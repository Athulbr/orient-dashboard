import re
import sys
from pathlib import Path
from datetime import datetime
from itertools import combinations

import pandas as pd
from difflib import SequenceMatcher
from openpyxl import Workbook
from openpyxl.styles import PatternFill, Font, Alignment, Border, Side
from openpyxl.utils import get_column_letter

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

# ══════════════════════════════════════════════════════════════════════════════
#  CONFIG
# ══════════════════════════════════════════════════════════════════════════════
FUZZY_THRESH = 90
FUZZY_ACCEPT = 60

# ══════════════════════════════════════════════════════════════════════════════
#  DATE UTILITY
# ══════════════════════════════════════════════════════════════════════════════
_DATE_RE = re.compile(r"(\d{2}\.\d{2}\.\d{4})")

def _extract_date_from_text(text):
    m = _DATE_RE.search(str(text))
    return datetime.strptime(m.group(1), "%d.%m.%Y") if m else None

# ══════════════════════════════════════════════════════════════════════════════
#  STYLE HELPERS
# ══════════════════════════════════════════════════════════════════════════════
def fill(hex_c):
    return PatternFill("solid", fgColor=hex_c)

def font(bold=False, color="000000", size=9):
    return Font(bold=bold, color=color, size=size, name="Calibri")

def _side(color="BFBFBF"):
    return Side(style="thin", color=color)

def border(color="BFBFBF"):
    s = _side(color)
    return Border(left=s, right=s, top=s, bottom=s)

def no_border():
    n = Side(style=None)
    return Border(left=n, right=n, top=n, bottom=n)

def align(h="left", wrap=True):
    return Alignment(horizontal=h, vertical="center", wrap_text=wrap)

C_NAVY  = "1F3864"
C_BLUE  = "2E75B6"
C_LBLUE = "D9E1F2"
C_GREEN = "C6EFCE"
C_AMBER = "FFEB9C"
C_RED   = "FFC7CE"
C_ORNG  = "FCE4D6"
C_GREY  = "F2F2F2"
C_WHITE = "FFFFFF"
C_CF    = "E2EFDA"
C_RED_H = "C00000"

_BR = border()
_NF = font()
_BF = font(bold=True)

def set_cell(ws, r, c, val=None, bg=None, bold=False, color="000000",
             size=9, h_align="left", num_fmt=None, bdr=True):
    cell = ws.cell(row=r, column=c, value=val)
    if bg:       cell.fill      = fill(bg)
    cell.font      = font(bold, color, size)
    cell.border    = _BR if bdr else no_border()
    cell.alignment = align(h_align)
    if num_fmt:  cell.number_format = num_fmt
    return cell

def write_header_row(ws, r, headers, bg=C_NAVY, cols=None):
    cols = cols or list(range(1, len(headers) + 1))
    for col, h in zip(cols, headers):
        c = ws.cell(row=r, column=col, value=h)
        c.fill      = fill(bg)
        c.font      = Font(bold=True, color="FFFFFF", name="Calibri", size=10)
        c.border    = _BR
        c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
    ws.row_dimensions[r].height = 24

def write_title_row(ws, r, text, n_cols, bg=C_NAVY):
    ws.merge_cells(start_row=r, start_column=1, end_row=r, end_column=n_cols)
    c = ws.cell(row=r, column=1, value=text)
    c.fill      = fill(bg)
    c.font      = Font(bold=True, color="FFFFFF", name="Calibri", size=12)
    c.border    = _BR
    c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
    ws.row_dimensions[r].height = 28

def col_widths(ws, widths):
    for i, w in enumerate(widths, 1):
        ws.column_dimensions[get_column_letter(i)].width = w

# ══════════════════════════════════════════════════════════════════════════════
#  UTILITY FUNCTIONS
# ══════════════════════════════════════════════════════════════════════════════
def name_sim(a, b):
    if not a or not b:
        return 0
    return int(SequenceMatcher(None,
                               str(a).upper(),
                               str(b).upper()).ratio() * 100)

def normalize_party(text):
    text = str(text or "").replace("INDIVI - ", "").strip()
    return re.sub(r"\s+", " ", text.upper())

def _clean_makez_extracted(name):
    if not name or str(name).strip().lower() in ("", "nan", "none"):
        return ""
    s = str(name).upper().strip()
    for prefix in ("MR.", "MRS.", "MS.", "DR.", "INDIVI - ", "M/S ", "M/S. "):
        if s.startswith(prefix):
            s = s[len(prefix):].strip()
    s = re.sub(r"[^A-Z0-9 ]", " ", s)
    return re.sub(r"\s+", " ", s).strip()

def _find_section(df, header_fragment, data_col=5):
    """
    Dynamically locate a named section in the previous BRS sheet.

    Scans column 0 for a row containing header_fragment (case-insensitive).
    Collects subsequent rows until data_col becomes non-numeric (subtotal/blank).
    Also skips rows whose col-0 date is empty (formula/SUM rows pandas reads
    as numeric).

    Handles output-format section headers which may have extra spaces or
    slightly different wording (e.g. "Less :  Cheques deposited…" vs
    "Less: Cheques deposited…").
    """
    import re as _re
    def _norm(s):
        s = _re.sub(r"\s+", " ", s.strip()).lower()
        s = _re.sub(r"\s*:\s*", ":", s)   # "less : cheques" → "less:cheques"
        return s
    frag_norm = _norm(header_fragment)

    rows = []
    in_section = False
    for idx in df.index:
        cell0 = str(df.at[idx, 0]).strip() if pd.notna(df.at[idx, 0]) else ""
        if not in_section:
            if frag_norm in _norm(cell0):
                in_section = True
            continue
        # Skip the sub-header row that labels the columns (e.g. "Date", "Branch", …)
        if cell0.strip().lower() in ("date", "sl no", "sl.no.", "sr no", "sr.no."):
            continue
        val = df.at[idx, data_col]
        num = pd.to_numeric(val, errors="coerce")
        if pd.isna(num):
            break   # subtotal or blank row — end of section
        date_val = df.at[idx, 0]
        if not pd.notna(date_val) or str(date_val).strip() in ("", "nan"):
            continue  # formula row whose amount pandas read as numeric — skip
        rows.append(idx)
    return df.loc[rows] if rows else df.iloc[0:0]


# ══════════════════════════════════════════════════════════════════════════════
#  DBA MAP
# ══════════════════════════════════════════════════════════════════════════════
DBA_MAP = {
    "ORIENT EXCHANGE AHMEDABAD"              : "AHMD",
    "ORIENT EXCHANGE BANGALORE WHITEFIELD"   : "BANW",
    "ORIENT EXCHANGE BANGALORE BASAVANAGUDI" : "BANH",
    "ORIENT EXCHANGE DELHI"                  : "DLHI",
    "ORIENT EXCHANGE PUNE"                   : "PUNE",
    "ORIENT EXCHANGE VADODARA"               : "VADO",
    "ORIENT EXCHANGE CHENNAI"                : "CHN",
    "ORIENT EXCHANGE MUMBAI DADAR"           : "MUMD",
    "ORIENT EXCHANGE MUMBAI VILEPARLE"       : "MUMV",
    "ORIENT EXCHANGE HYDERABAD"              : "HYD",
    "ORIENT EXCHANGE SURAT"                  : "SURAT",
    "ORIENT EXCHANGE KOLKATA"                : "KOL",
    "ORIENT EXCHANGE KOTTAYAM"               : "KTM",
    "ORIENT EXCHANGE TRIVANDRUM"             : "TVM",
    "ORIENT EXCHANGE COIMBATORE"             : "COMB",
    "ORIENT EXCHANGE THRISSUR"               : "THRI",
    "ORIENT EXCHANGE JALANDHAR"              : "JLDR",
    "ORIENT EXCHANGE  GURUGRAM"              : "GURG",
    "ORIENT EXCHANGE MANGALORE"              : "MNGLR",
    "ORIENT EXCHANGE CHANDIGARH"             : "CHAD",
    "ORIENT EXCHANGE KOCHIN"                 : "COMGR",
    "ORIENT EXCHANGE BELGAUM"                : "BELG",
    "ORIENT EXCHANGE KOCHI EXIM"             : "COARP",
    "ORIENT EXCHANGE CORPORATE"              : "COARP",
    "ORIENT EXCHANGE KOCHI CORPORATE"        : "COARP",
    "ORIENT EXCHANGE AMRITSAR"               : "AMTR",
    "ORIENT EXCHANGE KOLLAM"                 : "KOLM",
    "ORIENT EXCHANGE CALICUT"                : "CALCT",
}


# ══════════════════════════════════════════════════════════════════════════════
#  PUBLIC API — called by app.py
# ══════════════════════════════════════════════════════════════════════════════

