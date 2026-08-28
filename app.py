from fastapi import FastAPI, UploadFile, File, HTTPException, BackgroundTasks
from fastapi.responses import JSONResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Any, Dict, List
import os, tempfile, gc, shutil
import zipfile
import threading
from datetime import datetime
import math
import numpy as np
import pandas as pd

from reconcilation import (
    process_files, get_sheet_metadata,
    parse_book, parse_statement, parse_previous_brs, extract_brs_date, parse_date,
    detect_book_sheet, safe_read_excel, find_book_bank_id, extract_account_from_book, count_book_transactions_by_bill_no,
    build_excel, BOOK_COLS, STMT_COLS,
)
from qr_reconcilation import process_qr_files, count_transactions_by_bill_no_and_name
from gateway_reconcilation import process_gateway_files, count_transactions_by_bill_no_and_name as count_gateway_transactions_by_bill_no_and_name
import requests
from config import RECONCILIATION_API, TRANSACTIONS_DIR

app = FastAPI(title="Bank Reconciliation API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

ALLOWED_EXTENSIONS = {".csv", ".xlsx", ".xls", ".pdf"}


_archive_lock = threading.Lock()

def _ext(filename: str) -> str:
    return os.path.splitext(filename)[1].lower()

def _next_transaction_dir(recon_type: str) -> str:
    date_folder = datetime.now().strftime("%d-%m-%Y")
    base = os.path.join(TRANSACTIONS_DIR, date_folder, recon_type)
    with _archive_lock:
        os.makedirs(base, exist_ok=True)
        existing = [
            int(d.replace("transaction", ""))
            for d in os.listdir(base)
            if d.startswith("transaction") and d.replace("transaction", "").isdigit()
        ]
        txn_dir = os.path.join(base, f"transaction{max(existing, default=0) + 1}")
        os.makedirs(txn_dir)
    return txn_dir

def _archive_transaction(recon_type, input_files, output_path, output_name):
    """Copy inputs + output into the Transactions archive.

    Returns the transaction_ref string (e.g. "03-08-2026/bank/transaction7")
    identifying where this run was saved, or None if archiving failed. The
    ref is a relative path under TRANSACTIONS_DIR — it's what a later
    /workflow/regenerate call uses to find the original input files again.
    """
    try:
        txn_dir = _next_transaction_dir(recon_type)
        for src_path, save_name in input_files:
            if src_path and os.path.exists(src_path):
                shutil.copy2(src_path, os.path.join(txn_dir, save_name))
        if output_path and os.path.exists(output_path):
            shutil.copy2(output_path, os.path.join(txn_dir, output_name))
        return os.path.relpath(txn_dir, TRANSACTIONS_DIR).replace(os.sep, "/")
    except Exception as e:
        print(f"[archive] Failed to archive {recon_type} transaction: {e}")
        return None

def _sanitize(obj):
    """Recursively sanitize for JSON — handles numpy/pandas scalar types."""
    if isinstance(obj, dict):
        return {k: _sanitize(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_sanitize(v) for v in obj]
    # numpy bool
    if isinstance(obj, (np.bool_,)):
        return bool(obj)
    # numpy integers
    if isinstance(obj, (np.integer,)):
        return int(obj)
    # numpy floats + Python float
    if isinstance(obj, (np.floating, float)):
        if math.isnan(obj) or math.isinf(obj):
            return None
        return float(obj)
    # numpy arrays → list
    if isinstance(obj, np.ndarray):
        return _sanitize(obj.tolist())
    # Python native bool (must be before int)
    if isinstance(obj, bool):
        return bool(obj)
    # Python native int
    if isinstance(obj, int):
        return int(obj)
    return obj

def _format_transaction_date(value):
    if value is None:
        return ""
    try:
        if isinstance(value, float) and math.isnan(value):
            return ""
    except Exception:
        pass
    if hasattr(value, "strftime"):
        return value.strftime("%d-%m-%Y")
    return str(value)

def _validate_filename(filename: str) -> None:
    ext = os.path.splitext(filename)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"File '{filename}' has invalid extension. Allowed: {', '.join(ALLOWED_EXTENSIONS)}"
        )


def _compute_brs(book_closing_bal, bank_closing_bal, book_only_df, stmt_only_df):
    """
    Replicate the exact BRS arithmetic from build_brs_sheet().
    BRS flow:
        Start   Closing Balance as per Company Books
        Add     Cheques issued but NOT debited in bank        (book OUTFLOW)
        Less    Cheques deposited but NOT credited in bank    (book INFLOW)
        Less    Debited in bank but NOT in book               (stmt OUTFLOW)
        Add     Credited in bank but NOT in book              (stmt INFLOW)
        Result  must equal Closing Balance as per Bank  →  difference = 0
    """
    issued      = book_only_df[book_only_df["Direction"] == "OUTFLOW"]
    deposited   = book_only_df[book_only_df["Direction"] == "INFLOW"]
    debited_nb  = stmt_only_df[stmt_only_df["Direction"] == "OUTFLOW"]
    credited_nb = stmt_only_df[stmt_only_df["Direction"] == "INFLOW"]

    add_issued      = float(issued["Book Amt (Rs)"].sum())      if not issued.empty      else 0.0
    less_deposited  = float(deposited["Book Amt (Rs)"].sum())   if not deposited.empty   else 0.0
    less_debited_nb = float(debited_nb["Bank Amt (Rs)"].sum())  if not debited_nb.empty  else 0.0
    add_credited_nb = float(credited_nb["Bank Amt (Rs)"].sum()) if not credited_nb.empty else 0.0

    running  = book_closing_bal
    running += add_issued
    running -= less_deposited
    running -= less_debited_nb
    running += add_credited_nb

    brs_difference = round(bank_closing_bal - running, 2)

    return {
        "book_closing_bal":   round(book_closing_bal, 2),
        "bank_closing_bal":   round(bank_closing_bal, 2),
        "add_issued":         round(add_issued, 2),
        "less_deposited":     round(less_deposited, 2),
        "less_debited_nb":    round(less_debited_nb, 2),
        "add_credited_nb":    round(add_credited_nb, 2),
        "reconciled_balance": round(running, 2),
        "brs_difference":     brs_difference,
    }


def _compute_qr_brs(book_closing_bal, bank_closing_bal, book_only_df, bank_only_df):
    """
    QR BRS arithmetic:
        Start   Closing Balance as per company books
        Less    Cheques deposited but NOT credited in bank  (book_only — in book, not in bank)
        Add     Credited in pass book but NOT in our book   (bank_only — in bank, not in book)
        Result  = Closing Balance as per Bank
    """
    import pandas as pd

    # For QR, book_only contains the "Cheque Deposit" entries not yet in bank
    # bank_only contains gateway credits not yet in book
    dnc_total = 0.0
    cnb_total = 0.0

    if book_only_df is not None and not book_only_df.empty:
        # Filter out HOT entries if column exists
        if "Is HOT" in book_only_df.columns:
            nh = book_only_df[~book_only_df["Is HOT"].astype(bool)]
        else:
            nh = book_only_df
        dnc_total = float(nh["Amount"].sum()) if "Amount" in nh.columns else 0.0

    if bank_only_df is not None and not bank_only_df.empty:
        cnb_total = float(bank_only_df["Amount"].sum()) if "Amount" in bank_only_df.columns else 0.0

    running        = book_closing_bal - dnc_total + cnb_total
    brs_difference = round(bank_closing_bal - running, 2)

    return {
        "book_closing_bal":    round(book_closing_bal, 2),
        "bank_closing_bal":    round(bank_closing_bal, 2),
        "add_issued":          0.0,           # not applicable for QR
        "less_deposited":      round(dnc_total, 2),
        "less_debited_nb":     0.0,           # nil for QR
        "add_credited_nb":     round(cnb_total, 2),
        "reconciled_balance":  round(running, 2),
        "brs_difference":      brs_difference,
    }


# Exact key set produced by reconcilation.py's _make_row() for a "matched" row
# (and therefore what the frontend receives/echoes back for every matched
# record). Kept here so a regenerated workbook never hits a KeyError on a
# column build_excel expects, even if a manually-constructed row omitted one.
MATCHED_COLS = [
    "Match Method", "Name Match", "Fuzzy Score %", "Amount Match",
    "Book Date", "Book Txn", "Book Bill No", "Book Chq", "Book Party", "Book Party Raw",
    "Book Direction", "Book Sender", "Book Recipient", "Book Amt (Rs)",
    "Bank Date", "Bank Chq", "Bank Description", "Bank Party",
    "Bank Direction", "Bank Sender", "Bank Recipient",
    "Debit (Rs)", "Credit (Rs)", "Bank Amt (Rs)", "Difference (Rs)",
    "Flags", "Partial Payment", "Bank Full Amt",
]


def _records_to_df(records: List[Dict[str, Any]], required_cols: List[str]) -> pd.DataFrame:
    """Rebuild a DataFrame from frontend-edited records, guaranteeing every
    column build_excel() accesses by name exists — including when the list
    is empty, since build_excel indexes by column even on 0-row frames."""
    if not records:
        return pd.DataFrame(columns=required_cols)
    df = pd.DataFrame(records)
    for col in required_cols:
        if col not in df.columns:
            df[col] = ""
    return df


class RegenerateBankRequest(BaseModel):
    transaction_ref: str
    matched:   List[Dict[str, Any]]
    book_only: List[Dict[str, Any]]
    bank_only: List[Dict[str, Any]]


def post_reconciliation(transaction_info):
    try:
        response = requests.post(
            RECONCILIATION_API,
            json=transaction_info,
            timeout=30
        )

        response.raise_for_status()
        return response.json()

    except requests.exceptions.RequestException as e:
        raise Exception(f"Failed to update reconciliation database: {str(e)}")


# ─────────────────────────────────────────────────────────────────────────────
# NORMAL BANK RECONCILIATION
# ─────────────────────────────────────────────────────────────────────────────

@app.post("/reconcile/reconcile-bank", summary="Upload book report, bank statement and previous BRS file.")
async def reconcile_endpoint(
    book_file:         UploadFile = File(...),
    statement_file:    UploadFile = File(...),
    previous_brs_file: UploadFile = File(...)
):
    _validate_filename(book_file.filename)
    _validate_filename(statement_file.filename)
    _validate_filename(previous_brs_file.filename)

    tmpdir    = tempfile.mkdtemp()
    file_data = None

    try:
        book_path     = os.path.join(tmpdir, book_file.filename)
        stmt_path     = os.path.join(tmpdir, statement_file.filename)
        prev_brs_path = os.path.join(tmpdir, previous_brs_file.filename)

        with open(book_path,     "wb") as f: f.write(await book_file.read())
        with open(stmt_path,     "wb") as f: f.write(await statement_file.read())
        with open(prev_brs_path, "wb") as f: f.write(await previous_brs_file.read())

        book_sheets = get_sheet_metadata(book_path)
        stmt_sheets = get_sheet_metadata(stmt_path)

        stmt_result         = parse_statement(stmt_path)
        raw_stmt_df         = stmt_result[0]
        bank_closing_bal    = stmt_result[1]
        account_no          = stmt_result[2]
        branch_label        = stmt_result[3]
        bank_name_hint      = stmt_result[4]
        is_no_transactions  = stmt_result[5]

        _sheet         = detect_book_sheet(book_path)
        _raw           = safe_read_excel(book_path, sheet_name=_sheet, header=None)
        target_bank_id = None
        if bank_name_hint and bank_name_hint != "UNKNOWN":
            target_bank_id = find_book_bank_id(_raw, bank_name_hint)

        book_result       = parse_book(book_path, target_bank_id=target_bank_id)
        raw_book_df       = book_result[0]
        book_closing_bal  = book_result[3]
        book_closing_drcr = book_result[4]
        company_name      = book_result[5]
        bank_id           = book_result[6]

        if account_no == "ACCOUNT NO NOT FOUND" and bank_name_hint and bank_name_hint != "UNKNOWN":
            acc_from_book = extract_account_from_book(book_path, bank_name_hint)
            if acc_from_book:
                account_no = acc_from_book

        original_book_count = len(raw_book_df)
        original_stmt_count = len(raw_stmt_df)

        book_transaction_count = count_book_transactions_by_bill_no(raw_book_df)
        book_transactions = []
        for row, txn_no in zip(raw_book_df.to_dict("records"), book_transaction_count["transaction_numbers"]):
            book_transactions.append({
                "Date": row.get("Date", ""),
                "Bill No": row.get("Bill No", row.get("Book Bill No", "")),
                "Name": row.get("Party", row.get("Book Party", row.get("Name", ""))),
                "TXN No": f"TXN-{int(txn_no):02d}",
            })

        transaction_info = {
            "file_name": book_file.filename,
            "row_count": len(book_transactions),
            "transaction_count": book_transaction_count["transaction_count"],
            "transaction_type": "bank",
            "transactions": _sanitize(book_transactions),
        }

        post_reconciliation(transaction_info)

        brs_date = extract_brs_date(prev_brs_path)

        title_date = brs_date
        if not raw_book_df.empty and "Date" in raw_book_df.columns:
            _valid_dates = [parse_date(d) for d in raw_book_df["Date"]
                            if d and str(d).strip() not in ("", "nan")]
            _valid_dates = [d for d in _valid_dates if d is not None]
            if _valid_dates:
                title_date = max(_valid_dates).strftime("%d-%m-%Y")

        if is_no_transactions and bank_closing_bal == 0.0:
            from reconcilation import parse_previous_brs
            _prev = parse_previous_brs(prev_brs_path, bank_id=bank_id)
            prev_bank_bal = _prev.get("prev_bank_closing_bal", 0.0)
            if prev_bank_bal != 0.0:
                bank_closing_bal = prev_bank_bal
            else:
                bank_closing_bal = book_closing_bal

        output_path = os.path.join(tmpdir, "Reconciliation.xlsx")

        matched, book_only, stmt_only, book_closing_bal, bank_closing_bal = process_files(
            book_path, stmt_path, output_path, prev_brs_path
        )

        with open(output_path, "rb") as f:
            file_data = f.read()
        
        transaction_ref = _archive_transaction("bank", [
            (book_path,     f"book_report{_ext(book_file.filename)}"),
            (stmt_path,     f"bank_statement{_ext(statement_file.filename)}"),
            (prev_brs_path, f"previous_brs{_ext(previous_brs_file.filename)}"),
        ], output_path, "Reconciliation.xlsx")

    finally:
        gc.collect()
        shutil.rmtree(tmpdir, ignore_errors=True)

    brs = _compute_brs(book_closing_bal, bank_closing_bal, book_only, stmt_only)
    brs_difference = brs["brs_difference"]

    total_matched    = len(matched)
    total_book_only  = len(book_only)
    total_bank_only  = len(stmt_only)

    matched_perfect   = 0
    matched_with_diff = 0
    if not matched.empty:
        matched_perfect   = int(
            ((matched["Name Match"] == "Match") & (matched["Amount Match"] == "Exact")).sum()
        )
        matched_with_diff = int((matched["Amount Match"] != "Exact").sum())

    account_info = f"{branch_label} :- {account_no}" if account_no and branch_label else ""

    return JSONResponse(_sanitize({
        "status": "success",
        "recon_type": "bank",

        "book_file_name":      book_file.filename,
        "statement_file_name": statement_file.filename,
        "previous_brs_file":   previous_brs_file.filename,

        "book_sheets":      book_sheets,
        "statement_sheets": stmt_sheets,

        "matched":   matched.to_dict("records"),
        "book_only": book_only.to_dict("records"),
        "bank_only": stmt_only.to_dict("records"),

        "brs":          brs,
        "company_name": company_name,
        "account_info": account_info,
        "brs_date":     title_date,
        "transaction_info": transaction_info,

        "summary": {
            "book_entries":      original_book_count,
            "bank_entries":      original_stmt_count,
            "matched":           total_matched,
            "matched_perfect":   matched_perfect,
            "matched_with_diff": matched_with_diff,
            "book_only":         total_book_only,
            "bank_only":         total_bank_only,
            "difference":        brs_difference,
        },

        "file_bytes": file_data.hex(),
        "file_name":  "Reconciliation.xlsx",
        "transaction_ref": transaction_ref,
    }))


@app.post(
    "/reconcile/regenerate-bank",
    summary="Rebuild a reconciliation workbook from in-app edits (un-match / manual match). Bank type only for now.",
)
async def regenerate_endpoint(payload: RegenerateBankRequest):
    ref = (payload.transaction_ref or "").strip("/")
    parts = ref.split("/")
    if len(parts) != 3:
        raise HTTPException(status_code=400, detail=f"Malformed transaction_ref: '{payload.transaction_ref}'")
    date_folder, recon_type, txn_name = parts

    if recon_type != "bank":
        raise HTTPException(
            status_code=400,
            detail=(
                f"Regenerate is only supported for 'bank' reconciliations right now "
                f"(this transaction is '{recon_type}')."
            ),
        )

    txn_dir = os.path.join(TRANSACTIONS_DIR, date_folder, recon_type, txn_name)
    if not os.path.isdir(txn_dir):
        raise HTTPException(status_code=404, detail=f"Transaction not found: '{ref}'")

    def _find_archived(prefix):
        for fname in sorted(os.listdir(txn_dir)):
            if fname.startswith(prefix):
                return os.path.join(txn_dir, fname)
        return None

    book_path     = _find_archived("book_report")
    stmt_path     = _find_archived("bank_statement")
    prev_brs_path = _find_archived("previous_brs")
    if not book_path or not stmt_path:
        raise HTTPException(status_code=404, detail=f"Original input files missing for transaction '{ref}'.")
    # The upload form archives an empty placeholder file when no previous BRS
    # was supplied — treat a 0-byte file the same as "not supplied".
    if prev_brs_path and os.path.getsize(prev_brs_path) == 0:
        prev_brs_path = None

    out_tmpdir = tempfile.mkdtemp()
    try:
        # Re-derive everything that is NOT user-editable — the raw ledger/
        # statement rows, opening & closing balances, company/account/branch
        # labels, BRS date — via the exact same parsing the original run
        # used, so these stay identical to the original workbook. Only
        # matched / book_only / bank_only are replaced with the frontend's
        # edited tables below.
        stmt_result         = parse_statement(stmt_path)
        raw_stmt_df         = stmt_result[0]
        bank_closing_bal    = stmt_result[1]
        account_no          = stmt_result[2]
        branch_label        = stmt_result[3]
        bank_name_hint      = stmt_result[4]
        is_no_transactions  = stmt_result[5]

        _sheet = detect_book_sheet(book_path)
        _raw   = safe_read_excel(book_path, sheet_name=_sheet, header=None)
        target_bank_id = None
        if bank_name_hint and bank_name_hint != "UNKNOWN":
            target_bank_id = find_book_bank_id(_raw, bank_name_hint)

        book_result        = parse_book(book_path, target_bank_id=target_bank_id)
        book_df            = book_result[0]
        book_opening_bal   = book_result[1]
        book_opening_drcr  = book_result[2]
        book_closing_bal   = book_result[3]
        book_closing_drcr  = book_result[4]
        company_name       = book_result[5]
        bank_id            = book_result[6]

        if account_no == "ACCOUNT NO NOT FOUND" and bank_name_hint and bank_name_hint != "UNKNOWN":
            acc_from_book = extract_account_from_book(book_path, bank_name_hint)
            if acc_from_book:
                account_no = acc_from_book

        brs_date = extract_brs_date(prev_brs_path) if prev_brs_path else \
            "DATE NOT PROVIDED - please include previous BRS file"
        title_date = brs_date
        if not book_df.empty and "Date" in book_df.columns:
            _valid_dates = [parse_date(d) for d in book_df["Date"]
                             if d and str(d).strip() not in ("", "nan")]
            _valid_dates = [d for d in _valid_dates if d is not None]
            if _valid_dates:
                title_date = max(_valid_dates).strftime("%d-%m-%Y")

        if is_no_transactions and bank_closing_bal == 0.0 and prev_brs_path:
            _prev = parse_previous_brs(prev_brs_path, bank_id=bank_id)
            prev_bank_bal = _prev.get("prev_bank_closing_bal", 0.0)
            bank_closing_bal = prev_bank_bal if prev_bank_bal != 0.0 else book_closing_bal

        # Rebuild the three editable tables from what the user has in the app.
        matched_df   = _records_to_df(payload.matched,   MATCHED_COLS)
        book_only_df = _records_to_df(payload.book_only, BOOK_COLS)
        stmt_only_df = _records_to_df(payload.bank_only, STMT_COLS)

        output_path = os.path.join(out_tmpdir, "Reconciliation.xlsx")
        build_excel(
            book_df, raw_stmt_df, matched_df, book_only_df, stmt_only_df,
            book_opening_bal, book_opening_drcr,
            book_closing_bal, book_closing_drcr,
            bank_closing_bal, output_path,
            company_name=company_name,
            account_no=account_no,
            branch_label=branch_label,
            brs_date=title_date,
        )

        with open(output_path, "rb") as f:
            file_data = f.read()

        # Per product decision: downloading after edits becomes the new
        # permanent record for this transaction — overwrite the archive.
        shutil.copy2(output_path, os.path.join(txn_dir, "Reconciliation.xlsx"))

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to regenerate workbook: {e}")
    finally:
        gc.collect()
        shutil.rmtree(out_tmpdir, ignore_errors=True)

    brs = _compute_brs(book_closing_bal, bank_closing_bal, book_only_df, stmt_only_df)

    matched_perfect = matched_with_diff = 0
    if not matched_df.empty:
        matched_perfect   = int(((matched_df["Name Match"] == "Match") & (matched_df["Amount Match"] == "Exact")).sum())
        matched_with_diff = int((matched_df["Amount Match"].astype(str) != "Exact").sum())

    return JSONResponse(_sanitize({
        "status":          "success",
        "recon_type":      "bank",
        "transaction_ref": ref,
        "brs":             brs,
        "summary": {
            "book_entries":      len(book_df),
            "bank_entries":      len(raw_stmt_df),
            "matched":           len(matched_df),
            "matched_perfect":   matched_perfect,
            "matched_with_diff": matched_with_diff,
            "book_only":         len(book_only_df),
            "bank_only":         len(stmt_only_df),
            "difference":        brs["brs_difference"],
        },
        "file_bytes": file_data.hex(),
        "file_name":  "Reconciliation.xlsx",
    }))


# ─────────────────────────────────────────────────────────────────────────────
# QR RECONCILIATION
# ─────────────────────────────────────────────────────────────────────────────

@app.post(
    "/reconcile/reconcile-qr",
    summary="QR reconciliation — 4 files: All-Branches book, HOT QRHDFC book, QR gateway statement, Previous BRS.",
)
async def reconcile_qr_endpoint(
    all_branches_file: UploadFile = File(..., description="All-branches book report xlsx"),
    hot_book_file:     UploadFile = File(..., description="HOT QRHDFC book report xlsx"),
    statement_file:    UploadFile = File(..., description="QR-HDFC gateway statement xlsx"),
    previous_brs_file: UploadFile = File(..., description="Previous day BRS xlsx (must contain sheet 'QR-HDFC')"),
):
    for f in [all_branches_file, hot_book_file, statement_file, previous_brs_file]:
        _validate_filename(f.filename)
 
    tmpdir    = tempfile.mkdtemp()
    file_data = None
 
    try:
        all_branches_path = os.path.join(tmpdir, all_branches_file.filename)
        hot_book_path     = os.path.join(tmpdir, hot_book_file.filename)
        stmt_path         = os.path.join(tmpdir, statement_file.filename)
        prev_brs_path     = os.path.join(tmpdir, previous_brs_file.filename)
 
        with open(all_branches_path, "wb") as f: f.write(await all_branches_file.read())
        with open(hot_book_path,     "wb") as f: f.write(await hot_book_file.read())
        with open(stmt_path,         "wb") as f: f.write(await statement_file.read())
        with open(prev_brs_path,     "wb") as f: f.write(await previous_brs_file.read())
 
        # Sheet metadata
        all_branches_sheets = get_sheet_metadata(all_branches_path)
        hot_book_sheets     = get_sheet_metadata(hot_book_path)
        stmt_sheets         = get_sheet_metadata(stmt_path)

        qr_transaction_rows = count_transactions_by_bill_no_and_name(all_branches_path)
        qr_transactions = []
        qr_seen_transactions = {}
        for row in qr_transaction_rows.to_dict("records"):
            key = (
                str(row.get("party", "")).strip().upper(),
                str(row.get("bill_no", "")).strip().upper(),
            )
            if key not in qr_seen_transactions:
                qr_seen_transactions[key] = len(qr_seen_transactions) + 1
            qr_transactions.append({
                "Date": _format_transaction_date(row.get("date", "")),
                "Bill No": row.get("bill_no", ""),
                "Name": row.get("party", ""),
                "TXN No": f"TXN-{qr_seen_transactions[key]:02d}",
            })

        transaction_info = {
            "file_name": all_branches_file.filename,
            "row_count": len(qr_transactions),
            "transaction_count": len(qr_seen_transactions),
            "transaction_type": "qr",
            "transactions": _sanitize(qr_transactions),
        }

        post_reconciliation(transaction_info)
 
        output_path = os.path.join(tmpdir, "QR_Reconciliation.xlsx")
 
        # Run full QR reconciliation — all logic lives in qr_reconcilation.py
        (matched_df, dnc_df, cnb_df,
         closing_bal, bank_bal, reconciled,
         brs_date, books_match, corr_amts) = process_qr_files(
            all_branches_path = all_branches_path,
            hot_book_path     = hot_book_path,
            qr_stmt_path      = stmt_path,
            output_path       = output_path,
            prev_brs_path     = prev_brs_path,
        )
 
        with open(output_path, "rb") as f:
            file_data = f.read()
        
        transaction_ref = _archive_transaction("qr", [
            (all_branches_path, f"all_branches{_ext(all_branches_file.filename)}"),
            (hot_book_path,     f"hot_book{_ext(hot_book_file.filename)}"),
            (stmt_path,         f"qr_statement{_ext(statement_file.filename)}"),
            (prev_brs_path,     f"previous_brs{_ext(previous_brs_file.filename)}"),
        ], output_path, "QR_Reconciliation.xlsx")
 
    finally:
        gc.collect()
        shutil.rmtree(tmpdir, ignore_errors=True)
 
    # ── BRS figures (mirror qr_reconcilation.py arithmetic exactly) ───────────
    total_dnc = float(dnc_df["amount"].sum()) if not dnc_df.empty and "amount" in dnc_df.columns else 0.0
    total_cnb = float(cnb_df["amount"].sum()) if not cnb_df.empty and "amount" in cnb_df.columns else 0.0
 
    brs = {
        "book_closing_bal":   round(closing_bal, 2),
        "bank_closing_bal":   round(bank_bal, 2),
        "add_issued":         0.0,                   # not applicable for QR
        "less_deposited":     round(total_dnc, 2),
        "less_debited_nb":    0.0,                   # nil for QR
        "add_credited_nb":    round(total_cnb, 2),
        "reconciled_balance": round(bank_bal, 2),
        "brs_difference":     0.0 if reconciled else round(bank_bal - (closing_bal - total_dnc + total_cnb), 2),
    }
 
    # ── Summary counts ────────────────────────────────────────────────────────
    total_matched    = len(matched_df) if matched_df is not None else 0
    total_book_only  = len(dnc_df)     if dnc_df     is not None else 0
    total_bank_only  = len(cnb_df)     if cnb_df     is not None else 0
 
    matched_perfect = matched_with_diff = 0
    if matched_df is not None and not matched_df.empty:
        if "Name Match" in matched_df.columns and "Amount Match" in matched_df.columns:
            matched_perfect   = int(((matched_df["Name Match"] == "Match") & (matched_df["Amount Match"] == "Exact")).sum())
            matched_with_diff = int((~matched_df["Amount Match"].str.startswith("Exact")).sum())
 
    # ── Normalise book_only (DNC) for the frontend ────────────────────────────
    book_only_records = []
    if dnc_df is not None and not dnc_df.empty:
        for _, row in dnc_df.iterrows():
            raw_party   = str(row.get("party", ""))         # e.g. "INDIVI - VIJETA VIJAYAN"
            clean_party = raw_party.replace("INDIVI - ", "").strip()  # e.g. "VIJETA VIJAYAN"
            narr        = str(row.get("note", "") or row.get("remark", "") or "")
            is_cf       = bool(row.get("cf", False))
            # Narration mirrors qr_reconcilation.py _brs_item display_narr logic
            if is_cf and not narr:
                display_narr = "Carried Fwd"
            elif is_cf:
                display_narr = f"CF | {narr}"
            else:
                display_narr = narr
            book_only_records.append({
                "Date":           row.get("date", ""),
                "Branch":         row.get("branch", ""),
                "Txn Type":       "Public Sale",
                "Bill No":        row.get("ref", ""),
                "RRN":            "",                        # DNC has no RRN
                "Chq No":         511,
                "Book Report":    raw_party,                 # e.g. "INDIVI - VIJETA VIJAYAN"
                "Bank Statement": "",                        # blank — not in bank yet
                "Party":          clean_party,               # Makez Extracted
                "Narration":      display_narr,              # e.g. "CF | -2749"
                "Direction":      "INFLOW",
                "Sender":         raw_party,
                "Recipient":      "ORIENT EXCHANGE AND FINANCIAL SERVICES PVT LTD",
                "Book Amt (Rs)":  row.get("amount", 0),
                "Issue": (
                    "Carried Forward from Previous BRS"
                    if is_cf else narr or "In Book — NOT yet in Bank Gateway"
                ),
                "Is CF": is_cf,
            })
 
    # ── Normalise bank_only (CNB) for the frontend ────────────────────────────
    bank_only_records = []
    if cnb_df is not None and not cnb_df.empty:
        for _, row in cnb_df.iterrows():
            raw_party = str(row.get("party", ""))
            remark    = str(row.get("remark", ""))
            is_cf     = bool(row.get("cf", False))
            # Narration mirrors qr_reconcilation.py _brs_item display_narr logic
            if is_cf and not remark:
                display_narr = "Carried Fwd"
            elif is_cf:
                display_narr = f"CF | {remark}"
            else:
                display_narr = remark
            bank_only_records.append({
                "Date":           row.get("date", ""),
                "Branch":         row.get("branch", ""),
                "Bill No":        "",                       # CNB has no book bill no
                "RRN":            str(row.get("rrn", "")),  # bank RRN
                "Chq No":         "",                       # no cheque number
                "Book Report":    "",                       # blank — not in book
                "Bank Statement": raw_party,                # raw bank payer name
                "Party":          raw_party,                # Makez Extracted (same for CNB)
                "Narration":      display_narr,             # e.g. "CF | Carried Fwd"
                "Direction":      "INFLOW",
                "Sender":         raw_party,
                "Recipient":      "ORIENT EXCHANGE AND FINANCIAL SERVICES PVT LTD",
                "Bank Amt (Rs)":  row.get("amount", 0),
                "Issue": (
                    "Carried Forward from Previous BRS"
                    if is_cf else "Bank credit — NOT yet in company book"
                ),
                "Is CF": is_cf,
            })
 
    # ── Normalise matched records for the frontend ────────────────────────────
    matched_records = []
    if matched_df is not None and not matched_df.empty:
        for _, row in matched_df.iterrows():
            book_amt = row.get("Book Amt", 0) or 0
            bank_amt = row.get("Bank Amt", 0) or 0
            diff     = row.get("Diff", 0) or 0
            matched_records.append({
                "Match Method":    str(row.get("Method", "")),
                "Name Match":      str(row.get("Name Match", "")),
                "Fuzzy Score %":   row.get("Score%", 0) or 0,
                "Amount Match":    str(row.get("Amount Match", "")),
                "Book Txn":        "Public Sale",
                "Book Date":       str(row.get("Book Date", "")),
                "Book Bill No":    str(row.get("Book Bill No", "")),
                "Book Chq":        str(row.get("Book Chq No", "")),
                "Book Party":      str(row.get("Book Party", "")),
                "Book Direction":  "INFLOW",
                "Book Sender":     str(row.get("Book Party", "")),
                "Book Recipient":  "ORIENT EXCHANGE AND FINANCIAL SERVICES PVT LTD",
                "Book Amt (Rs)":   float(book_amt),
                "Bank Date":       str(row.get("Bank Date", "")),
                "Bank Chq":        str(row.get("Bank RRN", "")),
                "Bank RRN":        str(row.get("Bank RRN", "")),
                "Bank Description":str(row.get("Pay Type", "")),
                "Bank Payer":      str(row.get("Bank Payer", "")),
                "Bank Party":      str(row.get("Bank Payer", "")),
                "Bank Direction":  "INFLOW",
                "Bank Sender":     str(row.get("Bank Payer", "")),
                "Bank Recipient":  "ORIENT EXCHANGE AND FINANCIAL SERVICES PVT LTD",
                "Debit (Rs)":      "",
                "Credit (Rs)":     float(bank_amt),
                "Bank Amt (Rs)":   float(bank_amt),
                "Difference (Rs)": float(diff),
                "Flags":           str(row.get("Flags", "")),
            })
 
    return JSONResponse(_sanitize({
        "status":     "success",
        "recon_type": "qr",
 
        "all_branches_file":   all_branches_file.filename,
        "hot_book_file":       hot_book_file.filename,
        "statement_file_name": statement_file.filename,
        "previous_brs_file":   previous_brs_file.filename,
 
        "all_branches_sheets": all_branches_sheets,
        "hot_book_sheets":     hot_book_sheets,
        "statement_sheets":    stmt_sheets,
 
        "matched":   matched_records,
        "book_only": book_only_records,
        "bank_only": bank_only_records,
 
        "brs":          brs,
        "company_name": "ORIENT EXCHANGE AND FINANCIAL SERVICES PVT LTD",
        "account_info": "QR-HDFC Account",
        "brs_date":     brs_date,
        "transaction_info": transaction_info,
 
        "books_match":        books_match,
        "reconciled":         reconciled,
        "correction_amounts": [int(x) for x in set(corr_amts)],
 
        "summary": {
            "book_entries":       total_matched + total_book_only,
            "bank_entries":       total_matched + total_bank_only,
            "matched":            total_matched,
            "matched_perfect":    matched_perfect,
            "matched_with_diff":  matched_with_diff,
            "book_only":          total_book_only,
            "bank_only":          total_bank_only,
            "difference":         round(bank_bal, 2) if not reconciled else 0.0,
        },
 
        "file_bytes": file_data.hex(),
        "file_name":  "QR_Reconciliation.xlsx",
        "transaction_ref": transaction_ref,
    }))


# ── QR field-translation helpers ─────────────────────────────────────────────
# The frontend receives normalized, capitalized field names (built above, in
# this same endpoint). qr_reconcilation.py's own internals — the dnc_all /
# cnb_all / matched_rows lists the override mechanism substitutes — use a
# different, lowercase raw shape. These convert an edited session back into
# that raw shape. Some fields (original note/remark split, book/bank branch
# on matched rows, RRN-vs-chq nuances) can't be perfectly reconstructed from
# the normalized JSON alone — this is a best-effort, display-accurate
# reconstruction, not a byte-for-byte reversal of the original internal dict.

def _qr_records_to_dnc(records):
    out = []
    for r in (records or []):
        out.append({
            "date":    r.get("Date", ""),
            "branch":  r.get("Branch", ""),
            "ref":     r.get("Bill No", ""),
            "party":   r.get("Book Report") or r.get("Party", ""),
            "amount":  r.get("Book Amt (Rs)", 0) or 0,
            "note":    "",
            "remark":  r.get("Narration", ""),
            "cf":      bool(r.get("Is CF", False)),
        })
    return out


def _qr_records_to_cnb(records):
    out = []
    for r in (records or []):
        out.append({
            "date":    r.get("Date", ""),
            "branch":  r.get("Branch", ""),
            "rrn":     r.get("RRN", ""),
            "party":   r.get("Bank Statement") or r.get("Party", ""),
            "amount":  r.get("Bank Amt (Rs)", 0) or 0,
            "diff":    0,
            "remark":  r.get("Narration", ""),
            "cf":      bool(r.get("Is CF", False)),
        })
    return out


def _qr_records_to_matched_rows(records):
    out = []
    for r in (records or []):
        out.append({
            "Method":       r.get("Match Method", ""),
            "Name Match":   r.get("Name Match", ""),
            "Amount Match": r.get("Amount Match", ""),
            "Score%":       r.get("Fuzzy Score %", 0) or 0,
            "Book Date":    r.get("Book Date", ""),
            "Book Branch":  "",
            "Book Bank":    "QRYESBANK",
            "Book Bill No": r.get("Book Bill No", ""),
            "Book Chq No":  r.get("Book Chq", 511) or 511,
            "Book Party":   r.get("Book Party", ""),
            "Book Amt":     r.get("Book Amt (Rs)", 0) or 0,
            "Bank Date":    r.get("Bank Date", ""),
            "Bank Time":    "",
            "Bank Branch":  "",
            "Bank Payer":   r.get("Bank Payer") or r.get("Bank Party", ""),
            "Bank Amt":     r.get("Bank Amt (Rs)", 0) or 0,
            "Bank RRN":     r.get("Bank RRN") or r.get("Bank Chq", ""),
            "Pay Type":     "",
            "Diff":         r.get("Difference (Rs)", 0) or 0,
            "Flags":        r.get("Flags", ""),
        })
    return out


class RegenerateQrRequest(BaseModel):
    transaction_ref: str
    matched:   List[Dict[str, Any]]
    book_only: List[Dict[str, Any]]
    bank_only: List[Dict[str, Any]]


@app.post(
    "/reconcile/regenerate-qr",
    summary="Rebuild a QR reconciliation workbook from in-app edits (un-match / manual match).",
)
async def regenerate_qr_endpoint(payload: RegenerateQrRequest):
    ref = (payload.transaction_ref or "").strip("/")
    parts = ref.split("/")
    if len(parts) != 3:
        raise HTTPException(status_code=400, detail=f"Malformed transaction_ref: '{payload.transaction_ref}'")
    date_folder, recon_type, txn_name = parts
    if recon_type != "qr":
        raise HTTPException(
            status_code=400,
            detail=f"This endpoint only regenerates 'qr' reconciliations (got '{recon_type}').",
        )

    txn_dir = os.path.join(TRANSACTIONS_DIR, date_folder, recon_type, txn_name)
    if not os.path.isdir(txn_dir):
        raise HTTPException(status_code=404, detail=f"Transaction not found: '{ref}'")

    def _find_archived(prefix):
        for fname in sorted(os.listdir(txn_dir)):
            if fname.startswith(prefix):
                return os.path.join(txn_dir, fname)
        return None

    all_branches_path = _find_archived("all_branches")
    hot_book_path      = _find_archived("hot_book")
    stmt_path           = _find_archived("qr_statement")
    prev_brs_path       = _find_archived("previous_brs")
    if not all_branches_path or not hot_book_path or not stmt_path:
        raise HTTPException(status_code=404, detail=f"Original input files missing for transaction '{ref}'.")
    if prev_brs_path and os.path.getsize(prev_brs_path) == 0:
        prev_brs_path = None

    out_tmpdir = tempfile.mkdtemp()
    try:
        output_path = os.path.join(out_tmpdir, "QR_Reconciliation.xlsx")

        override_dnc     = _qr_records_to_dnc(payload.book_only)
        override_cnb     = _qr_records_to_cnb(payload.bank_only)
        override_matched = _qr_records_to_matched_rows(payload.matched)

        (matched_df, dnc_df, cnb_df,
         closing_bal, bank_bal, reconciled,
         brs_date, books_match, corr_amts) = process_qr_files(
            all_branches_path = all_branches_path,
            hot_book_path     = hot_book_path,
            qr_stmt_path       = stmt_path,
            output_path        = output_path,
            prev_brs_path       = prev_brs_path,
            override_dnc        = override_dnc,
            override_cnb        = override_cnb,
            override_matched    = override_matched,
        )

        with open(output_path, "rb") as f:
            file_data = f.read()

        # Per product decision: downloading after edits becomes the new
        # permanent record for this transaction — overwrite the archive.
        shutil.copy2(output_path, os.path.join(txn_dir, "QR_Reconciliation.xlsx"))

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to regenerate QR workbook: {e}")
    finally:
        gc.collect()
        shutil.rmtree(out_tmpdir, ignore_errors=True)

    return JSONResponse(_sanitize({
        "status":          "success",
        "recon_type":      "qr",
        "transaction_ref": ref,
        "summary": {
            "matched":    len(matched_df),
            "book_only":  len(dnc_df),
            "bank_only":  len(cnb_df),
            "difference": round(bank_bal, 2) if not reconciled else 0.0,
            "reconciled": reconciled,
        },
        "file_bytes": file_data.hex(),
        "file_name":  "QR_Reconciliation.xlsx",
    }))


# ─────────────────────────────────────────────────────────────────────────────
# GATEWAY RECONCILIATION (YES Bank)
# ─────────────────────────────────────────────────────────────────────────────

@app.post(
    "/reconcile/reconcile-gateway",
    summary=(
        "Gateway YES Bank reconciliation — "
        "All-Branches book (.xls), HOT book (.xls), YES Bank PDF statement, "
        "PayU report (.xlsx) required; "
        "PayU On-Demand, CashFree, EaseBuzz, Smart Pay, Previous BRS optional."
    ),
)
async def reconcile_gateway_endpoint(
    all_branches_file: UploadFile = File(..., description="All-branches Gateway book report (.xls)"),
    hot_book_file:     UploadFile = File(..., description="HOT Gateway book report (.xls)"),
    statement_file:    UploadFile = File(..., description="YES Bank statement PDF"),
    payu_files:        list[UploadFile] = File(default=[], description="PayU regular (.xlsx) — 0 to 4 files"),
    payu_od_files:     list[UploadFile] = File(default=[], description="PayU On-Demand (.xlsx) — 0 to 4 files"),
    cashfree_files:    list[UploadFile] = File(default=[], description="CashFree (.xlsx) — 0 to 4 files"),
    easebuzz_files:    list[UploadFile] = File(default=[], description="EaseBuzz (.csv) — 0 to 4 files"),
    smart_pay_files: list[UploadFile] = File(default=[],description="Smart Pay (.xlsx) — 0 to 4 files"),
    previous_brs_file: UploadFile = File(..., description="Previous day BRS workbook (.xlsx)"),
    name_match_direct_file: UploadFile = File(..., description="Name Matching Report - Direct payment workbook (.xlsx)"),
    name_match_file:        UploadFile = File(..., description="Name Matching Report workbook (.xlsx)"),
    total_orders_file:      UploadFile = File(..., description="Total Orders List workbook (.xlsx)"),
):
    # Validate file extensions
    for f in [all_branches_file, hot_book_file]:
        _validate_filename(f.filename)
    for f in payu_files + payu_od_files + cashfree_files + smart_pay_files:
        _validate_filename(f.filename)
    for f in easebuzz_files:
        ext = os.path.splitext(f.filename)[1].lower()
        if ext not in {".csv", ".xlsx", ".xls"}:
            raise HTTPException(status_code=400,
                detail=f"EaseBuzz file '{f.filename}' must be .csv or .xlsx")
    _validate_filename(previous_brs_file.filename)
    _validate_filename(name_match_direct_file.filename)
    _validate_filename(name_match_file.filename)
    _validate_filename(total_orders_file.filename)

    tmpdir    = tempfile.mkdtemp()
    file_data = None

    try:
        all_branches_path = os.path.join(tmpdir, all_branches_file.filename)
        hot_book_path     = os.path.join(tmpdir, hot_book_file.filename)
        stmt_path         = os.path.join(tmpdir, statement_file.filename)

        with open(all_branches_path, "wb") as f: f.write(await all_branches_file.read())
        with open(hot_book_path,     "wb") as f: f.write(await hot_book_file.read())
        with open(stmt_path,         "wb") as f: f.write(await statement_file.read())

        payu_paths = []
        for pf in payu_files:
            p = os.path.join(tmpdir, pf.filename)
            with open(p, "wb") as f: f.write(await pf.read())
            payu_paths.append(p)

        payu_od_paths = []
        for od in payu_od_files:
            p = os.path.join(tmpdir, od.filename)
            with open(p, "wb") as f: f.write(await od.read())
            payu_od_paths.append(p)

        cashfree_paths = []
        for cf in cashfree_files:
            p = os.path.join(tmpdir, cf.filename)
            with open(p, "wb") as f: f.write(await cf.read())
            cashfree_paths.append(p)

        easebuzz_paths = []
        for eb in easebuzz_files:
            p = os.path.join(tmpdir, eb.filename)
            with open(p, "wb") as f: f.write(await eb.read())
            easebuzz_paths.append(p)

        smart_pay_paths = []
        for sp in smart_pay_files:
            p = os.path.join(tmpdir, sp.filename)
            with open(p, "wb") as f:
                f.write(await sp.read())
            smart_pay_paths.append(p)

        prev_brs_path = os.path.join(tmpdir, previous_brs_file.filename)
        with open(prev_brs_path, "wb") as f: f.write(await previous_brs_file.read())

        name_match_direct_path = os.path.join(tmpdir, name_match_direct_file.filename)
        with open(name_match_direct_path, "wb") as f: f.write(await name_match_direct_file.read())

        name_match_path = os.path.join(tmpdir, name_match_file.filename)
        with open(name_match_path, "wb") as f: f.write(await name_match_file.read())

        total_orders_path = os.path.join(tmpdir, total_orders_file.filename)
        with open(total_orders_path, "wb") as f: f.write(await total_orders_file.read())

        # Sheet metadata (book files only — PDF has no sheets)
        all_branches_sheets = get_sheet_metadata(all_branches_path)
        hot_book_sheets     = get_sheet_metadata(hot_book_path)

<<<<<<< HEAD
        gateway_transaction_rows = count_gateway_transactions_by_bill_no_and_name(all_branches_path)
        gateway_transactions = []
        gateway_seen_transactions = {}
        for row in gateway_transaction_rows.to_dict("records"):
            key = (
                str(row.get("party", "")).strip().upper(),
                str(row.get("bill_no", "")).strip().upper(),
            )
            if key not in gateway_seen_transactions:
                gateway_seen_transactions[key] = len(gateway_seen_transactions) + 1
            gateway_transactions.append({
                "Date": _format_transaction_date(row.get("date", "")),
                "Bill No": row.get("bill_no", ""),
                "Name": row.get("party", ""),
                "TXN No": f"TXN-{gateway_seen_transactions[key]:02d}",
            })

        transaction_info = {
            "file_name": all_branches_file.filename,
            "row_count": len(gateway_transactions),
            "transaction_count": len(gateway_seen_transactions),
            "transaction_type": "gateway",
            "transactions": _sanitize(gateway_transactions),
        }

        post_reconciliation(transaction_info)

=======
>>>>>>> 89540cc6622848db88645975db4d2eb7ff4d6852
        output_path = os.path.join(tmpdir, "Gateway_BRS.xlsx")
        # Run full Gateway reconciliation
        (gateway_results,
         dnc_all,
         cnb_all,
         add1_all,
         less2_all,
         closing_bal,
         bank_bal,
         reconciled,
         brs_date,
         books_match,
         cheque_match_report,
         bank_open_bal,
         bank_close_bal,
         total_bank_credits,
         stmt_credits,
         bank_txns,
         payu_brs,
         od_brs,
         cf_brs,
         eb_brs,
         payu_groups,
         od_groups,
         od_detail,
         cf_rows,
         df_cf,
         eb_info,
         eb_gross,
         eb_net,
         eb_charge,
         eb_gst,
         ) = process_gateway_files(
            all_branches_path = all_branches_path,
            hot_book_path     = hot_book_path,
            statement_path    = stmt_path,
            payu_paths        = payu_paths,
            output_path       = output_path,
            payu_od_paths     = payu_od_paths,
            cashfree_path     = cashfree_paths,
            easebuzz_paths    = easebuzz_paths,
            smart_pay_paths=smart_pay_paths,
            prev_brs_path     = prev_brs_path,
            name_match_direct_path = name_match_direct_path,
            name_match_path        = name_match_path,
            total_orders_path      = total_orders_path,
        )

        with open(output_path, "rb") as f:
            file_data = f.read()
        
        _gw_inputs = [
            (all_branches_path, f"all_branches{_ext(all_branches_file.filename)}"),
            (hot_book_path,     f"hot_book{_ext(hot_book_file.filename)}"),
            (stmt_path,         f"yes_bank_statement{_ext(statement_file.filename)}"),
        ]
        _gw_inputs += [(p, f"payu{i+1}{_ext(p)}")     for i, p in enumerate(payu_paths)]
        _gw_inputs += [(p, f"payu_od{i+1}{_ext(p)}")  for i, p in enumerate(payu_od_paths)]
        _gw_inputs += [(p, f"cashfree{i+1}{_ext(p)}") for i, p in enumerate(cashfree_paths)]
        _gw_inputs += [(p, f"easebuzz{i+1}{_ext(p)}") for i, p in enumerate(easebuzz_paths)]
        _gw_inputs += [(p, f"smart_pay{i+1}{_ext(p)}") for i, p in enumerate(smart_pay_paths)]
        _gw_inputs.append((prev_brs_path, f"previous_brs{_ext(previous_brs_file.filename)}"))
        _gw_inputs.append((name_match_direct_path, f"name_match_direct{_ext(name_match_direct_file.filename)}"))
        _gw_inputs.append((name_match_path,        f"name_match{_ext(name_match_file.filename)}"))
        _gw_inputs.append((total_orders_path,      f"total_orders{_ext(total_orders_file.filename)}"))

<<<<<<< HEAD
        transaction_ref = _archive_transaction("gateway", _gw_inputs, output_path, "Gateway_BRS.xlsx")
=======
        _archive_transaction("gateway", _gw_inputs, output_path, "Gateway_BRS.xlsx")
>>>>>>> 89540cc6622848db88645975db4d2eb7ff4d6852
        


    finally:
        gc.collect()
        shutil.rmtree(tmpdir, ignore_errors=True)

    # ── BRS figures ───────────────────────────────────────────────────────────
    total_add1  = sum(i["amount"] for i in add1_all)
    total_dnc   = sum(i["amount"] for i in dnc_all)
    total_less2 = sum(i["amount"] for i in less2_all)
    total_cnb   = sum(i["amount"] for i in cnb_all)

    brs = {
        "book_closing_bal":   round(closing_bal,  2),
        "bank_closing_bal":   round(bank_bal,      2),
        "add_issued":         round(total_add1,    2),
        "less_deposited":     round(total_dnc,     2),
        "less_debited_nb":    round(total_less2,   2),
        "add_credited_nb":    round(total_cnb,     2),
        "reconciled_balance": round(closing_bal + total_add1 - total_dnc - total_less2 + total_cnb, 2),
        "brs_difference":     round(bank_bal - (closing_bal + total_add1 - total_dnc - total_less2 + total_cnb), 2),
    }

    # ── Summary counts ────────────────────────────────────────────────────────
    total_book_only = len(dnc_all) + len(add1_all)
    total_bank_only = len(cnb_all) + len(less2_all)

    # ── Normalise book_only (DNC = deposited-not-credited, INFLOW; plus
    #    Add1 = issued-not-debited, OUTFLOW) for frontend ──────────────────────
    # add1_all/less2_all were always computed for the BRS arithmetic
    # (brs.add_issued / brs.less_debited_nb below) but never sent to the
    # frontend at all — Book Only / Bank Only were silently missing two of
    # the four outstanding-item buckets. Merging them in here, distinguished
    # by Direction, matches exactly how bank/QR's book_only already
    # conflates both directions into one array.
    book_only_records = []
    for item in dnc_all:
        raw_party   = str(item.get("party", ""))
        clean_party = raw_party.replace("INDIVI - ", "").strip()
        book_only_records.append({
            "Date":          item.get("date", ""),
            "Txn Type":      "Gateway Settlement",
            "Bill No":       item.get("utr", ""),
            "Chq No":        "",
            "Branch":        item.get("branch", ""),
            "Book Report":   raw_party,       # raw: "INDIVI - NAME"
            "Party":         clean_party,     # clean: "NAME" (Makez Extracted)
            "Direction":     "INFLOW",
            "Sender":        raw_party,
            "Recipient":     "ORIENT EXCHANGE AND FINANCIAL SERVICES PVT LTD",
            "Book Amt (Rs)": item.get("amount", 0),
            "Narration":     item.get("remark", ""),
            "Gateway":       item.get("gateway", ""),
            "Issue": (
                "Carried Forward from Previous BRS"
                if item.get("cf")
                else item.get("remark") or "Deposited NOT yet Credited in Bank"
            ),
            "Is CF": bool(item.get("cf", False)),
        })
    for item in add1_all:
        raw_party   = str(item.get("party", ""))
        clean_party = raw_party.replace("INDIVI - ", "").strip()
        book_only_records.append({
            "Date":          item.get("date", ""),
            "Txn Type":      "Gateway Settlement",
            "Bill No":       item.get("utr", ""),
            "Chq No":        "",
            "Branch":        item.get("branch", ""),
            "Book Report":   raw_party,
            "Party":         clean_party,
            "Direction":     "OUTFLOW",
            "Sender":        raw_party,
            "Recipient":     "ORIENT EXCHANGE AND FINANCIAL SERVICES PVT LTD",
            "Book Amt (Rs)": item.get("amount", 0),
            "Narration":     item.get("remark", ""),
            "Gateway":       item.get("gateway", ""),
            "Issue": (
                "Carried Forward from Previous BRS"
                if item.get("cf")
                else item.get("remark") or "Issued NOT yet debited in Bank"
            ),
            "Is CF": bool(item.get("cf", False)),
        })

    # ── Normalise bank_only (CNB = credited-not-book, INFLOW; plus
    #    Less2 = debited-not-book, OUTFLOW) for frontend ───────────────────────
    bank_only_records = []
    for item in cnb_all:
        raw_party = str(item.get("party", ""))
        gw_tag    = "[CF]" if item.get("cf") else f"[{item.get('gateway', '')}]"
        bank_only_records.append({
            "Date":           item.get("date", ""),
            "Txn Type":       gw_tag,
            "Bill No":        str(item.get("utr", "")),    # UTR / reference
            "Chq No":         str(item.get("chq_no", "")),
            "Book Report":    "",                           # blank — not in book
            "Bank Statement": raw_party,                    # raw bank party name (= Bank Statement col)
            "Party":          raw_party,                    # Makez Extracted (same for CNB)
            "Narration":      item.get("remark", ""),       # e.g. "UNKNOWN CREDIT"
            "Direction":      "INFLOW",
            "Sender":         raw_party,
            "Recipient":      "ORIENT EXCHANGE AND FINANCIAL SERVICES PVT LTD",
            "Bank Amt (Rs)":  item.get("amount", 0),
            "Gateway":        item.get("gateway", ""),
            "Issue": (
                "Carried Forward from Previous BRS"
                if item.get("cf") else "Bank credit — NOT yet in company book"
            ),
            "Is CF": bool(item.get("cf", False)),
        })
    for item in less2_all:
        raw_party = str(item.get("party", ""))
        gw_tag    = "[CF]" if item.get("cf") else f"[{item.get('gateway', '')}]"
        bank_only_records.append({
            "Date":           item.get("date", ""),
            "Txn Type":       gw_tag,
            "Bill No":        str(item.get("utr", "")),
            "Chq No":         str(item.get("chq_no", "")),
            "Book Report":    "",
            "Bank Statement": raw_party,
            "Party":          raw_party,
            "Narration":      item.get("remark", ""),
            "Direction":      "OUTFLOW",
            "Sender":         raw_party,
            "Recipient":      "ORIENT EXCHANGE AND FINANCIAL SERVICES PVT LTD",
            "Bank Amt (Rs)":  item.get("amount", 0),
            "Gateway":        item.get("gateway", ""),
            "Issue": (
                "Carried Forward from Previous BRS"
                if item.get("cf") else "Debited in Bank — NOT yet in company book"
            ),
            "Is CF": bool(item.get("cf", False)),
        })

    # ── Normalise matched rows for frontend (from cheque_match_report = Matched sheet) ──
    import re as _re2

    def _gw_name_flag(rec):
        verdict = str(rec.get("verdict", "")).upper()
        score   = int(rec.get("name_score", 0) or 0)
        if verdict == "MATCHED" or score >= 90: return "Match"
        if verdict in ("REVIEW", "DNC") or score >= 65: return "Partial"
        return "Mismatch"

    def _gw_amt_flag(rec):
        verdict  = str(rec.get("verdict", "")).upper()
        if verdict == "DNC":       return "DNC"
        if verdict == "UNMATCHED": return "Missing"
        bank_amt = float(rec.get("bank_amount", 0) or 0)
        book_amt = float(rec.get("book_amount", 0) or 0)
        diff = bank_amt - book_amt
        return "Exact" if abs(diff) < 1 else f"Diff Rs{diff:+,.2f}"

    def _gw_bank_party(rec):
        reason = str(rec.get("verdict_reason", "") or "")
        m = _re2.search(r"'([^']+)'", reason)
        return m.group(1) if m else str(rec.get("bank_ref", "") or "")

    matched_records = []
    for rec in cheque_match_report:
        name_flag  = _gw_name_flag(rec)
        amt_flag   = _gw_amt_flag(rec)
        bank_party = _gw_bank_party(rec)
        book_party = str(rec.get("book_party", ""))
        book_amt   = float(rec.get("book_amount", 0) or 0)
        bank_amt   = float(rec.get("bank_amount", 0) or 0)
        diff       = bank_amt - book_amt
        name_score = int(rec.get("name_score", 0) or 0)
        verdict    = str(rec.get("verdict", ""))

        matched_records.append({
            "Match Method":    verdict,
            "Name Match":      name_flag,
            "Fuzzy Score %":   name_score,
            "Amount Match":    amt_flag,
            "Book Date":       str(rec.get("book_date", "")),
            "Book Txn":        "Public Sale",
            "Book Bill No":    str(rec.get("book_bill", "")),
            "Book Chq":        "511",
            "Book Party":      book_party,
            "Book Direction":  "INFLOW",
            "Book Sender":     book_party,
            "Book Recipient":  "YES BANK",
            "Book Amt (Rs)":   book_amt,
            "Bank Date":       str(rec.get("bank_date", "")),
            "Bank Chq":        str(rec.get("bank_ref", "")),
            "Bank Description": bank_party,
            "Bank Party":      bank_party,
            "Bank Direction":  "INFLOW" if bank_amt else "",
            "Bank Sender":     bank_party if bank_amt else "",
            "Bank Recipient":  "YES BANK" if bank_amt else "",
            "Debit (Rs)":      "",
            "Credit (Rs)":     bank_amt if bank_amt else "",
            "Bank Amt (Rs)":   bank_amt,
            "Difference (Rs)": round(diff, 2),
            "Partial Payment": False,
            "Flags":           str(rec.get("verdict_reason", "")),
        })

    total_matched   = len(matched_records)  # cheque_match_report rows (= Matched sheet)

    # ── Per-gateway summary for frontend ─────────────────────────────────────
    gateway_summary = [
        {
            "name":       g["name"],
            "gw_net":     round(g["gw_net"],    2),
            "bank_total": round(g["bank_total"], 2),
            "gross":      round(g["gross"],      2),
            "fees":       round(g["fees"],       2),
            "tax":        round(g["tax"],        2),
            "difference": round(g["gw_net"] - g["bank_total"], 2),
            "matched":    len([r for r in g["brs_rows"] if r["Color"] == "GREEN"]),
            "unmatched":  len([r for r in g["brs_rows"] if r["Color"] != "GREEN"]),
        }
        for g in gateway_results
    ]

    return JSONResponse(_sanitize({
        "status":     "success",
        "recon_type": "gateway",

        "all_branches_file":   all_branches_file.filename,
        "hot_book_file":       hot_book_file.filename,
        "statement_file_name": statement_file.filename,
        "payu_files": [f.filename for f in payu_files],
        "previous_brs_file":   previous_brs_file.filename,
        "name_match_direct_file": name_match_direct_file.filename,
        "name_match_file":        name_match_file.filename,
        "total_orders_file":      total_orders_file.filename,

        "all_branches_sheets": all_branches_sheets,
        "hot_book_sheets":     hot_book_sheets,

        "matched":   matched_records,
        "book_only": book_only_records,
        "bank_only": bank_only_records,

        "brs":          brs,
        "company_name": "ORIENT EXCHANGE AND FINANCIAL SERVICES PVT LTD",
        "account_info": "YES BANK -- Gateway Account",
        "brs_date":     brs_date,

        "books_match":     books_match,
        "reconciled":      reconciled,
        "gateway_summary": gateway_summary,

        "summary": {
            "book_entries":      total_matched + total_book_only,
            "bank_entries":      total_matched + total_bank_only,
            "matched":           total_matched,
            "matched_perfect":   sum(1 for r in matched_records if r["Amount Match"] == "Exact"),
            "matched_with_diff": sum(1 for r in matched_records if r["Amount Match"] != "Exact"),
            "book_only":         total_book_only,
            "bank_only":         total_bank_only,
            "difference":        round(bank_bal - (closing_bal + total_add1 - total_dnc - total_less2 + total_cnb), 2),
        },

        "file_bytes": file_data.hex(),
        "file_name":  "Gateway_BRS.xlsx",
<<<<<<< HEAD
        "transaction_ref": transaction_ref,
    }))


# ── Gateway field-translation helpers ────────────────────────────────────────
# Same idea as the QR ones above: the frontend receives normalized field
# names (built in the endpoint above), but gateway_reconcilation.py's own
# internals — dnc_all / add1_all / cnb_all / less2_all / cheque_match_report
# — use a different raw shape. gateway_reconcilation.py keeps the two BRS
# directions as separate lists per side (dnc_all vs add1_all, cnb_all vs
# less2_all) rather than one Direction-tagged list like bank/QR, so the
# split-back-by-Direction here is what makes that work.

def _gw_records_to_dnc_add1(records):
    """Split edited book_only records back into dnc_all (INFLOW) and
    add1_all (OUTFLOW)."""
    dnc, add1 = [], []
    for r in (records or []):
        item = {
            "date":    r.get("Date", ""),
            "branch":  r.get("Branch", ""),
            "utr":     r.get("Bill No", ""),
            "party":   r.get("Book Report") or r.get("Party", ""),
            "amount":  r.get("Book Amt (Rs)", 0) or 0,
            "remark":  r.get("Narration", ""),
            "gateway": r.get("Gateway", ""),
            "cf":      bool(r.get("Is CF", False)),
        }
        (add1 if r.get("Direction") == "OUTFLOW" else dnc).append(item)
    return dnc, add1


def _gw_records_to_cnb_less2(records):
    """Split edited bank_only records back into cnb_all (INFLOW) and
    less2_all (OUTFLOW)."""
    cnb, less2 = [], []
    for r in (records or []):
        item = {
            "date":    r.get("Date", ""),
            "branch":  "",
            "utr":     r.get("Bill No", ""),
            "chq_no":  r.get("Chq No", ""),
            "party":   r.get("Bank Statement") or r.get("Party", ""),
            "amount":  r.get("Bank Amt (Rs)", 0) or 0,
            "remark":  r.get("Narration", ""),
            "gateway": r.get("Gateway", ""),
            "cf":      bool(r.get("Is CF", False)),
        }
        (less2 if r.get("Direction") == "OUTFLOW" else cnb).append(item)
    return cnb, less2


def _gw_records_to_matched(records):
    out = []
    for r in (records or []):
        out.append({
            "verdict":            r.get("Match Method", ""),
            "verdict_reason":     r.get("Flags", ""),
            "name_score":         r.get("Fuzzy Score %", 0) or 0,
            "book_date":          r.get("Book Date", ""),
            "book_bill":          r.get("Book Bill No", ""),
            "book_party":         r.get("Book Party", ""),
            "book_amount":        r.get("Book Amt (Rs)", 0) or 0,
            "bank_date":          r.get("Bank Date", ""),
            "bank_ref":           r.get("Bank Chq", ""),
            "bank_party":         r.get("Bank Party", ""),
            "bank_amount":        r.get("Bank Amt (Rs)", 0) or 0,
            "gateway":            "",
            "total_order_branch": "",
            "name_label":         "",
            "amount_diff":        abs(r.get("Difference (Rs)", 0) or 0),
        })
    return out


class RegenerateGatewayRequest(BaseModel):
    transaction_ref: str
    matched:   List[Dict[str, Any]]
    book_only: List[Dict[str, Any]]
    bank_only: List[Dict[str, Any]]


@app.post(
    "/reconcile/regenerate-gateway",
    summary="Rebuild a Gateway reconciliation workbook from in-app edits (un-match / manual match).",
)
async def regenerate_gateway_endpoint(payload: RegenerateGatewayRequest):
    ref = (payload.transaction_ref or "").strip("/")
    parts = ref.split("/")
    if len(parts) != 3:
        raise HTTPException(status_code=400, detail=f"Malformed transaction_ref: '{payload.transaction_ref}'")
    date_folder, recon_type, txn_name = parts
    if recon_type != "gateway":
        raise HTTPException(
            status_code=400,
            detail=f"This endpoint only regenerates 'gateway' reconciliations (got '{recon_type}').",
        )

    txn_dir = os.path.join(TRANSACTIONS_DIR, date_folder, recon_type, txn_name)
    if not os.path.isdir(txn_dir):
        raise HTTPException(status_code=404, detail=f"Transaction not found: '{ref}'")

    def _find_one(prefix):
        for fname in sorted(os.listdir(txn_dir)):
            if fname.startswith(prefix) and not fname[len(prefix):len(prefix) + 1].isdigit():
                return os.path.join(txn_dir, fname)
        return None

    def _find_many(prefix):
        out = []
        for fname in sorted(os.listdir(txn_dir)):
            stem = os.path.splitext(fname)[0]
            if stem.startswith(prefix) and stem[len(prefix):].isdigit():
                out.append(os.path.join(txn_dir, fname))
        return out

    all_branches_path = _find_one("all_branches")
    hot_book_path      = _find_one("hot_book")
    stmt_path           = _find_one("yes_bank_statement")
    prev_brs_path       = _find_one("previous_brs")
    name_match_direct_path = _find_one("name_match_direct")
    name_match_path         = _find_one("name_match")
    total_orders_path       = _find_one("total_orders")
    payu_paths     = _find_many("payu")
    payu_od_paths  = _find_many("payu_od")
    cashfree_paths = _find_many("cashfree")
    easebuzz_paths = _find_many("easebuzz")
    smart_pay_paths = _find_many("smart_pay")

    if not all_branches_path or not hot_book_path or not stmt_path or not payu_paths:
        raise HTTPException(status_code=404, detail=f"Original input files missing for transaction '{ref}'.")
    if prev_brs_path and os.path.getsize(prev_brs_path) == 0:
        prev_brs_path = None

    out_tmpdir = tempfile.mkdtemp()
    try:
        output_path = os.path.join(out_tmpdir, "Gateway_BRS.xlsx")

        override_dnc, override_add1   = _gw_records_to_dnc_add1(payload.book_only)
        override_cnb, override_less2  = _gw_records_to_cnb_less2(payload.bank_only)
        override_matched              = _gw_records_to_matched(payload.matched)

        (gateway_results, dnc_all, cnb_all, add1_all, less2_all,
         closing_bal, bank_bal, reconciled, brs_date, books_match,
         cheque_match_report, *_rest) = process_gateway_files(
            all_branches_path      = all_branches_path,
            hot_book_path          = hot_book_path,
            statement_path         = stmt_path,
            payu_paths              = payu_paths,
            output_path              = output_path,
            payu_od_paths             = payu_od_paths,
            cashfree_path              = cashfree_paths,
            easebuzz_paths              = easebuzz_paths,
            smart_pay_paths              = smart_pay_paths,
            prev_brs_path                 = prev_brs_path,
            name_match_direct_path         = name_match_direct_path,
            name_match_path                 = name_match_path,
            total_orders_path                = total_orders_path,
            override_dnc                      = override_dnc,
            override_add1                      = override_add1,
            override_cnb                        = override_cnb,
            override_less2                       = override_less2,
            override_matched                      = override_matched,
        )

        with open(output_path, "rb") as f:
            file_data = f.read()

        # Per product decision: downloading after edits becomes the new
        # permanent record for this transaction — overwrite the archive.
        shutil.copy2(output_path, os.path.join(txn_dir, "Gateway_BRS.xlsx"))

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to regenerate Gateway workbook: {e}")
    finally:
        gc.collect()
        shutil.rmtree(out_tmpdir, ignore_errors=True)

    total_add1  = sum(i["amount"] for i in add1_all)
    total_dnc   = sum(i["amount"] for i in dnc_all)
    total_less2 = sum(i["amount"] for i in less2_all)
    total_cnb   = sum(i["amount"] for i in cnb_all)

    return JSONResponse(_sanitize({
        "status":          "success",
        "recon_type":      "gateway",
        "transaction_ref": ref,
        "summary": {
            "matched":    len(cheque_match_report),
            "book_only":  len(dnc_all) + len(add1_all),
            "bank_only":  len(cnb_all) + len(less2_all),
            "difference": round(bank_bal - (closing_bal + total_add1 - total_dnc - total_less2 + total_cnb), 2),
            "reconciled": reconciled,
        },
        "file_bytes": file_data.hex(),
        "file_name":  "Gateway_BRS.xlsx",
=======
>>>>>>> 89540cc6622848db88645975db4d2eb7ff4d6852
    }))


@app.get("/", summary="API status")
def root():
    return {
        "status":  "ok",
        "message": "POST /reconcile/reconcile-bank (bank) | /reconcile/reconcile-qr (QR) | /reconcile/reconcile-gateway (Gateway YES Bank)",
    }


@app.get("/reconcile/file-download", summary="Download all archived transactions as a zip.")
def file_download(background_tasks: BackgroundTasks):
    if not os.path.isdir(TRANSACTIONS_DIR) or not os.listdir(TRANSACTIONS_DIR):
        raise HTTPException(status_code=404, detail="No transactions archived yet.")

    tmp_zip = tempfile.NamedTemporaryFile(delete=False, suffix=".zip")
    tmp_zip.close()

    with zipfile.ZipFile(tmp_zip.name, "w", zipfile.ZIP_DEFLATED) as zf:
        for root_dir, _, files in os.walk(TRANSACTIONS_DIR):
            for fname in files:
                fpath   = os.path.join(root_dir, fname)
                arcname = os.path.join("Transactions", os.path.relpath(fpath, TRANSACTIONS_DIR))
                zf.write(fpath, arcname)

    background_tasks.add_task(os.remove, tmp_zip.name)

    return FileResponse(
        tmp_zip.name,
        media_type="application/zip",
        filename="Transactions.zip",
    )