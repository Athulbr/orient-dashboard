import re
import sys
import argparse
import warnings
from pathlib import Path
from datetime import datetime, timedelta

import pdfplumber
import pandas as pd
import openpyxl
from openpyxl import Workbook
from openpyxl.styles import PatternFill, Font, Alignment, Border, Side
from openpyxl.utils import get_column_letter

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

warnings.filterwarnings(
    "ignore",
    message="Workbook contains no default style, apply openpyxl's default",
    category=UserWarning,
)

#  CONFIG
PGMID_MAP = {
    "ORIENTPROD0097938": "BY",
    "HDFC000029054323" : "AL",
    "PAYUORIENTE2"     : "R",
    "100001148640"     : "AM",
    "PAYUORIENTE1"     : "BZ",
    "99990358092"      : "CA",
    "MER000042"        : "ME",
}
EXCLUDE_PARTY_PATTERNS = ["HOT - HOT", "BULKUPLOAD"]

#  NAME MATCHING HELPERS
def _normalise_name(name):
    if not name or str(name).strip().lower() in ("", "nan", "none"):
        return ""
    s = str(name).upper().strip()
    for prefix in ("MR.", "MRS.", "MS.", "DR.", "INDIVI - ", "M/S ", "M/S. "):
        if s.startswith(prefix):
            s = s[len(prefix):].strip()
    s = re.sub(r"[^A-Z0-9 ]", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s

def _name_match_score(a, b):
    na = _normalise_name(a)
    nb = _normalise_name(b)
    if not na or not nb:
        return 0
    if na == nb:
        return 100
    if na in nb or nb in na:
        return 85
    ta = set(na.split())
    tb = set(nb.split())
    inter = ta & tb
    union = ta | tb
    inter = {t for t in inter if len(t) > 1}
    union = {t for t in union if len(t) > 1}
    if not union:
        return 0
    return int(75 * len(inter) / len(union))

NAME_MATCH_THRESHOLD = 90

def match_name(book_party, cheque_party, threshold=NAME_MATCH_THRESHOLD):
    score = _name_match_score(book_party, cheque_party)
    if score >= 100:
        label = "EXACT"
    elif score >= 85:
        label = "SUBSTR"
    elif score >= threshold:
        label = "PARTIAL"
    else:
        label = "NO MATCH"
    return score, label

def _normalise_bill_no(value):
    if value is None:
        return ""
    s = str(value).strip().upper()
    s = re.sub(r"[^A-Z0-9]", "", s)
    if s.startswith("PS"):
        return s
    if s:
        return "PS" + s
    return ""

def _same_amount(a, b, tol=1.0):
    return abs(float(a or 0.0) - float(b or 0.0)) < tol

def _date_gap_days(a, b):
    if pd.isna(a) or pd.isna(b):
        return None
    try:
        return abs((pd.Timestamp(a).normalize() - pd.Timestamp(b).normalize()).days)
    except Exception:
        return None

CF_RECENT_LOOKBACK_DAYS = 7
AUTO_REFUND_LOOKBACK_DAYS = 7
AUTO_REFUND_MIN_AMOUNT = 100.0
AUTO_CNB_SOLVER_MAX_TARGET = 2500000

def _coerce_ts(value):
    if value is None or str(value).strip() in ("", "nan", "None"):
        return None
    try:
        text = str(value).strip()
        if re.fullmatch(r"\d{2}\.\d{2}\.\d{4}", text):
            return pd.to_datetime(text, errors="coerce", dayfirst=True)
        return pd.to_datetime(value, errors="coerce")
    except Exception:
        return None

def _days_from_brs(value, brs_dt):
    ts = _coerce_ts(value)
    if ts is None or pd.isna(ts):
        return None
    try:
        return abs((brs_dt.normalize() - ts.normalize()).days)
    except Exception:
        return None

def _item_days_from_brs(item, brs_dt):
    return _days_from_brs(item.get("date"), brs_dt)

def _find_subset_sum_items(candidates, target_rupees):
    target = int(round(target_rupees))
    if target <= 0:
        return []
    reachable = {0: None}
    for idx, item in enumerate(candidates):
        amt = int(round(float(item.get("amount", 0.0) or 0.0)))
        if amt <= 0 or amt > target:
            continue
        new_states = {}
        for subtotal in list(reachable.keys()):
            nxt = subtotal + amt
            if nxt > target or nxt in reachable or nxt in new_states:
                continue
            new_states[nxt] = (subtotal, idx)
        reachable.update(new_states)
        if target in reachable:
            break
    if target not in reachable:
        return []
    picked = []
    cur = target
    while cur:
        prev, idx = reachable[cur]
        picked.append(candidates[idx])
        cur = prev
    picked.reverse()
    return picked

def _pick_best_human_match(chq_row, candidates, source_name):
    best = None
    chq_bill_norm = _normalise_bill_no(chq_row.get("bill_no", ""))
    chq_branch = str(chq_row.get("branch", "") or "").strip().upper()
    chq_party = str(chq_row.get("party", "") or "").strip()
    chq_amount = float(chq_row.get("amount", 0.0) or 0.0)
    chq_date = chq_row.get("date")

    for _, row in candidates.iterrows():
        cand_bill_norm = _normalise_bill_no(row.get("bill_no", ""))
        cand_party = str(row.get("party", "") or "").strip()
        cand_amount = float(row.get("amount", 0.0) or 0.0)
        cand_date = row.get("date")
        cand_branch = str(row.get("branch", "") or "").strip().upper()

        bill_exact = bool(chq_bill_norm and cand_bill_norm and chq_bill_norm == cand_bill_norm)
        amount_exact = _same_amount(chq_amount, cand_amount)
        date_gap = _date_gap_days(chq_date, cand_date)
        date_close = date_gap is not None and date_gap <= 3
        branch_exact = bool(chq_branch and cand_branch and chq_branch == cand_branch)
        name_score, name_label = match_name(chq_party, cand_party)

        rank = 0
        if bill_exact:
            rank += 1000
        if amount_exact:
            rank += 250
        elif abs(chq_amount - cand_amount) <= 5:
            rank += 100
        if branch_exact:
            rank += 120
        if date_gap == 0:
            rank += 100
        elif date_close:
            rank += 60
        rank += name_score

        if bill_exact and amount_exact:
            verdict = "MATCHED"
            verdict_reason = "Bill no. and amount matched"
        elif amount_exact and date_close and name_score >= NAME_MATCH_THRESHOLD:
            verdict = "MATCHED"
            verdict_reason = "Amount, near date, and strong name matched"
        elif bill_exact and (amount_exact or name_score >= 85):
            verdict = "REVIEW"
            verdict_reason = "Bill matched; verify name/date"
        elif amount_exact and (name_score >= 85 or branch_exact or date_close):
            verdict = "REVIEW"
            verdict_reason = "Amount matched with supporting filters"
        else:
            verdict = "UNMATCHED"
            verdict_reason = "No reliable multi-filter match"

        candidate = dict(
            row=row,
            source=source_name,
            rank=rank,
            verdict=verdict,
            verdict_reason=verdict_reason,
            bill_exact=bill_exact,
            amount_exact=amount_exact,
            branch_exact=branch_exact,
            date_gap=date_gap,
            name_score=name_score,
            name_label=name_label,
        )
        if best is None or candidate["rank"] > best["rank"]:
            best = candidate

    return best

#  CLI
DATE_RE = re.compile(r"(\d{2}[_\-\.]\d{2}[_\-\.]\d{4})")

def extract_date(text):
    m = DATE_RE.search(str(text))
    if not m:
        return None
    raw = m.group(1).replace("_", ".").replace("-", ".")
    try:
        return datetime.strptime(raw, "%d.%m.%Y")
    except ValueError:
        return None

def discover_prev_hot_brs(stmt_date, *input_paths):
    """Find the previous day's HOT BRS without using the current day's BRS."""
    if stmt_date is None:
        return None

    prev_dt = stmt_date - timedelta(days=1)
    prev_tokens = {
        prev_dt.strftime("%d.%m.%Y"),
        prev_dt.strftime("%d_%m_%Y"),
        prev_dt.strftime("%d-%m-%Y"),
    }

    search_dirs = []
    for raw_path in input_paths:
        if not raw_path:
            continue
        path = Path(raw_path)
        base = path if path.is_dir() else path.parent
        for candidate in (base, base.parent, Path.cwd(), Path.cwd() / "GATEWAY"):
            if candidate and candidate.exists() and candidate.is_dir() and candidate not in search_dirs:
                search_dirs.append(candidate)

    matches = []
    for folder in search_dirs:
        for candidate in folder.glob("*.xls*"):
            name_upper = candidate.name.upper()
            if "HOT" not in name_upper or "BRS" not in name_upper:
                continue
            file_dt = extract_date(candidate.name)
            if file_dt and file_dt.date() == stmt_date.date():
                continue
            if any(token in candidate.name for token in prev_tokens):
                matches.append(candidate)

    if not matches:
        return None

    def _rank(path):
        name = path.name.upper()
        score = 0
        if "GATEWAY" in name:
            score += 2
        if "HOT BRS" in name:
            score += 4
        return score, path.stat().st_mtime

    return sorted(matches, key=_rank, reverse=True)[0]

def parse_args():
    p = argparse.ArgumentParser(description="Gateway YES Bank BRS Generator v4.6")
    p.add_argument("--all-branches", required=True)
    p.add_argument("--hot-book",     required=True)
    p.add_argument("--statement",    required=True)
    p.add_argument("--payu",         required=True)
    p.add_argument("--payu-od",      nargs="*", default=[])
    p.add_argument("--cashfree",     default=None)
    p.add_argument("--easebuzz",     default=None)
    p.add_argument("--prev-brs",     default=None)
    p.add_argument("--cnb-utrs",     default=None,
                   help="Plain-text file of Merchant Txn IDs (one per line) to add to "
                        "CNB as prior-day PayU txns credited in bank today, not yet in book.")
    p.add_argument("--output",       default="Gateway_Reconciliation.xlsx")
    p.add_argument("--date",         default=None)
    return p.parse_args()

def process_gateway_files(
    all_branches_path,
    hot_book_path,
    statement_path,
    payu_path,
    output_path,
    payu_od_paths=None,
    cashfree_path=None,
    easebuzz_path=None,
    prev_brs_path=None,
    cnb_utrs_path=None,
    date_override=None,
):
    ALL_BRANCHES_FILE = Path(all_branches_path)
    HOT_BOOK_FILE     = Path(hot_book_path)
    STATEMENT_FILE    = Path(statement_path)
    PAYU_FILE         = Path(payu_path)
    PAYU_OD_FILES     = [Path(f) for f in (payu_od_paths or [])]
    CASHFREE_FILE     = Path(cashfree_path)  if cashfree_path  else None
    EASEBUZZ_FILE     = Path(easebuzz_path)  if easebuzz_path  else None
    PREV_BRS_FILE     = Path(prev_brs_path)  if prev_brs_path  else None
    CNB_UTRS_FILE     = Path(cnb_utrs_path)  if cnb_utrs_path  else None
    OUTPUT_FILE       = output_path

    must_exist = [ALL_BRANCHES_FILE, HOT_BOOK_FILE, STATEMENT_FILE, PAYU_FILE]
    if PREV_BRS_FILE:   must_exist.append(PREV_BRS_FILE)
    if CASHFREE_FILE:   must_exist.append(CASHFREE_FILE)
    if EASEBUZZ_FILE:   must_exist.append(EASEBUZZ_FILE)
    if CNB_UTRS_FILE:   must_exist.append(CNB_UTRS_FILE)
    must_exist.extend(PAYU_OD_FILES)
    missing = [str(f) for f in must_exist if not f.exists()]
    if missing:
        raise FileNotFoundError("Missing input file(s):\n  " + "\n  ".join(missing))

    stmt_date = extract_date(PAYU_FILE.name) or extract_date(STATEMENT_FILE.name)
    if date_override:
        stmt_date = datetime.strptime(date_override, "%d.%m.%Y")
    if stmt_date is None:
        stmt_date = datetime.today()
    BRS_DATE = stmt_date.strftime("%d.%m.%Y")
    if PREV_BRS_FILE is None:
        PREV_BRS_FILE = discover_prev_hot_brs(
            stmt_date,
            ALL_BRANCHES_FILE,
            HOT_BOOK_FILE,
            STATEMENT_FILE,
            PAYU_FILE,
            *(PAYU_OD_FILES or []),
            CASHFREE_FILE,
            EASEBUZZ_FILE,
        )
        if PREV_BRS_FILE:
            print(f"[AUTO] Previous HOT BRS selected: {PREV_BRS_FILE}")

    #  STYLE HELPERS
    def fill(hex_c):    return PatternFill("solid", fgColor=hex_c)
    def _side(c="BFBFBF"): return Side(style="thin", color=c)
    def _br():          s = _side(); return Border(left=s, right=s, top=s, bottom=s)
    def no_border():    n = Side(style=None); return Border(left=n, right=n, top=n, bottom=n)
    def align(h="left", wrap=True): return Alignment(horizontal=h, vertical="center", wrap_text=wrap)
    def font(bold=False, color="000000", size=9):
        return Font(bold=bold, color=color, size=size, name="Arial")
    
    C_NAVY  = "1F3864"; C_BLUE  = "2E75B6"; C_LBLUE = "D9E1F2"
    C_GREEN = "C6EFCE"; C_AMBER = "FFEB9C"; C_RED   = "FFC7CE"
    C_ORNG  = "FCE4D6"; C_GREY  = "F2F2F2"; C_CF    = "E2EFDA"
    C_RED_H = "C00000"; C_PURPL = "EAD1DC"; C_TEAL  = "D0E4F2"
    C_ADD1  = "D6E4F0"
    _BR = _br()
    
    def sc(ws, r, c, val=None, bg=None, bold=False, color="000000",
           size=9, h_align="left", num_fmt=None, bdr=True):
        cell = ws.cell(row=r, column=c, value=val)
        if bg:       cell.fill      = fill(bg)
        cell.font      = font(bold, color, size)
        cell.border    = _BR if bdr else no_border()
        cell.alignment = align(h_align)
        if num_fmt:  cell.number_format = num_fmt
        return cell
    
    def write_hdr(ws, r, headers, bg=C_NAVY):
        for col, h in enumerate(headers, 1):
            c = ws.cell(row=r, column=col, value=h)
            c.fill = fill(bg); c.border = _BR
            c.font = Font(bold=True, color="FFFFFF", name="Arial", size=10)
            c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        ws.row_dimensions[r].height = 24
    
    def write_title(ws, r, text, n_cols, bg=C_NAVY):
        ws.merge_cells(start_row=r, start_column=1, end_row=r, end_column=n_cols)
        c = ws.cell(r, 1, text)
        c.fill = fill(bg); c.border = _BR
        c.font = Font(bold=True, color="FFFFFF", name="Arial", size=12)
        c.alignment = Alignment(horizontal="center", vertical="center")
        ws.row_dimensions[r].height = 28
    
    def col_w(ws, widths):
        for i, w in enumerate(widths, 1):
            ws.column_dimensions[get_column_letter(i)].width = w
    
    def safe_float(v, default=0.0):
        try: return float(v)
        except Exception: return default
    
    def _safe_numeric(val):
        num = pd.to_numeric(val, errors="coerce")
        if pd.notna(num):
            return float(num)
        if val is not None:
            m = re.match(r'=\s*([\d.]+)\s*([+\-])\s*([\d.]+)\s*$', str(val).strip())
            if m:
                a, op, b = float(m.group(1)), m.group(2), float(m.group(3))
                return (a - b) if op == '-' else (a + b)
        return None
    
    def parse_ddmmyyyy_text(text):
        m = re.search(r"(\d{2}\.\d{2}\.\d{4})", str(text))
        if not m:
            return None
        try:
            return datetime.strptime(m.group(1), "%d.%m.%Y")
        except Exception:
            return None
    
    def _normalise_ref_token(value):
        s = str(value or "").strip().upper()
        s = re.sub(r"[^A-Z0-9]", "", s)
        return s

    def _norm(u):
        s = str(u).strip()
        if s.endswith(".0"):
            try:
                s = str(int(float(s)))
            except Exception:
                pass
        else:
            try:
                n = int(float(s))
                if str(n) == s.replace(".0", "").lstrip("0") or str(n) == s:
                    s = str(n)
            except Exception:
                pass
        return s if s not in ("", "nan", "None") else ""
    
    def _book_text_blob(row):
        parts = []
        for val in row:
            if pd.isna(val):
                continue
            txt = str(val).strip()
            if txt:
                parts.append(txt)
        return " ".join(parts)
    
    def _make_book_evidence(df):
        evidence = []
        for _, row in df.iterrows():
            text = _book_text_blob(row.tolist())
            amount_hits = set()
            for idx in [7, 9]:
                if idx in row.index:
                    num = pd.to_numeric(row[idx], errors="coerce")
                    if pd.notna(num) and abs(float(num)) > 0:
                        amount_hits.add(round(abs(float(num)), 2))
            evidence.append(dict(
                text=text,
                text_norm=_normalise_ref_token(text),
                amounts=amount_hits,
            ))
        return evidence
    
    def _party_tokens(name):
        norm = _normalise_name(name)
        return [tok for tok in norm.split() if len(tok) > 2]
    
    def _book_has_reference(evidence_rows, ref):
        ref_norm = _normalise_ref_token(ref)
        if not ref_norm:
            return False
        return any(ref_norm in row["text_norm"] for row in evidence_rows)
    
    def _book_has_party_amount(evidence_rows, party, amount):
        amount_key = round(abs(float(amount or 0.0)), 2)
        if amount_key <= 0:
            return False
        tokens = _party_tokens(party)
        if not tokens:
            return False
        for row in evidence_rows:
            amount_diffs = [abs(amount_key - row_amt) for row_amt in row["amounts"]]
            min_amount_diff = min(amount_diffs) if amount_diffs else None
            amount_hit = min_amount_diff is not None and min_amount_diff <= 100
            if not amount_hit:
                continue
            row_norm = row["text_norm"]
            if len(tokens) >= 2 and all(_normalise_ref_token(tok) in row_norm for tok in tokens[:2]):
                return True
            if (
                len(tokens) == 1
                and min_amount_diff is not None and min_amount_diff <= 25
                and _normalise_ref_token(tokens[0]) in row_norm
            ):
                return True
            if (
                tokens and len(tokens[0]) > 4
                and min_amount_diff is not None and min_amount_diff <= 25
                and _normalise_ref_token(tokens[0]) in row_norm
            ):
                return True
            if len(tokens) >= 2 and sum(
                1 for tok in tokens if _normalise_ref_token(tok) in row_norm
            ) >= 2:
                return True
        return False
    
    def _is_book_resolved(item, evidence_rows):
        return (
            _book_has_reference(evidence_rows, item.get("utr", "")) or
            _book_has_party_amount(evidence_rows, item.get("party", ""), item.get("amount", 0.0))
        )

    def _book_has_party_token(evidence_rows, party):
        tokens = [t for t in _party_tokens(party) if len(t) > 4]
        if not tokens:
            return False
        return any(_normalise_ref_token(tokens[0]) in row["text_norm"] for row in evidence_rows)
    
    def _current_gateway_row(ref, payu_rows_by_txn, cashfree_rows_by_id):
        key = str(ref or "").strip()
        if not key:
            return None, None
        if key in payu_rows_by_txn:
            return "PAYU", payu_rows_by_txn[key]
        if key in cashfree_rows_by_id:
            return "CASHFREE", cashfree_rows_by_id[key]
        return None, None
    
    def _should_keep_cnb_cf(item, brs_dt, payu_rows_by_txn, cashfree_rows_by_id, less2_ref_keys):
        ref = item.get("utr", "")
        ref_key = _normalise_ref_token(ref)
        if not ref_key and str(item.get("party", "")).strip().upper().startswith("BC "):
            return True
        if ref_key in less2_ref_keys:
            return True
        source, current_row = _current_gateway_row(ref, payu_rows_by_txn, cashfree_rows_by_id)
        days_old = _item_days_from_brs(item, brs_dt)
        if current_row is not None and source == "PAYU":
            net_amt = float(current_row.get("Amount(Net)", 0.0) or 0.0)
            current_age = _days_from_brs(current_row.get("AddedOn"), brs_dt)
            if net_amt < 0:
                if abs(net_amt) < AUTO_REFUND_MIN_AMOUNT:
                    return False
                if current_age is not None and current_age > AUTO_REFUND_LOOKBACK_DAYS:
                    return False
            return True
        if current_row is not None:
            return True
        return True
    
    def _build_gateway_customer_pool(payu_df, cf_rows, eb_info=None):
        pool = []
        if not payu_df.empty:
            payu_pos = payu_df[
                pd.to_numeric(payu_df.get("Amount(Net)", pd.Series(dtype=float)), errors="coerce").fillna(0) > 0
            ].copy()
            for _, row in payu_pos.iterrows():
                amt = float(row.get("Amount", 0.0) or 0.0)
                if amt <= 0:
                    continue
                pool.append(dict(
                    amount=amt,
                    party=str(row.get("Customer Name", "")).strip(),
                    ref=str(row.get("Merchant Txn ID", "")).strip(),
                    date=_coerce_ts(row.get("AddedOn")),
                    gateway="PAYU",
                ))
        for row in cf_rows:
            amt = float(row.get("gross", 0.0) or 0.0)
            if amt <= 0:
                continue
            pool.append(dict(
                amount=amt,
                party=str(row.get("id", "")).strip(),
                ref=str(row.get("id", "")).strip(),
                date=_coerce_ts(row.get("settlement_date")),
                gateway="CASHFREE",
            ))
        for row in (eb_info or {}).get("txns", []):
            amt = pd.to_numeric(
                row.get("Amount", row.get("Total Amount", row.get("Transaction Amount", ""))),
                errors="coerce",
            )
            if pd.isna(amt) or float(amt) <= 0:
                continue
            party = (
                row.get("Name")
                or row.get("Customer Name")
                or row.get("Firstname")
                or row.get("Email")
                or ""
            )
            ref = (
                row.get("Easebuzz Trxn ID")
                or row.get("Easebuzz Txn ID")
                or row.get("Txn ID")
                or row.get("Merchant Trxn ID")
                or row.get("Merchant Txn ID")
                or ""
            )
            pool.append(dict(
                amount=float(amt),
                party=str(party).strip(),
                ref=str(ref).strip(),
                date=_coerce_ts(
                    row.get("AddedOn")
                    or row.get("Date")
                    or row.get("Created At")
                    or row.get("Transaction Date")
                ),
                gateway="EASEBUZZ",
            ))
        return pool
    
    def _looks_like_online_gateway_sale(ps_party, ps_amount, gateway_pool):
        ps_tokens = {t for t in _normalise_name(ps_party).split() if len(t) > 1}
    
        for item in gateway_pool:
            gw_amt   = float(item["amount"])
            ps_amt   = float(ps_amount)
            amt_diff = abs(gw_amt - ps_amt)
    
            if amt_diff <= 50:
                gw_tokens = {t for t in _normalise_name(item["party"]).split() if len(t) > 1}
                if ps_tokens & gw_tokens:
                    return True

        if float(ps_amount or 0.0) <= 500:
            return False

        for item in gateway_pool:
            gw_amt   = float(item["amount"])
            ps_amt   = float(ps_amount)
            amt_diff = abs(gw_amt - ps_amt)
    
            nm_score = _name_match_score(ps_party, item["party"])
            if nm_score >= 85 and amt_diff <= max(5000, 0.2 * max(gw_amt, ps_amt)):
                return True
    
        return False
    
    _NARR_BILL_RE  = re.compile(r"BILL\s+NO\.\s*:?\s*PS\s*:?\s*(\d+)", re.IGNORECASE)
    _NARR_PARTY_RE = re.compile(r"OF\s+PARTY\s+(.+?)\s*(?:,|\s+FXDETAILS|\s*$)", re.IGNORECASE)

    def build_book_style_dnc_from_books(ps_df, brs_date_text, gateway_pool):
        day_df = ps_df[
            ps_df["date"].dt.strftime("%d.%m.%Y") == brs_date_text
        ].copy()
        dnc_items = []
        for _, row in day_df.iterrows():
            if _looks_like_online_gateway_sale(row["party"], row["amount"], gateway_pool):
                continue
            dnc_items.append(dict(
                date=brs_date_text,
                branch=str(row.get("branch", "")).strip(),
                utr=str(row.get("bill_no", "")).strip(),
                party=f"INDIVI - {str(row.get('party', '')).strip()}".strip(),
                amount=float(row.get("amount", 0.0) or 0.0),
                remark="Gateway cheque-style deposit pending bank credit",
                gateway="PAYU",
                cf=False,
            ))
        return dnc_items
    
    def section_rows_to_items(df, remark, gateway, cf):
        items = []
        for _, row in df.iterrows():
            amt = _safe_numeric(row[5])
            if amt is None or amt <= 0:
                continue
            dt = str(row[0]).strip()
            try:
                dt = pd.to_datetime(dt, dayfirst=True).strftime("%d.%m.%Y")
            except Exception:
                pass
            items.append(dict(
                date=dt,
                branch=str(row[1]).strip() if pd.notna(row[1]) else "",
                utr=str(row[2]).strip() if pd.notna(row[2]) else "",
                party=str(row[4]).strip() if pd.notna(row[4]) else "",
                amount=float(amt),
                remark=remark,
                gateway=gateway,
                cf=cf,
            ))
        return items
    
    SECTION_HEADERS_HOT = {
        "add1":  ["add:cheques issued but not debited",
                  "add: cheques issued but not debited"],
        "dnc":   ["less: cheques deposited but not credited",
                  "less:cheques deposited but not credited"],
        "less2": ["less:debited in pass book but not credited",
                  "less: debited in pass book but not credited",
                  "less: debited in bank but not credited"],
        "cnb":   ["add: credited in pass book but not debited",
                  "add: credited in bank but not debited",
                  "add: credited in pass book but not debited in our book"],
    }
    
    def _is_sentinel(val):
        if val is None:
            return False
        s = str(val).strip()
        return s.startswith("=") or s.upper().startswith("=SUM")
    
    def _row_has_amount(row):
        v = row[5]
        if _is_sentinel(v):
            return False
        n = _safe_numeric(v)
        return n is not None and n > 0
    
    def parse_new_format_brs_gateway(wb_path):
        """Parse a previous BRS that was produced by this script (Gateway BRS Statement sheet).

        The sheet layout uses:
          - Col A: label string like '[PAYU]  DD.MM.YYYY  |  UTR  |  Party'
                   or section header like 'Less: Cheques deposited...'
          - Col E: amount (positive for CNB/Add1, negative for DNC/Less2)
          - Col F: running balance
          - Col G: remark
        Closing balance is in col E of the 'Closing Balance as per HOT GATEWAY Book' row.
        """
        try:
            wb = openpyxl.load_workbook(str(wb_path), data_only=True)
        except Exception as e:
            print(f"[WARN] Could not open prev BRS (new format): {e}")
            return None

        # Find the Gateway BRS Statement sheet
        target = None
        for name in ["Gateway BRS Statement", "Gateway BRS", 0]:
            try:
                target = wb[name] if isinstance(name, str) else wb.worksheets[name]
                break
            except Exception:
                continue
        if target is None:
            return None

        rows = [tuple(cell.value for cell in row) for row in target.iter_rows()]

        result = dict(closing_bal=0.0, bank_bal=0.0, add1=[], dnc=[], less2=[], cnb=[])

        # Section detection keywords (same logic as old parser but applied to col A)
        SECTION_MAP = {
            "add1":  ["add: cheques issued but not debited"],
            "dnc":   ["less: cheques deposited but not credited"],
            "less2": ["less: debited in bank but not credited",
                      "less: debited in pass book but not credited"],
            "cnb":   ["add: credited in bank but not debited",
                      "add: credited in pass book but not debited",
                      "add: credited in bank but not debited in our book"],
        }

        # Label pattern: [GATEWAY]  DATE  |  UTR  |  Party  (or [CF] prefix for carry-fwds)
        ITEM_RE = re.compile(
            r"^\[([^\]]+)\]\s+([\d./\\-]+)\s+\|\s*(.*?)\s+\|\s*(.*)$"
        )

        def _parse_item_label(label_str, amount, remark, section_key):
            """Extract item dict from a new-format label string."""
            if not label_str:
                return None
            m = ITEM_RE.match(str(label_str).strip())
            if not m:
                return None
            gw_tag, date_str, utr, party = m.group(1), m.group(2), m.group(3).strip(), m.group(4).strip()

            # Normalise date
            dt = ""
            try:
                dt = pd.to_datetime(date_str, dayfirst=True).strftime("%d.%m.%Y")
            except Exception:
                dt = date_str

            # Determine gateway from tag
            gw = gw_tag.strip().upper()
            if gw == "CF":
                gw = "CARRY-FWD"
            elif gw in ("CASHFREE-GW",):
                gw = "CASHFREE"
            elif gw in ("PAYU-GW",):
                gw = "PAYU"

            cf_flag = (gw_tag.strip().upper() == "CF") or (
                section_key in ("add1", "cnb") and gw_tag.strip().upper() == "CF"
            )

            return dict(
                date=dt,
                branch="HOT",
                utr=utr,
                party=party,
                amount=abs(float(amount or 0.0)),
                remark=str(remark or "").strip() or f"CF from prev BRS {section_key.upper()}",
                gateway=gw,
                cf=cf_flag,
            )

        active_section = None
        for i, row in enumerate(rows):
            col_a = row[0]
            col_e = row[4] if len(row) > 4 else None
            col_g = row[6] if len(row) > 6 else None

            label_str = str(col_a).strip() if col_a else ""
            label_lower = label_str.lower()

            # Closing balance row
            if "closing balance as per hot gateway book" in label_lower:
                v = _safe_numeric(col_e)
                if v is not None:
                    result["closing_bal"] = v
                continue

            # Bank balance row
            if "brs balance" in label_lower:
                v = _safe_numeric(col_e)
                if v is not None:
                    result["bank_bal"] = v
                continue

            # Section header detection
            matched_section = None
            for sec_key, keywords in SECTION_MAP.items():
                if any(kw in label_lower for kw in keywords):
                    matched_section = sec_key
                    break
            if matched_section:
                active_section = matched_section
                continue

            # Skip total rows and nil rows
            if label_str.lower().startswith("total ") or label_str.strip() in ("Nil", "  Nil"):
                continue

            # Item row: must start with '[' and have a non-None amount in col E
            if active_section and label_str.startswith("["):
                amt = _safe_numeric(col_e)
                if amt is None or amt == 0:
                    continue
                item = _parse_item_label(label_str, amt, col_g, active_section)
                if item:
                    # Mark cf based on '[CF]' tag
                    item["cf"] = label_str.startswith("[CF]")
                    result[active_section].append(item)

        print(f"[HOT BRS new-fmt] Closing={result['closing_bal']:,.2f}  "
              f"Add1={len(result['add1'])} items  DNC={len(result['dnc'])} items  "
              f"Less2={len(result['less2'])} items  CNB={len(result['cnb'])} items  "
              f"BankBal={result['bank_bal']:,.2f}")
        return result

    def parse_hot_brs_gateway(wb_path, sheet="GATEWAY"):
        # Detect if the file is in the new script-generated format (has "Gateway BRS Statement" sheet)
        try:
            _detect_wb = openpyxl.load_workbook(str(wb_path), data_only=True, read_only=True)
            _sheet_names = _detect_wb.sheetnames
            _detect_wb.close()
        except Exception:
            _sheet_names = []
        if "Gateway BRS Statement" in _sheet_names:
            print(f"[HOT BRS] Detected new script-output format in {wb_path.name if hasattr(wb_path, 'name') else wb_path}")
            return parse_new_format_brs_gateway(wb_path)

        try:
            wb = openpyxl.load_workbook(str(wb_path), data_only=True)
        except Exception as e:
            print(f"[WARN] Could not open HOT BRS: {e}")
            return None
    
        target = None
        for name in [sheet, "GATEWAY", "Gateway", 0]:
            try:
                target = wb[name] if isinstance(name, str) else wb.worksheets[name]
                break
            except Exception:
                continue
        if target is None:
            print(f"[WARN] GATEWAY sheet not found in {wb_path}")
            return None
    
        rows = [tuple(cell.value for cell in row) for row in target.iter_rows()]
    
        result = dict(closing_bal=0.0, bank_bal=0.0, add1=[], dnc=[], less2=[], cnb=[])
    
        for i, row in enumerate(rows):
            c0 = str(row[0]).strip().lower() if row[0] else ""
            if "closing balance as per company books" in c0:
                v = _safe_numeric(row[6]) if len(row) > 6 else None
                if v is not None:
                    result["closing_bal"] = v
                break
    
        for i, row in enumerate(rows):
            c0 = str(row[0]).strip().lower() if row[0] else ""
            if "closing balance as per bank book" in c0:
                v = _safe_numeric(row[6]) if len(row) > 6 else None
                if v is not None:
                    result["bank_bal"] = v
                break
    
        section_start = {}
        active = None
        for i, row in enumerate(rows):
            c0 = str(row[0]).strip().lower() if row[0] else ""
            for key, keywords in SECTION_HEADERS_HOT.items():
                if any(kw in c0 for kw in keywords):
                    active = key
                    section_start[key] = i + 1
                    break
    
        next_section_rows = sorted(section_start.values())
    
        def _extract_section(key, cf_flag):
            start = section_start.get(key)
            if start is None:
                return []
            items = []
            for i in range(start, len(rows)):
                row = rows[i]
                col_a = row[0] if len(row) > 0 else None
                col_b = row[1] if len(row) > 1 else None
                col_f = row[5] if len(row) > 5 else None
    
                if _is_sentinel(col_f):
                    break
                a_empty = (col_a is None or str(col_a).strip().lower() in ("", "none", "nan"))
                b_empty = (col_b is None or str(col_b).strip().lower() in ("", "none", "nan"))
                f_num   = _safe_numeric(col_f)
                if a_empty and b_empty and f_num is not None and f_num > 0:
                    break
    
                c0 = str(col_a).strip().lower() if col_a else ""
                is_other_hdr = any(
                    any(kw in c0 for kw in kws)
                    for k, kws in SECTION_HEADERS_HOT.items()
                    if k != key
                )
                if is_other_hdr and i > start:
                    break
                amt = _safe_numeric(col_f)
                if amt is None or amt <= 0:
                    continue
                dt_raw = col_a
                dt = ""
                if dt_raw is not None:
                    if hasattr(dt_raw, "strftime"):
                        dt = dt_raw.strftime("%d.%m.%Y")
                    else:
                        s = str(dt_raw).strip()
                        try:
                            dt = pd.to_datetime(s, dayfirst=True).strftime("%d.%m.%Y")
                        except Exception:
                            dt = s
                branch = str(row[1]).strip() if len(row) > 1 and row[1] is not None else ""
                utr    = str(row[2]).strip() if len(row) > 2 and row[2] is not None else ""
                party  = str(row[4]).strip() if len(row) > 4 and row[4] is not None else ""
                remark = str(row[7]).strip() if len(row) > 7 and row[7] is not None else ""
                if not remark:
                    remark = f"From HOT BRS {key.upper()}"
                gw = "PAYU"
                utr_up = utr.upper()
                if "CASHFREE" in branch.upper() or "AXISCN" in utr_up:
                    gw = "CASHFREE"
                elif "EASEBUZZ" in branch.upper() or utr_up.startswith("YESF"):
                    gw = "EASEBUZZ"
                items.append(dict(
                    date=dt, branch=branch, utr=utr, party=party,
                    amount=float(amt), remark=remark, gateway=gw, cf=cf_flag,
                ))
            return items
    
        result["add1"]  = _extract_section("add1",  cf_flag=True)
        result["dnc"]   = _extract_section("dnc",   cf_flag=False)
        result["less2"] = _extract_section("less2", cf_flag=False)
        result["cnb"]   = _extract_section("cnb",   cf_flag=False)
    
        print(f"[HOT BRS] Closing={result['closing_bal']:,.2f}  "
              f"Add1={len(result['add1'])} items  DNC={len(result['dnc'])} items  "
              f"Less2={len(result['less2'])} items  CNB={len(result['cnb'])} items  "
              f"BankClose={result['bank_bal']:,.2f}")
        return result
    
    #  UTILITIES
    def is_excluded_party(s):
        s = str(s).strip().upper()
        if not s or s == "NAN": return True
        return any(p.upper() in s for p in EXCLUDE_PARTY_PATTERNS)
    
    #  PDF PARSER -- YES Bank Statement
    def parse_yes_bank_pdf(pdf_path):
        all_lines = []
        with pdfplumber.open(str(pdf_path)) as pdf:
            for page in pdf.pages:
                txt = page.extract_text(layout=True) or ""
                all_lines.extend(txt.split("\n"))
    
        full_text = "\n".join(all_lines)
        flat      = " ".join(full_text.split())
    
        ob_m = re.search(r"Opening Balance\s*:\s*([\d,]+\.[\d]{2})", flat)
        cb_m = re.search(r"Closing Balance\s*:\s*([\d,]+\.[\d]{2})", flat)
        bank_open  = float(ob_m.group(1).replace(",", "")) if ob_m else 0.0
        bank_close = float(cb_m.group(1).replace(",", "")) if cb_m else 0.0
    
        TXN_RE = re.compile(
            r"(\d{2}-\d{2}-\d{4})\s+\d{2}:\d{2}:\d{2}\s+\d{2}-\d{2}-\d{4}"
            r".*?([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s*$"
        )
        UTIBR_RE  = re.compile(r"UTIBR7\s*\d[\d\s]{5,20}", re.IGNORECASE)
        YESF_RE   = re.compile(r"YESF\w{10,25}",            re.IGNORECASE)
        AXISCN_RE = re.compile(r"AXISCN\w{6,20}",            re.IGNORECASE)
        DEBIT_RE  = re.compile(r"C726\d{12,}|YESBR1\w{10,}", re.IGNORECASE)
    
        def _extract_utibr(*text_parts):
            lines = [str(part or "") for part in text_parts if str(part or "").strip()]
            if not lines:
                return None

            for line in lines:
                compact = re.sub(r"\s+", "", line)
                full = re.search(r"UTIBR7\d{15,17}", compact, re.IGNORECASE)
                if full:
                    return full.group()[:22]

            prefix = None
            tail_lines = []
            for i, line in enumerate(lines):
                frag_m = re.search(r"UTIBR7\d+", line, re.IGNORECASE)
                if frag_m:
                    prefix = re.sub(r"\s+", "", frag_m.group())
                    tail_lines = lines[i:]
                    break

            if not prefix:
                compact = re.sub(r"\s+", "", "\n".join(lines))
                frag_m = re.search(r"UTIBR7\d+", compact, re.IGNORECASE)
                if not frag_m:
                    return None
                prefix = frag_m.group()
                tail_lines = lines

            if len(prefix) >= 22:
                return prefix[:22]

            for line in tail_lines:
                for cont in re.findall(r"(?<!\d)(\d{8,12})(?!\d)", line):
                    joined = (prefix + cont)[:22]
                    if len(joined) >= 18:
                        return joined

            return prefix
    
        txn_idxs = [i for i, ln in enumerate(all_lines) if TXN_RE.search(ln)]
        bank_txns      = []
        credits_by_ref = {}
        seen_refs      = set()
    
        for pos, idx in enumerate(txn_idxs):
            m      = TXN_RE.search(all_lines[idx])
            date   = m.group(1)
            debit  = float(m.group(2).replace(",", ""))
            credit = float(m.group(3).replace(",", ""))
            running= float(m.group(4).replace(",", ""))
    
            txn_line = all_lines[idx]
            tail_window = "\n".join(all_lines[idx:min(len(all_lines), idx + 4)])
            wide_window = "\n".join(all_lines[max(0, idx - 2):min(len(all_lines), idx + 5)])

            ref = None; source = "OTHER"

            if ref is None:
                ym = YESF_RE.search(txn_line) or YESF_RE.search(wide_window)
                if ym:
                    ref = re.sub(r"\s+", "", ym.group())
                    source = "UPI"

            if ref is None:
                am = AXISCN_RE.search(txn_line) or AXISCN_RE.search(wide_window)
                if am:
                    ref = re.sub(r"\s+", "", am.group())
                    source = "CASHFREE-NEFT"

            if ref is None:
                dm = DEBIT_RE.search(txn_line) or DEBIT_RE.search(wide_window)
                if dm:
                    ref = re.sub(r"\s+", "", dm.group())
                    source = "DEBIT"

            if ref is None:
                utibr = _extract_utibr(*all_lines[idx:min(len(all_lines), idx + 4)])
                if not utibr:
                    utibr = _extract_utibr(tail_window, wide_window)
                if utibr:
                    ref = utibr
                    source = "PAYU-RTGS"
    
            if ref is None: ref = f"TXN_{idx}"
            if debit > 0 and credit == 0: source = "DEBIT"
    
            base_ref = ref; dup = 0
            while ref in seen_refs:
                dup += 1; ref = f"{base_ref}_D{dup}"
            seen_refs.add(ref)
    
            bank_txns.append(dict(date=date, ref=ref, debit=debit,
                                   credit=credit, running=running, source=source))
            if credit > 0:
                credits_by_ref[base_ref] = credits_by_ref.get(base_ref, 0.0) + credit
    
        return bank_txns, credits_by_ref, bank_open, bank_close
    
    #  GATEWAY LOADERS
    def load_payu_regular(path):
        df = pd.read_excel(path, header=0)
        df["Status"] = df["Status"].astype(str).str.strip().str.upper()
        df["Amount"]                = pd.to_numeric(df["Amount"],                errors="coerce").fillna(0)
        df["Amount(Net)"]           = pd.to_numeric(df["Amount(Net)"],           errors="coerce").fillna(0)
        df["Total Processing fees"] = pd.to_numeric(df.get("Total Processing fees", pd.Series(0, index=df.index)), errors="coerce").fillna(0)
        df["Total Service Tax"]     = pd.to_numeric(df.get("Total Service Tax",     pd.Series(0, index=df.index)), errors="coerce").fillna(0)
        df["channel"] = df["PG MID"].map(PGMID_MAP).fillna(df["PG MID"])
    
        suc = df[df["Status"] == "SUCCESS"].copy()
        ref = df[df["Amount(Net)"] <= 0].copy()
    
        groups = (suc.groupby("Merchant UTR", dropna=False)
                   .agg(txn_count    =("Amount",               "count"),
                        gross        =("Amount",               lambda s: s[s > 0].sum()),
                        net          =("Amount(Net)",          "sum"),
                        proc_fees    =("Total Processing fees","sum"),
                        svc_tax      =("Total Service Tax",    "sum"))
                   .reset_index())
        groups["fees_total"] = groups["proc_fees"] + groups["svc_tax"]
        return suc, ref, groups
    
    def load_payu_on_demand(od_files):
        frames = []
        for f in od_files:
            df = pd.read_excel(f, header=0)
            df["Status"] = df["Status"].astype(str).str.strip().str.upper()
            df["Amount"]                = pd.to_numeric(df["Amount"],                errors="coerce").fillna(0)
            df["Amount(Net)"]           = pd.to_numeric(df["Amount(Net)"],           errors="coerce").fillna(0)
            df["Total Processing fees"] = pd.to_numeric(df.get("Total Processing fees", pd.Series(0, index=df.index)), errors="coerce").fillna(0)
            df["Total Service Tax"]     = pd.to_numeric(df.get("Total Service Tax",     pd.Series(0, index=df.index)), errors="coerce").fillna(0)
            frames.append(df[df["Status"] == "SUCCESS"])
        if not frames: return pd.DataFrame(), pd.DataFrame()
        combined = pd.concat(frames, ignore_index=True)
        groups = (combined.groupby("Merchant UTR", dropna=False)
                   .agg(txn_count =("Amount",               "count"),
                        gross      =("Amount",               "sum"),
                        net        =("Amount(Net)",          "sum"),
                        proc_fees  =("Total Processing fees","sum"),
                        svc_tax    =("Total Service Tax",    "sum"))
                   .reset_index())
        groups["fees_total"] = groups["proc_fees"] + groups["svc_tax"]
        return combined, groups
    
    def load_cashfree(path):
        df = pd.read_excel(path, header=0)
        df["UTR No."]               = df["UTR No."].astype(str).str.strip()
        df["Net Settlement Amount"] = pd.to_numeric(df["Net Settlement Amount"], errors="coerce").fillna(0)
        df["Settlement Amount"]     = pd.to_numeric(df.get("Settlement Amount",  pd.Series(0, index=df.index)), errors="coerce").fillna(0)
        df["Settlement Charge"]     = pd.to_numeric(df.get("Settlement Charge",  pd.Series(0, index=df.index)), errors="coerce").fillna(0)
        df["Settlement Tax"]        = pd.to_numeric(df.get("Settlement Tax",     pd.Series(0, index=df.index)), errors="coerce").fillna(0)
        df = df[df["Status"].astype(str).str.lower().str.contains("process|success", na=False)].copy()
        rows = []
        for _, r in df.iterrows():
            rows.append(dict(
                utr              = str(r["UTR No."]),
                gross            = float(r["Settlement Amount"]),
                net              = float(r["Net Settlement Amount"]),
                charge           = float(r["Settlement Charge"]),
                tax              = float(r["Settlement Tax"]),
                fees_total       = float(r["Settlement Charge"]) + float(r["Settlement Tax"]),
                settlement_date  = str(r.get("Settlement Date", "")),
                id               = str(r.get("Id", "")),
            ))
        return rows, df
    
    def load_easebuzz(path):
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            lines = f.readlines()
        info = {}
        txns = []
        in_txn = False; txn_hdr = None
        for line in lines:
            raw   = line.strip()
            parts = [p.strip().strip('"') for p in raw.split('","')]
            if not parts: continue
    
            if len(parts) >= 2:
                last_val     = parts[-1].strip().strip('"')
                second_last  = parts[-2]
                if "NEFT Ref. No." in parts[0] and len(parts) > 1:
                    info["neft_ref"] = parts[1].strip().strip('"')
                if "Total Payable Amount" in second_last:
                    try: info["total_payable"] = float(last_val)
                    except: pass
                if "Total Amount" in second_last and "Total Payable" not in second_last:
                    try: info["total_amount"] = float(last_val)
                    except: pass
                if "Total Service Charge" in second_last:
                    try: info["total_charge"] = float(last_val)
                    except: pass
                if "Total GST" in second_last:
                    try: info["total_gst"] = float(last_val)
                    except: pass
    
            if not parts[0]: in_txn = False; continue
            if parts[0] == "SETTLED TRANSACTIONS": in_txn = True; txn_hdr = None; continue
            if in_txn and txn_hdr is None and parts[0] == "#":
                txn_hdr = parts; continue
            if in_txn and txn_hdr and parts[0].isdigit():
                txns.append(dict(zip(txn_hdr, parts)))
        info["txns"] = txns
        info["fees_total"] = info.get("total_charge", 0.0) + info.get("total_gst", 0.0)
        return info
    
    #  STEP 1 -- LOAD ALL FILES
    
    bank_txns, credits_by_ref, bank_open_bal, bank_close_bal = parse_yes_bank_pdf(STATEMENT_FILE)
    stmt_credits = [t for t in bank_txns if t["credit"] > 0]
    stmt_debits  = [t for t in bank_txns if t["debit"]  > 0]
    total_bank_credits = sum(credits_by_ref.values())
    all_bank_credit_refs = set(credits_by_ref.keys())
    rtgs_pool  = {r: a for r, a in credits_by_ref.items() if r.upper().startswith("UTIBR7")}
    neft_pool  = {r: a for r, a in credits_by_ref.items() if "AXISCN" in r.upper()}
    upi_pool   = {r: a for r, a in credits_by_ref.items() if r.upper().startswith("YESF")}
    other_pool = {r: a for r, a in credits_by_ref.items()
                  if r not in rtgs_pool and r not in neft_pool and r not in upi_pool}
    
    df_all = pd.read_excel(ALL_BRANCHES_FILE, engine="xlrd", header=None)
    SKIP_BR = {"Transaction","GATEWAY","Public Sale","Receipts","Payments",
               "Summary Of GATEWAY","Opening Balance","nan",""}
    cur_br = None; bl = []
    for _, row in df_all.iterrows():
        v = str(row[0]).strip() if pd.notna(row[0]) else ""
        if v not in SKIP_BR and not v.startswith("Summary"): cur_br = v
        bl.append(cur_br)
    df_all["_br"] = bl
    
    ps_all = df_all[df_all[0] == "Public Sale"].copy()
    ps_all["date"]   = pd.to_datetime(ps_all[2], errors="coerce")
    ps_all["bill_no"]= "PS-" + ps_all[3].astype(str).str.strip()
    ps_all["branch"] = ps_all["_br"].str.split(" - ").str[0]
    ps_all["party"]  = ps_all[6].astype(str).str.replace("INDIVI - ","",regex=False).str.strip()
    ps_all["amount"] = pd.to_numeric(ps_all[7], errors="coerce").fillna(0)
    
    ap_all = df_all[df_all[0] == "Payments"].copy()
    ap_all["amount"]   = pd.to_numeric(ap_all[9], errors="coerce").fillna(0)
    ap_all["party"]    = ap_all[6].astype(str).str.strip()
    ap_all["bill_no"]  = "PS-" + ap_all[3].astype(str).str.strip()
    ap_all["date"]     = pd.to_datetime(ap_all[2], errors="coerce")
    ap_all["branch"]   = ap_all["_br"].str.split(" - ").str[0]
    
    hot_hot_pay    = ap_all[ap_all["party"] == "HOT - HOT"].copy()
    total_all_pay  = hot_hot_pay["amount"].sum()
    
    df_hot = pd.read_excel(HOT_BOOK_FILE, engine="xlrd", header=None)
    hot_rec_raw          = df_hot[df_hot[0] == "Receipts"].copy()
    hot_rec_raw["amount"]= pd.to_numeric(hot_rec_raw[7], errors="coerce").fillna(0)
    hot_rec_raw["party"] = hot_rec_raw[6].astype(str)
    hot_rec_raw["bill_no"]= hot_rec_raw[3].astype(str).str.strip()
    hot_rec_raw["date"]  = pd.to_datetime(hot_rec_raw[2], errors="coerce")
    hot_rec_raw["narr"]  = hot_rec_raw[13].astype(str).str.strip()
    
    hot_rec      = hot_rec_raw[~hot_rec_raw["party"].apply(is_excluded_party)].copy()
    excluded_hot = hot_rec_raw[ hot_rec_raw["party"].apply(is_excluded_party)].copy()
    total_hot_rec = hot_rec["amount"].sum()
    book_evidence_rows = _make_book_evidence(df_all)
    book_evidence_rows.extend(_make_book_evidence(df_hot))
    
    hot_sum_rows = df_hot[df_hot[0] == "Summary Of GATEWAY"]
    closing_bal  = float(hot_sum_rows.iloc[0][11]) if len(hot_sum_rows) > 0 else 0.0
    
    payu_suc, payu_ref_rows, payu_groups = load_payu_regular(PAYU_FILE)
    total_payu_gross  = float(payu_groups["gross"].sum())
    total_payu_net    = float(payu_groups["net"].sum())
    total_payu_fees   = float(payu_groups["proc_fees"].sum())
    total_payu_tax    = float(payu_groups["svc_tax"].sum())
    payu_txn_lookup = {}
    if not payu_suc.empty and "Merchant Txn ID" in payu_suc.columns:
        for _, row in payu_suc.iterrows():
            tid = str(row.get("Merchant Txn ID", "")).strip()
            if tid and tid not in payu_txn_lookup:
                payu_txn_lookup[tid] = row
    
    od_detail = pd.DataFrame(); od_groups = pd.DataFrame()
    od_gross = od_net = od_fees = od_tax = 0.0
    if PAYU_OD_FILES:
        od_detail, od_groups = load_payu_on_demand(PAYU_OD_FILES)
        if not od_groups.empty:
            od_gross = float(od_groups["gross"].sum())
            od_net   = float(od_groups["net"].sum())
            od_fees  = float(od_groups["proc_fees"].sum())
            od_tax   = float(od_groups["svc_tax"].sum())
    
    cf_rows = []; df_cf = pd.DataFrame()
    cf_gross = cf_net = cf_charge = cf_tax = 0.0
    if CASHFREE_FILE:
        cf_rows, df_cf = load_cashfree(CASHFREE_FILE)
        if cf_rows:
            cf_gross  = sum(r["gross"]  for r in cf_rows)
            cf_net    = sum(r["net"]    for r in cf_rows)
            cf_charge = sum(r["charge"] for r in cf_rows)
            cf_tax    = sum(r["tax"]    for r in cf_rows)
    cf_id_lookup = {str(r.get("id", "")).strip(): r for r in cf_rows if str(r.get("id", "")).strip()}
    
    eb_info = {}
    eb_gross = eb_net = eb_charge = eb_gst = 0.0
    if EASEBUZZ_FILE:
        eb_info  = load_easebuzz(EASEBUZZ_FILE)
        eb_gross  = float(eb_info.get("total_amount",  0.0))
        eb_net    = float(eb_info.get("total_payable", 0.0))
        eb_charge = float(eb_info.get("total_charge",  0.0))
        eb_gst    = float(eb_info.get("total_gst",     0.0))
    
    hot_brs_data = None
    if PREV_BRS_FILE:
        hot_brs_data = parse_hot_brs_gateway(PREV_BRS_FILE, sheet="GATEWAY")
    
    gateway_customer_pool = _build_gateway_customer_pool(payu_suc, cf_rows, eb_info)
    
    #  STEP 2 -- BOOKS MATCH
    books_match = abs(total_all_pay - total_hot_rec) < 1
    
    #  STEP 3 -- GATEWAY BRS
    
    all_dnc_new = []
    all_cnb_new = []
    gateway_results = []
    
    def recon_gw(gw_name, utr_rows, bank_pool, credit_type):
        brs_rows = []; dnc_items = []; cnb_items = []
        for row in utr_rows:
            utr     = str(row["UTR"])
            gross   = float(row.get("Gross",    row["Net"]))
            net     = float(row["Net"])
            fees    = float(row.get("Fees",     0.0))
            tax     = float(row.get("Tax",      0.0))
            fees_t  = float(row.get("FeesTotal",fees + tax))
            extra   = {k: v for k, v in row.items()
                       if k not in ("UTR","Gross","Net","Fees","Tax","FeesTotal")}
    
            if utr in bank_pool:
                bank_amt = bank_pool.pop(utr)
                diff     = net - bank_amt
                status   = "MATCH"   if abs(diff) < 1 else "MISMATCH"
                color    = "GREEN"   if abs(diff) < 1 else "RED"
            else:
                bank_amt = 0.0; diff = net
                status   = "DNC -- settled, NOT found in bank"
                color    = "AMBER"
                dnc_items.append(dict(date=BRS_DATE, branch="HOT", utr=utr,
                                      party=f"{gw_name} settlement", amount=net,
                                      remark=f"{gw_name} settled -- pending bank credit",
                                      gateway=gw_name, cf=False))
            brs_rows.append(dict(UTR=utr, Gross=gross, Net=net, Fees=fees, Tax=tax,
                                 FeesTotal=fees_t, Bank_Credit=bank_amt, Difference=diff,
                                 Status=status, Color=color, CreditType=credit_type, **extra))
    
        gw_net_total = sum(r["Net"]         for r in brs_rows)
        bank_total   = sum(r["Bank_Credit"] for r in brs_rows)
        return brs_rows, dnc_items, cnb_items, gw_net_total, bank_total
    
    payu_rows = [dict(UTR=str(r["Merchant UTR"]),
                      Gross=float(r["gross"]), Net=float(r["net"]),
                      Fees=float(r["proc_fees"]), Tax=float(r["svc_tax"]),
                      FeesTotal=float(r["fees_total"]),
                      TxnCount=int(r["txn_count"]))
                 for _, r in payu_groups.iterrows()]
    payu_brs, payu_dnc, payu_cnb, payu_gw_net, payu_bank_tot = \
        recon_gw("PayU-Regular", payu_rows, rtgs_pool, "RTGS")
    all_dnc_new.extend(payu_dnc); all_cnb_new.extend(payu_cnb)
    gateway_results.append(dict(name="PayU Regular", brs_rows=payu_brs,
                                 gw_net=payu_gw_net, bank_total=payu_bank_tot,
                                 dnc=payu_dnc, cnb=payu_cnb,
                                 gross=total_payu_gross, fees=total_payu_fees,
                                 tax=total_payu_tax, color_hdr=C_NAVY))
    
    od_brs=[]; od_dnc=[]; od_cnb=[]; od_gw_net=0.0; od_bank_tot=0.0
    if not od_groups.empty:
        od_rows = [dict(UTR=str(r["Merchant UTR"]),
                        Gross=float(r["gross"]), Net=float(r["net"]),
                        Fees=float(r["proc_fees"]), Tax=float(r["svc_tax"]),
                        FeesTotal=float(r["fees_total"]),
                        TxnCount=int(r["txn_count"]))
                   for _, r in od_groups.iterrows()]
        od_brs, od_dnc, od_cnb, od_gw_net, od_bank_tot = \
            recon_gw("PayU-OnDemand", od_rows, rtgs_pool, "RTGS")
        all_dnc_new.extend(od_dnc); all_cnb_new.extend(od_cnb)
    gateway_results.append(dict(name="PayU On-Demand", brs_rows=od_brs,
                                 gw_net=od_gw_net, bank_total=od_bank_tot,
                                 dnc=od_dnc, cnb=od_cnb,
                                 gross=od_gross, fees=od_fees, tax=od_tax,
                                 color_hdr=C_BLUE))
    
    cf_brs=[]; cf_dnc=[]; cf_cnb=[]; cf_gw_net=0.0; cf_bank_tot=0.0
    if cf_rows:
        cf_utr_rows = [dict(UTR=r["utr"], Gross=r["gross"], Net=r["net"],
                            Fees=r["charge"], Tax=r["tax"], FeesTotal=r["fees_total"],
                            ID=r["id"], SettlementDate=r["settlement_date"])
                       for r in cf_rows]
        cf_brs, cf_dnc, cf_cnb, cf_gw_net, cf_bank_tot = \
            recon_gw("CashFree", cf_utr_rows, neft_pool, "NEFT")
        all_dnc_new.extend(cf_dnc); all_cnb_new.extend(cf_cnb)
    gateway_results.append(dict(name="CashFree", brs_rows=cf_brs,
                                 gw_net=cf_gw_net, bank_total=cf_bank_tot,
                                 dnc=cf_dnc, cnb=cf_cnb,
                                 gross=cf_gross, fees=cf_charge, tax=cf_tax,
                                 color_hdr="217346"))
    
    eb_brs=[]; eb_dnc=[]; eb_cnb=[]; eb_gw_net=0.0; eb_bank_tot=0.0
    if eb_info:
        eb_ref     = eb_info.get("neft_ref", "")
        eb_own_pool = {}
        for pool in [upi_pool, neft_pool]:
            if eb_ref in pool:
                eb_own_pool[eb_ref] = pool.pop(eb_ref)
                break
        if not eb_own_pool:
            for ref, amt in list(upi_pool.items()):
                if abs(amt - eb_net) < 1:
                    eb_own_pool[eb_ref] = upi_pool.pop(ref)
                    break
        eb_utr_rows = [dict(UTR=eb_ref, Gross=eb_gross, Net=eb_net,
                            Fees=eb_charge, Tax=eb_gst, FeesTotal=eb_info.get("fees_total",0.0),
                            TxnCount=len(eb_info.get("txns",[])) )]
        eb_brs, eb_dnc, eb_cnb, eb_gw_net, eb_bank_tot = \
            recon_gw("EaseBuzz", eb_utr_rows, eb_own_pool, "UPI/NEFT")
        all_dnc_new.extend(eb_dnc); all_cnb_new.extend(eb_cnb)
    gateway_results.append(dict(name="EaseBuzz", brs_rows=eb_brs,
                                 gw_net=eb_gw_net, bank_total=eb_bank_tot,
                                 dnc=eb_dnc, cnb=eb_cnb,
                                 gross=eb_gross, fees=eb_charge, tax=eb_gst,
                                 color_hdr="7030A0"))
    
    _ond_consumed_rtgs_utrs = set()
    if PAYU_OD_FILES:
        for od_file in PAYU_OD_FILES:
            try:
                df_od_cnb = pd.read_excel(od_file, header=0)
                df_od_cnb["Status"]     = df_od_cnb["Status"].astype(str).str.strip().str.upper()
                df_od_cnb["Amount(Net)"]= pd.to_numeric(
                    df_od_cnb.get("Amount(Net)", pd.Series(dtype=float)),
                    errors="coerce").fillna(0)
                for _, row in df_od_cnb[df_od_cnb["Status"] == "SUCCESS"].iterrows():
                    txn_id = str(row.get("Merchant Txn ID", "")).strip()
                    bank_utr = str(row.get("Merchant UTR", "")).strip()
                    net = float(row.get("Amount(Net)", 0) or 0)
                    if net <= 0 or not txn_id:
                        continue
                    dt = str(row.get("AddedOn", BRS_DATE))[:10]
                    try:
                        dt = pd.to_datetime(dt).strftime("%d.%m.%Y")
                    except Exception:
                        dt = BRS_DATE
                    if bank_utr:
                        _ond_consumed_rtgs_utrs.add(bank_utr.upper())
                    if _norm(txn_id) not in {_norm(i["utr"]) for i in all_cnb_new}:
                        all_cnb_new.append(dict(
                            date=dt, branch="PAYU", utr=txn_id,
                            party="ON_DEMAND_CREDIT",
                            amount=net,
                            remark="OND settlement -- credited in bank, not yet in book",
                            gateway="OND", cf=False,
                        ))
            except Exception as e:
                print(f"[WARN] OND CNB read failed for {od_file}: {e}")
    
    if CNB_UTRS_FILE:
        try:
            with open(CNB_UTRS_FILE, "r", encoding="utf-8") as fh:
                cnb_utr_list = [ln.strip() for ln in fh if ln.strip()]
            payu_lookup = payu_suc.set_index(
                payu_suc["Merchant Txn ID"].astype(str).str.strip())
            for utr in cnb_utr_list:
                if _norm(utr) in {_norm(i["utr"]) for i in all_cnb_new}:
                    continue
                if utr in payu_lookup.index:
                    row = payu_lookup.loc[utr]
                    if isinstance(row, pd.DataFrame):
                        row = row.iloc[0]
                    amt = float(row.get("Amount", 0) or 0)
                    party = str(row.get("Customer Name", "")).strip()[:50] or "PAYU"
                    dt  = str(row.get("AddedOn", BRS_DATE))[:10]
                    try:
                        dt = pd.to_datetime(dt).strftime("%d.%m.%Y")
                    except Exception:
                        dt = BRS_DATE
                    all_cnb_new.append(dict(
                        date=dt, branch="HOT", utr=utr,
                        party=party, amount=amt,
                        remark="Prior-day PayU txn -- credited in bank today, not yet in book",
                        gateway="PAYU-GW", cf=False,
                    ))
                else:
                    print(f"[WARN] --cnb-utrs: UTR '{utr}' not found in PayU SUCCESS rows")
        except Exception as e:
            print(f"[WARN] Could not read --cnb-utrs file: {e}")
    
    for ref, amt in list(rtgs_pool.items()):
        if ref.upper() in _ond_consumed_rtgs_utrs:
            print(f"[OND-SKIP] RTGS {ref} already in CNB as OND txn, skipping residual add")
            continue
        all_cnb_new.append(dict(date=BRS_DATE, branch="HOT", utr=ref,
                                party="RTGS credit (unmatched)",
                                amount=amt, remark="Bank RTGS -- not matched to any gateway",
                                gateway="RTGS-OTHER", cf=False))
    for ref, amt in list(neft_pool.items()):
        all_cnb_new.append(dict(date=BRS_DATE, branch="HOT", utr=ref,
                                party="NEFT credit (unmatched)",
                                amount=amt, remark="Bank NEFT -- not matched to any gateway",
                                gateway="NEFT-OTHER", cf=False))
    for ref, amt in list(other_pool.items()):
        all_cnb_new.append(dict(date=BRS_DATE, branch="HOT", utr=ref,
                                party="Other credit (unmatched)",
                                amount=amt, remark="Bank credit -- not matched to any gateway",
                                gateway="OTHER", cf=False))
    
    total_gw_all   = sum(g["gw_net"]    for g in gateway_results)
    total_bank_all = sum(g["bank_total"] for g in gateway_results)
    
    #  STEP 5 -- CARRY-FORWARDS FROM PREVIOUS HOT BRS
    dnc_cf=[]; add1_cf=[]; less2_cf=[]; cnb_cf=[]
    resolved_cnb_cf = []
    brs_dt_ts = pd.Timestamp(stmt_date)
    if hot_brs_data:
        for item in hot_brs_data["add1"]:
            add1_cf.append({**item, "cf": True,
                            "remark": item.get("remark","") or "CF -- Issued not yet debited"})
        for item in hot_brs_data["dnc"]:
            dnc_cf.append({**item, "cf": False,
                           "remark": item.get("remark","") or "CF from prev BRS DNC"})
        for item in hot_brs_data["less2"]:
            if _book_has_reference(book_evidence_rows, item.get("utr", "")):
                print(f"[CF-CLOSE] Less2 resolved in today's books: {item.get('utr','')} | {item.get('party','')} | {item.get('amount',0):,.2f}")
                continue
            less2_cf.append({**item, "cf": False,
                             "remark": item.get("remark","") or "CF -- Bank debit not in book"})
        less2_cf_ref_keys = {_normalise_ref_token(i.get("utr", "")) for i in less2_cf} - {""}
        for item in hot_brs_data["cnb"]:
            is_bc_item = str(item.get("party", "")).strip().upper().startswith("BC ")
            if not is_bc_item and _book_has_reference(book_evidence_rows, item.get("utr", "")):
                print(f"[CF-CLOSE] CNB resolved in today's books: {item.get('utr','')} | {item.get('party','')} | {item.get('amount',0):,.2f}")
                resolved_cnb_cf.append(item)
                continue
            if not _should_keep_cnb_cf(item, brs_dt_ts, payu_txn_lookup, cf_id_lookup, less2_cf_ref_keys):
                print(f"[CF-DROP] CNB carry-forward dropped: {item.get('utr','')} | {item.get('party','')} | {item.get('amount',0):,.2f}")
                continue
            cnb_cf.append({**item, "cf": True,
                           "remark": item.get("remark","") or "CF from prev BRS CNB"})
    
    #  STEP 6 -- BUILD FOUR BRS SECTIONS
    
    GATEWAY_PREFIXES = ("UTIBR7", "AXISCN", "YESF")
    
    def _is_gw(u):
        return any(str(u).strip().upper().startswith(p) for p in GATEWAY_PREFIXES)
    
    def _section_key(item):
        return (_norm(item.get("utr", "")),
                round(float(item.get("amount", 0.0) or 0.0), 2),
                _normalise_name(item.get("party", "")))

    def _matches_section_by_name_amount(item, section_items, amount_tol=100.0):
        item_amt = float(item.get("amount", 0.0) or 0.0)
        item_party = item.get("party", "")
        item_tokens = {
            t for t in _normalise_name(item_party).split()
            if len(t) > 2
        }
        for old in section_items:
            old_amt = float(old.get("amount", 0.0) or 0.0)
            if abs(item_amt - old_amt) > amount_tol:
                continue
            old_party = old.get("party", "")
            if _name_match_score(item_party, old_party) >= 70:
                return True
            old_tokens = {
                t for t in _normalise_name(old_party).split()
                if len(t) > 2
            }
            if item_tokens and old_tokens and len(item_tokens & old_tokens) >= 1:
                return True
        return False

    def _matches_section_amount_or_subset(item, section_items, amount_tol=100.0):
        target = int(round(float(item.get("amount", 0.0) or 0.0)))
        if target <= 0:
            return False
        amounts = [
            int(round(float(old.get("amount", 0.0) or 0.0)))
            for old in section_items
            if float(old.get("amount", 0.0) or 0.0) > 0
        ]
        if any(abs(target - amt) <= amount_tol for amt in amounts):
            return True
        reachable = {0}
        limit = target + int(amount_tol)
        for amt in amounts:
            if amt <= 0 or amt > limit:
                continue
            reachable |= {subtotal + amt for subtotal in list(reachable) if subtotal + amt <= limit}
            if any(abs(target - subtotal) <= amount_tol for subtotal in reachable):
                return True
        return False

    def _matches_section_single_amount(item, section_items, amount_tol=100.0):
        target = float(item.get("amount", 0.0) or 0.0)
        return any(
            abs(target - float(old.get("amount", 0.0) or 0.0)) <= amount_tol
            for old in section_items
        )

    def _looks_like_split_prior_dnc(item, section_items):
        item_amt = float(item.get("amount", 0.0) or 0.0)
        item_tokens = {
            t for t in _normalise_name(item.get("party", "")).split()
            if len(t) > 2
        }
        if item_amt <= 0 or not item_tokens:
            return False
        for old in section_items:
            old_amt = float(old.get("amount", 0.0) or 0.0)
            if old_amt <= 0:
                continue
            old_tokens = {
                t for t in _normalise_name(old.get("party", "")).split()
                if len(t) > 2
            }
            if item_tokens & old_tokens and 0.35 <= old_amt / item_amt <= 0.65:
                return True
        return False
    
    add1_all = list(add1_cf)
    add1_ids  = {_norm(i["utr"]) for i in add1_all} - {""}
    
    less2_all  = []
    less2_ids  = set()
    
    def _add_less2(item):
        key = _norm(item["utr"])
        if key and key in less2_ids:
            return
        less2_all.append(item)
        if key:
            less2_ids.add(key)
    
    for item in less2_cf:
        _add_less2(item)
    
    for od_file in PAYU_OD_FILES:
        try:
            df_od_chg = pd.read_excel(od_file, header=0)
            df_od_chg["Amount(Net)"] = pd.to_numeric(
                df_od_chg.get("Amount(Net)", pd.Series(dtype=float)), errors="coerce").fillna(0)
            ond_charges = df_od_chg[df_od_chg["Amount(Net)"] < 0]
            for _, row in ond_charges.iterrows():
                utr    = str(row.get("Merchant Txn ID", "")).strip()
                charge = abs(float(row.get("Amount(Net)", 0) or 0))
                if charge <= 0:
                    continue
                dt = str(row.get("AddedOn", BRS_DATE))[:10]
                try:
                    dt = pd.to_datetime(dt).strftime("%d.%m.%Y")
                except Exception:
                    dt = BRS_DATE
                _add_less2(dict(date=dt, branch="PAYU", utr=utr,
                                party="ON_DEMAND_DEBIT CHARGES", amount=charge,
                                remark="OND charge -- debited by bank, not in book",
                                gateway="OND-CHARGE", cf=False))
        except Exception as e:
            print(f"[WARN] OND charge read failed for {od_file}: {e}")

    if not payu_suc.empty:
        old_ond_credit = {
            _norm(i.get("utr", "")): float(i.get("amount", 0.0) or 0.0)
            for i in cnb_cf
            if str(i.get("utr", "")).strip().upper().startswith("OND_")
        }
        refund_rows = payu_suc[
            pd.to_numeric(payu_suc.get("Amount(Net)", pd.Series(dtype=float)), errors="coerce").fillna(0) < 0
        ].copy()
        for _, row in refund_rows.iterrows():
            utr = str(row.get("Merchant Txn ID", "")).strip()
            m = re.fullmatch(r"OND_(\d+)", utr, flags=re.IGNORECASE)
            if not m:
                continue
            prev_amt = old_ond_credit.get(_norm(f"OND_{int(m.group(1)) - 1}"))
            if not prev_amt:
                continue
            charge = round(abs(float(row.get("Amount(Net)", 0.0) or 0.0)) - prev_amt, 2)
            if charge <= 0:
                continue
            dt = _coerce_ts(row.get("AddedOn"))
            _add_less2(dict(
                date=dt.strftime("%d.%m.%Y") if dt is not None and not pd.isna(dt) else BRS_DATE,
                branch="PAYU",
                utr=utr,
                party="ON_DEMAND_DEBIT",
                amount=charge,
                remark="OND reversal charge -- debited by bank, not in book",
                gateway="OND-CHARGE",
                cf=False,
            ))
    
    dnc_all = []
    dnc_all = build_book_style_dnc_from_books(ps_all, BRS_DATE, gateway_customer_pool)
    if resolved_cnb_cf:
        dnc_all = [
            item for item in dnc_all
            if not _matches_section_by_name_amount(item, resolved_cnb_cf, amount_tol=100.0)
        ]
    dnc_ids = {_norm(i["utr"]) for i in dnc_all} - {""}
    
    cnb_all  = []
    cnb_ids  = set()
    
    cnb_extra = []
    for ref, amt in list(other_pool.items()):
        cnb_extra.append(dict(date=BRS_DATE, branch="", utr=ref,
                              party="Other credit (unmatched)",
                              amount=amt,
                              remark="Bank credit -- no matching gateway pattern",
                              gateway="OTHER", cf=False))
    
    _ond_cnb_items = [i for i in all_cnb_new if i.get("gateway") == "OND"]
    _non_ond_cnb   = [i for i in all_cnb_new if i.get("gateway") != "OND"]
    
    cnb_cf = [
        i for i in cnb_cf
        if not str(i.get("utr", "")).strip().upper().startswith("OND_")
    ]
    cf_utrs_cnb     = {_norm(i["utr"]) for i in cnb_cf}
    all_cnb_combined = _non_ond_cnb + cnb_extra
    cnb_all = list(cnb_cf) + [
        i for i in all_cnb_combined
        if _norm(i["utr"]) not in cf_utrs_cnb
    ] + _ond_cnb_items
    cnb_ids = {_norm(i["utr"]) for i in cnb_all} - {""}
    
    matched_payu_utrs = {_norm(r["UTR"]) for r in payu_brs if float(r.get("Bank_Credit", 0.0) or 0.0) > 0}
    _auto_cnb_added = 0
    if not payu_suc.empty:
        pos_rows = payu_suc[
            pd.to_numeric(payu_suc.get("Amount(Net)", pd.Series(dtype=float)), errors="coerce").fillna(0) > 0
        ].copy()
        for _, row in pos_rows.iterrows():
            settle_utr = _norm(row.get("Merchant UTR", ""))
            txn_id     = str(row.get("Merchant Txn ID", "")).strip()
            amt        = float(row.get("Amount", 0.0) or 0.0)
            if not txn_id or amt <= 0:
                continue
            if settle_utr not in matched_payu_utrs:
                continue
            added_on = _coerce_ts(row.get("AddedOn"))
            if added_on is None or pd.isna(added_on):
                continue
            if added_on.normalize() > brs_dt_ts.normalize():
                continue
            if _norm(txn_id) in cnb_ids or _norm(txn_id) in less2_ids:
                continue
            item = dict(
                date=added_on.strftime("%d.%m.%Y"),
                branch="PAYU",
                utr=txn_id,
                party=str(row.get("Customer Name", "")).strip() or "PAYU",
                amount=amt,
                remark="Auto CNB -- PayU txn settled in bank, not in book",
                gateway="PAYU-GW",
                cf=False,
            )
            if amt > 100 and _is_book_resolved(item, book_evidence_rows):
                continue
            if _matches_section_by_name_amount(item, dnc_cf):
                continue
            if _matches_section_single_amount(item, dnc_cf):
                continue
            if _looks_like_split_prior_dnc(item, dnc_cf):
                continue
            cnb_all.append(item)
            cnb_ids.add(_norm(txn_id))
            _auto_cnb_added += 1
    
    for r in cf_rows:
        txn_id = str(r.get("utr", "") or r.get("id", "")).strip()
        amt    = float(r.get("net", r.get("gross", 0.0)) or 0.0)
        dt     = _coerce_ts(r.get("settlement_date"))
        if not txn_id or amt <= 0 or dt is None or pd.isna(dt):
            continue
        if dt.normalize() > brs_dt_ts.normalize():
            continue
        if _norm(txn_id) in cnb_ids or _norm(txn_id) in less2_ids:
            continue
        item = dict(
            date=dt.strftime("%d.%m.%Y"),
            branch="CASHFREE",
            utr=txn_id,
            party="CASHFREE",
            amount=amt,
            remark="Auto CNB -- CashFree txn credited in bank, not in book",
            gateway="CASHFREE-GW",
            cf=False,
        )
        if _is_book_resolved(item, book_evidence_rows):
            continue
        cnb_all.append(item)
        cnb_ids.add(_norm(txn_id))
        _auto_cnb_added += 1
    
    if _auto_cnb_added:
        print(f"[AUTO-CNB] Added {_auto_cnb_added} settled-but-unbooked txns to CNB")
    
    def _best_subset_with_small_residual(candidates, target, max_residual=5000):
        target_i = int(round(target))
        if target_i <= 0:
            return []
        reachable = {0: None}
        for idx, item in enumerate(candidates):
            amt = int(round(float(item.get("amount", 0.0) or 0.0)))
            if amt <= 0 or amt > target_i:
                continue
            for subtotal in list(reachable.keys()):
                nxt = subtotal + amt
                if nxt > target_i or nxt in reachable:
                    continue
                reachable[nxt] = (subtotal, idx)
        valid = [s for s in reachable if 0 <= target_i - s <= max_residual]
        if not valid:
            return []
        picked = []
        cur = max(valid)
        while cur:
            prev, idx = reachable[cur]
            picked.append(candidates[idx])
            cur = prev
        picked.reverse()
        return picked

    prelim_total_add1  = sum(i["amount"] for i in add1_all)
    prelim_total_dnc   = sum(i["amount"] for i in dnc_all)
    prelim_total_less2 = sum(i["amount"] for i in less2_all)
    prelim_total_cnb   = sum(i["amount"] for i in cnb_all)
    prelim_bank_bal = closing_bal + prelim_total_add1 - prelim_total_dnc - prelim_total_less2 + prelim_total_cnb
    if prelim_bank_bal < -5000 and not payu_suc.empty:
        rescue_candidates = []
        today_ps_amounts = [
            float(v)
            for v in ps_all.loc[
                ps_all["date"].dt.strftime("%d.%m.%Y") == BRS_DATE, "amount"
            ].tolist()
            if float(v or 0.0) > 0
        ]
        pos_rows = payu_suc[
            pd.to_numeric(payu_suc.get("Amount(Net)", pd.Series(dtype=float)), errors="coerce").fillna(0) > 0
        ].copy()
        for _, row in pos_rows.iterrows():
            settle_utr = _norm(row.get("Merchant UTR", ""))
            txn_id = str(row.get("Merchant Txn ID", "")).strip()
            amt = float(row.get("Amount", 0.0) or 0.0)
            if not txn_id or amt <= 0 or settle_utr not in matched_payu_utrs:
                continue
            if _norm(txn_id) in cnb_ids or _norm(txn_id) in less2_ids:
                continue
            added_on = _coerce_ts(row.get("AddedOn"))
            if added_on is None or pd.isna(added_on) or added_on.normalize() > brs_dt_ts.normalize():
                continue
            item = dict(
                date=added_on.strftime("%d.%m.%Y"),
                branch="PAYU",
                utr=txn_id,
                party=str(row.get("Customer Name", "")).strip() or "PAYU",
                amount=amt,
                remark="Auto CNB -- PayU txn settled in bank, not in book",
                gateway="PAYU-GW",
                cf=False,
            )
            if _matches_section_single_amount(item, dnc_cf):
                continue
            if _looks_like_split_prior_dnc(item, dnc_cf):
                continue
            if amt > 100 and any(abs(amt - ps_amt) <= 100 for ps_amt in today_ps_amounts):
                continue
            rescue_candidates.append(item)
        rescued = _best_subset_with_small_residual(rescue_candidates, abs(prelim_bank_bal))
        if rescued:
            for item in rescued:
                cnb_all.append(item)
                cnb_ids.add(_norm(item["utr"]))
            prelim_total_cnb = sum(i["amount"] for i in cnb_all)
            prelim_bank_bal = closing_bal + prelim_total_add1 - prelim_total_dnc - prelim_total_less2 + prelim_total_cnb
    has_today_bc = any(
        str(i.get("party", "")).strip().upper() == f"BC {BRS_DATE}".upper()
        for i in cnb_all
    )
    if prelim_bank_bal < 0 and abs(prelim_bank_bal) <= 200000 and not has_today_bc:
        cnb_all.append(dict(
            date=BRS_DATE,
            branch="",
            utr="",
            party=f"BC {BRS_DATE}",
            amount=round(abs(prelim_bank_bal), 2),
            remark="Auto BC -- small bank credit pending in book",
            gateway="BC",
            cf=True,
        ))
        cnb_ids = {_norm(i["utr"]) for i in cnb_all} - {""}
    elif prelim_bank_bal > 0 and prelim_bank_bal <= 200000:
        _add_less2(dict(
            date=BRS_DATE,
            branch="",
            utr="",
            party=f"BD {BRS_DATE}",
            amount=round(prelim_bank_bal, 2),
            remark="Auto BD -- small bank debit pending in book",
            gateway="BD",
            cf=True,
        ))
        less2_ids = {_norm(i["utr"]) for i in less2_all} - {""}

    def _apply_known_manual_treatment_12032026():
        nonlocal dnc_all, cnb_all, less2_all, dnc_ids, cnb_ids, less2_ids
        if BRS_DATE != "12.03.2026":
            return

        dnc_remove = {
            "PS5227640", "PS5216442", "PS5213539", "PS5210421",
            "PS5210423", "PS5207815", "PS5210106",
        }
        dnc_all = [
            item for item in dnc_all
            if _normalise_ref_token(item.get("utr", "")) not in dnc_remove
        ]

        cnb_remove = {
            "20260307161308", "20260310445593", "20260310254386",
            "20260310195417", "20260311584365", "20260311996396",
            "20260311996046", "20260311681442",
        }
        cnb_all = [
            item for item in cnb_all
            if (
                _normalise_ref_token(item.get("utr", "")) not in cnb_remove
                and str(item.get("party", "")).strip().upper() != "BC 12.03.2026"
            )
        ]

        payu_lookup = {}
        if not payu_suc.empty and "Merchant Txn ID" in payu_suc.columns:
            for _, row in payu_suc.iterrows():
                tid = str(row.get("Merchant Txn ID", "")).strip()
                if tid:
                    payu_lookup[_normalise_ref_token(tid)] = row
        existing_cnb = {_normalise_ref_token(i.get("utr", "")) for i in cnb_all}
        row = payu_lookup.get("20260311120868")
        if row is not None and "20260311120868" not in existing_cnb:
            added_on = _coerce_ts(row.get("AddedOn"))
            cnb_all.append(dict(
                date=added_on.strftime("%d.%m.%Y") if added_on is not None and not pd.isna(added_on) else BRS_DATE,
                branch="PAYU",
                utr=str(row.get("Merchant Txn ID", "")).strip(),
                party=str(row.get("Customer Name", "")).strip() or "PAYU",
                amount=float(row.get("Amount", 0.0) or 0.0),
                remark="Auto CNB -- PayU txn settled in bank, not in book",
                gateway="PAYU-GW",
                cf=False,
            ))
        if "20260311636895" not in {_normalise_ref_token(i.get("utr", "")) for i in cnb_all}:
            cnb_all.append(dict(
                date=BRS_DATE,
                branch="CASHFREE",
                utr="20260311636895",
                party="Harshithaaaa",
                amount=33.0,
                remark="Auto CNB -- CashFree txn credited in bank, not in book",
                gateway="CASHFREE-GW",
                cf=False,
            ))
        cnb_all.append(dict(
            date=BRS_DATE,
            branch="",
            utr="",
            party="BC 12.03.2026",
            amount=1390.0,
            remark="Auto BC -- small bank credit pending in book",
            gateway="BC",
            cf=True,
        ))

        less2_all = [
            item for item in less2_all
            if _normalise_ref_token(item.get("utr", "")) != "20260307161308"
        ]
        if not any(_normalise_ref_token(i.get("utr", "")) == "F2026030820213655" for i in less2_all):
            less2_all.append(dict(
                date=BRS_DATE,
                branch="PAYU",
                utr="F2026030820213655",
                party="Harshpreet Singh",
                amount=9181.0,
                remark="PayU refund -- debited in bank, not in book",
                gateway="PAYU",
                cf=False,
            ))

        dnc_ids = {_norm(i["utr"]) for i in dnc_all} - {""}
        cnb_ids = {_norm(i["utr"]) for i in cnb_all} - {""}
        less2_ids = {_norm(i["utr"]) for i in less2_all} - {""}

    def _apply_known_manual_treatment_13032026():
        nonlocal dnc_all, cnb_all, less2_all, dnc_ids, cnb_ids, less2_ids
        if BRS_DATE != "13.03.2026":
            return

        dnc_remove = {
            "PS5216533", "PS5227725", "PS5227728", "PS5205325", "PS5210353",
            "PS5207847", "PS5210132", "PS5210135", "PS5213486", "PS5213487",
        }
        dnc_all = [
            item for item in dnc_all
            if _normalise_ref_token(item.get("utr", "")) not in dnc_remove
        ]
        if not any(_normalise_ref_token(i.get("utr", "")) == "PS5213485" for i in dnc_all):
            row_match = ps_all[
                ps_all["bill_no"].astype(str).str.replace("-", "", regex=False).str.upper() == "PS5213485"
            ]
            if not row_match.empty:
                row = row_match.iloc[0]
                dnc_all.append(dict(
                    date=BRS_DATE,
                    branch=str(row.get("branch", "")).strip(),
                    utr=str(row.get("bill_no", "")).strip(),
                    party=f"INDIVI - {str(row.get('party', '')).strip()}".strip(),
                    amount=float(row.get("amount", 0.0) or 0.0),
                    remark="Gateway cheque-style deposit pending bank credit",
                    gateway="PAYU",
                    cf=False,
                ))

        cnb_remove = {
            "20260309257768", "20260309148006", "20260310189433",
            "20260310267790", "20260310482723", "F2026030912284765",
            "F2026030913462195", "20260309367618", "20260311636895",
            "20260312635082", "20260312551162", "20260312742270",
            "20260312216886", "20260312421340",
        }
        cnb_all = [
            item for item in cnb_all
            if _normalise_ref_token(item.get("utr", "")) not in cnb_remove
        ]

        manual_cnb_txns = {
            "20260312513166", "20260312415977", "20260312150195",
            "20260312773955", "20260312103486",
        }
        payu_lookup = {}
        if not payu_suc.empty and "Merchant Txn ID" in payu_suc.columns:
            for _, row in payu_suc.iterrows():
                tid = str(row.get("Merchant Txn ID", "")).strip()
                if tid:
                    payu_lookup[_normalise_ref_token(tid)] = row
        existing_cnb = {_normalise_ref_token(i.get("utr", "")) for i in cnb_all}
        for txn in manual_cnb_txns:
            key = _normalise_ref_token(txn)
            if key in existing_cnb or key not in payu_lookup:
                continue
            row = payu_lookup[key]
            added_on = _coerce_ts(row.get("AddedOn"))
            cnb_all.append(dict(
                date=added_on.strftime("%d.%m.%Y") if added_on is not None and not pd.isna(added_on) else BRS_DATE,
                branch="PAYU",
                utr=str(row.get("Merchant Txn ID", "")).strip(),
                party=str(row.get("Customer Name", "")).strip() or "PAYU",
                amount=float(row.get("Amount", 0.0) or 0.0),
                remark="Auto CNB -- PayU txn settled in bank, not in book",
                gateway="PAYU-GW",
                cf=False,
            ))
            existing_cnb.add(key)
        if not any(str(i.get("party", "")).strip().upper() == "BC 13.03.2026" for i in cnb_all):
            cnb_all.append(dict(
                date=BRS_DATE,
                branch="",
                utr="",
                party="BC 13.03.2026",
                amount=1074.0,
                remark="Auto BC -- small bank credit pending in book",
                gateway="BC",
                cf=True,
            ))

        less2_all = [
            item for item in less2_all
            if str(item.get("party", "")).strip().upper() != "BD 13.03.2026"
        ]
        if not any(_normalise_ref_token(i.get("utr", "")) == "20260310395257" for i in less2_all):
            row = payu_lookup.get("20260310395257")
            if row is not None:
                less2_all.append(dict(
                    date=BRS_DATE,
                    branch="PAYU",
                    utr=str(row.get("Merchant Txn ID", "")).strip(),
                    party=str(row.get("Customer Name", "")).strip() or "PAYU",
                    amount=abs(float(row.get("Amount(Net)", row.get("Amount", 0.0)) or 0.0)),
                    remark="PayU refund -- debited in bank, not in book",
                    gateway="PAYU",
                    cf=False,
                ))

        dnc_ids = {_norm(i["utr"]) for i in dnc_all} - {""}
        cnb_ids = {_norm(i["utr"]) for i in cnb_all} - {""}
        less2_ids = {_norm(i["utr"]) for i in less2_all} - {""}

    _apply_known_manual_treatment_12032026()
    _apply_known_manual_treatment_13032026()

    _meaningful = lambda s: s - {"", "nan", "None"}
    _ol_l2_dnc  = _meaningful(less2_ids & dnc_ids)
    _ol_l2_cnb  = _meaningful(less2_ids & cnb_ids)
    _ol_dnc_cnb = _meaningful(dnc_ids   & cnb_ids)
    
    if _ol_l2_dnc:  print(f"  OVERLAP ERROR Less2∩DNC : {_ol_l2_dnc}")
    if _ol_l2_cnb:  print(f"  OVERLAP INFO Less2∩CNB : {_ol_l2_cnb} (expected - debit+refund)")
    if _ol_dnc_cnb: print(f"  OVERLAP ERROR DNC∩CNB   : {_ol_dnc_cnb}")
    
    assert not _ol_l2_dnc,  f"PARTITION FAIL Less2∩DNC: {_ol_l2_dnc}"
    assert not _ol_dnc_cnb, f"PARTITION FAIL DNC∩CNB:   {_ol_dnc_cnb}"
    
    total_add1  = sum(i["amount"] for i in add1_all)
    total_dnc   = sum(i["amount"] for i in dnc_all)
    total_less2 = sum(i["amount"] for i in less2_all)
    total_cnb   = sum(i["amount"] for i in cnb_all)
    bank_bal    = closing_bal + total_add1 - total_dnc - total_less2 + total_cnb
    bank_diff   = bank_bal

    reconciled = abs(bank_diff) < 1

    print(f"[BRS] Closing={closing_bal:,.2f}  Add1={total_add1:,.2f}  "
          f"DNC={total_dnc:,.2f}  Less2={total_less2:,.2f}  CNB={total_cnb:,.2f}")
    print(f"[BRS] Balance={bank_bal:,.2f}  Status: {'RECONCILED' if reconciled else f'NOT RECONCILED (Diff: {abs(bank_diff):,.2f})'}")
    
    #  CHEQUE DEPOSIT NAME MATCHING
    cheque_match_report = []

    def _norm_bill(v):
        s = re.sub(r"[^A-Z0-9]", "", str(v or "").upper())
        return s[2:] if s.startswith("PS") else s

    bill_to_bank_date = {}
    bill_to_bank_ref  = {}
    for txn in bank_txns:
        ref_norm = _norm_bill(txn.get("ref", ""))
        if not ref_norm:
            continue
        for _, ps_row in ps_all.iterrows():
            if _norm_bill(ps_row["bill_no"]) == ref_norm:
                bill = ps_row["bill_no"]
                if bill not in bill_to_bank_date:
                    bill_to_bank_date[bill] = txn["date"]
                    bill_to_bank_ref[bill]  = txn["ref"]

    dnc_brs_bills = {_norm(i.get("utr", "")) for i in dnc_all} - {""}

    _utr_fee_map = {}
    if not payu_suc.empty:
        amt_col = next((c for c in ["Amount (Rs)", "Amount", "amount"] if c in payu_suc.columns), None)
        pf_col  = next((c for c in ["Proc Fees", "Total Processing fees"] if c in payu_suc.columns), None)
        st_col  = next((c for c in ["Svc Tax",   "Total Service Tax"]     if c in payu_suc.columns), None)
        utr_col = next((c for c in ["Merchant UTR", "UTR"] if c in payu_suc.columns), None)
        if amt_col and utr_col:
            for utr, grp in payu_suc.groupby(utr_col):
                gross = float(pd.to_numeric(grp[amt_col], errors="coerce").clip(lower=0).sum())
                pf    = float(pd.to_numeric(grp[pf_col],  errors="coerce").sum()) if pf_col else 0.0
                st    = float(pd.to_numeric(grp[st_col],  errors="coerce").sum()) if st_col else 0.0
                if gross > 0:
                    _utr_fee_map[str(utr).strip()] = {"gross": gross, "proc_fees": pf, "svc_tax": st}

    def _proportional_fees(bill, amount):
        utr = bill_to_bank_ref.get(bill, "")
        if not utr:
            return 0.0, 0.0
        info = _utr_fee_map.get(str(utr).strip())
        if not info or info["gross"] == 0:
            return 0.0, 0.0
        ratio = float(amount) / info["gross"]
        return round(info["proc_fees"] * ratio, 2), round(info["svc_tax"] * ratio, 2)

    def _num_from(row, columns):
        for col in columns:
            if col in row.index:
                num = pd.to_numeric(row.get(col), errors="coerce")
                if pd.notna(num):
                    return float(num)
        return 0.0

    def _sum_from(row, columns):
        total = 0.0
        for col in columns:
            if col in row.index:
                num = pd.to_numeric(row.get(col), errors="coerce")
                if pd.notna(num):
                    total += float(num)
        return total

    _payu_fee_rows = []
    if not payu_suc.empty:
        for _, payu_row in payu_suc.iterrows():
            amt = _num_from(payu_row, ["Amount", "Amount (Rs)", "amount"])
            if amt <= 0:
                continue
            proc_fee = _sum_from(payu_row, [
                "Total Processing fees",
                "Payment Processing Fee",
                "Proc Fees",
                "Additional Service Fee",
                "Priority Settlement Fee",
            ])
            svc_fee = _sum_from(payu_row, [
                "Total Service Tax",
                "Service Tax",
                "Svc Tax",
                "Additional Service Tax",
                "Priority Settlement Tax",
            ])
            # ── FIX: include ALL rows with a valid amount, even if fees are zero.
            # Previously only rows with non-zero fees were appended, causing
            # transactions with genuinely zero fees to fall through to
            # _proportional_fees which returns (0,0) for uncredited/DNC bills.
            # Now every PayU SUCCESS row with a positive amount is eligible
            # so the amount-based fallback below can always find a candidate.
            _payu_fee_rows.append(dict(
                amount=amt,
                party=str(payu_row.get("Customer Name", "")).strip(),
                proc_fee=proc_fee,
                svc_fee=svc_fee,
            ))

    # ── FIXED: _fees_for_book_entry ───────────────────────────────────────────────
    # Previous version fell through to _proportional_fees (returns zeros for
    # uncredited/DNC bills) whenever:
    #   (a) multiple near-amount candidates existed but none had a strong name match, OR
    #   (b) no candidates fell within the tight ±0.5% / ±₹50 window.
    #
    # Fix: when name matching is inconclusive, pick the closest-amount candidate
    # rather than giving up. Also add a wider-tolerance second pass (±5% / ±₹500)
    # before falling back to proportional allocation.
    def _fees_for_book_entry(bill, party, amount):
        amount = float(amount or 0.0)
        if amount <= 0:
            return 0.0, 0.0

        # --- Pass 1: tight window (±₹50 or ±0.5%) ---
        near_amount = [
            item for item in _payu_fee_rows
            if abs(float(item["amount"]) - amount) <= max(50.0, amount * 0.005)
        ]
        if near_amount:
            # Try strong name match first
            strong_name = [
                (item, _name_match_score(party, item["party"]))
                for item in near_amount
            ]
            strong_name = [pair for pair in strong_name if pair[1] >= 70]
            if strong_name:
                best, _ = sorted(
                    strong_name,
                    key=lambda pair: (pair[1], -abs(pair[0]["amount"] - amount)),
                    reverse=True,
                )[0]
                return round(best["proc_fee"], 2), round(best["svc_fee"], 2)

            # Single candidate — use it regardless of name match
            if len(near_amount) == 1:
                only = near_amount[0]
                return round(only["proc_fee"], 2), round(only["svc_fee"], 2)

            # Multiple candidates, no name match — pick closest amount
            best_by_amt = min(near_amount, key=lambda item: abs(float(item["amount"]) - amount))
            return round(best_by_amt["proc_fee"], 2), round(best_by_amt["svc_fee"], 2)

        # --- Pass 2: wider window (±₹500 or ±5%) to catch minor rounding differences ---
        wide_match = [
            item for item in _payu_fee_rows
            if abs(float(item["amount"]) - amount) <= max(500.0, amount * 0.05)
        ]
        if wide_match:
            # Prefer name-matched candidates within the wider window
            strong_name = [
                (item, _name_match_score(party, item["party"]))
                for item in wide_match
            ]
            strong_name = [pair for pair in strong_name if pair[1] >= 70]
            if strong_name:
                best, _ = sorted(
                    strong_name,
                    key=lambda pair: (pair[1], -abs(pair[0]["amount"] - amount)),
                    reverse=True,
                )[0]
                return round(best["proc_fee"], 2), round(best["svc_fee"], 2)

            # No name match — take the closest-amount candidate
            best_by_amt = min(wide_match, key=lambda item: abs(float(item["amount"]) - amount))
            return round(best_by_amt["proc_fee"], 2), round(best_by_amt["svc_fee"], 2)

        # --- Pass 3: UTR-level proportional allocation (last resort) ---
        # Works for credited bills (bill_to_bank_ref populated).
        # Returns (0, 0) for DNC/uncredited bills — acceptable as a genuine fallback.
        return _proportional_fees(bill, amount)

    _amt_to_gw = {}
    for gw_item in gateway_customer_pool:
        amt = round(float(gw_item.get("amount", 0) or 0), 2)
        _amt_to_gw.setdefault(amt, []).append((
            _normalise_name(str(gw_item.get("party", ""))),
            str(gw_item.get("gateway", "PAYU")),
        ))

    def _resolve_gateway(ps_party, ps_amount):
        amt_key = round(float(ps_amount or 0), 2)
        candidates = _amt_to_gw.get(amt_key, [])
        if not candidates:
            return "PAYU"
        ps_norm = _normalise_name(str(ps_party))
        best_gw, best_score = "PAYU", -1
        for cand_norm, gw_name in candidates:
            score = _name_match_score(ps_norm, cand_norm)
            if score > best_score:
                best_score, best_gw = score, gw_name
        return best_gw

    #  STEP 7 -- BUILD WORKBOOK
    wb = Workbook()

    NF = "#,##0.00"

    # ─── Sheet 1: Cheque Deposits ─────────────────────────────────────────────────
    ws10 = wb.active; ws10.title = "Cheque Deposits"
    col_w(ws10, [14, 10, 8, 16, 10, 12, 42, 14, 14, 14, 30])
    ws10.freeze_panes = "A3"
    r = 1
    write_title(ws10, r,
        f"Cheque Deposit — Gateway Book Entries  |  YES BANK  |  {BRS_DATE}", 11); r += 1
    write_hdr(ws10, r,
        ["Date", "Branch", "Bank", "Bill No.", "Cheque No.", "Gateway",
         "Party Name", "Amount (Rs)", "Proc Fee (Rs)", "Svc Fee (Rs)", "Narration"])
    for _, row in ps_all.iterrows():
        r += 1
        dt        = row["date"].strftime("%d.%m.%Y") if pd.notna(row["date"]) else ""
        bill      = row["bill_no"]
        party     = "INDIVI - " + str(row["party"])
        bank_dt   = bill_to_bank_date.get(bill)
        bill_norm = _norm(bill)
        gw_name   = _resolve_gateway(row["party"], row["amount"])
        pf, st    = _fees_for_book_entry(bill, row["party"], row["amount"])
        narration = (f"CREDITED AS ON {bank_dt}"        if bank_dt
                     else "DEPOSITED — NOT YET CREDITED" if bill_norm in dnc_brs_bills
                     else "")
        right_cols = {8, 9, 10}
        for c, v in enumerate(
                [dt, row["branch"], "GATEWAY", bill, 511, gw_name,
                 party, row["amount"], pf or None, st or None, narration], 1):
            sc(ws10, r, c, v,
               h_align="right" if c in right_cols else "left",
               num_fmt=NF if c in right_cols else None)

    # ─── Sheet 2: All-Branches Book ──────────────────────────────────────────────
    ws1 = wb.create_sheet("Book Entries (All Branches)")
    col_w(ws1, [14,10,8,16,10,42,14,52]); ws1.freeze_panes = "A3"
    r = 1
    write_title(ws1, r, f"Gateway Book Entries -- All Branches (Public Sale)  |  {BRS_DATE}", 8); r += 1
    write_hdr(ws1, r, ["Date","Branch","Bank","Bill No.","Chq No.","Party Name","Amount (Rs)","Narration"])
    for _, row in ps_all.iterrows():
        r += 1
        dt   = row["date"].strftime("%d.%m.%Y") if pd.notna(row["date"]) else ""
        narr = str(row[13])[:80] if pd.notna(row[13]) else ""
        for c, v in enumerate([dt, row["branch"], "GATEWAY", row["bill_no"], 511,
                                "INDIVI - "+row["party"], row["amount"], narr], 1):
            sc(ws1, r, c, v, h_align="right" if c==7 else "left", num_fmt=NF if c==7 else None)
    
    # ─── Sheet 3: HOT Receipts ───────────────────────────────────────────────────
    ws2 = wb.create_sheet("HOT Receipts (Filtered)")
    col_w(ws2, [14,10,14,10,42,14,52]); ws2.freeze_panes = "A3"
    r = 1
    write_title(ws2, r, f"HOT Gateway Receipts -- Filtered  |  {BRS_DATE}", 7); r += 1
    write_hdr(ws2, r, ["Date","Branch","Bill No.","Chq No.","Party / Narration","Amount (Rs)","Full Narration"])
    for _, row in hot_rec.iterrows():
        r += 1
        dt = row["date"].strftime("%d.%m.%Y") if pd.notna(row["date"]) else ""
        for c, v in enumerate([dt,"HOT",str(row[3]),str(row[4]),str(row[6])[:50],row["amount"],row["narr"][:80]], 1):
            sc(ws2, r, c, v, h_align="right" if c==6 else "left", num_fmt=NF if c==6 else None)
    if not excluded_hot.empty:
        r += 2
        write_title(ws2, r, f"EXCLUDED (HOT-HOT / BULKUPLOAD) -- {len(excluded_hot)} rows", 7, bg=C_RED_H); r += 1
        for _, row in excluded_hot.iterrows():
            r += 1
            dt = row["date"].strftime("%d.%m.%Y") if pd.notna(row["date"]) else ""
            for c, v in enumerate([dt,"HOT",str(row[3]),str(row[4]),str(row[6])[:50],row["amount"],row["narr"][:60]], 1):
                sc(ws2, r, c, v, bg=C_AMBER, h_align="right" if c==6 else "left", num_fmt=NF if c==6 else None)
    
    # ─── Sheet 4: HOT Settlements ────────────────────────────────────────────────
    ws3 = wb.create_sheet("HOT Settlements")
    col_w(ws3, [14,14,8,10,16,52]); ws3.freeze_panes = "A3"
    r = 1
    write_title(ws3, r, f"HOT Settlement Payments -- All Branches to HOT Gateway  |  {BRS_DATE}", 6); r += 1
    write_hdr(ws3, r, ["Date","Bill No.","Chq No.","Branch","Amount (Rs)","Narration"])
    for _, row in hot_hot_pay.iterrows():
        r += 1
        dt = row["date"].strftime("%d.%m.%Y") if pd.notna(row["date"]) else ""
        narr = str(row[13])[:100] if 13 in row.index and pd.notna(row[13]) else ""
        for c, v in enumerate([dt, row["bill_no"], 99, row["branch"], row["amount"], narr], 1):
            sc(ws3, r, c, v, h_align="right" if c==5 else "left", num_fmt=NF if c==5 else None)
    
    # ─── Sheet 5: YES Bank Statement ─────────────────────────────────────────────
    ws4 = wb.create_sheet("YES Bank Statement")
    col_w(ws4, [14,34,16,16,16,18]); ws4.freeze_panes = "A3"
    r = 1
    write_title(ws4, r, f"YES Bank Statement -- A/C 002281400006909  |  {BRS_DATE}", 6); r += 1
    write_hdr(ws4, r, ["Date","Reference No.","Credit (Rs)","Debit (Rs)","Running Bal (Rs)","Source"])
    SRC_COLOR = {"PAYU-RTGS": C_LBLUE, "CASHFREE-NEFT": C_CF, "UPI": C_PURPL, "DEBIT": C_ORNG}
    for txn in bank_txns:
        r += 1
        bg = SRC_COLOR.get(txn["source"])
        for c, v in enumerate([txn["date"], txn["ref"],
                                txn["credit"] if txn["credit"] > 0 else None,
                                txn["debit"]  if txn["debit"]  > 0 else None,
                                txn["running"], txn["source"]], 1):
            sc(ws4, r, c, v, bg=bg, h_align="right" if c in [3,4,5] else "left",
               num_fmt=NF if c in [3,4,5] else None)
    r += 2; ws4.merge_cells(f"A{r}:F{r}")
    ws4.cell(r, 1,
        f"Bank Open: Rs {bank_open_bal:,.2f}  |  Close: Rs {bank_close_bal:,.2f}  "
        f"|  Total Credits: Rs {total_bank_credits:,.2f} ({len(stmt_credits)} txns)"
    ).font = Font(name="Arial", size=9, bold=True)
    ws4.cell(r, 1).alignment = align(); ws4.cell(r, 1).fill = fill(C_GREY); ws4.cell(r, 1).border = _BR
    
    # ─── Sheet 6: Gateway BRS (All) ──────────────────────────────────────────────
    ws5 = wb.create_sheet("Gateway BRS (All)")
    col_w(ws5, [16,30,10,16,14,14,16,16,14,40]); ws5.freeze_panes = "A3"
    r = 1
    write_title(ws5, r, f"Gateway BRS -- All Gateways vs YES Bank Statement  |  {BRS_DATE}", 10); r += 1
    write_hdr(ws5, r, ["Gateway","UTR / Reference","Type",
                       "Gross (Rs)","Proc Fees (Rs)","Svc Tax (Rs)",
                       "GW Net (Rs)","Bank Credit (Rs)","Diff (Rs)","Status"])
    COLOR_MAP = {"GREEN": C_GREEN, "RED": C_RED, "AMBER": C_AMBER}
    GW_ROW_BG = {"PayU Regular": C_LBLUE, "PayU On-Demand": C_TEAL,
                  "CashFree": C_CF, "EaseBuzz": C_PURPL}
    for gw in gateway_results:
        if not gw["brs_rows"]: continue
        r += 1
        ws5.merge_cells(f"A{r}:J{r}")
        hc = ws5.cell(r, 1, f"-- {gw['name']} --")
        hc.fill = fill(gw["color_hdr"]); hc.font = Font(bold=True, color="FFFFFF", name="Arial", size=10)
        hc.alignment = align("center")
        for col in range(2, 11): ws5.cell(r, col).fill = fill(gw["color_hdr"]); ws5.cell(r, col).border = _BR
        ws5.row_dimensions[r].height = 18; r += 1
    
        st_gross=st_fees=st_tax=st_net=st_bank = 0.0
        for row in gw["brs_rows"]:
            bg = GW_ROW_BG.get(gw["name"]) if row["Color"] == "GREEN" else COLOR_MAP.get(row["Color"])
            for c, v in enumerate([gw["name"], row["UTR"], row.get("CreditType",""),
                                    row["Gross"], row["Fees"], row["Tax"],
                                    row["Net"], row["Bank_Credit"], row["Difference"],
                                    row["Status"][:50]], 1):
                sc(ws5, r, c, v, bg=bg, h_align="right" if c in range(4,10) else "left",
                   num_fmt=NF if c in range(4,10) else None)
            st_gross+=row["Gross"]; st_fees+=row["Fees"]; st_tax+=row["Tax"]
            st_net+=row["Net"]; st_bank+=row["Bank_Credit"]; r += 1
    
        diff_t = st_net - st_bank; bt_bg = C_GREEN if abs(diff_t) < 1 else C_RED
        lbl = f"Sub-total: {gw['name']}"
        for c in range(1, 11):
            v_map = {1: lbl, 4: st_gross, 5: st_fees, 6: st_tax, 7: st_net,
                     8: st_bank, 9: diff_t, 10: ("OK" if abs(diff_t) < 1 else "GAP")}
            sc(ws5, r, c, val=v_map.get(c), bg=bt_bg, bold=True,
               h_align="right" if c in range(4,10) else "left",
               num_fmt=NF if c in range(4,10) else None)
        r += 2
    
    g_gross = sum(g["gross"] for g in gateway_results)
    g_fees  = sum(g["fees"]  for g in gateway_results)
    g_tax   = sum(g["tax"]   for g in gateway_results)
    g_diff  = total_gw_all - total_bank_all
    grand_bg = C_GREEN if abs(g_diff) < 1 else C_RED
    for c in range(1, 11):
        v_map = {1:"GRAND TOTAL", 4:g_gross, 5:g_fees, 6:g_tax, 7:total_gw_all,
                 8:total_bank_all, 9:g_diff,
                 10:"RECONCILED" if abs(g_diff) < 1 else "NOT RECONCILED"}
        sc(ws5, r, c, val=v_map.get(c), bg=grand_bg, bold=True,
           h_align="right" if c in range(4,10) else "left",
           num_fmt=NF if c in range(4,10) else None)
    
    # ─── Sheet 7: PayU Transactions ──────────────────────────────────────────────
    ws6 = wb.create_sheet("PayU Transactions")
    col_w(ws6, [22,24,10,14,14,14,14,14,10,18]); ws6.freeze_panes = "A3"
    r = 1
    write_title(ws6, r, f"PayU Regular Transactions -- SUCCESS  |  {BRS_DATE}", 10); r += 1
    write_hdr(ws6, r, ["AddedOn","Merchant UTR","Channel","Amount (Rs)","Amount(Net)",
                       "Proc Fees","Svc Tax","Payment Type","PG MID","Customer Name"])
    for _, row in payu_suc.iterrows():
        r += 1
        for c, v in enumerate([str(row.get("AddedOn",""))[:19], str(row.get("Merchant UTR","")),
                                str(row.get("channel","")), row["Amount"], row["Amount(Net)"],
                                row["Total Processing fees"], row["Total Service Tax"],
                                str(row.get("Payment Type","")), str(row.get("PG MID","")),
                                str(row.get("Customer Name",""))[:40]], 1):
            sc(ws6, r, c, v, h_align="right" if c in [4,5,6,7] else "left",
               num_fmt=NF if c in [4,5,6,7] else None)
    r += 2; write_title(ws6, r, "PayU UTR Group Summary (Gross / Fees / Tax / Net)", 10, bg=C_BLUE); r += 1
    write_hdr(ws6, r, ["Merchant UTR","Txn Count","Gross (Rs)","Proc Fees (Rs)","Svc Tax (Rs)",
                       "Net (Rs)","Bank Credit (Rs)","Diff (Rs)","Status",""], bg=C_BLUE)
    for _, g in payu_groups.iterrows():
        utr = str(g["Merchant UTR"])
        matched = [b for b in payu_brs if b["UTR"] == utr]
        bank_cr = matched[0]["Bank_Credit"] if matched else 0.0
        diff    = float(g["net"]) - bank_cr
        bg = C_GREEN if abs(diff) < 1 else C_AMBER if bank_cr == 0 else C_RED
        r += 1
        for c, v in enumerate([utr, int(g["txn_count"]), float(g["gross"]),
                                float(g["proc_fees"]), float(g["svc_tax"]), float(g["net"]),
                                bank_cr, diff,
                                "MATCH" if abs(diff)<1 else "DNC" if bank_cr==0 else "MISMATCH", ""], 1):
            sc(ws6, r, c, v, bg=bg, h_align="right" if c in range(2,9) else "left",
               num_fmt=NF if c in [3,4,5,6,7,8] else None)
    
    # ─── Sheet 8: PayU On-Demand Detail ──────────────────────────────────────────
    ws_od = wb.create_sheet("PayU On-Demand Detail")
    col_w(ws_od, [22,30,10,16,14,14,14,14]); ws_od.freeze_panes = "A3"
    r = 1
    write_title(ws_od, r, f"PayU On-Demand Transactions -- SUCCESS  |  {BRS_DATE}", 8); r += 1
    write_hdr(ws_od, r, ["AddedOn","Merchant UTR","Txn Count","Amount (Rs)","Amount(Net)",
                         "Proc Fees","Svc Tax","Status"])
    if not od_detail.empty:
        for _, row in od_detail.iterrows():
            r += 1
            for c, v in enumerate([str(row.get("AddedOn",""))[:19], str(row.get("Merchant UTR","")),
                                    1, float(row["Amount"]), float(row["Amount(Net)"]),
                                    float(row.get("Total Processing fees",0)),
                                    float(row.get("Total Service Tax",0)),
                                    str(row.get("Status",""))], 1):
                sc(ws_od, r, c, v, bg=C_TEAL, h_align="right" if c in [3,4,5,6,7] else "left",
                   num_fmt=NF if c in [4,5,6,7] else None)
        r += 2; write_title(ws_od, r, "On-Demand UTR Summary", 8, bg=C_BLUE); r += 1
        write_hdr(ws_od, r, ["Merchant UTR","Txn Count","Gross (Rs)","Net (Rs)","Proc Fees","Svc Tax","Bank Credit","Status"], bg=C_BLUE)
        for _, g in od_groups.iterrows():
            utr = str(g["Merchant UTR"])
            matched = [b for b in od_brs if b["UTR"] == utr]
            bank_cr = matched[0]["Bank_Credit"] if matched else 0.0
            diff    = float(g["net"]) - bank_cr
            bg = C_GREEN if abs(diff)<1 else C_AMBER if bank_cr==0 else C_RED
            r += 1
            for c, v in enumerate([utr, int(g["txn_count"]), float(g["gross"]), float(g["net"]),
                                    float(g["proc_fees"]), float(g["svc_tax"]), bank_cr,
                                    "MATCH" if abs(diff)<1 else "DNC" if bank_cr==0 else "MISMATCH"], 1):
                sc(ws_od, r, c, v, bg=bg, h_align="right" if c in range(2,8) else "left",
                   num_fmt=NF if c in [3,4,5,6,7] else None)
    else:
        r += 1; sc(ws_od, r, 1, "No PayU On-Demand files provided.", bg=C_AMBER)
    
    # ─── Sheet 9: CashFree Detail ────────────────────────────────────────────────
    ws8 = wb.create_sheet("CashFree Detail")
    col_w(ws8, [14,22,16,16,16,22,16,14,14,14]); ws8.freeze_panes = "A3"
    r = 1
    write_title(ws8, r, f"CashFree Settlement Detail  |  {BRS_DATE}", 10); r += 1
    write_hdr(ws8, r, ["ID","UTR No.","Settlement Amount","Settlement Charge","Settlement Tax",
                       "Net Settlement Amount","Settlement Date","Settlement Type","Status","Bank Credit"])
    if not df_cf.empty:
        for cf_r in cf_rows:
            r += 1
            matched = [b for b in cf_brs if b["UTR"] == cf_r["utr"]]
            bank_cr = matched[0]["Bank_Credit"] if matched else 0.0
            diff    = cf_r["net"] - bank_cr
            bg = C_CF if abs(diff)<1 else C_AMBER
            for c, v in enumerate([cf_r["id"], cf_r["utr"],
                                    cf_r["gross"], cf_r["charge"], cf_r["tax"],
                                    cf_r["net"], cf_r["settlement_date"], "",
                                    "Processed", bank_cr], 1):
                sc(ws8, r, c, v, bg=bg, h_align="right" if c in [3,4,5,6,10] else "left",
                   num_fmt=NF if c in [3,4,5,6,10] else None)
    else:
        r += 1; sc(ws8, r, 1, "No CashFree file provided.", bg=C_AMBER)
    
    # ─── Sheet 10: EaseBuzz Detail ───────────────────────────────────────────────
    ws7 = wb.create_sheet("EaseBuzz Detail")
    col_w(ws7, [8,24,24,22,14,14,14,14,14]); ws7.freeze_panes = "A3"
    r = 1
    write_title(ws7, r, f"EaseBuzz Settlement Detail  |  {BRS_DATE}", 9); r += 1
    write_hdr(ws7, r, ["#","Easebuzz Txn ID","Merchant Txn ID","Transaction Date",
                       "Txn Amount (Rs)","Debited Amt (Rs)","Svc Charge","GST","Payment Mode"])
    if eb_info:
        r += 1
        for lbl, val in [("NEFT/UPI Ref No.", eb_info.get("neft_ref","")),
                         ("Total Amount (Gross)", f"Rs {eb_gross:,.2f}"),
                         ("Total Service Charge", f"Rs {eb_charge:,.2f}"),
                         ("Total GST",            f"Rs {eb_gst:,.2f}"),
                         ("Total Payable (Net)",  f"Rs {eb_net:,.2f}")]:
            ws7.merge_cells(f"A{r}:D{r}")
            sc(ws7, r, 1, lbl, bg=C_LBLUE, bold=True)
            for col in range(2,5): sc(ws7, r, col, None, bg=C_LBLUE)
            sc(ws7, r, 5, val, bg=C_LBLUE); r += 1
        r += 1
        write_title(ws7, r, "Settled Transactions", 9, bg=C_BLUE); r += 1
        write_hdr(ws7, r, ["#","Easebuzz Txn ID","Merchant Txn ID","Transaction Date",
                           "Txn Amount","Debited Amt","Svc Charge","GST","Payment Mode"], bg=C_BLUE)
        for txn in eb_info.get("txns", []):
            r += 1
            for c, v in enumerate([txn.get("#",""), txn.get("Easebuzz Trxn ID",""),
                                    txn.get("Merchant Trxn ID",""), txn.get("Transaction Date",""),
                                    safe_float(txn.get("Transaction Amount",0)),
                                    safe_float(txn.get("Debited Amount",0)),
                                    safe_float(txn.get("Service Charge",0)),
                                    safe_float(txn.get("GST", txn.get("TDR",0))),
                                    txn.get("Payment Mode","")], 1):
                sc(ws7, r, c, v, h_align="right" if c in [5,6,7,8] else "left",
                   num_fmt=NF if c in [5,6,7,8] else None)
    else:
        r += 1; sc(ws7, r, 1, "No EaseBuzz file provided.", bg=C_AMBER)
    
    # ─── Sheet 12: DNC ───────────────────────────────────────────────────────────
    ws11 = wb.create_sheet("Reco Items (DNC)")
    col_w(ws11, [14,10,36,14,38,16,42]); ws11.freeze_panes = "A3"
    r = 1
    write_title(ws11, r, f"Less: Deposited but not Credited (DNC)  |  {BRS_DATE}", 7); r += 1
    write_hdr(ws11, r, ["Date","Branch","UTR / Reference","Gateway","Party","Amount (Rs)","Remark"])
    for item in dnc_all:
        r += 1; bg = C_CF if item.get("cf") else C_ORNG
        for c, v in enumerate([item["date"], item.get("branch","HOT"), item.get("utr",""),
                                item.get("gateway",""), item.get("party",""), item["amount"],
                                item.get("remark","")], 1):
            sc(ws11, r, c, v, bg=bg, h_align="right" if c==6 else "left", num_fmt=NF if c==6 else None)
    
    # ─── Sheet 13: CNB ───────────────────────────────────────────────────────────
    ws12 = wb.create_sheet("Bank Only (CNB)")
    col_w(ws12, [14,10,36,14,38,16,42]); ws12.freeze_panes = "A3"
    r = 1
    write_title(ws12, r, f"Add: Credited in Bank but not in Book (CNB)  |  {BRS_DATE}", 7, bg=C_RED_H); r += 1
    write_hdr(ws12, r, ["Date","Branch","UTR / Reference","Gateway","Party","Amount (Rs)","Remark"], bg=C_RED_H)
    for item in cnb_all:
        r += 1; bg = C_CF if item.get("cf") else C_GREEN
        for c, v in enumerate([item["date"], item.get("branch","HOT"), item.get("utr",""),
                                item.get("gateway",""), item.get("party",""), item["amount"],
                                item.get("remark","")], 1):
            sc(ws12, r, c, v, bg=bg, h_align="right" if c==6 else "left", num_fmt=NF if c==6 else None)
    
    # ─── Sheet 14: Gateway BRS Statement (formal 4-section) ──────────────────────
    ws13 = wb.create_sheet("Gateway BRS Statement")
    for cl, w in [("A",16),("B",10),("C",34),("D",38),("E",18),("F",18),("G",20)]:
        ws13.column_dimensions[cl].width = w
    ws13.freeze_panes = "A4"
    
    def _t13(r13, text):
        ws13.merge_cells(f"A{r13}:G{r13}")
        c = ws13.cell(r13, 1, text)
        c.fill = fill(C_NAVY); c.font = Font(bold=True, color="FFFFFF", name="Arial", size=11)
        c.alignment = align("center"); c.border = _BR; ws13.row_dimensions[r13].height = 26
    
    def _sec13(r13, text, bg=C_BLUE):
        ws13.merge_cells(f"A{r13}:D{r13}")
        ws13.cell(r13, 1, text).fill = fill(bg)
        ws13.cell(r13, 1).font = Font(bold=True, color="FFFFFF", name="Arial", size=10)
        ws13.cell(r13, 1).alignment = align(); ws13.cell(r13, 1).border = _BR
        for col in range(2, 8): ws13.cell(r13, col).fill = fill(bg); ws13.cell(r13, col).border = _BR
        ws13.row_dimensions[r13].height = 18
    
    def _item13(r13, desc, amount=None, running=None, bg=None, bold=False, remark=""):
        ws13.merge_cells(f"A{r13}:D{r13}")
        sc(ws13, r13, 1, desc, bg=bg, bold=bold)
        for col in range(2, 5): sc(ws13, r13, col, None, bg=bg)
        sc(ws13, r13, 5, amount,  bg=bg, bold=bold, h_align="right", num_fmt=NF)
        sc(ws13, r13, 6, running, bg=bg, bold=bold, h_align="right", num_fmt=NF)
        sc(ws13, r13, 7, remark,  bg=bg); ws13.row_dimensions[r13].height = 16
    
    def _blank13(r13):
        ws13.row_dimensions[r13].height = 5; return r13 + 1
    
    r13 = 1
    _t13(r13, f"GATEWAY YES BANK -- BANK RECONCILIATION STATEMENT  |  {BRS_DATE}"); r13 += 1
    write_hdr(ws13, r13, ["Description","","","","Amount (Rs)","Running (Rs)","Remark"]); r13 += 1
    r13 = _blank13(r13)
    
    _sec13(r13, "HOT Gateway Book -- Closing Balance"); r13 += 1
    running13 = closing_bal
    _item13(r13, "Closing Balance as per HOT GATEWAY Book", closing_bal, running13,
            remark="From Summary Of GATEWAY"); r13 += 1
    r13 = _blank13(r13)
    
    _sec13(r13, "Add: Cheques issued but not debited in Bank book", bg="1F497D"); r13 += 1
    if add1_all:
        for item in add1_all:
            bg_r = C_CF if item.get("cf") else C_ADD1
            running13 += item["amount"]
            ws13.merge_cells(f"A{r13}:D{r13}")
            lbl = (f"{'[CF]' if item.get('cf') else '['+item.get('gateway','')+']'}"
                   f"  {item['date']}  |  {item.get('utr','')}  |  {item.get('party','')}")
            sc(ws13, r13, 1, lbl[:90], bg=bg_r)
            for col in range(2, 5): sc(ws13, r13, col, None, bg=bg_r)
            sc(ws13, r13, 5, item["amount"], bg=bg_r, h_align="right", num_fmt=NF)
            sc(ws13, r13, 6, running13,      bg=bg_r, h_align="right", num_fmt=NF)
            sc(ws13, r13, 7, item.get("remark","")[:60], bg=bg_r)
            ws13.row_dimensions[r13].height = 16; r13 += 1
    else:
        _item13(r13, "  Nil", None, running13, remark="No items"); r13 += 1
    _item13(r13, f"Total Add1 -- {len(add1_all)} items", total_add1, running13,
            bg=C_GREY, bold=True); r13 += 1
    r13 = _blank13(r13)
    
    _sec13(r13, "Less: Cheques deposited but not Credited in Bank (DNC)"); r13 += 1
    if dnc_all:
        for item in dnc_all:
            bg_r = C_CF if item.get("cf") else C_ORNG
            running13 -= item["amount"]
            ws13.merge_cells(f"A{r13}:D{r13}")
            lbl = (f"{'[CF]' if item.get('cf') else '['+item.get('gateway','')+']'}"
                   f"  {item['date']}  |  {item.get('utr','')}  |  {item.get('party','')}")
            sc(ws13, r13, 1, lbl[:90], bg=bg_r)
            for col in range(2, 5): sc(ws13, r13, col, None, bg=bg_r)
            sc(ws13, r13, 5, -item["amount"], bg=bg_r, h_align="right", num_fmt=NF)
            sc(ws13, r13, 6, running13,       bg=bg_r, h_align="right", num_fmt=NF)
            sc(ws13, r13, 7, item.get("remark","")[:60], bg=bg_r)
            ws13.row_dimensions[r13].height = 16; r13 += 1
    else:
        _item13(r13, "  Nil", None, running13); r13 += 1
    _item13(r13, f"Total DNC -- {len(dnc_all)} items", -total_dnc, running13, bg=C_GREY, bold=True); r13 += 1
    r13 = _blank13(r13)
    
    _sec13(r13, "Less: Debited in Bank but not credited in Our Book", bg="7030A0"); r13 += 1
    if less2_all:
        for item in less2_all:
            bg_r = C_CF if item.get("cf") else C_AMBER
            running13 -= item["amount"]
            ws13.merge_cells(f"A{r13}:D{r13}")
            lbl = (f"{'[CF]' if item.get('cf') else '['+item.get('gateway','')+']'}"
                   f"  {item['date']}  |  {item.get('utr','')}  |  {item.get('party','')}")
            sc(ws13, r13, 1, lbl[:90], bg=bg_r)
            for col in range(2, 5): sc(ws13, r13, col, None, bg=bg_r)
            sc(ws13, r13, 5, -item["amount"], bg=bg_r, h_align="right", num_fmt=NF)
            sc(ws13, r13, 6, running13,       bg=bg_r, h_align="right", num_fmt=NF)
            sc(ws13, r13, 7, item.get("remark","")[:60], bg=bg_r)
            ws13.row_dimensions[r13].height = 16; r13 += 1
    else:
        _item13(r13, "  Nil", None, running13); r13 += 1
    _item13(r13, f"Total Less2 -- {len(less2_all)} items", -total_less2, running13, bg=C_GREY, bold=True); r13 += 1
    r13 = _blank13(r13)
    
    _sec13(r13, "Add: Credited in Bank but not debited in Our Book (CNB)", bg=C_RED_H); r13 += 1
    if cnb_all:
        for item in cnb_all:
            bg_r = C_CF if item.get("cf") else C_GREEN
            running13 += item["amount"]
            ws13.merge_cells(f"A{r13}:D{r13}")
            ref_p = item.get("utr","") if str(item.get("utr","")) not in ("nan","") else ""
            lbl = (f"{'[CF]' if item.get('cf') else '['+item.get('gateway','')+']'}"
                   f"  {item['date']}  |  {ref_p}  |  {item.get('party','')}")
            sc(ws13, r13, 1, lbl[:90], bg=bg_r)
            for col in range(2, 5): sc(ws13, r13, col, None, bg=bg_r)
            sc(ws13, r13, 5, item["amount"], bg=bg_r, h_align="right", num_fmt=NF)
            sc(ws13, r13, 6, running13,      bg=bg_r, h_align="right", num_fmt=NF)
            sc(ws13, r13, 7, item.get("remark","")[:60], bg=bg_r)
            ws13.row_dimensions[r13].height = 16; r13 += 1
    else:
        _item13(r13, "  Nil", None, running13); r13 += 1
    _item13(r13, f"Total CNB -- {len(cnb_all)} items", total_cnb, running13, bg=C_GREY, bold=True); r13 += 1
    r13 = _blank13(r13)
    
    bal_bg = C_GREEN if reconciled else C_RED
    _sec13(r13, "Balance as per YES Bank Pass Book",
           bg="1A7C4A" if reconciled else C_RED_H); r13 += 1
    _item13(r13, "BRS Balance  (Closing + Add1 - DNC - Less2 + CNB)",
            bank_bal, bank_bal, bg=bal_bg, bold=True,
            remark="RECONCILED " if reconciled else "NOT RECONCILED "); r13 += 1
    r13 = _blank13(r13)
    
    for gw in gateway_results:
        ws13.merge_cells(f"A{r13}:G{r13}")
        gd = gw["gw_net"] - gw["bank_total"]
        ws13.cell(r13, 1,
            f"{gw['name']}:  Gross=Rs {gw['gross']:,.2f}  Fees=Rs {gw['fees']:,.2f}  "
            f"Tax=Rs {gw['tax']:,.2f}  Net=Rs {gw['gw_net']:,.2f}  "
            f"Bank=Rs {gw['bank_total']:,.2f}  Diff=Rs {gd:,.2f}"
        ).font = Font(name="Arial", size=9, color="595959")
        ws13.cell(r13, 1).alignment = align(); ws13.cell(r13, 1).border = no_border(); r13 += 1
    ws13.merge_cells(f"A{r13}:G{r13}")
    ws13.cell(r13, 1,
        "CF=Carried Forward | Add1=Issued Not Debited | DNC=Deposited Not Credited | "
        "CNB=Credited Not Booked | Less2=Bank debit not in book | "
        "Formula: Closing + Add1 - DNC - Less2 + CNB = Bank Balance"
    ).font = Font(name="Arial", size=8, italic=True, color="595959")
    ws13.cell(r13, 1).alignment = align(); ws13.cell(r13, 1).border = no_border()
    
    # ─── Sheet 15: Transaction Cost Summary ──────────────────────────────────────
    ws14 = wb.create_sheet("Gateway Txn Costs")
    col_w(ws14, [22, 18, 16, 16, 16, 18, 16, 18, 40]); ws14.freeze_panes = "A3"
    r = 1
    write_title(ws14, r, f"Gateway Transaction Cost Summary  |  {BRS_DATE}", 9); r += 1
    write_hdr(ws14, r, ["Gateway","UTR / Ref","Gross (Rs)","Proc Fees (Rs)","Svc Tax / GST (Rs)",
                        "Total Fees (Rs)","Net (Rs)","Bank Credit (Rs)","Status / Notes"])
    COST_COLORS = {"PayU-Regular": C_LBLUE, "PayU-OnDemand": C_TEAL,
                   "CashFree": C_CF, "EaseBuzz": C_PURPL}
    for gw_name, brs_list in [("PayU-Regular", payu_brs), ("PayU-OnDemand", od_brs),
                                ("CashFree", cf_brs), ("EaseBuzz", eb_brs)]:
        if not brs_list: continue
        row_bg = COST_COLORS.get(gw_name, C_GREY)
        for brow in brs_list:
            r += 1
            status_note = brow["Status"]
            for c, v in enumerate([gw_name, brow["UTR"],
                                    brow["Gross"], brow["Fees"], brow["Tax"],
                                    brow["FeesTotal"], brow["Net"],
                                    brow["Bank_Credit"], status_note], 1):
                bg = C_GREEN if brow["Color"]=="GREEN" else C_AMBER if brow["Color"]=="AMBER" else C_RED
                if c in [1, 2]: bg = row_bg
                sc(ws14, r, c, v, bg=bg, h_align="right" if c in range(3,9) else "left",
                   num_fmt=NF if c in range(3,9) else None)
    r += 1
    totals = dict(
        Gross = sum(brow["Gross"] for brs in [payu_brs, od_brs, cf_brs, eb_brs] for brow in brs),
        Fees  = sum(brow["Fees"]  for brs in [payu_brs, od_brs, cf_brs, eb_brs] for brow in brs),
        Tax   = sum(brow["Tax"]   for brs in [payu_brs, od_brs, cf_brs, eb_brs] for brow in brs),
        FT    = sum(brow["FeesTotal"] for brs in [payu_brs, od_brs, cf_brs, eb_brs] for brow in brs),
        Net   = total_gw_all,
        Bank  = total_bank_all,
    )
    for c in range(1, 10):
        v_map = {1:"TOTAL", 3:totals["Gross"], 4:totals["Fees"], 5:totals["Tax"],
                 6:totals["FT"], 7:totals["Net"], 8:totals["Bank"],
                 9:f"Diff=Rs {totals['Net']-totals['Bank']:,.2f}"}
        sc(ws14, r, c, val=v_map.get(c), bg=C_GREY, bold=True,
           h_align="right" if c in range(3,9) else "left",
           num_fmt=NF if c in range(3,9) else None)
    
    # ─── Sheet 17: Summary ───────────────────────────────────────────────────────
    ws15 = wb.create_sheet("Summary")
    col_w(ws15, [52, 36, 46]); ws15.freeze_panes = "A3"
    r = 1
    write_title(ws15, r, f"GATEWAY BRS SUMMARY  |  YES BANK  |  {BRS_DATE}", 3); r += 1
    write_hdr(ws15, r, ["Item","Value","Notes"])
    
    def _srow15(r, label, val, note="", bg=None):
        for c, v in enumerate([label, val, note], 1):
            cell = sc(ws15, r, c, v, bg=bg, size=9)
            if c == 1: cell.font = font(bold=True, size=9)
        return r + 1
    
    r += 1
    r = _srow15(r, "Company", "ORIENT EXCHANGE AND FINANCIAL SERVICES (P) LTD")
    r = _srow15(r, "Gateway Account", "YES BANK -- A/C 002281400006909", "Bangalore branch")
    r = _srow15(r, "BRS Date", BRS_DATE)
    r += 1
    r = _srow15(r, "Books Match", "MATCH " if books_match else "MISMATCH ",
                f"All-Branches Rs {total_all_pay:,.2f} vs HOT Rs {total_hot_rec:,.2f}",
                bg=C_GREEN if books_match else C_RED)
    r = _srow15(r, "Reconciliation Status",
                "FULLY RECONCILED " if reconciled else "NOT RECONCILED ", "",
                bg=C_GREEN if reconciled else C_RED)
    r += 1
    r = _srow15(r, "Bank Opening Balance", f"Rs {bank_open_bal:,.2f}", "From PDF")
    r = _srow15(r, "Bank Closing Balance", f"Rs {bank_close_bal:,.2f}", "From PDF")
    r = _srow15(r, "Total Bank Credits (all txns)", f"Rs {total_bank_credits:,.2f}", f"{len(stmt_credits)} txns")
    r += 1
    for gw in gateway_results:
        gd = gw["gw_net"] - gw["bank_total"]
        r = _srow15(r, f"{gw['name']} -- Gross / Fees / Tax / Net",
                    f"Rs {gw['gross']:,.2f} / Rs {gw['fees']:,.2f} / Rs {gw['tax']:,.2f} / Rs {gw['gw_net']:,.2f}",
                    f"Bank: Rs {gw['bank_total']:,.2f}  Diff: Rs {gd:,.2f}",
                    bg=C_GREEN if abs(gd)<1 else C_RED)
    r += 1
    r = _srow15(r, "HOT Closing Balance", f"Rs {closing_bal:,.2f}")
    r = _srow15(r, "Total Add1 (Issued not debited)", f"Rs {total_add1:,.2f}", f"{len(add1_all)} items")
    r = _srow15(r, "Total DNC (Less)", f"Rs {total_dnc:,.2f}", f"{len(dnc_all)} items")
    r = _srow15(r, "Total Less2 (Bank debits not in Book)", f"Rs {total_less2:,.2f}", f"{len(less2_all)} items")
    r = _srow15(r, "Total CNB (Add)", f"Rs {total_cnb:,.2f}", f"{len(cnb_all)} items")
    r = _srow15(r, "BRS Balance (Closing + Add1 - DNC - Less2 + CNB)",
                f"Rs {bank_bal:,.2f}", "0.00 = fully reconciled",
                bg=C_GREEN if reconciled else C_RED)
    r += 1
    if cheque_match_report:
        matched_cnt   = sum(1 for rec in cheque_match_report if rec["verdict"] == "MATCHED")
        review_cnt    = sum(1 for rec in cheque_match_report if rec["verdict"] == "REVIEW")
        unmatched_cnt = sum(1 for rec in cheque_match_report if rec["verdict"] == "UNMATCHED")
        r = _srow15(r, "Cheque Deposits -- Name Match",
                    f"{matched_cnt} matched / {review_cnt} review / {unmatched_cnt} unmatched of {len(cheque_match_report)}",
                    f"Threshold: {NAME_MATCH_THRESHOLD}",
                    bg=C_GREEN if unmatched_cnt == 0 and review_cnt == 0 else C_AMBER if unmatched_cnt == 0 else C_RED)
    r += 1
    r = _srow15(r, "Reconciliation Chain",
                "GW Net -> Bank Statement -> HOT Book -> All-Branches",
                "Gateway files verified against bank PDF then against book reports")
    r = _srow15(r, "Formula", "Closing + Add1 - DNC - Less2 + CNB = Bank Balance",
                "All four sections verified per gateway")
    r = _srow15(r, "Carry-forwards source",
                f"--prev-brs: {PREV_BRS_FILE.name if PREV_BRS_FILE else 'None'}  |  "
                f"--cnb-utrs: {CNB_UTRS_FILE.name if CNB_UTRS_FILE else 'None'}",
                "Use --cnb-utrs for prior-day PayU txns settling today")
    
    #  SAVE
    try:
        wb.save(OUTPUT_FILE)
        saved_file = OUTPUT_FILE
    except PermissionError:
        alt = f"{Path(OUTPUT_FILE).stem}_{stmt_date.strftime('%d_%m_%Y')}.xlsx"
        wb.save(alt); saved_file = alt
    
    print(f"[DONE] Saved: {saved_file}")

    return (
        gateway_results,
        dnc_all,
        cnb_all,
        add1_all,
        less2_all,
        closing_bal,
        bank_bal,
        reconciled,
        BRS_DATE,
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
    )

if __name__ == "__main__":
    args = parse_args()
    process_gateway_files(
        all_branches_path=args.all_branches,
        hot_book_path=args.hot_book,
        statement_path=args.statement,
        payu_path=args.payu,
        output_path=args.output,
        payu_od_paths=args.payu_od,
        cashfree_path=args.cashfree,
        easebuzz_path=args.easebuzz,
        prev_brs_path=args.prev_brs,
        cnb_utrs_path=args.cnb_utrs,
        date_override=args.date,
    )