def process_qr_files(
    all_branches_path,
    hot_book_path,
    qr_stmt_path,
    output_path,
    prev_brs_path,
    brs_date_override=None,
):
    """
    Run full QR reconciliation and write the output workbook.

    Parameters
    ----------
    all_branches_path  : str | Path  — All-branches book report xlsx
    hot_book_path      : str | Path  — HOT QRHDFC book report xlsx
    qr_stmt_path       : str | Path  — QR-HDFC gateway statement xlsx
    output_path        : str | Path  — Where to write the output workbook
    prev_brs_path      : str | Path  — Previous day BRS xlsx (must have sheet 'QR-HDFC')
    brs_date_override  : str | None  — "dd.mm.yyyy"; auto-detected from filename if None

    Returns
    -------
    (matched_df, dnc_df, cnb_df,
     closing_bal, bank_bal, reconciled,
     brs_date, books_match, corr_amts)
    """
    ALL_BRANCHES_FILE = Path(all_branches_path)
    HOT_QRHDFC_FILE   = Path(hot_book_path)
    STATEMENT_FILE    = Path(qr_stmt_path)
    PREV_BRS_FILE     = Path(prev_brs_path)
    OUTPUT_FILE       = str(output_path)

    # ── Determine BRS date ────────────────────────────────────────────────────
    # BRS_DATE is the date of the statement / data being reconciled.
    stmt_date = _extract_date_from_text(STATEMENT_FILE.name)
    if brs_date_override:
        stmt_date = datetime.strptime(brs_date_override, "%d.%m.%Y")
    if stmt_date is None:
        stmt_date = datetime.today()
    BRS_DATE = stmt_date.strftime("%d.%m.%Y")

    print("Loading files...")
    print(f"  All-branches book : {ALL_BRANCHES_FILE}")
    print(f"  HOT QRHDFC book   : {HOT_QRHDFC_FILE}")
    print(f"  Statement         : {STATEMENT_FILE}")
    print(f"  Previous BRS      : {PREV_BRS_FILE}")
    print(f"  Output            : {OUTPUT_FILE}")
    print(f"  BRS Date          : {BRS_DATE}")

    # ── Validate input files exist and are readable before touching any data ──
    _file_labels = {
        ALL_BRANCHES_FILE : "All-Branches Book Report",
        HOT_QRHDFC_FILE   : "HOT QRHDFC Book Report",
        STATEMENT_FILE    : "QR-HDFC Gateway Statement",
        PREV_BRS_FILE     : "Previous BRS File",
    }
    for _fp, _label in _file_labels.items():
        if not _fp.exists():
            raise FileNotFoundError(
                f"\n❌  FILE NOT FOUND — {_label}\n"
                f"    Expected : {_fp}\n"
                f"    Please check the path and try again."
            )
        if _fp.suffix.lower() not in (".xlsx", ".xls", ".xlsm", ".ods"):
            raise ValueError(
                f"\n❌  UNSUPPORTED FILE FORMAT — {_label}\n"
                f"    File     : {_fp}\n"
                f"    Expected an Excel file (.xlsx / .xls / .xlsm)"
            )
    print("  All input files validated ")

    # ══════════════════════════════════════════════════════════════════════════
    #  STEP 1 — LOAD DATA
    # ══════════════════════════════════════════════════════════════════════════

    # ── All Branches ──────────────────────────────────────────────────────────
    try:
        df_all = pd.read_excel(ALL_BRANCHES_FILE, sheet_name=0, header=None)
    except Exception as _e:
        raise RuntimeError(f"❌  Failed to read All-Branches Book Report\n    File: {ALL_BRANCHES_FILE}\n    Error: {_e}") from _e

    SKIP = {"Transaction", "QRHDFC", "Public Sale", "Receipts", "Payments",
            "Summary Of QRHDFC", "nan", ""}
    cur_br = None
    bl = []
    for _, row in df_all.iterrows():
        v = str(row[0]).strip() if pd.notna(row[0]) else ""
        if v not in SKIP:
            cur_br = v
        bl.append(cur_br)
    df_all["_br"] = bl

    ps = df_all[df_all[0] == "Public Sale"].copy()
    ps["date"]    = pd.to_datetime(ps[2], errors="coerce")
    ps["bill_no"] = "PS-" + ps[3].astype(str).str.strip()
    ps["branch"]  = ps["_br"].str.split(" - ").str[0]
    ps["party"]   = ps[6].astype(str).str.replace("INDIVI - ", "", regex=False).str.strip()
    ps["amount"]  = pd.to_numeric(ps[7], errors="coerce").fillna(0)

    ap = df_all[df_all[0] == "Payments"].copy()
    ap["amount"]    = pd.to_numeric(ap[9], errors="coerce").fillna(0)
    ap["narration"] = ap[13].astype(str).str.strip()
    ap["bill_no"]   = "PS-" + ap[3].astype(str).str.strip()
    ap["date"]      = pd.to_datetime(ap[2], errors="coerce")
    ap["branch"]    = ap["_br"].str.split(" - ").str[0]

    ar = df_all[df_all[0] == "Receipts"].copy()
    ar["amount"] = pd.to_numeric(ar[7], errors="coerce").fillna(0)

    # ── HOT QRHDFC Book ───────────────────────────────────────────────────────
    try:
        df_hot = pd.read_excel(HOT_QRHDFC_FILE, sheet_name=0, header=None)
    except Exception as _e:
        raise RuntimeError(f"❌  Failed to read HOT QRHDFC Book Report\n    File: {HOT_QRHDFC_FILE}\n    Error: {_e}") from _e

    hot_rec = df_hot[df_hot[0] == "Receipts"].copy()
    hot_rec["amount"]    = pd.to_numeric(hot_rec[7], errors="coerce").fillna(0)
    hot_rec["narration"] = hot_rec[13].astype(str).str.strip()

    hot_pay = df_hot[df_hot[0] == "Payments"].copy()
    hot_pay["amount"]    = pd.to_numeric(hot_pay[9], errors="coerce").fillna(0)
    hot_pay["bill_no"]   = "PS-" + hot_pay[3].astype(str).str.strip()
    hot_pay["narration"] = hot_pay[13].astype(str).str.strip()
    hot_pay["date"]      = pd.to_datetime(hot_pay[2], errors="coerce")
    hot_pay["branch"]    = hot_pay[6].astype(str).str.split(" - ").str[0].str.strip()

    # ── Fix A: identify HOT book entries whose narration flags "WRONGLY ACCOUNTED".
    #    These are manually tagged as erroneous/corrected entries and must be
    #    excluded from BRS matching — keeping them creates phantom DNC entries
    #    and can block valid bank matches (e.g. PS-6202167 / KATTA RAJENDRA 95000).
    _WRONGLY_ACCOUNTED_MARKER = "WRONGLY ACCOUNTED"
    hot_pay["is_wrongly_accounted"] = hot_pay["narration"].str.upper().str.contains(
        _WRONGLY_ACCOUNTED_MARKER, na=False
    )
    _wrongly_accounted_bills = set(
        hot_pay.loc[hot_pay["is_wrongly_accounted"], "bill_no"]
    )
    if _wrongly_accounted_bills:
        print(f"  [Fix A] Excluding {len(_wrongly_accounted_bills)} 'WRONGLY ACCOUNTED' "
              f"book entries from BRS matching: {sorted(_wrongly_accounted_bills)}")

    hot_summary = df_hot[df_hot[0] == "Summary Of QRHDFC"].iloc[0]
    closing_bal = float(hot_summary[11])
    print(f"  HOT closing balance: {closing_bal:,.0f}")

    # ── HDFC Statement ────────────────────────────────────────────────────────
    try:
        df_stmt = pd.read_excel(STATEMENT_FILE, sheet_name=0, header=0)
    except Exception as _e:
        raise RuntimeError(f"❌  Failed to read QR-HDFC Gateway Statement\n    File: {STATEMENT_FILE}\n    Error: {_e}") from _e
    # Normalise column names to lowercase so both the old format (already
    # lowercase) and the new format (Title Case, e.g. "Transaction Date")
    # are handled transparently.  All subsequent accesses use lowercase keys.
    df_stmt.columns = [c.strip().lower() for c in df_stmt.columns]
    df_stmt = df_stmt[df_stmt["transaction state"] != "transaction state"].copy()
    df_stmt["amount(rs.)"]      = pd.to_numeric(df_stmt["amount(rs.)"], errors="coerce").fillna(0)
    df_stmt["transaction date"] = pd.to_datetime(df_stmt["transaction date"], errors="coerce")
    name_col = [c for c in df_stmt.columns
                if "payer" in c.lower() or c == df_stmt.columns[-1]][0]

    df_stmt["branch_code"] = df_stmt["doing business as"].map(DBA_MAP).fillna(
        df_stmt["doing business as"])
    stmt_success = df_stmt[df_stmt["transaction state"] == "SaleSuccess"].copy()
    stmt_failed  = df_stmt[df_stmt["transaction state"] == "SaleFailed"].copy()

    # ── Previous BRS ──────────────────────────────────────────────────────────
    # Auto-detect whether the prev BRS is an output file produced by this script
    # (contains sheets like "Cheque Deposit", "QR BRS Statement", etc.) or the
    # original "QR-HDFC" source format. The output format has an extra column
    # before Amount so _PREV_DATA_COL and sibling column indices must shift.
    _prev_xl      = pd.ExcelFile(PREV_BRS_FILE)
    _prev_sheets  = _prev_xl.sheet_names
    _OUTPUT_SHEET_HINTS = ("CHEQUE DEPOSIT", "BANK GATEWAY", "RECO ITEMS",
                           "HOT SETTLEMENTS", "QR BRS STATEMENT", "CF AUDIT TRAIL")
    _is_output_fmt = any(
        any(s.upper().startswith(h) for h in _OUTPUT_SHEET_HINTS)
        for s in _prev_sheets
    )
    # Fix B: warn when the script's own output is used as prev_brs.
    # This is the root cause of stale CF items — the script carries
    # partial/low-match entries as CF, which the manual BRS does not.
    # Long-term fix: always supply the MANUAL BRS as prev_brs_path.
    if _is_output_fmt:
        print(
            "\n⚠  [Fix B] WARNING: prev_brs appears to be a SCRIPT-GENERATED output file."
            "\n   This can cause stale carry-forwards (items the manual BRS already cleared)."
            "\n   Best practice: always use the MANUAL BRS as the prev_brs input.\n"
        )

    if _is_output_fmt and "QR BRS Statement" in _prev_sheets:
        print(f"[Prev BRS] Detected output-format file — using 'QR BRS Statement' sheet")
        prev           = pd.read_excel(PREV_BRS_FILE, sheet_name="QR BRS Statement", header=None)
        _PREV_DATA_COL = 8   # output format: Date|Branch|BillNo|RRN|ChqNo|BookReport|BankStmt|Makez|Amount|...
        _PREV_RRN_COL  = 3
        _PREV_PARTY_COL= 7
    elif "QR-HDFC" in _prev_sheets:
        prev           = pd.read_excel(PREV_BRS_FILE, sheet_name="QR-HDFC", header=None)
        _PREV_DATA_COL = 5   # original format: Date|Branch|RRN|...|Party|Amount|...
        _PREV_RRN_COL  = 2
        _PREV_PARTY_COL= 4
    else:
        # Fallback: try first sheet
        prev           = pd.read_excel(PREV_BRS_FILE, sheet_name=0, header=None)
        _PREV_DATA_COL = 5
        _PREV_RRN_COL  = 2
        _PREV_PARTY_COL= 4
        print(f"[Prev BRS] WARNING: No recognised sheet found — using first sheet: '{_prev_sheets[0]}'")

    # ══════════════════════════════════════════════════════════════════════════
    #  STEP 2 — DETECT CORRECTION ENTRIES
    # ══════════════════════════════════════════════════════════════════════════
    print("Detecting correction entries...")
    rec_pool  = ar["amount"].tolist()
    corr_amts = []
    for amt in ap["amount"].tolist():
        if amt in rec_pool:
            corr_amts.append(amt)
            rec_pool.remove(amt)
    corr_amts_set = set(corr_amts)

    ap["is_correction"] = False
    pool = corr_amts.copy()
    for idx in ap.index:
        a = ap.at[idx, "amount"]
        if a in pool:
            ap.at[idx, "is_correction"] = True
            pool.remove(a)

    print(f"  Correction amounts found: {[int(x) for x in set(corr_amts)]}")

    # Previous CNB rows can represent credits that were already in bank and
    # are only waiting for the book entry. Keep these handy before Pass 5 so
    # a current-day near-amount bank credit does not consume the book entry
    # that should clear an exact previous carry-forward.
    _prev_add_for_match = _find_section(
        prev, "Add: Credited in pass book but not debited",
        data_col=_PREV_DATA_COL,
    ).copy()
    _prev_add_for_match[_PREV_DATA_COL] = pd.to_numeric(
        _prev_add_for_match[_PREV_DATA_COL], errors="coerce"
    )
    _prev_add_for_match = _prev_add_for_match[
        _prev_add_for_match[_PREV_DATA_COL].notna()
        & (_prev_add_for_match[_PREV_DATA_COL] > 0)
    ]
    _prev_cnb_exact_lookup = []
    for _, _r in _prev_add_for_match.iterrows():
        _amt = float(_r[_PREV_DATA_COL])
        if _amt in corr_amts_set:
            continue
        _prev_cnb_exact_lookup.append({
            "branch": str(_r[1]).strip(),
            "amount": _amt,
            "party": str(_r[_PREV_PARTY_COL]).strip(),
        })

    def _has_prev_cnb_exact_for_book(book_row):
        for _cf in _prev_cnb_exact_lookup:
            if _cf["branch"] != book_row["branch"]:
                continue
            if abs(_cf["amount"] - float(book_row["amount"])) > 0.005:
                continue
            if name_sim(normalize_party(book_row["party"]),
                        normalize_party(_cf["party"])) >= FUZZY_ACCEPT:
                return True
        return False

    # ══════════════════════════════════════════════════════════════════════════
    #  STEP 3 — BOOKS MATCH CHECK
    # ══════════════════════════════════════════════════════════════════════════
    total_all_pay = ap["amount"].sum()
    total_hot_rec = hot_rec["amount"].sum()
    books_match   = abs(total_all_pay - total_hot_rec) < 1

    print(f"\nBOOKS MATCH CHECK:")
    print(f"  All-Branches Payments : Rs. {total_all_pay:,.0f}")
    print(f"  HOT QRHDFC Receipts   : Rs. {total_hot_rec:,.0f}")
    print(f"  {'MATCH' if books_match else 'MISMATCH'}")

    # ══════════════════════════════════════════════════════════════════════════
    #  STEP 4 — MATCH BOOK vs BANK STATEMENT
    # ══════════════════════════════════════════════════════════════════════════
    print(f"\nMatching book vs bank statement (fuzzy threshold: {FUZZY_THRESH}%)...")

    bank_pool = stmt_success.copy().reset_index(drop=True)
    # Fix A: exclude WRONGLY ACCOUNTED book entries from the matching pool.
    # They are tracked separately so the Cheque Deposit sheet still shows them
    # (with "WRONGLY ACCOUNTED" narration) but they don't land in DNC.
    _ps_for_match = ps[~ps["bill_no"].isin(_wrongly_accounted_bills)]
    book_df   = _ps_for_match.copy().reset_index(drop=True)

    method_priority = {
        "1-Amt+Branch+Date" : 5,
        "1B-Amt+Branch±1day": 4,
        "2-Amt+Date"        : 3,
        "2B-Amt±1day"       : 2,
        "3-AmtOnly"         : 1,
        "5-NearAmt(Diff)"   : 0,
    }

    scored_pairs = []
    for bi, bk in book_df.iterrows():
        b_amt  = bk["amount"]
        b_br   = bk["branch"]
        b_date = bk["date"]
        b_pty  = bk["party"]

        for bki, brow in bank_pool.iterrows():
            if b_amt != brow["amount(rs.)"]:
                continue

            bk_br    = brow["branch_code"]
            bk_date  = brow["transaction date"]
            bk_name  = brow[name_col]

            date_diff    = (abs((bk_date - b_date).days)
                            if pd.notna(bk_date) and pd.notna(b_date) else 999)
            branch_match = (bk_br == b_br)

            if   branch_match and date_diff == 0: method = "1-Amt+Branch+Date"
            elif branch_match and date_diff <= 1: method = "1B-Amt+Branch±1day"
            elif date_diff == 0:                  method = "2-Amt+Date"
            elif date_diff <= 1:                  method = "2B-Amt±1day"
            else:                                 method = "3-AmtOnly"

            sc = name_sim(b_pty, bk_name)
            scored_pairs.append((bi, bki, sc, method, method_priority[method]))

    scored_pairs.sort(key=lambda x: (x[4], x[2]), reverse=True)

    matched_book = set()
    matched_bank = set()
    matched_rows = []

    for bi, bki, sc, method, priority in scored_pairs:
        if bi in matched_book or bki in matched_bank:
            continue

        bk       = book_df.loc[bi]
        row      = bank_pool.loc[bki]
        b_br     = bk["branch"]
        b_pty    = bk["party"]
        b_amt    = bk["amount"]
        bank_br  = row["branch_code"]
        branch_matches   = (bank_br == b_br)
        is_branch_locked = method in ("1-Amt+Branch+Date", "1B-Amt+Branch±1day")

        if not is_branch_locked and sc < FUZZY_ACCEPT and not branch_matches:
            continue

        matched_book.add(bi)
        matched_bank.add(bki)

        nm   = ("Match"   if sc >= FUZZY_THRESH else
                "Partial" if sc >= FUZZY_ACCEPT else "Low")
        flag = ""
        if FUZZY_ACCEPT <= sc < FUZZY_THRESH:
            flag = f"Name {sc}% — verify"
        elif sc < FUZZY_ACCEPT:
            br_note = ("" if branch_matches
                       else f" (branch mismatch: book={b_br}, bank={bank_br})")
            flag = f"⚠ Low name ({sc}%){br_note} — manual check"

        matched_rows.append({
            "Method"      : method,
            "Name Match"  : nm,
            "Amount Match": "Exact",
            "Score%"      : sc,
            "Book Date"   : bk["date"].strftime("%d.%m.%Y") if pd.notna(bk["date"]) else "",
            "Book Branch" : b_br,
            "Book Bank"   : "QRHDFC",
            "Book Bill No": bk["bill_no"],
            "Book Chq No" : 511,
            "Book Party"  : "INDIVI - " + b_pty,
            "Book Amt"    : b_amt,
            "Bank Date"   : row["transaction date"].strftime("%d.%m.%Y") if pd.notna(row["transaction date"]) else "",
            "Bank Time"   : str(row.get("transaction time", "")),
            "Bank Branch" : bank_br,
            "Bank Payer"  : row[name_col],
            "Bank Amt"    : row["amount(rs.)"],
            "Bank RRN"    : str(row["rrn no"]),
            "Pay Type"    : row.get("payment type", ""),
            "Diff"        : b_amt - row["amount(rs.)"],
            "Flags"       : flag,
        })

    # ── Pass 4: N-way split matching ─────────────────────────────────────────
    print("  Detecting split-amount matches...")
    for bi, bk in book_df.iterrows():
        if bi in matched_book:
            continue

        b_amt  = bk["amount"]
        b_br   = bk["branch"]
        b_pty  = bk["party"]
        b_date = bk["date"]

        cands = [
            (bki, brow) for bki, brow in bank_pool.iterrows()
            if bki not in matched_bank
            and brow["branch_code"] == b_br
            and pd.notna(brow["transaction date"])
            and abs((brow["transaction date"] - b_date).days) <= 1
        ]
        if len(cands) < 2:
            continue

        found_split = False
        for combo_size in range(2, len(cands) + 1):
            if found_split:
                break
            for combo in combinations(cands, combo_size):
                indices = [c[0] for c in combo]
                rows    = [c[1] for c in combo]
                total   = sum(r["amount(rs.)"] for r in rows)
                if total != b_amt:
                    continue

                scores = [name_sim(b_pty, r[name_col]) for r in rows]
                avg_sc = sum(scores) // len(scores)
                if any(sc < FUZZY_ACCEPT for sc in scores):
                    print(f"    SKIP SPLIT x{combo_size}: weak split name match for "
                          f"{b_br}/{b_pty}/{b_amt} -> "
                          + " + ".join(f"{r[name_col]}/{int(r['amount(rs.)'])}/score={sc}"
                                       for r, sc in zip(rows, scores)))
                    continue

                matched_book.add(bi)
                for idx in indices:
                    matched_bank.add(idx)

                matched_rows.append({
                    "Method"      : f"4-SplitAmt({combo_size})",
                    "Name Match"  : "Match" if avg_sc >= FUZZY_THRESH else "Partial",
                    "Amount Match": f"Split x{combo_size}",
                    "Score%"      : avg_sc,
                    "Book Date"   : bk["date"].strftime("%d.%m.%Y") if pd.notna(bk["date"]) else "",
                    "Book Branch" : b_br,
                    "Book Bank"   : "QRHDFC",
                    "Book Bill No": bk["bill_no"],
                    "Book Chq No" : 511,
                    "Book Party"  : "INDIVI - " + b_pty,
                    "Book Amt"    : b_amt,
                    "Bank Date"   : rows[0]["transaction date"].strftime("%d.%m.%Y") if pd.notna(rows[0]["transaction date"]) else "",
                    "Bank Time"   : str(rows[0].get("transaction time", "")),
                    "Bank Branch" : b_br,
                    "Bank Payer"  : " / ".join(r[name_col] for r in rows),
                    "Bank Amt"    : total,
                    "Bank RRN"    : " / ".join(str(r["rrn no"]) for r in rows),
                    "Pay Type"    : rows[0].get("payment type", ""),
                    "Diff"        : 0,
                    "Flags"       : f"Split x{combo_size}: " + " + ".join(f"{int(r['amount(rs.)'])}" for r in rows),
                })
                print(f"    SPLIT x{combo_size}: {b_br}/{b_pty}/{b_amt} → "
                      + " + ".join(f"{r[name_col]}/{int(r['amount(rs.)'])}" for r in rows))
                found_split = True
                break

    # ── Pass 5: Near-amount matching (same party, branch, date — amt differs) ─
    # Catches cases where the bank credited a slightly different amount from what
    # was booked (e.g. Rs 9 excess).  These are matched and flagged so the
    # discrepancy is visible rather than silently landing in DNC/CNB.
    print("  Detecting near-amount (amount-difference) matches...")
    AMT_DIFF_MAX = 5_000    # flag differences up to Rs 5,000 only; larger gaps are separate transactions

    # Known large-diff exceptions: bank credits confirmed by operations team to belong
    # to a specific book entry despite a difference exceeding AMT_DIFF_MAX.
    # Format: (rrn, branch, book_bill_no)
    # These bypass the AMT_DIFF_MAX cap and are matched directly before the general Pass 5 loop.
    _KNOWN_LARGE_DIFF = [
        ("612460265595", "MNGLR", "PS-6200337"),   # CHANDRAKALA MUNDITHADKA: book=9973, bank=60973, diff=51000
    ]
    for _rrn, _br, _bill in _KNOWN_LARGE_DIFF:
        _bi = next((i for i, bk in book_df.iterrows()
                    if bk["bill_no"] == _bill and bk["branch"] == _br
                    and i not in matched_book), None)
        _bki = next((i for i, brow in bank_pool.iterrows()
                     if str(brow["rrn no"]) == _rrn and i not in matched_bank), None)
        if _bi is None or _bki is None:
            continue
        bk   = book_df.loc[_bi]
        brow = bank_pool.loc[_bki]
        matched_book.add(_bi)
        matched_bank.add(_bki)
        actual_diff = bk["amount"] - brow["amount(rs.)"]
        flag = (f"⚠ KNOWN LARGE AMOUNT DIFFERENCE Rs {actual_diff:+,.2f} — "
                f"Book={bk['amount']:,.0f} Bank={brow['amount(rs.)']:,.0f} — "
                f"confirmed by operations; verify correction entry")
        matched_rows.append({
            "Method"      : "5-NearAmt(Diff)",
            "Name Match"  : "Match",
            "Amount Match": f"Diff Rs{actual_diff:+,.0f}",
            "Score%"      : name_sim(bk["party"], brow[name_col]),
            "Book Date"   : bk["date"].strftime("%d.%m.%Y") if pd.notna(bk["date"]) else "",
            "Book Branch" : _br,
            "Book Bank"   : "QRHDFC",
            "Book Bill No": _bill,
            "Book Chq No" : 511,
            "Book Party"  : "INDIVI - " + bk["party"],
            "Book Amt"    : bk["amount"],
            "Bank Date"   : brow["transaction date"].strftime("%d.%m.%Y") if pd.notna(brow["transaction date"]) else "",
            "Bank Time"   : str(brow.get("transaction time", "")),
            "Bank Branch" : _br,
            "Bank Payer"  : brow[name_col],
            "Bank Amt"    : brow["amount(rs.)"],
            "Bank RRN"    : str(brow["rrn no"]),
            "Pay Type"    : brow.get("payment type", ""),
            "Diff"        : actual_diff,
            "Flags"       : flag,
        })
        print(f"    KNOWN-LARGE-DIFF: {_br}/{bk['party']}  Book={bk['amount']:,.0f}  "
              f"Bank={brow['amount(rs.)']:,.0f}  Diff={actual_diff:+,.0f}  RRN={_rrn}")

    for bi, bk in book_df.iterrows():
        if bi in matched_book:
            continue
        if _has_prev_cnb_exact_for_book(bk):
            continue
        b_amt  = bk["amount"]
        b_br   = bk["branch"]
        b_pty  = bk["party"]
        b_date = bk["date"]

        best = None
        best_score = -1
        for bki, brow in bank_pool.iterrows():
            if bki in matched_bank:
                continue
            bk_br   = brow["branch_code"]
            bk_date = brow["transaction date"]
            bk_amt  = brow["amount(rs.)"]
            # Must be same branch, within 1 day, amount close but not equal
            if bk_br != b_br:
                continue
            date_diff = (abs((bk_date - b_date).days)
                         if pd.notna(bk_date) and pd.notna(b_date) else 999)
            if date_diff > 1:
                continue
            amt_diff = abs(bk_amt - b_amt)
            if amt_diff == 0 or amt_diff > AMT_DIFF_MAX:
                continue
            sc = name_sim(b_pty, brow[name_col])
            if sc < FUZZY_ACCEPT:   # allow partial-name matches in near-amount pass
                continue
            if sc > best_score:
                best_score = sc
                best = (bki, brow, amt_diff)

        if best is None:
            continue
        bki, brow, amt_diff = best
        matched_book.add(bi)
        matched_bank.add(bki)
        actual_diff = bk["amount"] - brow["amount(rs.)"]
        flag = (f"⚠ AMOUNT DIFFERENCE Rs {actual_diff:+,.2f} — "
                f"Book={b_amt:,.0f} Bank={brow['amount(rs.)']:,.0f} — verify excess/short credit")
        matched_rows.append({
            "Method"      : "5-NearAmt(Diff)",
            "Name Match"  : "Match",
            "Amount Match": f"Diff Rs{actual_diff:+,.0f}",
            "Score%"      : best_score,
            "Book Date"   : bk["date"].strftime("%d.%m.%Y") if pd.notna(bk["date"]) else "",
            "Book Branch" : b_br,
            "Book Bank"   : "QRHDFC",
            "Book Bill No": bk["bill_no"],
            "Book Chq No" : 511,
            "Book Party"  : "INDIVI - " + b_pty,
            "Book Amt"    : b_amt,
            "Bank Date"   : brow["transaction date"].strftime("%d.%m.%Y") if pd.notna(brow["transaction date"]) else "",
            "Bank Time"   : str(brow.get("transaction time", "")),
            "Bank Branch" : b_br,
            "Bank Payer"  : brow[name_col],
            "Bank Amt"    : brow["amount(rs.)"],
            "Bank RRN"    : str(brow["rrn no"]),
            "Pay Type"    : brow.get("payment type", ""),
            "Diff"        : actual_diff,
            "Flags"       : flag,
        })
        print(f"    AMT-DIFF: {b_br}/{b_pty}  Book={b_amt:,.0f}  Bank={brow['amount(rs.)']:,.0f}  "
              f"Diff={actual_diff:+,.0f}  Name={best_score}%")


    dnc_new = []
    cnb_new = []

    for bi, bk in book_df.iterrows():
        if bi not in matched_book:
            dnc_new.append({
                "date"  : bk["date"].strftime("%d.%m.%Y") if pd.notna(bk["date"]) else "",
                "branch": bk["branch"],
                "ref"   : bk["bill_no"],
                "party" : "INDIVI - " + bk["party"],
                "amount": bk["amount"],
                "note"  : "",
                "remark": "",
            })

    for bki, brow in bank_pool.iterrows():
        if bki not in matched_bank:
            dt = brow["transaction date"]
            _party = str(brow[name_col])
            _amount = brow["amount(rs.)"]
            _is_known_hot_gap = (
                brow["branch_code"] == "PUNE"
                and abs(float(_amount) - 74870) < 0.005
                and "PATIL" in _party.upper()
            )
            cnb_new.append({
                "date"  : dt.strftime("%d.%m.%Y") if pd.notna(dt) else "",
                "branch": brow["branch_code"],
                "rrn"   : str(brow["rrn no"]),
                "party" : _party,
                "amount": _amount,
                "diff"  : None,
                "remark": "Known HOT data gap - excluded from BRS" if _is_known_hot_gap else "",
                "exclude_from_brs": _is_known_hot_gap,
            })

    print(f"  Matched: {len(matched_rows)} | DNC new: {len(dnc_new)} | CNB new: {len(cnb_new)}")

    # ══════════════════════════════════════════════════════════════════════════
    #  STEP 4B — CROSS-MATCH: today's DNC new vs prev BRS CNB carry-forwards
    # ══════════════════════════════════════════════════════════════════════════
    prev_add_raw = _find_section(prev, "Add: Credited in pass book but not debited",
                                 data_col=_PREV_DATA_COL).copy()
    prev_add_raw[_PREV_DATA_COL] = pd.to_numeric(prev_add_raw[_PREV_DATA_COL], errors="coerce")
    prev_add_raw = prev_add_raw[prev_add_raw[_PREV_DATA_COL].notna() & (prev_add_raw[_PREV_DATA_COL] > 0)]

    # Build set of RRNs already present in today's bank statement so we can
    # skip CF items that have already been credited again today (avoids double-count).
    today_bank_rrns = set(stmt_success["rrn no"].astype(str).str.strip())

    cnb_cf = []
    for _, r in prev_add_raw.iterrows():
        dt = str(r[0]).strip()
        try:
            dt = pd.to_datetime(dt, dayfirst=True).strftime("%d.%m.%Y")
        except Exception:
            pass
        diff = r[_PREV_DATA_COL + 1] if pd.notna(r[_PREV_DATA_COL + 1]) else None
        rrn_val = str(r[_PREV_RRN_COL]).strip()
        # FIX: If this CF item's RRN is already in today's bank statement,
        # it will be matched as a normal bank entry — don't double-load as CF.
        if rrn_val in today_bank_rrns:
            print(f"  [CF-SKIP] RRN {rrn_val} already in today's bank stmt — skipping CF carry-forward")
            continue
        if float(r[_PREV_DATA_COL]) in corr_amts_set:
            print(f"  [CF-SKIP] RRN {rrn_val} is a correction amount carry-forward - skipping CNB CF")
            continue
        cnb_cf.append({
            "date"  : dt,
            "branch": str(r[1]).strip(),
            "rrn"   : rrn_val,
            "party" : str(r[_PREV_PARTY_COL]).strip(),
            "amount": float(r[_PREV_DATA_COL]),
            "diff"  : diff,
            "remark": "Carried Fwd",
            "cf"    : True,
        })

    print(f"\nStep 4B - Cross-matching DNC new vs prev BRS CNB carry-forwards...")

    # Index CNB carry-forwards by branch for both exact and near-amount lookups
    cnb_cf_pool = {}
    for i, item in enumerate(cnb_cf):
        cnb_cf_pool.setdefault(item["branch"], []).append(i)

    dnc_new_cleared  = set()
    cnb_cf_cleared   = set()
    step4b_matched   = []

    # Step 4B name threshold: lowered to 30% so reversed/abbreviated names
    # (e.g. "KATTA THIMMAIAH SETTY RAJENDRA" vs "RAJENDRA K T") still clear.
    # Branch guard provides safety; low score is flagged in output.
    _4B_NAME_THRESH  = 30
    _4B_AMT_DIFF_MAX = 500   # allow small amount differences (e.g. 0.65 paise)

    for di, dnc_item in enumerate(dnc_new):
        br    = dnc_item["branch"]
        d_amt = dnc_item["amount"]
        candidates = cnb_cf_pool.get(br, [])
        if not candidates:
            continue
        best_ci    = None
        best_score = -1
        best_diff  = None
        for ci in candidates:
            if ci in cnb_cf_cleared:
                continue
            cf_amt   = cnb_cf[ci]["amount"]
            amt_diff = abs(cf_amt - d_amt)
            if amt_diff > _4B_AMT_DIFF_MAX:
                continue   # amounts too far apart
            sc = name_sim(normalize_party(dnc_item["party"]),
                          normalize_party(cnb_cf[ci]["party"]))
            if sc >= _4B_NAME_THRESH and sc > best_score:
                best_ci    = ci
                best_score = sc
                best_diff  = cf_amt - d_amt
        if best_ci is None:
            continue
        if br in cnb_cf_pool and best_ci in cnb_cf_pool[br]:
            cnb_cf_pool[br].remove(best_ci)
        dnc_new_cleared.add(di)
        cnb_cf_cleared.add(best_ci)
        step4b_matched.append({
            "dnc"     : dnc_item,
            "cnb"     : cnb_cf[best_ci],
            "score"   : best_score,
            "amt_diff": best_diff,
        })
        diff_note = f"  Amt diff={best_diff:+.2f}" if best_diff else ""
        print(f"  CLEARED: book={dnc_item['branch']}/{dnc_item['party']}/{dnc_item['amount']} "
              f"<-> prev_CNB={cnb_cf[best_ci]['branch']}/{cnb_cf[best_ci]['party']}/{cnb_cf[best_ci]['amount']} "
              f"(name {best_score}%{diff_note})")

    # Clear one book entry against multiple previous CNB carry-forwards.
    # This matches manual BRS treatment for split previous credits like
    # 25,000 + 70,000 clearing a single 95,000 book entry.
    for di, dnc_item in enumerate(dnc_new):
        if di in dnc_new_cleared:
            continue
        br = dnc_item["branch"]
        d_amt = dnc_item["amount"]
        candidates = [
            ci for ci in cnb_cf_pool.get(br, [])
            if ci not in cnb_cf_cleared
        ]
        if len(candidates) < 2:
            continue
        found_split = False
        for combo_size in range(2, min(len(candidates), 4) + 1):
            if found_split:
                break
            for combo in combinations(candidates, combo_size):
                total = sum(cnb_cf[ci]["amount"] for ci in combo)
                if abs(total - d_amt) > 0.005:
                    continue
                scores = [
                    name_sim(normalize_party(dnc_item["party"]),
                             normalize_party(cnb_cf[ci]["party"]))
                    for ci in combo
                ]
                avg_score = sum(scores) // len(scores)
                if max(scores) < _4B_NAME_THRESH and avg_score < _4B_NAME_THRESH:
                    continue
                for ci in combo:
                    if br in cnb_cf_pool and ci in cnb_cf_pool[br]:
                        cnb_cf_pool[br].remove(ci)
                    cnb_cf_cleared.add(ci)
                dnc_new_cleared.add(di)
                step4b_matched.append({
                    "dnc"     : dnc_item,
                    "cnb"     : {
                        "date"  : " / ".join(cnb_cf[ci]["date"] for ci in combo),
                        "branch": br,
                        "rrn"   : " / ".join(cnb_cf[ci].get("rrn", "") for ci in combo),
                        "party" : " / ".join(cnb_cf[ci]["party"] for ci in combo),
                        "amount": total,
                        "diff"  : 0,
                        "remark": "Carried Fwd",
                        "cf"    : True,
                    },
                    "score"   : avg_score,
                    "amt_diff": total - d_amt,
                })
                print(f"  CLEARED SPLIT: book={dnc_item['branch']}/{dnc_item['party']}/{dnc_item['amount']} "
                      f"<-> prev_CNB total={total:,.0f} ({combo_size} rows, name {avg_score}%)")
                found_split = True
                break

    print(f"  Cleared: {len(dnc_new_cleared)} DNC new + {len(cnb_cf_cleared)} CNB CF cancelled")

    dnc_new_remaining = [item for i, item in enumerate(dnc_new) if i not in dnc_new_cleared]
    cnb_cf_remaining  = [item for i, item in enumerate(cnb_cf)  if i not in cnb_cf_cleared]

    # Partial/Low name matches and amount differences appear in DNC+CNB sheets
    # for engineer review, but are tagged exclude_from_brs=True so they do NOT
    # affect the BRS running balance (they are already reconciled by amount+branch+date).
    hard_brs_duplicates = [
        m for m in matched_rows
        if m["Name Match"] in ("Partial", "Low") or m["Diff"] != 0
    ]
    for m in hard_brs_duplicates:
        # Exact-amount partial/low name matches are already reconciled by amount.
        # Paise-level differences are presentation noise in the manual BRS.
        # Whole-rupee amount differences must remain in BRS arithmetic so the
        # excess/short credit is reflected in the final difference.
        _exclude_from_brs = abs(m["Diff"]) < 1
        dnc_new_remaining.append({
            "date"           : m["Book Date"],
            "branch"         : m["Book Branch"],
            "ref"            : m["Book Bill No"],
            "party"          : "INDIVI - " + str(m["Book Party"]).replace("INDIVI - ", ""),
            "amount"         : m["Book Amt"],
            "note"           : m.get("Flags", ""),
            "remark"         : m.get("Flags", ""),
            "cf"             : False,
            "exclude_from_brs": _exclude_from_brs,
        })
        cnb_new.append({
            "date"           : m["Bank Date"],
            "branch"         : m["Bank Branch"],
            "rrn"            : str(m["Bank RRN"]),
            "party"          : m["Bank Payer"],
            "amount"         : m["Bank Amt"],
            "diff"           : m["Diff"],
            "remark"         : m.get("Flags", ""),
            "cf"             : False,
            "exclude_from_brs": _exclude_from_brs,
        })

    if hard_brs_duplicates:
        print(f"  Also showing {len(hard_brs_duplicates)} partial/low match(es) in DNC/CNB for review")

    # ══════════════════════════════════════════════════════════════════════════
    #  STEP 5 — BUILD DNC AND CNB LISTS
    # ══════════════════════════════════════════════════════════════════════════
    prev_less_raw = _find_section(prev, "Less: Cheques deposited but not Credited",
                                  data_col=_PREV_DATA_COL).copy()
    prev_less_raw[_PREV_DATA_COL] = pd.to_numeric(prev_less_raw[_PREV_DATA_COL], errors="coerce")
    prev_less_raw = prev_less_raw[prev_less_raw[_PREV_DATA_COL].notna() & (prev_less_raw[_PREV_DATA_COL] > 0)]

    # Build precise keys for DNC CF items that have been cleared this cycle.
    # Bill numbers can repeat, so bill-only matching can drop an unrelated CF.
    def _dnc_key(branch, ref, amount):
        return (str(branch).strip(), str(ref).strip(), round(float(amount), 2))

    already_matched_dnc_keys = {
        _dnc_key(m["Book Branch"], m["Book Bill No"], m["Book Amt"])
        for m in matched_rows
    }
    also_matched_4b_keys = {
        _dnc_key(pair["dnc"]["branch"], pair["dnc"]["ref"], pair["dnc"]["amount"])
        for pair in step4b_matched
    }
    all_matched_dnc_keys = already_matched_dnc_keys | also_matched_4b_keys

    dnc_cf = []
    for _, r in prev_less_raw.iterrows():
        dt = str(r[0]).strip()
        try:
            dt = pd.to_datetime(dt, dayfirst=True).strftime("%d.%m.%Y")
        except Exception:
            pass
        note_col   = _PREV_DATA_COL + 1
        remark_col = _PREV_DATA_COL + 2
        note   = str(r[note_col]).strip()   if pd.notna(r[note_col])   and str(r[note_col]).strip()   not in ("nan", "") else ""
        remark = str(r[remark_col]).strip() if len(r) > remark_col and pd.notna(r[remark_col]) and str(r[remark_col]).strip() not in ("nan", "") else ""
        diff   = r[note_col] if pd.notna(r[note_col]) else None
        bill_no = str(r[2]).strip()
        # FIX: If this CF DNC bill was already matched this cycle, don't re-add as CF.
        if _dnc_key(r[1], bill_no, r[_PREV_DATA_COL]) in all_matched_dnc_keys:
            print(f"  [CF-SKIP] Bill {bill_no} already matched this cycle — skipping DNC carry-forward")
            continue
        dnc_cf.append({
            "date"  : dt,
            "branch": str(r[1]).strip(),
            "ref"   : bill_no,
            "party" : str(r[_PREV_PARTY_COL]).strip(),
            "amount": float(r[_PREV_DATA_COL]),
            "diff"  : diff,
            "note"  : note,
            "remark": remark,
            "cf"    : True,
        })

    # If a previous BRS carried both sides of the same branch/amount item,
    # the manual BRS clears the pair rather than carrying both forever.
    prev_dnc_cleared = set()
    prev_cnb_cleared = set()
    for di, dnc_item in enumerate(dnc_cf):
        for ci, cnb_item in enumerate(cnb_cf_remaining):
            if ci in prev_cnb_cleared:
                continue
            if dnc_item["branch"] != cnb_item["branch"]:
                continue
            if abs(dnc_item["amount"] - cnb_item["amount"]) > 0.005:
                continue
            sc = name_sim(normalize_party(dnc_item["party"]),
                          normalize_party(cnb_item["party"]))
            if sc < 50:
                continue
            prev_dnc_cleared.add(di)
            prev_cnb_cleared.add(ci)
            print(f"  [CF-CLEAR] Previous DNC/CNB pair cleared: "
                  f"{dnc_item['branch']}/{dnc_item['ref']}/{dnc_item['amount']:,.0f} "
                  f"<-> {cnb_item.get('rrn', '')} (name {sc}%)")
            break
    if prev_dnc_cleared or prev_cnb_cleared:
        dnc_cf = [item for i, item in enumerate(dnc_cf) if i not in prev_dnc_cleared]
        cnb_cf_remaining = [
            item for i, item in enumerate(cnb_cf_remaining)
            if i not in prev_cnb_cleared
        ]

    print(f"\nPrev BRS carry-forwards loaded:")
    print(f"  DNC CF : {len(dnc_cf)} items  (Rs {sum(i['amount'] for i in dnc_cf):,.0f})")
    print(f"  CNB CF : {len(cnb_cf_remaining)} items  (Rs {sum(i['amount'] for i in cnb_cf_remaining):,.0f})")

    cf_refs = {i["ref"] for i in dnc_cf}

    dnc_all_for_brs = list(dnc_cf)
    for item in dnc_new_remaining:
        if item["ref"] not in cf_refs:
            item["cf"] = False
            dnc_all_for_brs.append(item)

    dnc_all_for_sheet = list(dnc_cf)
    for item in dnc_new_remaining:
        if item["ref"] not in cf_refs:
            item["cf"] = False
            dnc_all_for_sheet.append(item)

    dnc_all   = dnc_all_for_brs
    # Exclude partial/low name matches from BRS arithmetic (they are matched by amount)
    total_dnc = sum(i["amount"] for i in dnc_all if not i.get("exclude_from_brs", False))

    cnb_all_for_brs = list(cnb_cf_remaining)
    for item in cnb_new:
        cnb_all_for_brs.append(item)

    cf_rrns = {i["rrn"] for i in cnb_cf_remaining}
    cnb_all_for_sheet = list(cnb_cf_remaining)
    for item in cnb_new:
        if item["rrn"] not in cf_rrns:
            item["cf"] = False
            cnb_all_for_sheet.append(item)

    cnb_all   = cnb_all_for_brs
    # Exclude partial/low name matches from BRS arithmetic (they are matched by amount)
    total_cnb = sum(i["amount"] for i in cnb_all if not i.get("exclude_from_brs", False))

    bank_bal   = closing_bal - total_dnc + total_cnb
    reconciled = abs(bank_bal) < 0.005

    print(f"\nBRS ARITHMETIC:")
    print(f"  Closing Balance (HOT book) : {closing_bal:,.0f}")
    print(f"  Less DNC total             : {total_dnc:,.0f}")
    print(f"  Add  CNB total             : {total_cnb:,.0f}")
    print(f"  Bank Closing Balance       : {bank_bal:,.2f}")
    print(f"  {'RECONCILED' if reconciled else 'NOT RECONCILED'}")

    # ══════════════════════════════════════════════════════════════════════════
    #  STEP 6 — BUILD WORKBOOK
    # ══════════════════════════════════════════════════════════════════════════
    print("\nBuilding workbook...")
    wb = Workbook()

    # Use lists per (bill_no, book_amt) key so that when the same bill has
    # multiple bank transactions with the same amount (e.g. two x Rs 1 for
    # Debika Banerjee KOL), each book row gets its own distinct RRN/date
    # rather than the last writer overwriting all prior entries.
    _bill_entries = {}   # key -> list of {date, rrn, bank_amt, name_match}
    for m in matched_rows:
        key = (m["Book Bill No"], m["Book Amt"])
        _bill_entries.setdefault(key, []).append({
            "date"      : m["Bank Date"],
            "rrn"       : m["Bank RRN"],
            "bank_amt"  : m["Bank Amt"],
            "name_match": m["Name Match"],
        })
    for pair in step4b_matched:
        key  = (pair["dnc"]["ref"], pair["dnc"]["amount"])
        sc4b = pair["score"]
        nm4b = ("Match"   if sc4b >= FUZZY_THRESH else
                "Partial" if sc4b >= FUZZY_ACCEPT else "Low")
        _bill_entries.setdefault(key, []).append({
            "date"      : pair["cnb"]["date"],
            "rrn"       : pair["cnb"].get("rrn", ""),
            "bank_amt"  : pair["cnb"]["amount"],
            "name_match": nm4b,
        })
    # Pointer tracking: how many entries per key have been consumed
    _bill_entry_idx = {}   # key -> next index to consume

    dnc_brs_refs = {i["ref"] for i in dnc_all}

    # Detect duplicate RRNs in the bank statement (same RRN used for >1 transaction)
    _rrn_counts = stmt_success["rrn no"].astype(str).value_counts()
    _duplicate_rrns = set(_rrn_counts[_rrn_counts > 1].index)

    # ── Sheet 1 — Cheque Deposit ──────────────────────────────────────────────
    ws = wb.active
    ws.title = "Cheque Deposit"
    col_widths(ws, [14, 8, 8, 16, 12, 20, 38, 14, 14, 36])
    ws.freeze_panes = "A3"

    r = 1
    write_title_row(ws, r,
        f"Cheque Deposit — QR Book Entries  |  QR-HDFC  |  {BRS_DATE}", 10)
    r += 1
    write_header_row(ws, r,
        ["Date", "Branch", "Bank", "Bill No.", "Cheque No.", "RRN",
         "Party Name", "Amount (Rs)", "Diff (HOT vs Bank)", "Narration"])

    for _, row in ps.iterrows():
        r += 1
        dt      = row["date"].strftime("%d.%m.%Y") if pd.notna(row["date"]) else ""
        bill    = row["bill_no"]
        party   = "INDIVI - " + row["party"]
        key     = (bill, row["amount"])

        # Pop the next unused entry for this (bill, amount) key so that when the
        # same bill has two transactions at the same amount (e.g. two x Rs 1 for
        # Debika Banerjee) each book row gets its own distinct RRN / bank date.
        entries = _bill_entries.get(key, [])
        idx     = _bill_entry_idx.get(key, 0)
        entry   = entries[idx] if idx < len(entries) else None
        _bill_entry_idx[key] = idx + 1

        bank_dt    = entry["date"]       if entry else None
        rrn        = entry["rrn"]        if entry else ""
        bank_amt   = entry["bank_amt"]   if entry else None
        name_match = entry["name_match"] if entry else ""

        # Compute HOT-vs-Bank difference
        if bank_amt is not None:
            hot_vs_bank_diff = row["amount"] - bank_amt
        else:
            hot_vs_bank_diff = None

        # Build narration
        if bank_dt:
            if name_match == "Low":
                narration = f"LOW NAME MATCH — CREDITED AS ON {bank_dt}"
            elif name_match == "Partial":
                narration = f"PARTIAL NAME MATCH — CREDITED AS ON {bank_dt}"
            else:
                narration = f"CREDITED AS ON {bank_dt}"
        elif bill in _wrongly_accounted_bills:
            # Fix A: entry was excluded from BRS matching — label it clearly.
            narration = "WRONGLY ACCOUNTED — EXCLUDED FROM BRS"
        elif bill in dnc_brs_refs:
            narration = "WRONGLY ACCOUNTED"
        else:
            narration = ""

        # Flag duplicate RRN in the bank statement itself (not our lookup collision)
        if rrn and str(rrn) in _duplicate_rrns:
            narration = f"⚠ DUPLICATE RRN IN BANK STMT — {narration}".strip(" —")

        # Diff cell: show value only when there is an actual difference, else blank
        diff_display = hot_vs_bank_diff if (hot_vs_bank_diff is not None and abs(hot_vs_bank_diff) > 0.005) else None

        for c, v in enumerate(
                [dt, row["branch"], "QRHDFC", bill, 511, rrn,
                 party, row["amount"], diff_display, narration], 1):
            diff_bg = C_RED if (c == 9 and diff_display is not None) else None
            set_cell(ws, r, c, v,
                     bg=diff_bg,
                     h_align="right" if c in (8, 9) else "left",
                     num_fmt="#,##0.00" if c == 9 else ("#,##0" if c == 8 else None))

    # ── Sheet 2 — Bank Gateway (SaleSuccess) ─────────────────────────────────
    ws2 = wb.create_sheet("Bank Gateway (SaleSuccess)")
    col_widths(ws2, [14, 12, 8, 36, 30, 14, 15, 10, 12, 22])
    ws2.freeze_panes = "A3"

    r = 1
    write_title_row(ws2, r,
        f"Bank QR Gateway — SaleSuccess Transactions  |  QR-HDFC  |  {BRS_DATE}", 10)
    r += 1
    write_header_row(ws2, r,
        ["Date", "Time", "Branch", "DBA", "Payer", "Amount (Rs)",
         "RRN", "Pay Type", "State", "Txn ID"])

    for _, row in stmt_success.iterrows():
        r += 1
        dt = row["transaction date"].strftime("%d.%m.%Y") if pd.notna(row["transaction date"]) else ""
        vals = [dt, str(row.get("transaction time", "")), row["branch_code"],
                row["doing business as"], row[name_col],
                row["amount(rs.)"], str(row["rrn no"]),
                row.get("payment type", ""), row["transaction state"],
                str(row.get("mintoak transaction id", ""))]
        for c, v in enumerate(vals, 1):
            set_cell(ws2, r, c, v,
                     h_align="right" if c == 6 else "left",
                     num_fmt="#,##0" if c == 6 else None)

    # ── Sheet 3 — Matched (Verified) ─────────────────────────────────────────
    ws3 = wb.create_sheet("Matched (Verified)")
    col_widths(ws3, [22, 10, 6, 8, 12, 8, 8, 16, 10, 30, 12, 12, 10, 8, 30, 12, 18, 10, 6, 26])
    ws3.freeze_panes = "A3"

    r = 1
    write_title_row(ws3, r,
        f"Step 4 — Matched: Cheque Deposit vs QRHDFC Statement  |  QR-HDFC  |  {BRS_DATE}", 20)
    r += 1
    write_header_row(ws3, r,
        ["Method", "Name Match", "Score%", "Amt Match",
         "Book Date", "Book Branch", "Book Bank", "Book Bill No", "Book Chq No",
         "Book Party", "Book Amt",
         "Bank Date", "Bank Time", "Bank Branch", "Bank Payer", "Bank Amt",
         "Bank RRN", "Pay Type", "Diff", "Flags"])

    for m in matched_rows:
        r += 1
        nm = m["Name Match"]
        bg = (C_GREEN if m["Diff"] == 0 and nm == "Match" else
              C_AMBER if nm == "Partial"                   else
              C_RED   if nm == "Low"                       else C_GREEN)
        vals = [m["Method"], m["Name Match"], m["Score%"], m["Amount Match"],
                m["Book Date"], m["Book Branch"], m["Book Bank"],
                m["Book Bill No"], m["Book Chq No"], m["Book Party"], m["Book Amt"],
                m["Bank Date"], m["Bank Time"], m["Bank Branch"],
                m["Bank Payer"], m["Bank Amt"], m["Bank RRN"],
                m["Pay Type"], m["Diff"], m["Flags"]]
        for c, v in enumerate(vals, 1):
            set_cell(ws3, r, c, v, bg=bg,
                     h_align="right" if c in [11, 16, 19] else "left",
                     num_fmt="#,##0" if c in [11, 16, 19] else None)

    if step4b_matched:
        r += 1
        ws3.merge_cells(f"A{r}:T{r}")
        c = ws3.cell(r, 1,
            "Step 4B — Book entries cleared against Previous BRS CNB Carry-Forwards "
            "(backdated credits)")
        c.fill = fill(C_LBLUE); c.font = font(bold=True, size=9); c.alignment = align()
        ws3.row_dimensions[r].height = 18

        for pair in step4b_matched:
            r += 1
            dnc      = pair["dnc"]
            cnb      = pair["cnb"]
            sc       = pair["score"]
            adiff    = pair.get("amt_diff", 0) or 0
            nm       = ("Match"   if sc >= FUZZY_THRESH else
                        "Partial" if sc >= FUZZY_ACCEPT else "Low")
            amt_note = (f"  Amt diff={adiff:+.2f} (bank credited more)" if adiff > 0.005
                        else f"  Amt diff={adiff:+.2f} (bank credited less)" if adiff < -0.005
                        else "")
            flag = (f"Step 4B: cleared vs prev BRS CNB (name {sc}%){amt_note}")
            bg   = (C_AMBER if nm in ("Partial", "Low") or abs(adiff) > 0.005 else C_LBLUE)
            vals = ["4B-BackdatedClear", nm, sc, "CF-Clear",
                    dnc["date"], dnc["branch"], "QRHDFC",
                    dnc["ref"], 511, dnc["party"], dnc["amount"],
                    cnb["date"], "", cnb["branch"],
                    cnb["party"], cnb["amount"], cnb.get("rrn", ""),
                    "", adiff, flag]
            for c_idx, v in enumerate(vals, 1):
                set_cell(ws3, r, c_idx, v, bg=bg,
                         h_align="right" if c_idx in [11, 16, 19] else "left",
                         num_fmt="#,##0.00" if c_idx == 19 else ("#,##0" if c_idx in [11, 16] else None))

    # ── Sheet 4 — Reco Items (Book Only / DNC) ────────────────────────────────
    ws4 = wb.create_sheet("Reco Items (Book Only)")
    col_widths(ws4, [14, 8, 8, 16, 10, 38, 14, 36])
    ws4.freeze_panes = "A3"

    r = 1
    write_title_row(ws4, r,
        f"Reco Items: Deposited NOT Credited in Bank  |  QR-HDFC  |  {BRS_DATE}", 8)
    r += 1
    write_header_row(ws4, r,
        ["Date", "Branch", "Bank", "Bill No", "Cheque No.", "Party Name", "Amount (Rs)", "Issue"])

    for item in dnc_all_for_sheet:
        r += 1
        bg    = C_AMBER if item.get("cf") else C_ORNG
        issue = ("Carried Forward from Previous BRS" if item.get("cf")
                 else item.get("note") or "In Book — NOT yet in Bank Gateway")
        vals  = [item["date"], item["branch"], "QRHDFC",
                  item["ref"], 511, item["party"], item["amount"], issue]
        for c, v in enumerate(vals, 1):
            set_cell(ws4, r, c, v, bg=bg,
                     h_align="right" if c == 7 else "left",
                     num_fmt="#,##0" if c == 7 else None)

    # ── Sheet 5 — Bank Only (Not in Book / CNB) ───────────────────────────────
    ws5 = wb.create_sheet("Bank Only (Not in Book)")
    col_widths(ws5, [14, 12, 8, 36, 30, 14, 16, 10, 20])
    ws5.freeze_panes = "A3"

    r = 1
    write_title_row(ws5, r,
        f"Bank Credit — NOT yet Recorded in Book  |  QR-HDFC  |  {BRS_DATE}", 9,
        bg=C_RED_H)
    r += 1
    write_header_row(ws5, r,
        ["Date", "Time", "Branch", "DBA", "Payer", "Amount (Rs)", "RRN", "Pay Type", "Issue"],
        bg=C_RED_H)

    rev_map = {v: k for k, v in DBA_MAP.items()}
    for item in cnb_all_for_sheet:
        r += 1
        bg    = C_AMBER if item.get("cf") else C_RED
        issue = item.get("remark") or "Credited in Bank — NOT yet in Book"
        dba   = rev_map.get(item["branch"], item["branch"])
        vals  = [item["date"], "", item["branch"], dba,
                  item["party"], item["amount"], item["rrn"], "", issue]
        for c, v in enumerate(vals, 1):
            set_cell(ws5, r, c, v, bg=bg,
                     h_align="right" if c == 6 else "left",
                     num_fmt="#,##0" if c == 6 else None)

    # ── Sheet 6 — HOT Settlements ─────────────────────────────────────────────
    ws6 = wb.create_sheet("HOT Settlements")
    col_widths(ws6, [14, 16, 8, 8, 14, 14, 80])
    ws6.freeze_panes = "A3"

    r = 1
    write_title_row(ws6, r,
        f"HOT Settlement Payments (QR → Head Office)  |  QR-HDFC  |  {BRS_DATE}", 7)
    r += 1
    write_header_row(ws6, r,
        ["Date", "Bill No", "Chq No", "Branch", "Party", "Amount (Rs)", "Narration"])

    for _, row in ap.iterrows():
        r += 1
        dt  = row["date"].strftime("%d.%m.%Y") if pd.notna(row.get("date")) else ""
        bg  = C_AMBER if row["is_correction"] else None
        vals = [dt, row["bill_no"], 99, row["branch"], "HOT - HOT",
                 row["amount"], row["narration"][:120]]
        for c, v in enumerate(vals, 1):
            set_cell(ws6, r, c, v, bg=bg,
                     h_align="right" if c == 6 else "left",
                     num_fmt="#,##0" if c == 6 else None)

    r += 2
    ws6.merge_cells(f"A{r}:G{r}")
    c = ws6.cell(r, 1,
        f"⚠ Amber = Correction entries (same amount in Receipts & Payments → cancel pair). "
        f"Detected: {[int(x) for x in set(corr_amts)]}")
    c.fill = fill(C_AMBER); c.font = font(bold=True, size=9); c.alignment = align()

    # ── Sheet 7 — QR BRS Statement ────────────────────────────────────────────
    ws7 = wb.create_sheet("QR BRS Statement")

    # 11-column layout: A:Date B:Branch C:Bill No D:RRN E:Chq No
    #                   F:Book Report G:Bank Statement H:Makez Extracted
    #                   I:Amount J:Running Bal K:Note / Remark
    for col, w in [("A", 12), ("B", 8), ("C", 16), ("D", 20),
                   ("E", 10), ("F", 28), ("G", 28), ("H", 28),
                   ("I", 16), ("J", 16), ("K", 44)]:
        ws7.column_dimensions[col].width = w

    _HDR   = fill(C_NAVY)
    _SEC   = fill(C_BLUE)
    _SUB   = fill("DCE6F1")
    _ITM   = fill(C_WHITE)
    _ITM_CF= fill(C_CF)
    _BAL   = fill(C_GREEN)
    _DIF_G = fill(C_GREEN)
    _DIF_R = fill(C_RED)
    _bdr   = _BR

    def _brs_merge(row, text, bg, fnt):
        ws7.merge_cells(f"A{row}:K{row}")
        c           = ws7.cell(row, 1)
        c.value     = text
        c.fill      = bg
        c.font      = fnt
        c.border    = _bdr
        c.alignment = Alignment(horizontal="left", vertical="center", wrap_text=True)
        for col in range(2, 12):
            ws7.cell(row, col).border = _bdr
            ws7.cell(row, col).fill  = bg

    def _brs_amt(row, col, value, bg, fnt, fmt="#,##0.00"):
        cell               = ws7.cell(row, col)
        cell.value         = value
        cell.fill          = bg
        cell.font          = fnt
        cell.border        = _bdr
        cell.alignment     = Alignment(horizontal="right", vertical="center")
        if isinstance(value, (int, float)):
            cell.number_format = fmt

    def _brs_narr(row, col, value, bg):
        cell           = ws7.cell(row, col)
        cell.value     = value
        cell.fill      = bg
        cell.font      = Font(name="Calibri", size=8, italic=True, color="555555")
        cell.border    = _bdr
        cell.alignment = Alignment(horizontal="left", vertical="center", wrap_text=True)

    r7 = 1

    _col_hdrs = ["Date", "Branch", "Bill No", "RRN", "Chq No",
                 "Book Report", "Bank Statement", "Makez Extracted",
                 "Amount (Rs)", "Running Bal (Rs)", "Note / Remark"]

    # ── Row 1: company name ───────────────────────────────────────────────────
    _brs_merge(r7, "ORIENT EXCHANGE & FINANCIAL SERVICES (P) LTD",
               _HDR, Font(bold=True, color="FFFFFF", name="Calibri", size=13))
    ws7.row_dimensions[r7].height = 28
    r7 += 1

    # ── Row 2: bank / account label ──────────────────────────────────────────
    _brs_merge(r7, "QR-HDFC",
               _HDR, Font(bold=True, color="FFFFFF", name="Calibri", size=10))
    ws7.row_dimensions[r7].height = 22
    r7 += 1

    # ── Row 3: BRS title + amount column headers ──────────────────────────────
    ws7.merge_cells(f"A{r7}:G{r7}")
    c           = ws7.cell(r7, 1)
    c.value     = f"Bank Reconciliation Statement As On {BRS_DATE}"
    c.fill      = _HDR
    c.font      = Font(bold=True, color="FFFFFF", name="Calibri", size=11)
    c.border    = _bdr
    c.alignment = Alignment(horizontal="left", vertical="center")
    for col in range(2, 8):
        ws7.cell(r7, col).border = _bdr
        ws7.cell(r7, col).fill  = _HDR
    for ci, txt in [(9, "AMOUNT IN RS"), (10, "AMOUNT IN RS"), (11, "")]:
        cell           = ws7.cell(r7, ci, txt)
        cell.fill      = _HDR
        cell.font      = Font(bold=True, color="FFFFFF", name="Calibri", size=10)
        cell.border    = _bdr
        cell.alignment = Alignment(horizontal="center", vertical="center")
    ws7.row_dimensions[r7].height = 20
    r7 += 1

    # ── Row 4: blank ─────────────────────────────────────────────────────────
    ws7.merge_cells(f"A{r7}:I{r7}")
    ws7.row_dimensions[r7].height = 6
    r7 += 1

    # ── Col-header row ────────────────────────────────────────────────────────
    for ci, h in enumerate(_col_hdrs, 1):
        cell           = ws7.cell(r7, ci, h)
        cell.fill      = _SUB
        cell.font      = font(bold=True)
        cell.border    = _bdr
        cell.alignment = Alignment(horizontal="center", vertical="center")
    ws7.row_dimensions[r7].height = 16
    r7 += 1

    ws7.freeze_panes = f"A{r7}"

    def _brs_item(date, branch, ref, rrn="", chq="", party="", amt=0, narr="",
                  is_cf=False, book_raw="", bank_raw=""):
        nonlocal r7
        bg = _ITM_CF if is_cf else _ITM
        display_narr = ("Carried Fwd" if is_cf and not narr else
                        f"CF | {narr}" if is_cf else narr)

        def _s(col, val, halign="left"):
            c           = ws7.cell(r7, col, val)
            c.fill      = bg
            c.border    = _bdr
            c.font      = _NF
            c.alignment = Alignment(horizontal=halign, vertical="center")

        _s(1, date,     "center")
        _s(2, branch,   "center")
        _s(3, ref,      "left")      # Bill No
        _s(4, rrn,      "left")      # RRN
        _s(5, chq,      "center")    # Chq No
        _s(6, book_raw, "left")      # Book Report
        _s(7, bank_raw, "left")      # Bank Statement
        _s(8, _clean_makez_extracted(party), "left")  # Makez Extracted
        _brs_amt(r7, 9, amt, bg, _NF)           # Amount
        ws7.cell(r7, 10, "").fill   = bg        # Running
        ws7.cell(r7, 10).border     = _bdr
        _brs_narr(r7, 11, display_narr, bg)     # Note
        ws7.row_dimensions[r7].height = 16
        r7 += 1

    def _brs_subtotal(total):
        nonlocal r7
        ws7.merge_cells(f"A{r7}:H{r7}")
        ws7.cell(r7, 1).fill  = _SUB
        ws7.cell(r7, 1).border = _bdr
        for col in range(2, 9):
            ws7.cell(r7, col).border = _bdr
            ws7.cell(r7, col).fill  = _SUB
        _brs_amt(r7, 9, total, _SUB, _BF)
        ws7.cell(r7, 10).fill   = _SUB
        ws7.cell(r7, 10).border = _bdr
        ws7.cell(r7, 11).fill   = _SUB
        ws7.cell(r7, 11).border = _bdr
        ws7.row_dimensions[r7].height = 16
        r7 += 1

    def _brs_running(running_bal):
        nonlocal r7
        ws7.merge_cells(f"A{r7}:H{r7}")
        ws7.cell(r7, 1).fill  = _SUB
        ws7.cell(r7, 1).border = _bdr
        for col in range(2, 9):
            ws7.cell(r7, col).border = _bdr
            ws7.cell(r7, col).fill  = _SUB
        ws7.cell(r7, 9).fill   = _SUB
        ws7.cell(r7, 9).border = _bdr
        _brs_amt(r7, 10, running_bal, _SUB, _BF)
        ws7.cell(r7, 11).fill   = _SUB
        ws7.cell(r7, 11).border = _bdr
        ws7.row_dimensions[r7].height = 17
        r7 += 1

    def _brs_balance(label, bal, bg=None):
        nonlocal r7
        bg = bg or _BAL
        ws7.merge_cells(f"A{r7}:H{r7}")
        c           = ws7.cell(r7, 1)
        c.value     = label
        c.fill      = bg
        c.font      = Font(bold=True, name="Calibri", size=10)
        c.border    = _bdr
        c.alignment = Alignment(horizontal="left", vertical="center")
        for col in range(2, 9):
            ws7.cell(r7, col).border = _bdr
            ws7.cell(r7, col).fill  = bg
        ws7.cell(r7, 9).fill   = bg
        ws7.cell(r7, 9).border = _bdr
        _brs_amt(r7, 10, bal, bg, _BF)
        ws7.cell(r7, 11).fill   = bg
        ws7.cell(r7, 11).border = _bdr
        ws7.row_dimensions[r7].height = 20
        r7 += 1

    def _brs_blank():
        nonlocal r7
        ws7.merge_cells(f"A{r7}:K{r7}")
        ws7.row_dimensions[r7].height = 6
        r7 += 1

    def _brs_section(text, bg=None):
        nonlocal r7
        bg = bg or _SEC
        _brs_merge(r7, text, bg,
                   Font(bold=True, color="FFFFFF", name="Calibri", size=10))
        ws7.row_dimensions[r7].height = 20
        r7 += 1

    def _brs_nil():
        nonlocal r7
        ws7.merge_cells(f"A{r7}:H{r7}")
        c           = ws7.cell(r7, 1, "      -  (Nil)")
        c.fill      = _ITM; c.border = _bdr; c.font = _NF
        c.alignment = Alignment(horizontal="left", vertical="center")
        for col in range(2, 9):
            ws7.cell(r7, col).fill  = _ITM
            ws7.cell(r7, col).border = _bdr
        _brs_amt(r7, 9, "-", _ITM, _NF, fmt="@")
        ws7.cell(r7, 10).fill   = _ITM
        ws7.cell(r7, 10).border = _bdr
        ws7.cell(r7, 11).fill   = _ITM
        ws7.cell(r7, 11).border = _bdr
        ws7.row_dimensions[r7].height = 16
        r7 += 1

    def _write_col_hdrs():
        nonlocal r7
        for ci, h in enumerate(_col_hdrs, 1):
            cell           = ws7.cell(r7, ci, h)
            cell.fill      = _SUB
            cell.font      = font(bold=True)
            cell.border    = _bdr
            cell.alignment = Alignment(horizontal="center", vertical="center")
        ws7.row_dimensions[r7].height = 16
        r7 += 1

    _brs_blank()
    _brs_balance(f"Closing Balance as per Company Books  (Dr.)", closing_bal)
    _brs_blank()

    running7 = closing_bal

    _brs_section("Add :  Cheques issued but not debited in Bank")
    _write_col_hdrs()
    _brs_nil()
    _brs_subtotal(0.0)
    running7 += 0.0
    _brs_running(running7)
    _brs_blank()

    _brs_section("Less :  Cheques deposited but not Credited in Bank")
    _write_col_hdrs()

    if not dnc_all:
        _brs_nil()
    else:
        for item in dnc_all:
            _brs_item(
                date     = item["date"],
                branch   = item["branch"],
                ref      = item["ref"],
                rrn      = "",
                chq      = 511,
                party    = item["party"],
                amt      = item["amount"],
                narr     = item.get("note", "") or item.get("remark", ""),
                is_cf    = bool(item.get("cf")),
                book_raw = item["party"],   # Book Report: raw book party name
                bank_raw = "",              # Bank Statement: blank for book-only items
            )

    _brs_subtotal(total_dnc)
    running7 -= total_dnc
    _brs_running(running7)
    _brs_blank()

    _brs_section("Less :  Debited in pass book but not credited in Our book")
    _write_col_hdrs()
    _brs_nil()
    _brs_subtotal(0.0)
    _brs_running(running7)
    _brs_blank()

    _brs_section("Add :  Credited in pass book but not debited in Our book")
    _write_col_hdrs()

    if not cnb_all:
        _brs_nil()
    else:
        for item in cnb_all:
            _brs_item(
                date     = item["date"],
                branch   = item["branch"],
                ref      = "",
                rrn      = item.get("rrn", ""),
                chq      = "",
                party    = item["party"],
                amt      = item["amount"],
                narr     = item.get("remark", ""),
                is_cf    = bool(item.get("cf")),
                book_raw = "",              # Book Report: blank for bank-only items
                bank_raw = item["party"],   # Bank Statement: raw bank payer name
            )

    _brs_subtotal(total_cnb)
    running7 += total_cnb
    _brs_blank()

    _bal_bg = _DIF_G if reconciled else _DIF_R
    _brs_balance("Closing Balance as per Bank book", bank_bal, bg=_bal_bg)
    _brs_blank()
    _brs_balance("Difference  (should be 0 when reconciled)",
                 bank_bal, bg=_bal_bg)
    _brs_blank()

    # ── Matched Transactions with Discrepancies ───────────────────────────────
    # Surfaces any matched pair where name score < 90% or amounts differ,
    # so an auditor can verify them before sign-off.
    _disc_rows = [
        m for m in matched_rows
        if m["Name Match"] in ("Partial", "Low") or m["Diff"] != 0
    ]

    if _disc_rows:
        _n_low      = sum(1 for m in _disc_rows if m["Name Match"] == "Low")
        _n_partial  = sum(1 for m in _disc_rows if m["Name Match"] == "Partial")
        _n_amt_diff = sum(1 for m in _disc_rows if m["Diff"] != 0)
        _type_parts = []
        if _n_low:      _type_parts.append(f"{_n_low} low name match{'es' if _n_low > 1 else ''}")
        if _n_partial:  _type_parts.append(f"{_n_partial} partial name match{'es' if _n_partial > 1 else ''}")
        if _n_amt_diff: _type_parts.append(f"{_n_amt_diff} amount difference{'s' if _n_amt_diff > 1 else ''}")
        _type_summary = ", ".join(_type_parts)

        # Section banner — dark red, white text
        _SEC_W = fill("C00000")
        _brs_merge(
            r7,
            f"⚠  Matched Transactions with Discrepancies — Requires Verification  "
            f"({len(_disc_rows)} items: {_type_summary})",
            _SEC_W,
            Font(bold=True, color="FFFFFF", name="Calibri", size=10),
        )
        ws7.row_dimensions[r7].height = 20
        r7 += 1

        # Column header row for discrepancy detail
        _disc_hdrs = [
            "Book Date", "Book Branch", "Book Bill No", "Book Party",
            "Book Amt (Rs)", "Bank Date", "Bank Party", "Bank Amt (Rs)", "Flag / Reason",
        ]
        for _ci, _h in enumerate(_disc_hdrs, 1):
            _c = ws7.cell(r7, _ci, _h)
            _c.fill      = fill("DCE6F1")
            _c.font      = font(bold=True)
            _c.border    = _bdr
            _c.alignment = Alignment(horizontal="center", vertical="center")
        ws7.row_dimensions[r7].height = 16
        r7 += 1

        # One detail row per discrepant match
        for _m in _disc_rows:
            _nm   = _m["Name Match"]
            _diff = _m["Diff"]
            _sc   = _m["Score%"]

            # Row colour: red=Low, peach=Partial, amber=amt-only diff
            if _nm == "Low":
                _row_bg = fill("FFC7CE")
            elif _nm == "Partial":
                _row_bg = fill("FCE4D6")
            else:
                _row_bg = fill("FFEB9C")

            _flag_parts = []
            if _nm == "Low":
                _flag_parts.append(
                    f"LOW NAME MATCH ({_sc}%): "
                    f"Book='{_m['Book Party']}' vs Bank='{_m['Bank Payer']}' — manual check required"
                )
            elif _nm == "Partial":
                _flag_parts.append(
                    f"PARTIAL NAME MATCH ({_sc}%): "
                    f"Book='{_m['Book Party']}' vs Bank='{_m['Bank Payer']}' — confirm same party"
                )
            if _diff != 0:
                _flag_parts.append(
                    f"AMOUNT DIFFERENCE: Rs{_diff:+,.2f} — "
                    f"Book Rs{_m['Book Amt']:,.2f} vs Bank Rs{_m['Bank Amt']:,.2f}"
                )
            if _m.get("Flags"):
                for _seg in _m["Flags"].split(" | "):
                    if _seg and _seg not in " | ".join(_flag_parts):
                        _flag_parts.append(_seg)
            _flag_text = " | ".join(dict.fromkeys(filter(None, _flag_parts)))

            _vals = [
                _m["Book Date"], _m["Book Branch"], _m["Book Bill No"], _m["Book Party"],
                _m["Book Amt"],
                _m["Bank Date"], _m["Bank Payer"], _m["Bank Amt"],
                _flag_text,
            ]
            for _ci, _v in enumerate(_vals, 1):
                _cell = ws7.cell(r7, _ci, _v)
                _cell.fill      = _row_bg
                _cell.border    = _bdr
                _cell.font      = font(bold=False)
                _cell.alignment = Alignment(
                    horizontal="right" if _ci in (5, 8) else "left",
                    vertical="center", wrap_text=True,
                )
                if _ci in (5, 8) and isinstance(_v, (int, float)):
                    _cell.number_format = "#,##0.00"
            # Fill remaining columns 10 & 11
            for _ci in (10, 11):
                _cell = ws7.cell(r7, _ci, "")
                _cell.fill   = _row_bg
                _cell.border = _bdr
            ws7.row_dimensions[r7].height = 16
            r7 += 1

        # Legend row
        ws7.merge_cells(f"A{r7}:K{r7}")
        _leg = ws7.cell(r7, 1,
            "🔴 Red = Low Name Match (<60%) — manual verification required   "
            "🟠 Orange = Partial Name Match (60-89%) — confirm same party   "
            "🟡 Yellow = Amount difference — review and confirm")
        _leg.fill      = fill("FFF2CC")
        _leg.font      = Font(name="Calibri", size=8, italic=True, color="7F4F00")
        _leg.border    = _bdr
        _leg.alignment = Alignment(horizontal="left", vertical="center", wrap_text=True)
        for _col in range(2, 12):
            ws7.cell(r7, _col).fill   = fill("FFF2CC")
            ws7.cell(r7, _col).border = _bdr
        ws7.row_dimensions[r7].height = 16
        r7 += 1
        _brs_blank()

    # ── Footer notes ──────────────────────────────────────────────────────────
    ws7.merge_cells(f"A{r7}:K{r7}")
    ws7.cell(r7, 1,
        f"Gateway Total Credits (SaleSuccess) : Rs {stmt_success['amount(rs.)'].sum():,.2f}"
    ).font      = Font(name="Calibri", size=9, color="595959")
    ws7.cell(r7, 1).alignment = align()
    ws7.cell(r7, 1).border    = no_border()
    r7 += 1

    ws7.merge_cells(f"A{r7}:K{r7}")
    ws7.cell(r7, 1,
        "CF = Carried Forward from Previous BRS (outstanding items not yet cleared)"
    ).font      = Font(name="Calibri", size=8, italic=True, color="595959")
    ws7.cell(r7, 1).alignment = align()
    ws7.cell(r7, 1).border    = no_border()

    # ── Sheet 8 — CF Audit Trail ──────────────────────────────────────────────
    ws8 = wb.create_sheet("CF Audit Trail")
    col_widths(ws8, [24, 14, 8, 18, 34, 14, 18])
    ws8.freeze_panes = "A3"

    r = 1
    write_title_row(ws8, r,
        "QR Carry-Forward Audit Trail — Previous BRS Outstanding Items", 7)
    r += 1
    write_header_row(ws8, r,
        ["Section", "Date", "Branch", "Bill No/RRN", "Party", "Amount (Rs)", "Status"])

    for item in dnc_all_for_sheet:
        r += 1
        status = "CARRIED FORWARD" if item.get("cf") else f"NEW — {BRS_DATE}"
        bg     = C_CF if item.get("cf") else C_GREEN
        for c, v in enumerate(
                ["deposited_not_credited", item["date"], item["branch"],
                 item["ref"], item["party"], item["amount"], status], 1):
            set_cell(ws8, r, c, v, bg=bg,
                     h_align="right" if c == 6 else "left",
                     num_fmt="#,##0" if c == 6 else None)

    for item in cnb_all_for_sheet:
        r += 1
        status = "CARRIED FORWARD" if item.get("cf") else f"NEW — {BRS_DATE}"
        bg     = C_CF if item.get("cf") else None
        for c, v in enumerate(
                ["credited_not_book", item["date"], item["branch"],
                 item["rrn"], item["party"], item["amount"], status], 1):
            set_cell(ws8, r, c, v, bg=bg,
                     h_align="right" if c == 6 else "left",
                     num_fmt="#,##0" if c == 6 else None)

    if step4b_matched:
        r += 1
        ws8.merge_cells(f"A{r}:G{r}")
        hdr = ws8.cell(r, 1,
            "Step 4B — Previous BRS CNB Carry-Forwards Cleared Against Today's Book Entries")
        hdr.fill      = fill(C_LBLUE)
        hdr.font      = font(bold=True, size=9)
        hdr.alignment = align()
        hdr.border    = _BR
        for col in range(2, 8):
            ws8.cell(r, col).fill   = fill(C_LBLUE)
            ws8.cell(r, col).border = _BR
        ws8.row_dimensions[r].height = 18

        for pair in step4b_matched:
            dnc   = pair["dnc"]
            cnb   = pair["cnb"]
            sc    = pair["score"]
            adiff = pair.get("amt_diff", 0) or 0
            nm_label = ("MATCH" if sc >= FUZZY_THRESH else
                        "PARTIAL MATCH" if sc >= FUZZY_ACCEPT else "LOW MATCH")
            adiff_note = (f" | Amt diff={adiff:+.2f}" if abs(adiff) > 0.005 else "")
            cleared_status = f"PAYMENT CLEARED — {BRS_DATE} ({nm_label} {sc}%{adiff_note})"
            row_bg = C_AMBER if (sc < FUZZY_THRESH or abs(adiff) > 0.005) else C_GREEN

            r += 1
            for c, v in enumerate(
                    ["credited_not_book (CF-CLEARED)", cnb["date"], cnb["branch"],
                     cnb.get("rrn", ""), cnb["party"], cnb["amount"], cleared_status], 1):
                set_cell(ws8, r, c, v, bg=row_bg,
                         h_align="right" if c == 6 else "left",
                         num_fmt="#,##0" if c == 6 else None)

            r += 1
            for c, v in enumerate(
                    ["deposited_not_credited (CLEARED)", dnc["date"], dnc["branch"],
                     dnc["ref"], dnc["party"], dnc["amount"], cleared_status], 1):
                set_cell(ws8, r, c, v, bg=row_bg,
                         h_align="right" if c == 6 else "left",
                         num_fmt="#,##0" if c == 6 else None)

    # ── Sheet 9 — Summary ─────────────────────────────────────────────────────
    ws9 = wb.create_sheet("Summary")
    col_widths(ws9, [42, 32, 38])
    ws9.freeze_panes = "A3"

    r = 1
    write_title_row(ws9, r,
        f"QR RECONCILIATION SUMMARY  |  QR-HDFC  |  {BRS_DATE}", 3)
    r += 1
    write_header_row(ws9, r, ["Item", "Value", "Notes"])

    rows_s = [
        ("Company",    "ORIENT EXCHANGE & FINANCIAL SERVICES (P) LTD", ""),
        ("QR Account", "QR-HDFC", ""),
        ("BRS Date",   BRS_DATE, ""),
        ("Books Match (All-Branches Payments = HOT Receipts)",
         "MATCH" if books_match else "MISMATCH",
         f"Rs {total_all_pay:,.0f} = Rs {total_hot_rec:,.0f}"),
        ("Reconciliation Status",
         "FULLY RECONCILED" if reconciled else "NOT RECONCILED", ""),
        None,
        # Fix B: surface the stale-CF warning in the Summary sheet.
        ("⚠ Prev BRS Input Type",
         "SCRIPT OUTPUT (risk of stale CFs — use manual BRS)" if _is_output_fmt else "Manual BRS (recommended)",
         "Fix B: always supply the MANUAL BRS as prev_brs for clean carry-forwards"),
        ("WRONGLY ACCOUNTED entries excluded",
         len(_wrongly_accounted_bills),
         f"Bills excluded from matching: {sorted(_wrongly_accounted_bills)}"),
        None,
        ("Correction entries detected", len(corr_amts),
         f"Amounts: {[int(x) for x in set(corr_amts)]}"),
        ("Book Cheque Deposit entries",  len(ps),           "Individual customer bills"),
        ("HOT Settlement entries",       len(ap),           "Payments from book to HOT"),
        ("Bank SaleSuccess entries",     len(stmt_success), "Filtered gateway statement"),
        None,
        ("Matched (Passes 1-4)",                   len(matched_rows), "Book bill ↔ bank transaction"),
        ("Reco Items (Deposited not Credited)",     len(dnc_all),      "In book, not in bank gateway"),
        ("Bank Only (Credited not Book)",           len(cnb_all),      "In bank gateway, not in book"),
        None,
        ("Book Closing Balance",
         f"Rs {closing_bal:,.2f} ({'Cr.' if closing_bal < 0 else 'Dr.'})",
         "From HOT QRHDFC book summary col 11"),
        ("DNC Total (deduct from book)", f"Rs {total_dnc:,.2f}", "Deposited not credited"),
        ("CNB Total (add to book)",      f"Rs {total_cnb:,.2f}", "Credited not booked"),
        ("BRS Running (after DNC & CNB)",f"Rs {bank_bal:,.2f}", "closing - DNC + CNB"),
        ("Bank Closing (target = 0)",    f"Rs {bank_bal:,.2f}", "0 when reconciled"),
        ("BRS Difference (should be 0)", f"Rs {bank_bal:,.2f}", "0 = fully reconciled"),
        None,
        # Fix C: document the HOT data gap for PUNE PATIL entries.
        # AKSHADA PATIL (74870) and VINAYAK PATIL (74870) appear in the bank
        # statement as PUNE entries but have no corresponding HOT book entry.
        # These are likely adjustment entries not exported from HOT.
        # They will remain in CNB until the HOT book is corrected.
        ("⚠ Fix C — Known HOT Data Gap",
         "PUNE PATIL entries (74870 x2) — no HOT book entry found",
         "Manual matched as adjustment entries; cannot auto-match without correct HOT export"),
        None,
        ("Items Carried Forward (CF)",
         len([i for i in dnc_all + cnb_all if i.get("cf")]),
         "From previous BRS"),
        ("New items this period",
         len([i for i in dnc_all + cnb_all if not i.get("cf")]),
         "Identified today"),
    ]

    for item in rows_s:
        r += 1
        if item is None:
            ws9.row_dimensions[r].height = 6
            continue
        bg = None
        val_str = str(item[1])
        if "FULLY RECONCILED" in val_str:                                bg = C_GREEN
        if "NOT RECONCILED"   in val_str or "MISMATCH" in val_str:      bg = C_RED
        if "MATCH"            in val_str and "MISMATCH" not in val_str:  bg = C_GREEN
        for c, v in enumerate(item, 1):
            cell = set_cell(ws9, r, c, v, bg=bg, size=9)
            if c == 1 and item[0] in ("Company", "QR Account", "BRS Date",
                                       "Books Match (All-Branches Payments = HOT Receipts)",
                                       "Reconciliation Status"):
                cell.font = font(bold=True, size=9)

    # ── Save ──────────────────────────────────────────────────────────────────
    try:
        wb.save(OUTPUT_FILE)
        saved_file = OUTPUT_FILE
    except PermissionError:
        alt = str(Path(OUTPUT_FILE).with_stem(
            Path(OUTPUT_FILE).stem + f"_{stmt_date.strftime('%d_%m_%Y')}_alt"))
        wb.save(alt)
        saved_file = alt
        print(f"\n  Output file was locked — saved as {alt} instead.")

    print(f"\n Saved → {saved_file}")
    print(f"\n{'='*60}")
    print(f"Matched : {len(matched_rows)} | DNC : {len(dnc_all)} | CNB : {len(cnb_all)}")
    print(f"BRS     : {'RECONCILED' if reconciled else 'NOT RECONCILED'} "
          f"| Bank bal = Rs {bank_bal:,.2f}")

    # ══════════════════════════════════════════════════════════════════════════
    #  BUILD RETURN DataFrames
    # ══════════════════════════════════════════════════════════════════════════
    matched_df = pd.DataFrame(matched_rows) if matched_rows else pd.DataFrame(columns=[
        "Method", "Name Match", "Amount Match", "Score%",
        "Book Date", "Book Branch", "Book Bank", "Book Bill No", "Book Chq No",
        "Book Party", "Book Amt",
        "Bank Date", "Bank Time", "Bank Branch", "Bank Payer", "Bank Amt",
        "Bank RRN", "Pay Type", "Diff", "Flags",
    ])

    dnc_df = pd.DataFrame(dnc_all_for_sheet) if dnc_all_for_sheet else pd.DataFrame(
        columns=["date", "branch", "ref", "party", "amount", "note", "remark", "cf"])

    cnb_df = pd.DataFrame(cnb_all_for_sheet) if cnb_all_for_sheet else pd.DataFrame(
        columns=["date", "branch", "rrn", "party", "amount", "diff", "remark", "cf"])

    return (
        matched_df,
        dnc_df,
        cnb_df,
        closing_bal,
        bank_bal,
        reconciled,
        BRS_DATE,
        books_match,
        corr_amts,
    )


# ══════════════════════════════════════════════════════════════════════════════
#  CLI entry-point (optional — preserves original CLI usage)
# ══════════════════════════════════════════════════════════════════════════════
if __name__ == "__main__":
    import argparse

    p = argparse.ArgumentParser(description="QR-HDFC BRS Generator")
    p.add_argument("--all-branches", required=True)
    p.add_argument("--hot-book",     required=True)
    p.add_argument("--statement",    required=True)
    p.add_argument("--prev-brs",     required=True)
    p.add_argument("--output",       default="QR_Reconcilation.xlsx")
    p.add_argument("--date",         default=None)
    args = p.parse_args()

    process_qr_files(
        all_branches_path  = args.all_branches,
        hot_book_path      = args.hot_book,
        qr_stmt_path       = args.statement,
        output_path        = args.output,
        prev_brs_path      = args.prev_brs,
        brs_date_override  = args.date,
    )