import re
import sys
import argparse
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
FUZZY_THRESH = 90   # >= 90% : confirmed match   (green)
FUZZY_ACCEPT = 60   # 60-89% : partial match     (amber, flag for review)
#                   # <  60% : low match          (red flag, manual check)

# ══════════════════════════════════════════════════════════════════════════════
#  CLI ARGS  (FROM v10)
# ══════════════════════════════════════════════════════════════════════════════
DATE_RE = re.compile(r"(\d{2}\.\d{2}\.\d{4})")

def extract_date(text):
    m = DATE_RE.search(str(text))
    return datetime.strptime(m.group(1), "%d.%m.%Y") if m else None

def parse_args():
    p = argparse.ArgumentParser(
        description="QR-HDFC BRS Generator — merged v5+v10")
    p.add_argument("--all-branches", required=True,
                   help="All-branches book report xlsx")
    p.add_argument("--hot-book",     required=True,
                   help="HOT QRHDFC book report xlsx")
    p.add_argument("--statement",    required=True,
                   help="QR-HDFC bank statement xlsx")
    p.add_argument("--prev-brs",     required=True,
                   help="Previous day BRS xlsx")
    p.add_argument("--output",       default="QR_Reconciliation.xlsx",
                   help="Output workbook path  (default: QR_Reconciliation.xlsx)")
    p.add_argument("--date",         default=None,
                   help="BRS date dd.mm.yyyy; auto-detected from statement filename if omitted")
    return p.parse_args()

args              = parse_args()
ALL_BRANCHES_FILE = Path(args.all_branches)
HOT_QRHDFC_FILE   = Path(args.hot_book)
STATEMENT_FILE    = Path(args.statement)
PREV_BRS_FILE     = Path(args.prev_brs)
OUTPUT_FILE       = args.output

# Validate all input files exist before doing any work
missing = [str(f) for f in
           [ALL_BRANCHES_FILE, HOT_QRHDFC_FILE, STATEMENT_FILE, PREV_BRS_FILE]
           if not f.exists()]
if missing:
    raise FileNotFoundError("Missing input file(s):\n  " + "\n  ".join(missing))

# Determine BRS date
stmt_date = extract_date(STATEMENT_FILE.name)
if args.date:
    stmt_date = datetime.strptime(args.date, "%d.%m.%Y")
if stmt_date is None:
    raise ValueError(
        "Cannot determine BRS date from statement filename. "
        "Pass --date dd.mm.yyyy explicitly.")
BRS_DATE = stmt_date.strftime("%d.%m.%Y")

# ══════════════════════════════════════════════════════════════════════════════
#  STYLE HELPERS  — matched to Bank_Reconc_06.py colour theme
# ══════════════════════════════════════════════════════════════════════════════
def fill(hex_c):
    return PatternFill("solid", fgColor=hex_c)

def font(bold=False, color="000000", size=9):
    return Font(bold=bold, color=color, size=size, name="Arial")

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

# ── Colour palette (Bank_Reconc_06 standard) ─────────────────────────────────
C_NAVY  = "1F3864"   # dark navy  — title bars, primary headers
C_BLUE  = "2E75B6"   # mid blue   — secondary headers
C_LBLUE = "D9E1F2"   # light blue — step-4B section banner
C_GREEN = "C6EFCE"   # green      — matched / reconciled rows
C_AMBER = "FFEB9C"   # amber/yellow — partial match / CF items
C_RED   = "FFC7CE"   # red        — mismatch / unmatched rows
C_ORNG  = "FCE4D6"   # peach/orange — low-confidence / DNC items
C_GREY  = "F2F2F2"   # light grey — totals / subtotals
C_WHITE = "FFFFFF"
C_CF    = "E2EFDA"   # pale green — carried-forward items (BRS)
C_RED_H = "C00000"   # dark red   — alert section headers

# Shared openpyxl style objects (mirrors Bank_Reconc_06 globals)
_BR = border()        # standard thin border (used everywhere)
_NF = font()          # normal font
_BF = font(bold=True) # bold font

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
    """Column header bar — dark navy background, white bold text (Bank_Reconc_06 style)."""
    cols = cols or list(range(1, len(headers) + 1))
    for col, h in zip(cols, headers):
        c = ws.cell(row=r, column=col, value=h)
        c.fill      = fill(bg)
        c.font      = Font(bold=True, color="FFFFFF", name="Arial", size=10)
        c.border    = _BR
        c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
    ws.row_dimensions[r].height = 24

def write_title_row(ws, r, text, n_cols, bg=C_NAVY):
    """Full-width title banner — navy, white bold, size 12, centred (Bank_Reconc_06 style)."""
    ws.merge_cells(start_row=r, start_column=1, end_row=r, end_column=n_cols)
    c = ws.cell(row=r, column=1, value=text)
    c.fill      = fill(bg)
    c.font      = Font(bold=True, color="FFFFFF", name="Arial", size=12)
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
    """Return 0-100 similarity between two strings (case-insensitive)."""
    if not a or not b:
        return 0
    return int(SequenceMatcher(None,
                               str(a).upper(),
                               str(b).upper()).ratio() * 100)

def normalize_party(text):
    """Strip 'INDIVI - ' prefix, collapse whitespace, uppercase.  (FROM v10)"""
    text = str(text or "").replace("INDIVI - ", "").strip()
    return re.sub(r"\s+", " ", text.upper())

def _find_section(df, header_fragment, data_col=5):
    """
    FROM v10 — dynamically locate a named section in the previous BRS sheet.

    Scans column 0 for a row containing header_fragment (case-insensitive).
    Collects subsequent rows until data_col becomes non-numeric (subtotal/blank).
    Also skips rows whose col-0 date is empty (formula/SUM rows pandas reads
    as numeric).

    Replaces the old hardcoded iloc[11:15] and iloc[22:173] slices.
    Works regardless of how many items are in the section.
    Also handles output-format section headers which may have extra spaces or
    slightly different wording (e.g. "Less :  Cheques deposited…" vs
    "Less: Cheques deposited…").
    """
    # Build a normalised version of the fragment for flexible matching:
    # collapse whitespace AND remove spaces around colons/punctuation so that
    # "Less :" and "Less:" both normalise to "less:" for comparison.
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
#  STEP 1 — LOAD DATA
# ══════════════════════════════════════════════════════════════════════════════
print("Loading files...")
print(f"  All-branches book : {ALL_BRANCHES_FILE}")
print(f"  HOT QRHDFC book   : {HOT_QRHDFC_FILE}")
print(f"  Statement         : {STATEMENT_FILE}")
print(f"  Previous BRS      : {PREV_BRS_FILE}")
print(f"  Output            : {OUTPUT_FILE}")
print(f"  BRS Date          : {BRS_DATE}")

