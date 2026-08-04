from fastapi import FastAPI, UploadFile, File, HTTPException, BackgroundTasks
from fastapi.responses import JSONResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
import os, tempfile, gc, shutil
import zipfile
import threading
from datetime import datetime
import math
import numpy as np

from reconcilation import (
    process_files, get_sheet_metadata,
    parse_book, parse_statement, extract_brs_date, parse_date,
    detect_book_sheet, safe_read_excel, find_book_bank_id, extract_account_from_book, count_book_transactions_by_bill_no
)
from qr_reconcilation import process_qr_files, count_transactions_by_bill_no_and_name
from gateway_reconcilation import process_gateway_files
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
    try:
        txn_dir = _next_transaction_dir(recon_type)
        for src_path, save_name in input_files:
            if src_path and os.path.exists(src_path):
                shutil.copy2(src_path, os.path.join(txn_dir, save_name))
        if output_path and os.path.exists(output_path):
            shutil.copy2(output_path, os.path.join(txn_dir, output_name))
    except Exception as e:
        print(f"[archive] Failed to archive {recon_type} transaction: {e}")

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
        
        _archive_transaction("bank", [
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
        "file_name":  "Reconciliation.xlsx"
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
        
        _archive_transaction("qr", [
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
        "PayU On-Demand, CashFree, EaseBuzz, Previous BRS optional."
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
    previous_brs_file: UploadFile = File(..., description="Previous day BRS workbook (.xlsx)"),
    name_match_direct_file: UploadFile = File(..., description="Name Matching Report - Direct payment workbook (.xlsx)"),
    name_match_file:        UploadFile = File(..., description="Name Matching Report workbook (.xlsx)"),
    total_orders_file:      UploadFile = File(..., description="Total Orders List workbook (.xlsx)"),
):
    # Validate file extensions
    for f in [all_branches_file, hot_book_file]:
        _validate_filename(f.filename)
    for f in payu_files + payu_od_files + cashfree_files:
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
        _gw_inputs.append((prev_brs_path, f"previous_brs{_ext(previous_brs_file.filename)}"))
        _gw_inputs.append((name_match_direct_path, f"name_match_direct{_ext(name_match_direct_file.filename)}"))
        _gw_inputs.append((name_match_path,        f"name_match{_ext(name_match_file.filename)}"))
        _gw_inputs.append((total_orders_path,      f"total_orders{_ext(total_orders_file.filename)}"))

        _archive_transaction("gateway", _gw_inputs, output_path, "Gateway_BRS.xlsx")
        


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
    total_book_only = len(dnc_all)
    total_bank_only = len(cnb_all)

    # ── Normalise book_only (DNC) for frontend ────────────────────────────────
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

    # ── Normalise bank_only (CNB) for frontend ────────────────────────────────
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
    }))


@app.get("/", summary="API status")
def root():
    return {
        "status":  "ok",
        "message": "POST /reconcile (bank) | /reconcile-qr (QR) | /reconcile-gateway (Gateway YES Bank)",
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