# ── All Branches ──────────────────────────────────────────────────────────────
df_all = pd.read_excel(ALL_BRANCHES_FILE, sheet_name=0, header=None)

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

# Public Sales — these are the book entries we reconcile against the bank
ps = df_all[df_all[0] == "Public Sale"].copy()
ps["date"]    = pd.to_datetime(ps[2], errors="coerce")
ps["bill_no"] = "PS-" + ps[3].astype(str).str.strip()
ps["branch"]  = ps["_br"].str.split(" - ").str[0]
ps["party"]   = ps[6].astype(str).str.replace("INDIVI - ", "", regex=False).str.strip()
ps["amount"]  = pd.to_numeric(ps[7], errors="coerce").fillna(0)

# All-Branches Payments (HOT settlements)
ap = df_all[df_all[0] == "Payments"].copy()
ap["amount"]    = pd.to_numeric(ap[9], errors="coerce").fillna(0)
ap["narration"] = ap[13].astype(str).str.strip()
ap["bill_no"]   = "PS-" + ap[3].astype(str).str.strip()
ap["date"]      = pd.to_datetime(ap[2], errors="coerce")
ap["branch"]    = ap["_br"].str.split(" - ").str[0]

# All-Branches Receipts (cancel side for correction detection)
ar = df_all[df_all[0] == "Receipts"].copy()
ar["amount"] = pd.to_numeric(ar[7], errors="coerce").fillna(0)

# ── HOT QRHDFC Book ───────────────────────────────────────────────────────────
df_hot = pd.read_excel(HOT_QRHDFC_FILE, sheet_name=0, header=None)

hot_rec = df_hot[df_hot[0] == "Receipts"].copy()
hot_rec["amount"]    = pd.to_numeric(hot_rec[7], errors="coerce").fillna(0)
hot_rec["narration"] = hot_rec[13].astype(str).str.strip()

hot_pay = df_hot[df_hot[0] == "Payments"].copy()
hot_pay["amount"]    = pd.to_numeric(hot_pay[9], errors="coerce").fillna(0)
hot_pay["bill_no"]   = "PS-" + hot_pay[3].astype(str).str.strip()
hot_pay["narration"] = hot_pay[13].astype(str).str.strip()
hot_pay["date"]      = pd.to_datetime(hot_pay[2], errors="coerce")
hot_pay["branch"]    = hot_pay[6].astype(str).str.split(" - ").str[0].str.strip()

# Closing balance from HOT summary row col 11
hot_summary = df_hot[df_hot[0] == "Summary Of QRHDFC"].iloc[0]
closing_bal = float(hot_summary[11])
print(f"  HOT closing balance: {closing_bal:,.0f}")

# ── HDFC Statement ────────────────────────────────────────────────────────────
df_stmt = pd.read_excel(STATEMENT_FILE, sheet_name=0, header=0)
df_stmt = df_stmt[df_stmt["transaction state"] != "transaction state"].copy()
df_stmt["amount(rs.)"]      = pd.to_numeric(df_stmt["amount(rs.)"], errors="coerce").fillna(0)
df_stmt["transaction date"] = pd.to_datetime(df_stmt["transaction date"], errors="coerce")
name_col = [c for c in df_stmt.columns
            if "payer" in c.lower() or c == df_stmt.columns[-1]][0]

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
    "ORIENT EXCHANGE KOCHI EXIM"             : "KOCHI",
    "ORIENT EXCHANGE AMRITSAR"               : "AMTR",
    "ORIENT EXCHANGE KOLLAM"                 : "KOLM",
    "ORIENT EXCHANGE CALICUT"                : "CALCT",
}
df_stmt["branch_code"] = df_stmt["doing business as"].map(DBA_MAP).fillna(
    df_stmt["doing business as"])
stmt_success = df_stmt[df_stmt["transaction state"] == "SaleSuccess"].copy()
stmt_failed  = df_stmt[df_stmt["transaction state"] == "SaleFailed"].copy()

# ── Previous BRS ──────────────────────────────────────────────────────────────
# ── Output-format detection ───────────────────────────────────────────────────
# When the previous BRS file is itself an output file produced by this script
# (e.g. QR_12_03_2026_BRS_2.xlsx), it contains sheets like "Cheque Deposit",
# "Bank Gateway (SaleSuccess)", "QR BRS Statement", etc. — NOT "QR-HDFC".
# In that case, load "QR BRS Statement" and adjust _find_section data_col to 6
# (the output format has an extra "Bill No / RRN" column before Amount).
_prev_xl      = pd.ExcelFile(PREV_BRS_FILE)
_prev_sheets  = _prev_xl.sheet_names
_OUTPUT_SHEET_HINTS = ("CHEQUE DEPOSIT", "BANK GATEWAY", "RECO ITEMS",
                       "HOT SETTLEMENTS", "QR BRS STATEMENT", "CF AUDIT TRAIL")
_is_output_fmt = any(
    any(s.upper().startswith(h) for h in _OUTPUT_SHEET_HINTS)
    for s in _prev_sheets
)
if _is_output_fmt and "QR BRS Statement" in _prev_sheets:
    print(f"[Prev BRS] Detected output-format file — using 'QR BRS Statement' sheet")
    prev           = pd.read_excel(PREV_BRS_FILE, sheet_name="QR BRS Statement", header=None)
    _PREV_DATA_COL = 6   # output format: Date|Branch|BillNo|RRN|ChqNo|Party|Amount|RunBal|Remark
    _PREV_RRN_COL  = 3   # RRN is col 3 in the output format (CNB rows)
    _PREV_PARTY_COL= 5   # Party/Description is col 5 in the output format
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
# ─────────────────────────────────────────────────────────────────────────────

# ══════════════════════════════════════════════════════════════════════════════
#  STEP 2 — DETECT CORRECTION ENTRIES
#  Any amount appearing in both Receipts AND Payments = cancel pair
# ══════════════════════════════════════════════════════════════════════════════
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

# ══════════════════════════════════════════════════════════════════════════════
#  STEP 3 — BOOKS MATCH CHECK
#  All-Branches Payments must equal HOT QRHDFC Receipts
# ══════════════════════════════════════════════════════════════════════════════
total_all_pay = ap["amount"].sum()
total_hot_rec = hot_rec["amount"].sum()
books_match   = abs(total_all_pay - total_hot_rec) < 1

print(f"\nBOOKS MATCH CHECK:")
print(f"  All-Branches Payments : Rs. {total_all_pay:,.0f}")
print(f"  HOT QRHDFC Receipts   : Rs. {total_hot_rec:,.0f}")
print(f"  {' MATCH' if books_match else ' MISMATCH'}")
if not books_match:
    print("  WARNING: Books do not match — BRS will be generated with mismatch flag")

# ══════════════════════════════════════════════════════════════════════════════
#  STEP 4 — MATCH BOOK vs BANK STATEMENT
#
#  FROM v5: global pre-score approach
#    • Score every (book, bank) amount-matching pair across all 5 passes
#    • Sort globally by (method_priority DESC, name_score DESC)
#    • Single greedy assignment pass
#    • Cross-branch guard uses pure name score (0-100) — BUG-FREE
#
#  5 passes (priority order):
#    1  : Amount + Branch + Exact Date        → most confident
#    1B : Amount + Branch + ±1 day
#    2  : Amount + Exact Date (any branch)
#    2B : Amount + ±1 day    (any branch)
#    3  : Amount only                         → least confident
#
#  Cross-branch guard (Passes 2/2B/3):
#    Reject if pure_name_score < FUZZY_ACCEPT AND bank_branch ≠ book_branch
# ══════════════════════════════════════════════════════════════════════════════
print(f"\nMatching book vs bank statement (fuzzy threshold: {FUZZY_THRESH}%)...")

bank_pool = stmt_success.copy().reset_index(drop=True)
book_df   = ps.copy().reset_index(drop=True)

method_priority = {
    "1-Amt+Branch+Date" : 5,
    "1B-Amt+Branch±1day": 4,
    "2-Amt+Date"        : 3,
    "2B-Amt±1day"       : 2,
    "3-AmtOnly"         : 1,
}

# ── Phase A: build scored pair list ──────────────────────────────────────────
scored_pairs = []   # (book_idx, bank_idx, name_score, method, priority)

for bi, bk in book_df.iterrows():
    b_amt  = bk["amount"]
    b_br   = bk["branch"]
    b_date = bk["date"]
    b_pty  = bk["party"]

    for bki, brow in bank_pool.iterrows():
        if b_amt != brow["amount(rs.)"]:
            continue                         # amount must match exactly

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

        # Pure name score — kept separate from priority (fixes v10 composite bug)
        sc = name_sim(b_pty, bk_name)
        scored_pairs.append((bi, bki, sc, method, method_priority[method]))

# ── Phase B: sort globally — method priority first, name score second ────────
scored_pairs.sort(key=lambda x: (x[4], x[2]), reverse=True)

# ── Phase C: single greedy assignment ────────────────────────────────────────
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

    # Cross-branch false-positive guard
    # sc is pure name% (0-100) — guard fires correctly for all passes
    if not is_branch_locked and sc < FUZZY_ACCEPT and not branch_matches:
        continue   # reject → book entry will fall to DNC

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
        "Score%"      : sc,
        "Amt Match"   : "Exact",
        "Book Date"   : bk["date"].strftime("%d.%m.%Y") if pd.notna(bk["date"]) else "",
        "Book Branch" : b_br,
        "Book Bank"   : "QRHDFC",
        "Book Bill No": bk["bill_no"],
        "Book Chq No" : 511,
        "Book Party"  : b_pty,
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

# ── Pass 4: N-way split matching ─────────────────────────────────────────────
# FROM v5 updated: handles 2, 3, 4... splits using itertools.combinations
# Candidates restricted to same branch + ±1 day (tighter than original v5)
print("  Detecting split-amount matches...")

for bi, bk in book_df.iterrows():
    if bi in matched_book:
        continue

    b_amt  = bk["amount"]
    b_br   = bk["branch"]
    b_pty  = bk["party"]
    b_date = bk["date"]

    # Unmatched bank entries from same branch within ±1 day
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

            matched_book.add(bi)
            for idx in indices:
                matched_bank.add(idx)

            matched_rows.append({
                "Method"      : f"4-SplitAmt({combo_size})",
                "Name Match"  : "Match" if avg_sc >= FUZZY_THRESH else "Partial",
                "Score%"      : avg_sc,
                "Amt Match"   : f"Split x{combo_size}",
                "Book Date"   : bk["date"].strftime("%d.%m.%Y") if pd.notna(bk["date"]) else "",
                "Book Branch" : b_br,
                "Book Bank"   : "QRHDFC",
                "Book Bill No": bk["bill_no"],
                "Book Chq No" : 511,
                "Book Party"  : b_pty,
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

# ── Build initial DNC new / CNB new from unmatched entries ───────────────────
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
        cnb_new.append({
            "date"  : dt.strftime("%d.%m.%Y") if pd.notna(dt) else "",
            "branch": brow["branch_code"],
            "rrn"   : str(brow["rrn no"]),
            "party" : brow[name_col],
            "amount": brow["amount(rs.)"],
            "diff"  : None,
            "remark": "",
        })

print(f"  Matched: {len(matched_rows)} | DNC new: {len(dnc_new)} | CNB new: {len(cnb_new)}")

# ══════════════════════════════════════════════════════════════════════════════
#  STEP 4B — CROSS-MATCH: today's DNC new vs prev BRS CNB carry-forwards
#
#  If a book entry is unmatched today (DNC new) but a CNB entry from the
#  previous BRS has the same branch + amount + similar name, it means the bank
#  credited it last period and the book caught up today — both cancel out.
#
#  Name check (>=50%) added from v10 to avoid wrong cancellations when two
#  entries from the same branch have identical amounts.
# ══════════════════════════════════════════════════════════════════════════════

# Read CNB carry-forwards FIRST (needed for Step 4B)
# FROM v10: _find_section() — no hardcoded row range
prev_add_raw = _find_section(prev, "Add: Credited in pass book but not debited",
                             data_col=_PREV_DATA_COL).copy()
prev_add_raw[_PREV_DATA_COL] = pd.to_numeric(prev_add_raw[_PREV_DATA_COL], errors="coerce")
prev_add_raw = prev_add_raw[prev_add_raw[_PREV_DATA_COL].notna() & (prev_add_raw[_PREV_DATA_COL] > 0)]

cnb_cf = []
for _, r in prev_add_raw.iterrows():
    dt = str(r[0]).strip()
    try:
        dt = pd.to_datetime(dt, dayfirst=True).strftime("%d.%m.%Y")
    except Exception:
        pass
    diff = r[_PREV_DATA_COL + 1] if pd.notna(r[_PREV_DATA_COL + 1]) else None
    cnb_cf.append({
        "date"  : dt,
        "branch": str(r[1]).strip(),
        "rrn"   : str(r[_PREV_RRN_COL]).strip(),
        "party" : str(r[_PREV_PARTY_COL]).strip(),
        "amount": float(r[_PREV_DATA_COL]),
        "diff"  : diff,
        "remark": "Carried Fwd",
        "cf"    : True,
    })

print(f"\nStep 4B — Cross-matching DNC new vs prev BRS CNB carry-forwards...")

# Index CNB CF by (branch, amount) for fast lookup
cnb_cf_pool = {}
for i, item in enumerate(cnb_cf):
    key = (item["branch"], item["amount"])
    cnb_cf_pool.setdefault(key, []).append(i)

dnc_new_cleared  = set()
cnb_cf_cleared   = set()
step4b_matched   = []   # FIX: track cleared pairs for Matched sheet + CF Audit Trail

for di, dnc_item in enumerate(dnc_new):
    key = (dnc_item["branch"], dnc_item["amount"])
    if key not in cnb_cf_pool or not cnb_cf_pool[key]:
        continue
    # Among candidates at this (branch, amount), pick best name match >= 50%
    # This prevents wrong cancellation when two entries share same branch+amount
    best_ci    = None
    best_score = -1
    for ci in cnb_cf_pool[key]:
        sc = name_sim(normalize_party(dnc_item["party"]),
                      normalize_party(cnb_cf[ci]["party"]))
        if sc >= 50 and sc > best_score:
            best_ci    = ci
            best_score = sc
    if best_ci is None:
        continue
    cnb_cf_pool[key].remove(best_ci)
    dnc_new_cleared.add(di)
    cnb_cf_cleared.add(best_ci)
    # FIX: record the pair so it appears in Matched sheet and CF Audit Trail
    step4b_matched.append({
        "dnc": dnc_item,
        "cnb": cnb_cf[best_ci],
        "score": best_score,
    })
    print(f"  CLEARED: book={dnc_item['branch']}/{dnc_item['party']}/{dnc_item['amount']} "
          f"↔ prev_CNB={cnb_cf[best_ci]['branch']}/{cnb_cf[best_ci]['party']}/{cnb_cf[best_ci]['amount']} "
          f"(name {best_score}%)")

print(f"  Cleared: {len(dnc_new_cleared)} DNC new + {len(cnb_cf_cleared)} CNB CF cancelled")

dnc_new_remaining = [item for i, item in enumerate(dnc_new) if i not in dnc_new_cleared]
cnb_cf_remaining  = [item for i, item in enumerate(cnb_cf)  if i not in cnb_cf_cleared]

print(f"  DNC new remaining  : {len(dnc_new_remaining)}")
print(f"  CNB CF remaining   : {len(cnb_cf_remaining)}")

# ══════════════════════════════════════════════════════════════════════════════
#  STEP 5 — BUILD DNC AND CNB LISTS
#
#  DNC (Less: Deposited Not Credited):
#    = CF items from prev BRS (read via _find_section)
#    + new book-only items completely absent from bank statement
#
#  CNB (Add: Credited Not Booked):
#    = CF items remaining after Step 4B clearance
#    + new bank-only items (today's unmatched bank entries)
#
#  FIX vs v5: cnb_all_for_sheet is built ONCE using cnb_cf_remaining
#  (the v5 double-write bug overwrote this with the full cnb_cf,
#   re-including already-cleared carry-forward items)
# ══════════════════════════════════════════════════════════════════════════════

# ── DNC carry-forwards from prev BRS  (FROM v10: _find_section) ──────────────
prev_less_raw = _find_section(prev, "Less: Cheques deposited but not Credited",
                              data_col=_PREV_DATA_COL).copy()
prev_less_raw[_PREV_DATA_COL] = pd.to_numeric(prev_less_raw[_PREV_DATA_COL], errors="coerce")
prev_less_raw = prev_less_raw[prev_less_raw[_PREV_DATA_COL].notna() & (prev_less_raw[_PREV_DATA_COL] > 0)]

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
    dnc_cf.append({
        "date"  : dt,
        "branch": str(r[1]).strip(),
        "ref"   : str(r[2]).strip(),
        "party" : str(r[_PREV_PARTY_COL]).strip(),
        "amount": float(r[_PREV_DATA_COL]),
        "diff"  : diff,
        "note"  : note,
        "remark": remark,
        "cf"    : True,
    })

print(f"\nPrev BRS carry-forwards loaded:")
print(f"  DNC CF : {len(dnc_cf)} items  (Rs {sum(i['amount'] for i in dnc_cf):,.0f})")
print(f"  CNB CF : {len(cnb_cf)} items  (Rs {sum(i['amount'] for i in cnb_cf):,.0f})")

# ── Build DNC all lists ───────────────────────────────────────────────────────
# For BRS arithmetic: CF items + new items completely absent from bank
stmt_all_keys = {(row["branch_code"], row["amount(rs.)"])
                 for _, row in df_stmt.iterrows()}
cf_refs = {i["ref"] for i in dnc_cf}

dnc_all_for_brs = list(dnc_cf)
for item in dnc_new_remaining:
    if item["ref"] not in cf_refs:
        key = (item["branch"], item["amount"])
        if key not in stmt_all_keys:
            dnc_all_for_brs.append(item)

# For Sheet 4 (Reco Items): CF + all truly unmatched new items
dnc_all_for_sheet = list(dnc_cf)
for item in dnc_new_remaining:
    if item["ref"] not in cf_refs:
        item["cf"] = False
        dnc_all_for_sheet.append(item)

dnc_all   = dnc_all_for_brs
total_dnc = sum(i["amount"] for i in dnc_all)

# ── Build CNB all lists  (FIX: built once from cnb_cf_remaining) ─────────────
# For BRS arithmetic: cleared CF items removed, new bank-only items added
cnb_all_for_brs = list(cnb_cf_remaining)
for item in cnb_new:
    cnb_all_for_brs.append(item)

# For Sheet 5 (Bank Only): same — use remaining CF + new
# FIX vs v5: this is now built ONCE and uses cnb_cf_remaining not full cnb_cf
cf_rrns = {i["rrn"] for i in cnb_cf_remaining}
cnb_all_for_sheet = list(cnb_cf_remaining)
for item in cnb_new:
    if item["rrn"] not in cf_rrns:
        item["cf"] = False
        cnb_all_for_sheet.append(item)

cnb_all   = cnb_all_for_brs
total_cnb = sum(i["amount"] for i in cnb_all)

# ── BRS Arithmetic ────────────────────────────────────────────────────────────
bank_bal   = closing_bal - total_dnc + total_cnb
reconciled = abs(bank_bal) < 1

print(f"\nBRS ARITHMETIC:")
print(f"  Closing Balance (HOT book) : {closing_bal:,.0f}")
print(f"  Less DNC total             : {total_dnc:,.0f}")
print(f"  Add  CNB total             : {total_cnb:,.0f}")
print(f"  Bank Closing Balance       : {bank_bal:,.0f}")
print(f"  {' RECONCILED' if reconciled else ' NOT RECONCILED'}")

# ══════════════════════════════════════════════════════════════════════════════
#  STEP 6 — BUILD WORKBOOK  (FROM v5 — all 9 sheets)
# ══════════════════════════════════════════════════════════════════════════════
print("\nBuilding workbook...")
wb = Workbook()

# ─────────────────────────────────────────────────────────────────────────────
#  Build Bill No → Bank credited date lookup (Passes 1-4 + Step 4B cleared pairs)
# ─────────────────────────────────────────────────────────────────────────────
bill_to_bank_date = {}
bill_to_bank_rrn  = {}
for m in matched_rows:
    key = (m["Book Bill No"], m["Book Amt"])
    bill_to_bank_date[key] = m["Bank Date"]
    bill_to_bank_rrn[key]  = m["Bank RRN"]
# Also map Step 4B cleared pairs (book bill ↔ prev BRS CNB date / RRN)
for pair in step4b_matched:
    key = (pair["dnc"]["ref"], pair["dnc"]["amount"])
    bill_to_bank_date[key] = pair["cnb"]["date"]
    bill_to_bank_rrn[key]  = pair["cnb"].get("rrn", "")

dnc_brs_refs = {i["ref"] for i in dnc_all}

# ─────────────────────────────────────────────────────────────────────────────
#  Sheet 1 — Cheque Deposit
# ─────────────────────────────────────────────────────────────────────────────
ws = wb.active
ws.title = "Cheque Deposit"
col_widths(ws, [14, 8, 8, 16, 12, 20, 38, 14, 30])
ws.freeze_panes = "A3"

r = 1
write_title_row(ws, r,
    f"Cheque Deposit — QR Book Entries  |  QR-HDFC  |  {BRS_DATE}", 9)
r += 1
write_header_row(ws, r,
    ["Date", "Branch", "Bank", "Bill No.", "Cheque No.", "RRN",
     "Party Name", "Amount (Rs)", "Narration"])

for _, row in ps.iterrows():
    r += 1
    dt      = row["date"].strftime("%d.%m.%Y") if pd.notna(row["date"]) else ""
    bill    = row["bill_no"]
    party   = "INDIVI - " + row["party"]
    key     = (bill, row["amount"])
    bank_dt = bill_to_bank_date.get(key)
    rrn     = bill_to_bank_rrn.get(key, "")
    narration = (f"CREDITED AS ON {bank_dt}" if bank_dt
                 else "WRONGLY ACCOUNTED" if bill in dnc_brs_refs
                 else "")
    for c, v in enumerate(
            [dt, row["branch"], "QRHDFC", bill, 511, rrn,
             party, row["amount"], narration], 1):
        set_cell(ws, r, c, v,
                 h_align="right" if c == 8 else "left",
                 num_fmt="#,##0" if c == 8 else None)

# ─────────────────────────────────────────────────────────────────────────────
#  Sheet 2 — Bank Gateway (SaleSuccess)
# ─────────────────────────────────────────────────────────────────────────────
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

# ─────────────────────────────────────────────────────────────────────────────
#  Sheet 3 — Matched (Verified)
# ─────────────────────────────────────────────────────────────────────────────
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
    # Bank_Reconc_06 colour logic: green=exact match, amber=partial, red=low/mismatch
    nm = m["Name Match"]
    bg = (C_GREEN if m["Diff"] == 0 and nm == "Match" else
          C_AMBER if nm == "Partial"                   else
          C_RED   if nm == "Low"                       else C_GREEN)
    vals = [m["Method"], m["Name Match"], m["Score%"], m["Amt Match"],
            m["Book Date"], m["Book Branch"], m["Book Bank"],
            m["Book Bill No"], m["Book Chq No"], m["Book Party"], m["Book Amt"],
            m["Bank Date"], m["Bank Time"], m["Bank Branch"],
            m["Bank Payer"], m["Bank Amt"], m["Bank RRN"],
            m["Pay Type"], m["Diff"], m["Flags"]]
    for c, v in enumerate(vals, 1):
        set_cell(ws3, r, c, v, bg=bg,
                 h_align="right" if c in [11, 16, 19] else "left",
                 num_fmt="#,##0" if c in [11, 16, 19] else None)

# FIX: Append Step 4B cleared pairs (backdated credits / prev BRS CNB matches)
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
        dnc  = pair["dnc"]
        cnb  = pair["cnb"]
        sc   = pair["score"]
        nm   = "Match" if sc >= FUZZY_THRESH else "Partial"
        flag = f"Step 4B: book bill cleared vs prev BRS CNB (name {sc}%)"
        vals = ["4B-BackdatedClear", nm, sc, "CF-Clear",
                dnc["date"], dnc["branch"], "QRHDFC",
                dnc["ref"], 511, dnc["party"], dnc["amount"],
                cnb["date"], "", cnb["branch"],
                cnb["party"], cnb["amount"], cnb.get("rrn", ""),
                "", 0, flag]
        bg = C_LBLUE
        for c_idx, v in enumerate(vals, 1):
            set_cell(ws3, r, c_idx, v, bg=bg,
                     h_align="right" if c_idx in [11, 16, 19] else "left",
                     num_fmt="#,##0" if c_idx in [11, 16, 19] else None)

# ─────────────────────────────────────────────────────────────────────────────
#  Sheet 4 — Reco Items (Book Only / DNC)
# ─────────────────────────────────────────────────────────────────────────────
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
    bg    = C_AMBER if item.get("cf") else C_ORNG   # amber=CF, peach=new DNC (Bank_Reconc_06 style)
    issue = ("Carried Forward from Previous BRS" if item.get("cf")
             else item.get("note") or "In Book — NOT yet in Bank Gateway")
    vals  = [item["date"], item["branch"], "QRHDFC",
              item["ref"], 511, item["party"], item["amount"], issue]
    for c, v in enumerate(vals, 1):
        set_cell(ws4, r, c, v, bg=bg,
                 h_align="right" if c == 7 else "left",
                 num_fmt="#,##0" if c == 7 else None)

# ─────────────────────────────────────────────────────────────────────────────
#  Sheet 5 — Bank Only (Not in Book / CNB)
# ─────────────────────────────────────────────────────────────────────────────
ws5 = wb.create_sheet("Bank Only (Not in Book)")
col_widths(ws5, [14, 12, 8, 36, 30, 14, 16, 10, 20])
ws5.freeze_panes = "A3"

r = 1
write_title_row(ws5, r,
    f"Bank Credit — NOT yet Recorded in Book  |  QR-HDFC  |  {BRS_DATE}", 9,
    bg=C_RED_H)                                   # red title — Bank_Reconc_06 "Bank Only" style
r += 1
write_header_row(ws5, r,
    ["Date", "Time", "Branch", "DBA", "Payer", "Amount (Rs)", "RRN", "Pay Type", "Issue"],
    bg=C_RED_H)

rev_map = {v: k for k, v in DBA_MAP.items()}
for item in cnb_all_for_sheet:
    r += 1
    bg    = C_AMBER if item.get("cf") else C_RED   # amber=CF, red=new unbooked (Bank_Reconc_06)
    issue = item.get("remark") or "Credited in Bank — NOT yet in Book"
    dba   = rev_map.get(item["branch"], item["branch"])
    vals  = [item["date"], "", item["branch"], dba,
              item["party"], item["amount"], item["rrn"], "", issue]
    for c, v in enumerate(vals, 1):
        set_cell(ws5, r, c, v, bg=bg,
                 h_align="right" if c == 6 else "left",
                 num_fmt="#,##0" if c == 6 else None)

# ─────────────────────────────────────────────────────────────────────────────
#  Sheet 6 — HOT Settlements
# ─────────────────────────────────────────────────────────────────────────────
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

# ─────────────────────────────────────────────────────────────────────────────
#  Sheet 7 — QR BRS Statement  (Bank_Reconc_06 style)
# ─────────────────────────────────────────────────────────────────────────────
ws7 = wb.create_sheet("QR BRS Statement")

# Column widths: A:Date B:Branch C:Bill No D:RRN E:Chq No F:Party G:Amount H:Running I:Note
for col, w in [("A", 12), ("B", 8), ("C", 16), ("D", 20),
               ("E", 10), ("F", 38), ("G", 16), ("H", 16), ("I", 44)]:
    ws7.column_dimensions[col].width = w

# ── Style objects (mirror Bank_Reconc_06 build_brs_sheet) ────────────────────
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
    ws7.merge_cells(f"A{row}:I{row}")
    c           = ws7.cell(row, 1)
    c.value     = text
    c.fill      = bg
    c.font      = fnt
    c.border    = _bdr
    c.alignment = Alignment(horizontal="left", vertical="center", wrap_text=True)
    for col in range(2, 10):
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
    cell.font      = Font(name="Arial", size=8, italic=True, color="555555")
    cell.border    = _bdr
    cell.alignment = Alignment(horizontal="left", vertical="center", wrap_text=True)

r7 = 1

# ── Row 1: company name ───────────────────────────────────────────────────────
_brs_merge(r7, "ORIENT EXCHANGE & FINANCIAL SERVICES (P) LTD",
           _HDR, Font(bold=True, color="FFFFFF", name="Arial", size=13))
ws7.row_dimensions[r7].height = 28
r7 += 1

# ── Row 2: bank / account label ───────────────────────────────────────────────
_brs_merge(r7, "QR-HDFC",
           _HDR, Font(bold=True, color="FFFFFF", name="Arial", size=10))
ws7.row_dimensions[r7].height = 22
r7 += 1

# ── Row 3: BRS title + amount column headers ──────────────────────────────────
ws7.merge_cells(f"A{r7}:E{r7}")
c           = ws7.cell(r7, 1)
c.value     = f"Bank Reconciliation Statement As On {BRS_DATE}"
c.fill      = _HDR
c.font      = Font(bold=True, color="FFFFFF", name="Arial", size=11)
c.border    = _bdr
c.alignment = Alignment(horizontal="left", vertical="center")
for col in range(2, 6):
    ws7.cell(r7, col).border = _bdr
    ws7.cell(r7, col).fill  = _HDR
for ci, txt in [(7, "AMOUNT IN RS"), (8, "AMOUNT IN RS"), (9, "")]:
    cell           = ws7.cell(r7, ci, txt)
    cell.fill      = _HDR
    cell.font      = Font(bold=True, color="FFFFFF", name="Arial", size=10)
    cell.border    = _bdr
    cell.alignment = Alignment(horizontal="center", vertical="center")
ws7.row_dimensions[r7].height = 20
r7 += 1

# ── Row 4: blank ──────────────────────────────────────────────────────────────
ws7.merge_cells(f"A{r7}:I{r7}")
ws7.row_dimensions[r7].height = 6
r7 += 1

# ── Col-header row ────────────────────────────────────────────────────────────
_col_hdrs = ["Date", "Branch", "Bill No", "RRN", "Chq No",
             "Party / Description", "Amount (Rs)", "Running Bal (Rs)", "Note / Remark"]
for ci, h in enumerate(_col_hdrs, 1):
    cell           = ws7.cell(r7, ci, h)
    cell.fill      = _SUB
    cell.font      = font(bold=True)
    cell.border    = _bdr
    cell.alignment = Alignment(horizontal="center", vertical="center")
ws7.row_dimensions[r7].height = 16
r7 += 1

ws7.freeze_panes = f"A{r7}"

# ── helper: write one detail item row ────────────────────────────────────────
def _brs_item(date, branch, ref, rrn="", chq="", party="", amt=0, narr="", is_cf=False):
    global r7
    bg = _ITM_CF if is_cf else _ITM
    display_narr = ("Carried Fwd" if is_cf and not narr else
                    f"CF | {narr}" if is_cf else narr)

    def _s(col, val, halign="left"):
        c           = ws7.cell(r7, col, val)
        c.fill      = bg
        c.border    = _bdr
        c.font      = _NF
        c.alignment = Alignment(horizontal=halign, vertical="center")

    _s(1, date,   "center")
    _s(2, branch, "center")
    _s(3, ref,    "left")     # Bill No
    _s(4, rrn,    "left")     # RRN  ← new column
    _s(5, chq,    "center")   # Chq No  (was col 4)
    _s(6, party,  "left")     # Party   (was col 5)
    _brs_amt(r7, 7, amt, bg, _NF)          # Amount  (was col 6)
    ws7.cell(r7, 8, "").fill   = bg        # Running (was col 7)
    ws7.cell(r7, 8).border     = _bdr
    _brs_narr(r7, 9, display_narr, bg)     # Note    (was col 8)
    ws7.row_dimensions[r7].height = 16
    r7 += 1

def _brs_subtotal(total):
    global r7
    ws7.merge_cells(f"A{r7}:F{r7}")
    ws7.cell(r7, 1).fill  = _SUB
    ws7.cell(r7, 1).border = _bdr
    for col in range(2, 7):
        ws7.cell(r7, col).border = _bdr
        ws7.cell(r7, col).fill  = _SUB
    _brs_amt(r7, 7, total, _SUB, _BF)
    ws7.cell(r7, 8).fill   = _SUB
    ws7.cell(r7, 8).border = _bdr
    ws7.cell(r7, 9).fill   = _SUB
    ws7.cell(r7, 9).border = _bdr
    ws7.row_dimensions[r7].height = 16
    r7 += 1

def _brs_running(running_bal):
    global r7
    ws7.merge_cells(f"A{r7}:F{r7}")
    ws7.cell(r7, 1).fill  = _SUB
    ws7.cell(r7, 1).border = _bdr
    for col in range(2, 7):
        ws7.cell(r7, col).border = _bdr
        ws7.cell(r7, col).fill  = _SUB
    ws7.cell(r7, 7).fill   = _SUB
    ws7.cell(r7, 7).border = _bdr
    _brs_amt(r7, 8, running_bal, _SUB, _BF)
    ws7.cell(r7, 9).fill   = _SUB
    ws7.cell(r7, 9).border = _bdr
    ws7.row_dimensions[r7].height = 17
    r7 += 1

def _brs_balance(label, bal, bg=None):
    global r7
    bg = bg or _BAL
    ws7.merge_cells(f"A{r7}:F{r7}")
    c           = ws7.cell(r7, 1)
    c.value     = label
    c.fill      = bg
    c.font      = Font(bold=True, name="Arial", size=10)
    c.border    = _bdr
    c.alignment = Alignment(horizontal="left", vertical="center")
    for col in range(2, 7):
        ws7.cell(r7, col).border = _bdr
        ws7.cell(r7, col).fill  = bg
    ws7.cell(r7, 7).fill   = bg
    ws7.cell(r7, 7).border = _bdr
    _brs_amt(r7, 8, bal, bg, _BF)
    ws7.cell(r7, 9).fill   = bg
    ws7.cell(r7, 9).border = _bdr
    ws7.row_dimensions[r7].height = 20
    r7 += 1

def _brs_blank():
    global r7
    ws7.merge_cells(f"A{r7}:I{r7}")
    ws7.row_dimensions[r7].height = 6
    r7 += 1

def _brs_section(text, bg=None):
    global r7
    bg = bg or _SEC
    _brs_merge(r7, text, bg,
               Font(bold=True, color="FFFFFF", name="Arial", size=10))
    ws7.row_dimensions[r7].height = 20
    r7 += 1

def _brs_nil():
    global r7
    ws7.merge_cells(f"A{r7}:F{r7}")
    c           = ws7.cell(r7, 1, "      -  (Nil)")
    c.fill      = _ITM; c.border = _bdr; c.font = _NF
    c.alignment = Alignment(horizontal="left", vertical="center")
    for col in range(2, 7):
        ws7.cell(r7, col).fill  = _ITM
        ws7.cell(r7, col).border = _bdr
    _brs_amt(r7, 7, "-", _ITM, _NF, fmt="@")
    ws7.cell(r7, 8).fill   = _ITM
    ws7.cell(r7, 8).border = _bdr
    ws7.cell(r7, 9).fill   = _ITM
    ws7.cell(r7, 9).border = _bdr
    ws7.row_dimensions[r7].height = 16
    r7 += 1

# ── Opening balance ───────────────────────────────────────────────────────────
_brs_blank()
_brs_balance(f"Closing Balance as per Company Books  (Dr.)", closing_bal)
_brs_blank()

running7 = closing_bal

# ── Add: Cheques issued but not debited ──────────────────────────────────────
_brs_section("Add :  Cheques issued but not debited in Bank")
# header for item columns
for ci, h in enumerate(_col_hdrs, 1):
    cell           = ws7.cell(r7, ci, h)
    cell.fill      = _SUB
    cell.font      = font(bold=True)
    cell.border    = _bdr
    cell.alignment = Alignment(horizontal="center", vertical="center")
ws7.row_dimensions[r7].height = 16
r7 += 1
_brs_nil()                           # QR has no "issued not debited" entries
_brs_subtotal(0.0)
running7 += 0.0
_brs_running(running7)
_brs_blank()

# ── Less: Cheques deposited but not Credited ─────────────────────────────────
_brs_section("Less :  Cheques deposited but not Credited in Bank")
for ci, h in enumerate(_col_hdrs, 1):
    cell           = ws7.cell(r7, ci, h)
    cell.fill      = _SUB
    cell.font      = font(bold=True)
    cell.border    = _bdr
    cell.alignment = Alignment(horizontal="center", vertical="center")
ws7.row_dimensions[r7].height = 16
r7 += 1

if not dnc_all:
    _brs_nil()
else:
    for item in dnc_all:
        _brs_item(
            date   = item["date"],
            branch = item["branch"],
            ref    = item["ref"],
            rrn    = "",
            chq    = 511,
            party  = item["party"],
            amt    = item["amount"],
            narr   = item.get("note", "") or item.get("remark", ""),
            is_cf  = bool(item.get("cf")),
        )

_brs_subtotal(total_dnc)
running7 -= total_dnc
_brs_running(running7)
_brs_blank()

# ── Less: Debited in bank but not in book ─────────────────────────────────────
_brs_section("Less :  Debited in pass book but not credited in Our book")
for ci, h in enumerate(_col_hdrs, 1):
    cell           = ws7.cell(r7, ci, h)
    cell.fill      = _SUB
    cell.font      = font(bold=True)
    cell.border    = _bdr
    cell.alignment = Alignment(horizontal="center", vertical="center")
ws7.row_dimensions[r7].height = 16
r7 += 1
_brs_nil()
_brs_subtotal(0.0)
_brs_running(running7)
_brs_blank()

# ── Add: Credited in bank but not in book ─────────────────────────────────────
_brs_section("Add :  Credited in pass book but not debited in Our book")
for ci, h in enumerate(_col_hdrs, 1):
    cell           = ws7.cell(r7, ci, h)
    cell.fill      = _SUB
    cell.font      = font(bold=True)
    cell.border    = _bdr
    cell.alignment = Alignment(horizontal="center", vertical="center")
ws7.row_dimensions[r7].height = 16
r7 += 1

if not cnb_all:
    _brs_nil()
else:
    for item in cnb_all:
        _brs_item(
            date   = item["date"],
            branch = item["branch"],
            ref    = "",
            rrn    = item.get("rrn", ""),
            chq    = "",
            party  = item["party"],
            amt    = item["amount"],
            narr   = item.get("remark", ""),
            is_cf  = bool(item.get("cf")),
        )

_brs_subtotal(total_cnb)
running7 += total_cnb
_brs_blank()

# ── Closing / difference rows ─────────────────────────────────────────────────
_bal_bg = _DIF_G if reconciled else _DIF_R
_brs_balance("Closing Balance as per Bank book", int(bank_bal), bg=_bal_bg)
_brs_blank()
_brs_balance("Difference  (should be 0 when reconciled)",
             int(bank_bal), bg=_bal_bg)
_brs_blank()

# ── Footer notes ──────────────────────────────────────────────────────────────
ws7.merge_cells(f"A{r7}:I{r7}")
ws7.cell(r7, 1,
    f"Gateway Total Credits (SaleSuccess) : Rs {stmt_success['amount(rs.)'].sum():,.2f}"
).font      = Font(name="Arial", size=9, color="595959")
ws7.cell(r7, 1).alignment = align()
ws7.cell(r7, 1).border    = no_border()
r7 += 1

ws7.merge_cells(f"A{r7}:I{r7}")
ws7.cell(r7, 1,
    "CF = Carried Forward from Previous BRS (outstanding items not yet cleared)"
).font      = Font(name="Arial", size=8, italic=True, color="595959")
ws7.cell(r7, 1).alignment = align()
ws7.cell(r7, 1).border    = no_border()

# ─────────────────────────────────────────────────────────────────────────────
#  Sheet 8 — CF Audit Trail
# ─────────────────────────────────────────────────────────────────────────────
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

# Step 4B cleared pairs — previous BRS CNB CF items that matched today's book entries
# Show both sides: the CNB CF (prev BRS bank credit) and the DNC new (book bill) as cleared
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
        dnc = pair["dnc"]
        cnb = pair["cnb"]
        sc  = pair["score"]
        cleared_status = f"PAYMENT CLEARED — {BRS_DATE} (name {sc}%)"

        # CNB CF side — the prev-BRS bank credit now reconciled
        r += 1
        for c, v in enumerate(
                ["credited_not_book (CF→CLEARED)", cnb["date"], cnb["branch"],
                 cnb.get("rrn", ""), cnb["party"], cnb["amount"], cleared_status], 1):
            set_cell(ws8, r, c, v, bg=C_GREEN,
                     h_align="right" if c == 6 else "left",
                     num_fmt="#,##0" if c == 6 else None)

        # DNC new side — the book bill that cleared the CNB CF
        r += 1
        for c, v in enumerate(
                ["deposited_not_credited (CLEARED)", dnc["date"], dnc["branch"],
                 dnc["ref"], dnc["party"], dnc["amount"], cleared_status], 1):
            set_cell(ws8, r, c, v, bg=C_GREEN,
                     h_align="right" if c == 6 else "left",
                     num_fmt="#,##0" if c == 6 else None)

# ─────────────────────────────────────────────────────────────────────────────
#  Sheet 9 — Summary
# ─────────────────────────────────────────────────────────────────────────────
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
     " MATCH" if books_match else " MISMATCH",
     f"Rs {total_all_pay:,.0f} = Rs {total_hot_rec:,.0f}"),
    ("Reconciliation Status",
     "FULLY RECONCILED " if reconciled else "NOT RECONCILED ", ""),
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
    if "FULLY RECONCILED" in val_str:                                    bg = C_GREEN
    if "NOT RECONCILED"   in val_str or "MISMATCH"   in val_str:        bg = C_RED
    if " MATCH"           in val_str and "MISMATCH" not in val_str:     bg = C_GREEN
    for c, v in enumerate(item, 1):
        cell = set_cell(ws9, r, c, v, bg=bg, size=9)
        # Bold key label rows (matches Bank_Reconc_06 summary style)
        if c == 1 and item[0] in ("Company", "QR Account", "BRS Date",
                                   "Books Match (All-Branches Payments = HOT Receipts)",
                                   "Reconciliation Status"):
            cell.font = font(bold=True, size=9)

# ══════════════════════════════════════════════════════════════════════════════
#  SAVE  (FROM v10: PermissionError fallback)
# ══════════════════════════════════════════════════════════════════════════════
try:
    wb.save(OUTPUT_FILE)
    saved_file = OUTPUT_FILE
except PermissionError:
    alt = f"{Path(OUTPUT_FILE).stem}_{stmt_date.strftime('%d_%m_%Y')}.xlsx"
    wb.save(alt)
    saved_file = alt
    print(f"\n  Output file was locked — saved as {alt} instead.")

print(f"\nSaved → {saved_file}")
print(f"\n{'='*60}")
print(f"Matched : {len(matched_rows)} | DNC : {len(dnc_all)} | CNB : {len(cnb_all)}")
print(f"BRS     : {'RECONCILED' if reconciled else ' NOT RECONCILED'} "
      f"| Bank bal = Rs {bank_bal:,.0f}")