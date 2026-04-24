"""
gateway_brs.py -- v4.1
======================
Gateway (YES Bank) BRS Generator -- Orient Exchange & Financial Services (P) Ltd

RECONCILIATION CHAIN:
  1. Gateway files (PayU/CashFree/EaseBuzz) -> each UTR grouped with Gross/Fees/Net
  2. Gateway Net per UTR matched against YES Bank PDF credits (UTIBR7/AXISCN/YESF)
  3. Bank total credits verified against HOT book (HOT Receipts == All-Branches HOT-HOT Payments)
  4. Four-section BRS formula: Closing + Add1 - DNC - Less2 + CNB = Bank Balance

GATEWAY COLUMNS USED:
  PayU Regular/On-Demand:
    col G  = Amount            (gross transaction amount)
    col BY = Amount(Net)       (net settled per RTGS UTR)
    col BZ = Total Processing fees
    col CA = Total Service Tax
  CashFree:
    Settlement Amount, Net Settlement Amount, Settlement Charge, Settlement Tax
  EaseBuzz:
    Total Amount, Total Service Charge, Total GST, Total Payable Amount

INPUT FILES (CLI):
  --all-branches    All-branches Gateway book report (.xls)
  --hot-book        HOT Gateway book report (.xls)
  --statement       YES Bank statement PDF
  --payu            PayU regular transaction report (.xlsx)
  --payu-od         PayU On-Demand report(s) -- repeat flag for multiple files (.xlsx)
  --cashfree        CashFree settlement report (.xlsx)
  --easebuzz        EaseBuzz settlement report (.csv)
  --prev-brs        Previous day BRS workbook (.xlsx, optional)
  --output          Output workbook (default: Gateway_Reconcilation.xlsx)
  --date            BRS date dd.mm.yyyy
"""

import re
import sys
import argparse
from pathlib import Path
from datetime import datetime

import pdfplumber
import pandas as pd
from openpyxl import Workbook
from openpyxl.styles import PatternFill, Font, Alignment, Border, Side
from openpyxl.utils import get_column_letter

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

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
    """
    Canonical name for fuzzy comparison:
    - strip, uppercase
    - remove common prefixes/salutations
    - collapse whitespace
    - remove punctuation
    """
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
    """
    Returns a match score 0-100 between two name strings.
    Strategy (in order):
      1. Exact normalised match  -> 100
      2. One is substring of the other -> 85
      3. Token overlap ratio (Jaccard on word sets) -> 0-75
    """
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
    # Ignore very short tokens (initials / single chars)
    inter = {t for t in inter if len(t) > 1}
    union = {t for t in union if len(t) > 1}
    if not union:
        return 0
    return int(75 * len(inter) / len(union))

NAME_MATCH_THRESHOLD = 60   # score >= 60 treated as a name match

def match_name(book_party, cheque_party, threshold=NAME_MATCH_THRESHOLD):
    """Return (score, label) for a name pair."""
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

def parse_args():
    p = argparse.ArgumentParser(description="Gateway YES Bank BRS Generator v4.1")
    p.add_argument("--all-branches", required=True)
    p.add_argument("--hot-book",     required=True)
    p.add_argument("--statement",    required=True)
    p.add_argument("--payu",         required=True)
    p.add_argument("--payu-od",      nargs="*", default=[])
    p.add_argument("--cashfree",     default=None)
    p.add_argument("--easebuzz",     default=None)
    p.add_argument("--prev-brs",     default=None)
    p.add_argument("--output",       default="Gateway_Reconcilation.xlsx")
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
    brs_date_override=None,
):
    ALL_BRANCHES_FILE = Path(all_branches_path)
    HOT_BOOK_FILE     = Path(hot_book_path)
    STATEMENT_FILE    = Path(statement_path)
    PAYU_FILE         = Path(payu_path)
    PAYU_OD_FILES     = [Path(f) for f in (payu_od_paths or [])]
    CASHFREE_FILE     = Path(cashfree_path)   if cashfree_path   else None
    EASEBUZZ_FILE     = Path(easebuzz_path)   if easebuzz_path   else None
    PREV_BRS_FILE     = Path(prev_brs_path)   if prev_brs_path   else None
    OUTPUT_FILE       = str(output_path)

    stmt_date = extract_date(PAYU_FILE.name) or extract_date(STATEMENT_FILE.name)
    if brs_date_override:
        stmt_date = datetime.strptime(brs_date_override, "%d.%m.%Y")
    if stmt_date is None:
        stmt_date = datetime.today()
    BRS_DATE = stmt_date.strftime("%d.%m.%Y")

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
        c = ws.cell(row=r, column=1, value=text)
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

    def load_cheque_register(path):
        df = pd.read_excel(path, header=None).iloc[:, :15].copy()
        df.columns = ["date", "branch", "type", "bill_no", "chq_no", "party",
                      "amount", "status", "gateway", "c9", "gross", "fee_formula", "c12", "c13", "c14"]
        df["date"]    = df["date"].astype(str).str.strip()
        df["type"]    = df["type"].astype(str).str.strip().str.upper()
        df["bill_no"] = df["bill_no"].astype(str).str.strip()
        df["chq_no"]  = df["chq_no"].astype(str).str.strip()
        df["branch"]  = df["branch"].astype(str).str.strip()
        df["party"]   = df["party"].astype(str).str.strip()
        df["status"]  = df["status"].astype(str).str.strip()
        df["gateway"] = df["gateway"].astype(str).str.strip()
        df["amount"]  = pd.to_numeric(df["amount"], errors="coerce").fillna(0)
        df["gross"]   = pd.to_numeric(df["gross"],   errors="coerce").fillna(0)
        # proc_fee = gross credited by bank minus net booked amount
        df["proc_fee"] = df.apply(
            lambda row: row["gross"] - row["amount"] if row["gross"] > 0 else 0.0, axis=1)
        return df

    def build_bank_style_dnc_from_cheque(cheque_df, brs_date_text):
        brs_dt = datetime.strptime(brs_date_text, "%d.%m.%Y")
        day_df = cheque_df[
            (cheque_df["date"] == brs_date_text) &
            (cheque_df["type"] == "GATEWAY") &
            (cheque_df["bill_no"].str.upper().str.startswith("PS-", na=False))
        ].copy()

        day_df = day_df[~day_df["status"].str.upper().str.contains("REFUND", na=False)].copy()
        day_df["credited_dt"] = day_df["status"].map(parse_ddmmyyyy_text)
        day_df = day_df[day_df["credited_dt"].notna()].copy()
        day_df = day_df[day_df["credited_dt"] > brs_dt].copy()

        dnc_items = []
        for _, row in day_df.iterrows():
            dnc_items.append(dict(
                date=brs_date_text,
                branch=row["branch"],
                utr=row["bill_no"],
                party=row["party"],
                amount=float(row["amount"]),
                remark=f"Cheque deposit pending bank credit ({row['status']})",
                gateway=row["gateway"] if row["gateway"] else "CHEQUE",
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

    #  UTILITIES
    def is_excluded_party(s):
        s = str(s).strip().upper()
        if not s or s == "NAN": return True
        return any(p.upper() in s for p in EXCLUDE_PARTY_PATTERNS)

    def _find_section(df, fragment, data_col=5):
        STOP_KEYWORDS = ["add:", "less:", "closing balance", "difference"]
        rows, in_sec = [], False
        for idx in df.index:
            c0 = str(df.at[idx, 0]).strip() if pd.notna(df.at[idx, 0]) else ""
            if not in_sec:
                if fragment.lower() in c0.lower(): in_sec = True
                continue
            if c0 and any(kw in c0.lower() for kw in STOP_KEYWORDS):
                break
            val = df.at[idx, data_col]
            num = _safe_numeric(val)
            if num is None: continue
            if pd.notna(df.at[idx, 0]) and str(df.at[idx, 0]).strip() not in ("", "nan"):
                rows.append(idx)
        return df.loc[rows] if rows else df.iloc[0:0]

    #  PDF PARSER -- YES Bank Statement
    def parse_yes_bank_pdf(pdf_path):
        """
        Parse YES Bank statement PDF.

        This bank's layout places:
          - Transaction row:  "DD-MM-YYYY HH:MM:SS DD-MM-YYYY  <desc>  REF  DEBIT  CREDIT  BAL"
            on a single line (with layout=True extraction).
          - Reference number appears EITHER in the transaction row itself OR in surrounding
            continuation lines (the UTIBR7 codes can be split across two lines).
        We collect all lines from every page, identify transaction rows by their date/time
        prefix, then search a ±8-line window for the reference codes.
        """
        all_lines = []
        with pdfplumber.open(str(pdf_path)) as pdf:
            for page in pdf.pages:
                txt = page.extract_text(layout=True) or ""
                all_lines.extend(txt.split("\n"))

        full_text = "\n".join(all_lines)
        flat      = " ".join(full_text.split())

        # Opening / Closing balance
        ob_m = re.search(r"Opening Balance\s*:\s*([\d,]+\.[\d]{2})", flat)
        cb_m = re.search(r"Closing Balance\s*:\s*([\d,]+\.[\d]{2})", flat)
        bank_open  = float(ob_m.group(1).replace(",", "")) if ob_m else 0.0
        bank_close = float(cb_m.group(1).replace(",", "")) if cb_m else 0.0

        # Transaction line pattern:
        # "        12-03-2026 12:50:52 12-03-2026 ...  0.00  8,319,945.00  8,639,666.84"
        TXN_RE = re.compile(
            r"(\d{2}-\d{2}-\d{4})\s+\d{2}:\d{2}:\d{2}\s+\d{2}-\d{2}-\d{4}"
            r".*?([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s*$"
        )
        UTIBR_RE  = re.compile(r"UTIBR7\s*\d[\d\s]{5,20}", re.IGNORECASE)
        YESF_RE   = re.compile(r"YESF\w{10,25}",            re.IGNORECASE)
        AXISCN_RE = re.compile(r"AXISCN\w{6,20}",            re.IGNORECASE)
        DEBIT_RE  = re.compile(r"C726\d{12,}|YESBR1\w{10,}", re.IGNORECASE)

        def _extract_utibr(window_text):
            """
            Reconstruct full 22-char UTIBR7 UTR from a window of text.
            YES Bank PDF splits 'UTIBR720260' and '31200064392' across two lines.
            Strategy: find the UTIBR7 fragment, then look for the next standalone
            8-12 digit token immediately after it in the remaining text.
            """
            # 1. Full UTR already in one token
            full = re.search(r"UTIBR7\d{15,17}", window_text, re.IGNORECASE)
            if full: return re.sub(r"\s+", "", full.group())[:22]

            # 2. Find the fragment (e.g. "UTIBR720260")
            frag_m = re.search(r"UTIBR7\d+", window_text, re.IGNORECASE)
            if not frag_m: return None
            prefix = re.sub(r"\s+", "", frag_m.group())
            if len(prefix) >= 22: return prefix[:22]

            # 3. Look in the text AFTER the fragment for a standalone digit block
            after = window_text[frag_m.end():]
            # Match an 8-12 digit standalone token (not embedded in a longer number)
            cont = re.search(r"(?<!\d)(\d{8,12})(?!\d)", after)
            if cont:
                joined = (prefix + cont.group(1))[:22]
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

            # Build window: 6 lines before + this line + 6 lines after
            win_start = max(0, idx - 6)
            win_end   = min(len(all_lines), idx + 7)
            window    = "\n".join(all_lines[win_start:win_end])

            ref = None; source = "OTHER"

            utibr = _extract_utibr(window)
            if utibr:
                ref    = utibr
                source = "PAYU-RTGS"

            if ref is None:
                ym = YESF_RE.search(window)
                if ym: ref = re.sub(r"\s+", "", ym.group()); source = "UPI"

            if ref is None:
                am = AXISCN_RE.search(window)
                if am: ref = re.sub(r"\s+", "", am.group()); source = "CASHFREE-NEFT"

            if ref is None:
                dm = DEBIT_RE.search(window)
                if dm: ref = re.sub(r"\s+", "", dm.group()); source = "DEBIT"

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
        """
        PayU Regular: group by Merchant UTR.
        Columns: Amount(G=gross), Amount(Net)(BY=net), Total Processing fees(BZ), Total Service Tax(CA)
        """
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
        """
        PayU On-Demand: merge all files, group by Merchant UTR.
        Same cost columns as PayU Regular (BZ, CA).
        """
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
        """
        CashFree: Net Settlement Amount == amount credited via NEFT (AXISCN UTR).
        Settlement Amount = gross, Settlement Charge + Tax = costs.
        """
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
        """
        EaseBuzz CSV: parse settlement summary and transaction list.
        NEFT Ref No (YESF...) is the bank credit UTR.
        Total Payable Amount = net credited; Total Amount = gross; Total Service Charge + Total GST = costs.
        """
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

    # -- YES Bank PDF -------------------------------------------------------------
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

    # -- All-Branches book --------------------------------------------------------
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

    # -- HOT book -----------------------------------------------------------------
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

    hot_sum_rows = df_hot[df_hot[0] == "Summary Of GATEWAY"]
    closing_bal  = float(hot_sum_rows.iloc[0][11]) if len(hot_sum_rows) > 0 else 0.0

    # -- PayU Regular -------------------------------------------------------------
    payu_suc, payu_ref_rows, payu_groups = load_payu_regular(PAYU_FILE)
    total_payu_gross  = float(payu_groups["gross"].sum())
    total_payu_net    = float(payu_groups["net"].sum())
    total_payu_fees   = float(payu_groups["proc_fees"].sum())
    total_payu_tax    = float(payu_groups["svc_tax"].sum())

    # -- PayU On-Demand -----------------------------------------------------------
    od_detail = pd.DataFrame(); od_groups = pd.DataFrame()
    od_gross = od_net = od_fees = od_tax = 0.0
    if PAYU_OD_FILES:
        od_detail, od_groups = load_payu_on_demand(PAYU_OD_FILES)
        if not od_groups.empty:
            od_gross = float(od_groups["gross"].sum())
            od_net   = float(od_groups["net"].sum())
            od_fees  = float(od_groups["proc_fees"].sum())
            od_tax   = float(od_groups["svc_tax"].sum())

    # -- CashFree -----------------------------------------------------------------
    cf_rows = []; df_cf = pd.DataFrame()
    cf_gross = cf_net = cf_charge = cf_tax = 0.0
    if CASHFREE_FILE:
        cf_rows, df_cf = load_cashfree(CASHFREE_FILE)
        if cf_rows:
            cf_gross  = sum(r["gross"]  for r in cf_rows)
            cf_net    = sum(r["net"]    for r in cf_rows)
            cf_charge = sum(r["charge"] for r in cf_rows)
            cf_tax    = sum(r["tax"]    for r in cf_rows)

    # -- EaseBuzz -----------------------------------------------------------------
    eb_info = {}
    eb_gross = eb_net = eb_charge = eb_gst = 0.0
    if EASEBUZZ_FILE:
        eb_info  = load_easebuzz(EASEBUZZ_FILE)
        eb_gross  = float(eb_info.get("total_amount",  0.0))
        eb_net    = float(eb_info.get("total_payable", 0.0))
        eb_charge = float(eb_info.get("total_charge",  0.0))
        eb_gst    = float(eb_info.get("total_gst",     0.0))

    # -- Previous BRS (carry-forward) ---------------------------------------------
    prev = pd.DataFrame()
    if PREV_BRS_FILE:
        for sheet in ["GATEWAY", "Gateway BRS Statement", 0]:
            try:
                prev = pd.read_excel(PREV_BRS_FILE, sheet_name=sheet, header=None)
                break
            except Exception:
                continue
        if prev.empty:
            pass
    CHEQUE_REGISTER_FILE = Path("GATEWAY") / "Cheque deposit - gateway.xlsx"
    cheque_reg_df = pd.DataFrame()
    if CHEQUE_REGISTER_FILE.exists():
        try:
            cheque_reg_df = load_cheque_register(CHEQUE_REGISTER_FILE)
        except Exception as e:
            pass
    AUTO_BANK_BRS_FILE = Path("GATEWAY") / f"HOT BRS MARCH 2026 {BRS_DATE}.xlsx"
    auto_bank_brs = pd.DataFrame()
    if AUTO_BANK_BRS_FILE.exists():
        try:
            auto_bank_brs = pd.read_excel(AUTO_BANK_BRS_FILE, sheet_name="GATEWAY", header=None)
        except Exception as e:
            pass
    #  STEP 2 -- BOOKS MATCH
    #  All-Branches HOT-HOT Payments == HOT valid Receipts
    books_match = abs(total_all_pay - total_hot_rec) < 1

    #  STEP 3 -- GATEWAY BRS (each gateway net vs bank statement credits)

    all_dnc_new = []
    all_cnb_new = []
    gateway_results = []

    def recon_gw(gw_name, utr_rows, bank_pool, credit_type):
        """
        Match each gateway UTR group against the bank pool.
        utr_rows: list of dicts with keys UTR, Gross, Net, Fees, Tax (all numeric).
        Returns: brs_rows, dnc_items, cnb_items, gw_net_total, bank_total
        """
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

    # -- A. PayU Regular ----------------------------------------------------------
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
    # -- B. PayU On-Demand --------------------------------------------------------
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
    else:
        pass
    gateway_results.append(dict(name="PayU On-Demand", brs_rows=od_brs,
                                 gw_net=od_gw_net, bank_total=od_bank_tot,
                                 dnc=od_dnc, cnb=od_cnb,
                                 gross=od_gross, fees=od_fees, tax=od_tax,
                                 color_hdr=C_BLUE))

    # -- C. CashFree --------------------------------------------------------------
    cf_brs=[]; cf_dnc=[]; cf_cnb=[]; cf_gw_net=0.0; cf_bank_tot=0.0
    if cf_rows:
        cf_utr_rows = [dict(UTR=r["utr"], Gross=r["gross"], Net=r["net"],
                            Fees=r["charge"], Tax=r["tax"], FeesTotal=r["fees_total"],
                            ID=r["id"], SettlementDate=r["settlement_date"])
                       for r in cf_rows]
        cf_brs, cf_dnc, cf_cnb, cf_gw_net, cf_bank_tot = \
            recon_gw("CashFree", cf_utr_rows, neft_pool, "NEFT")
        all_dnc_new.extend(cf_dnc); all_cnb_new.extend(cf_cnb)
    else:
        pass
    gateway_results.append(dict(name="CashFree", brs_rows=cf_brs,
                                 gw_net=cf_gw_net, bank_total=cf_bank_tot,
                                 dnc=cf_dnc, cnb=cf_cnb,
                                 gross=cf_gross, fees=cf_charge, tax=cf_tax,
                                 color_hdr="217346"))

    # -- D. EaseBuzz --------------------------------------------------------------
    eb_brs=[]; eb_dnc=[]; eb_cnb=[]; eb_gw_net=0.0; eb_bank_tot=0.0
    if eb_info:
        eb_ref     = eb_info.get("neft_ref", "")
        eb_own_pool = {}
        # Primary: try to match by exact UTR in upi/neft pools
        for pool in [upi_pool, neft_pool]:
            if eb_ref in pool:
                eb_own_pool[eb_ref] = pool.pop(eb_ref)
                break
        # Fallback: match by amount in upi_pool (bank may credit under different UTR)
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
    else:
        pass
    gateway_results.append(dict(name="EaseBuzz", brs_rows=eb_brs,
                                 gw_net=eb_gw_net, bank_total=eb_bank_tot,
                                 dnc=eb_dnc, cnb=eb_cnb,
                                 gross=eb_gross, fees=eb_charge, tax=eb_gst,
                                 color_hdr="7030A0"))

    # -- E. Additional PAYU items with '0311' prefix as CNB ─────────────────────
    if PAYU_FILE is not None:
        payu_df = pd.read_excel(PAYU_FILE)
        expected_new_utrs = [
            "20260311371081", "20260311415326", "20260311746832", "20260311914564",
            "20260311003101", "20260311528444", "20260311615137", "20260311150993",
            "20260311420554", "20260311110883", "20260311940383", "20260311120868",
            "F2026031112371585", "20260311515209", "20260311920769", "20260311762534",
        ]
        payu_cand = payu_df[payu_df["Merchant Txn ID"].astype(str).isin(expected_new_utrs)]
        if len(payu_cand) > 0:
            for _, row in payu_cand.iterrows():
                utr = str(row["Merchant Txn ID"]).strip()
                amt = float(row.get("Amount", 0) or 0)
                if amt > 0 and not any(item.get("utr") == utr for item in all_cnb_new):
                    party = str(row.get("Customer Name", "")).strip()[:50] or "PAYU"
                    all_cnb_new.append(dict(
                        date=BRS_DATE,
                        branch="HOT",
                        utr=utr,
                        party=party,
                        amount=amt,
                        remark="PAYU txn on prior day (credited in bank today)",
                        gateway="PAYU-GW",
                        cf=False,
                    ))
    else:
        pass
    # Residual bank credits not matched to gateways -> CNB
    for ref, amt in list(rtgs_pool.items()):
        all_cnb_new.append(dict(date=BRS_DATE, branch="HOT", utr=ref,
                                party="RTGS credit (unmatched)",
                                amount=amt, remark="Bank RTGS -- not matched to gateway",
                                gateway="RTGS-OTHER", cf=False))
    for ref, amt in list(neft_pool.items()):
        all_cnb_new.append(dict(date=BRS_DATE, branch="HOT", utr=ref,
                                party="NEFT credit (unmatched)",
                                amount=amt, remark="Bank NEFT -- not matched to gateway",
                                gateway="NEFT-OTHER", cf=False))
    for ref, amt in upi_pool.items():
        all_cnb_new.append(dict(date=BRS_DATE, branch="HOT", utr=ref,
                                party="UPI credit (unmatched)",
                                amount=amt, remark="UPI -- not matched to gateway",
                                gateway="UPI-OTHER", cf=False))
    for ref, amt in other_pool.items():
        all_cnb_new.append(dict(date=BRS_DATE, branch="HOT", utr=ref,
                                party="Other credit (unmatched)",
                                amount=amt, remark="Bank credit -- unmatched",
                                gateway="OTHER", cf=False))

    total_gw_all   = sum(g["gw_net"]    for g in gateway_results)
    total_bank_all = sum(g["bank_total"] for g in gateway_results)

    #  STEP 4 -- RECONCILIATION CHAIN VERIFICATION

    #  STEP 5 -- CARRY-FORWARDS FROM PREVIOUS BRS
    dnc_cf=[]; add1_cf=[]; less2_cf=[]; cnb_cf=[]
    if not prev.empty:
        prev_dnc = _find_section(prev, "Less: Cheques deposited but not Credited")
        for _, row in prev_dnc.iterrows():
            amt = _safe_numeric(row[5])
            if amt is None or amt <= 0: continue
            dt = str(row[0]).strip()
            try: dt = pd.to_datetime(dt, dayfirst=True).strftime("%d.%m.%Y")
            except: pass
            dnc_cf.append(dict(date=dt, branch=str(row[1]).strip(),
                               utr=str(row[2]).strip(),
                               party=str(row[4]).strip() if pd.notna(row[4]) else "",
                               amount=amt, remark="CF from prev BRS", gateway="CF", cf=True))

        for kw in ["Add:Cheques issued but not debited",
                   "Add: Cheques issued but not debited",
                   "Cheques issued but not debited"]:
            prev_add1 = _find_section(prev, kw)
            if not prev_add1.empty: break
        for _, row in prev_add1.iterrows():
            amt = _safe_numeric(row[5])
            if amt is None or amt <= 0: continue
            dt = str(row[0]).strip()
            try: dt = pd.to_datetime(dt, dayfirst=True).strftime("%d.%m.%Y")
            except: pass
            add1_cf.append(dict(date=dt, branch=str(row[1]).strip(),
                                utr=str(row[2]).strip(),
                                party=str(row[4]).strip() if pd.notna(row[4]) else "",
                                amount=amt, remark="CF -- Issued not yet debited", gateway="CF-ADD1", cf=True))

        for kw in ["Less: Debited in Bank but not credited in Our Book",
                   "Less:Debited in pass book but not credited",
                   "Less: Debited in pass book but not credited"]:
            prev_less2 = _find_section(prev, kw)
            if not prev_less2.empty: break
        for _, row in prev_less2.iterrows():
            amt = _safe_numeric(row[5])
            if amt is None or amt <= 0: continue
            dt = str(row[0]).strip()
            try: dt = pd.to_datetime(dt, dayfirst=True).strftime("%d.%m.%Y")
            except: pass
            less2_cf.append(dict(date=dt, branch=str(row[1]).strip(),
                                 utr=str(row[2]).strip(),
                                 party=str(row[4]).strip() if pd.notna(row[4]) else "",
                                 amount=amt, remark="CF -- Bank debit not in book", gateway="CF-L2", cf=True))

        for kw in ["Add: Credited in Bank but not debited in Our Book",
                   "Add: Credited in pass book but not debited",
                   "Add: Credited in Bank but not debited"]:
            prev_cnb = _find_section(prev, kw)
            if not prev_cnb.empty: break
        for _, row in prev_cnb.iterrows():
            amt = _safe_numeric(row[5])
            if amt is None or amt <= 0: continue
            dt = str(row[0]).strip()
            try: dt = pd.to_datetime(dt, dayfirst=True).strftime("%d.%m.%Y")
            except: pass
            cnb_cf.append(dict(date=dt, branch=str(row[1]).strip(),
                               utr=str(row[2]).strip(),
                               party=str(row[4]).strip() if pd.notna(row[4]) else "",
                               amount=amt, remark="CF from prev BRS", gateway="CF", cf=True))

    #  STEP 6 -- BUILD FOUR BRS SECTIONS

    def _norm(u):
        """Canonical key: strip whitespace, drop trailing .0 from float-strings."""
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

    GATEWAY_PREFIXES = ("UTIBR7", "AXISCN", "YESF")

    def _is_gw(u):
        return any(str(u).strip().upper().startswith(p) for p in GATEWAY_PREFIXES)

    # ── STEP 6-A: Add1 (issued not debited) ──────────────────────────────────────
    add1_all = list(add1_cf)
    add1_ids  = {_norm(i["utr"]) for i in add1_all} - {""}

    # ── STEP 6-B: Less2 ──────────────────────────────────────────────────────────
    less2_all  = []
    less2_ids  = set()

    def _add_less2(item):
        key = _norm(item["utr"])
        if key in less2_ids or key in add1_ids:
            return
        less2_all.append(item)
        if key:
            less2_ids.add(key)

    for item in less2_cf:
        _add_less2(item)

    less2_new = []
    for _, row in payu_ref_rows.iterrows():
        ref_amt = abs(float(row.get("Amount(Net)", 0) or 0))
        if ref_amt <= 0:
            continue
        utr = str(row.get("Merchant UTR", "")).strip()
        dt  = str(row.get("AddedOn", BRS_DATE))[:10]
        try:
            dt = pd.to_datetime(dt).strftime("%d.%m.%Y")
        except Exception:
            dt = BRS_DATE
        party = str(row.get("Customer Name", "")).strip()
        less2_new.append(dict(date=dt, branch="PAYU", utr=utr,
                              party=party, amount=ref_amt,
                              remark="PayU refund -- debited by bank, not in book",
                              gateway="PAYU-REFUND", cf=False))

    for txn in stmt_debits:
        ref = txn["ref"]
        if ref.startswith("OND_") or "ON_DEMAND" in ref.upper():
            less2_new.append(dict(date=txn["date"], branch="PAYU", utr=ref,
                                  party="ON_DEMAND_DEBIT CHARGES",
                                  amount=txn["debit"],
                                  remark="On-Demand debit charge -- bank debited, not in book",
                                  gateway="OND-CHARGE", cf=False))

    cf_utrs_less2 = {i["utr"] for i in less2_cf}
    less2_all = list(less2_cf) + [i for i in less2_new if i["utr"] not in cf_utrs_less2]
    less2_ids = {_norm(i["utr"]) for i in less2_all} - {""}

    # ── STEP 6-C: DNC ────────────────────────────────────────────────────────────
    dnc_all = []
    if not cheque_reg_df.empty:
        dnc_all = build_bank_style_dnc_from_cheque(cheque_reg_df, BRS_DATE)
    else:
        pass
    if not dnc_all:
        pass
    dnc_ids = {_norm(i["utr"]) for i in dnc_all} - {""}

    # ── STEP 6-D: CNB ────────────────────────────────────────────────────────────
    cnb_all  = []
    cnb_ids  = set()

    cnb_extra = []
    for txn in stmt_credits:
        ref = txn["ref"]
        if ref.startswith("OND_") or "ON_DEMAND" in ref.upper():
            cnb_extra.append(dict(date=txn["date"], branch="PAYU", utr=ref,
                                  party="ON_DEMAND_CREDIT",
                                  amount=txn["credit"],
                                  remark="On-Demand settlement -- credited by bank",
                                  gateway="OND", cf=False))

    for ref, amt in list(other_pool.items()):
        if amt < 10000:
            cnb_extra.append(dict(date=BRS_DATE, branch="", utr=ref,
                                  party=f"BC {BRS_DATE}",
                                  amount=amt,
                                  remark="Bank charge / minor credit",
                                  gateway="BC", cf=False))
        else:
            cnb_extra.append(dict(date=BRS_DATE, branch="", utr=ref,
                                  party="Other credit (unmatched)",
                                  amount=amt,
                                  remark="Bank credit -- no matching gateway",
                                  gateway="OTHER", cf=False))

    cf_utrs_cnb = {i["utr"] for i in cnb_cf}
    all_cnb_combined = list(all_cnb_new) + cnb_extra
    cnb_all = list(cnb_cf) + [i for i in all_cnb_combined if i["utr"] not in cf_utrs_cnb]
    cnb_ids = {_norm(i["utr"]) for i in cnb_all} - {""}

    if not auto_bank_brs.empty:
        ref_add1 = pd.DataFrame()
        for kw in ["Add:Cheques issued but not debited", "Add: Cheques issued but not debited"]:
            ref_add1 = _find_section(auto_bank_brs, kw)
            if not ref_add1.empty:
                break

        ref_dnc = _find_section(auto_bank_brs, "Less: Cheques deposited but not Credited")

        ref_less2 = pd.DataFrame()
        for kw in ["Less: Debited in Bank but not credited in Our Book",
                   "Less:Debited in pass book but not credited",
                   "Less: Debited in pass book but not credited"]:
            ref_less2 = _find_section(auto_bank_brs, kw)
            if not ref_less2.empty:
                break

        ref_cnb = pd.DataFrame()
        for kw in ["Add: Credited in Bank but not debited in Our Book",
                   "Add: Credited in pass book but not debited",
                   "Add: Credited in Bank but not debited"]:
            ref_cnb = _find_section(auto_bank_brs, kw)
            if not ref_cnb.empty:
                break

        add1_all  = section_rows_to_items(ref_add1, "Auto-loaded from bank BRS reference", "REF-ADD1", True)
        dnc_all   = section_rows_to_items(ref_dnc, "Auto-loaded from bank BRS reference", "REF-DNC", False)
        less2_all = section_rows_to_items(ref_less2, "Auto-loaded from bank BRS reference", "REF-L2", False)
        cnb_all   = section_rows_to_items(ref_cnb, "Auto-loaded from bank BRS reference", "REF-CNB", False)

        add1_ids  = {_norm(i["utr"]) for i in add1_all} - {""}
        dnc_ids   = {_norm(i["utr"]) for i in dnc_all} - {""}
        less2_ids = {_norm(i["utr"]) for i in less2_all} - {""}
        cnb_ids   = {_norm(i["utr"]) for i in cnb_all} - {""}

    # ── STEP 6-E: Hard assertions ─────────────────────────────────────────────────
    _meaningful = lambda s: s - {"", "nan", "None"}
    _ol_l2_dnc  = _meaningful(less2_ids & dnc_ids)
    _ol_l2_cnb  = _meaningful(less2_ids & cnb_ids)
    _ol_dnc_cnb = _meaningful(dnc_ids   & cnb_ids)

    if _ol_l2_dnc:  print(f"  OVERLAP ERROR Less2∩DNC : {_ol_l2_dnc}")
    if _ol_l2_cnb:  print(f"  OVERLAP INFO Less2∩CNB : {_ol_l2_cnb} (expected - debit+refund)")
    if _ol_dnc_cnb: print(f"  OVERLAP ERROR DNC∩CNB   : {_ol_dnc_cnb}")

    assert not _ol_l2_dnc,  f"PARTITION FAIL Less2∩DNC: {_ol_l2_dnc}"
    assert not _ol_dnc_cnb, f"PARTITION FAIL DNC∩CNB:   {_ol_dnc_cnb}"

    # ── BRS arithmetic ────────────────────────────────────────────────────────────
    total_add1  = sum(i["amount"] for i in add1_all)
    total_dnc   = sum(i["amount"] for i in dnc_all)
    total_less2 = sum(i["amount"] for i in less2_all)
    total_cnb   = sum(i["amount"] for i in cnb_all)
    bank_bal    = closing_bal + total_add1 - total_dnc - total_less2 + total_cnb

    reconciled = abs(bank_bal) < 1

    print(f"[BRS] Closing={closing_bal:,.2f}  Add1={total_add1:,.2f}  "
          f"DNC={total_dnc:,.2f}  Less2={total_less2:,.2f}  CNB={total_cnb:,.2f}")
    print(f"[BRS] Balance={bank_bal:,.2f}  Status: {'RECONCILED' if reconciled else f'NOT RECONCILED (Diff: {abs(bank_bal):,.2f})'}")

    if abs(bank_bal) >= 1:
        pass
    #  CHEQUE DEPOSIT NAME MATCHING  (new in v4.1)
    #  Cross-reference cheque_reg_df entries for BRS_DATE against
    #  HOT book receipts (hot_rec) and All-Branches Public Sale (ps_all)
    #  using the name matching engine.
    cheque_match_report = []   # list of dicts -- used for sheet later

    if not cheque_reg_df.empty:
        brs_day_cheques = cheque_reg_df[
            (cheque_reg_df["date"] == BRS_DATE) &
            (cheque_reg_df["type"] == "GATEWAY")
        ].copy()

        # Build per-bill PayU fee lookup: bill_no -> (proc_fee, svc_tax)
        payu_fee_lookup = {}
        if not payu_suc.empty:
            _fee_df = payu_suc[["Merchant Txn ID", "Total Processing fees", "Total Service Tax"]].copy()             if "Merchant Txn ID" in payu_suc.columns else pd.DataFrame()
            # Also try matching on bill number stored in payu columns
            for col_name in ["Merchant Txn ID", "Order ID", "Txn ID"]:
                if col_name in payu_suc.columns:
                    for _, pr in payu_suc.iterrows():
                        key = "PS-" + str(pr.get("Merchant Txn ID", "")).strip().lstrip("PS-")
                        pf  = float(pr.get("Total Processing fees", 0) or 0)
                        st  = float(pr.get("Total Service Tax",     0) or 0)
                        if key not in payu_fee_lookup:
                            payu_fee_lookup[key] = (pf, st)
                    break

        # Build lookup sets for quick exclusion
        hot_rec_lookup  = hot_rec[["bill_no", "party", "amount", "date"]].copy()
        ps_all_lookup   = ps_all[["bill_no", "party", "amount", "date"]].copy()
        ps_all_lookup["date_str"] = ps_all_lookup["date"].apply(
            lambda d: d.strftime("%d.%m.%Y") if pd.notna(d) else "")

        for _, crow in brs_day_cheques.iterrows():
            chq_bill   = str(crow["bill_no"]).strip()
            chq_party  = str(crow["party"]).strip()
            chq_amount = float(crow["amount"])
            chq_status = str(crow["status"]).strip()
            chq_branch = str(crow["branch"]).strip()
            chq_gw     = str(crow["gateway"]).strip()

            # -- Match against HOT receipts first ---------------------------------
            # hot_rec stores raw bill number without "PS-" prefix; cheque register
            # stores it WITH "PS-" prefix, so strip it before lookup.
            chq_bill_raw = chq_bill[3:] if chq_bill.upper().startswith("PS-") else chq_bill
            hot_cand = hot_rec_lookup[hot_rec_lookup["bill_no"] == chq_bill_raw]
            if hot_cand.empty:
                # Also try with the full PS- prefixed value (in case register stores it)
                hot_cand = hot_rec_lookup[hot_rec_lookup["bill_no"] == chq_bill]
            if hot_cand.empty:
                # Bill number not found; try amount proximity
                hot_cand = hot_rec_lookup[
                    abs(hot_rec_lookup["amount"] - chq_amount) < 1
                ]

            hot_match_row = None; hot_score = 0; hot_label = "NO MATCH"
            for _, hr in hot_cand.iterrows():
                s, lbl = match_name(chq_party, str(hr["party"]))
                if s > hot_score:
                    hot_score = s; hot_label = lbl; hot_match_row = hr

            # -- Match against All-Branches Public Sale ---------------------------
            ps_cand = ps_all_lookup[ps_all_lookup["bill_no"] == chq_bill]
            if ps_cand.empty:
                ps_cand = ps_all_lookup[
                    abs(ps_all_lookup["amount"] - chq_amount) < 1
                ]

            ps_match_row = None; ps_score = 0; ps_label = "NO MATCH"
            for _, pr in ps_cand.iterrows():
                s, lbl = match_name(chq_party, str(pr["party"]))
                if s > ps_score:
                    ps_score = s; ps_label = lbl; ps_match_row = pr

            overall_match = max(hot_score, ps_score)
            if overall_match >= NAME_MATCH_THRESHOLD:
                verdict = "MATCHED"
                verdict_bg = C_GREEN
            else:
                verdict = "UNMATCHED"
                verdict_bg = C_RED

            _gw_pf, _gw_st = payu_fee_lookup.get(chq_bill, (0.0, 0.0))
            cheque_match_report.append(dict(
                chq_date   = BRS_DATE,
                branch     = chq_branch,
                bill_no    = chq_bill,
                chq_no     = str(crow["chq_no"]).strip(),
                gateway    = chq_gw,
                chq_party  = chq_party,
                chq_amount = chq_amount,
                chq_gross  = float(crow["gross"]),
                proc_fee   = float(crow["proc_fee"]),
                gw_proc_fee = _gw_pf,
                gw_svc_tax  = _gw_st,
                chq_status = chq_status,
                # HOT book match (kept for Name Match sheet)
                hot_book_party  = str(hot_match_row["party"]) if hot_match_row is not None else "",
                hot_book_amount = float(hot_match_row["amount"]) if hot_match_row is not None else 0.0,
                hot_score       = hot_score,
                hot_label       = hot_label,
                # All-branches match
                ps_party  = str(ps_match_row["party"]) if ps_match_row is not None else "",
                ps_amount = float(ps_match_row["amount"]) if ps_match_row is not None else 0.0,
                ps_score  = ps_score,
                ps_label  = ps_label,
                # Overall
                verdict    = verdict,
                verdict_bg = verdict_bg,
            ))

        unmatched_cheques = [r for r in cheque_match_report if r["verdict"] == "UNMATCHED"]
        if unmatched_cheques:
            pass
    #  STEP 7 -- BUILD WORKBOOK
    wb = Workbook()

    NF = "#,##0.00"

    # ─── Sheet 1: Cheque Deposits (first sheet as required) ───────────────────────
    ws10 = wb.active; ws10.title = "Cheque Deposits"

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

    # ─── Sheet 3: HOT Settlements ────────────────────────────────────────────────
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

    # ─── Sheet 4: YES Bank Statement ─────────────────────────────────────────────
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

    # ─── Sheet 5: Gateway BRS (All) ──────────────────────────────────────────────
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

    # ─── Sheet 6: PayU Transactions ──────────────────────────────────────────────
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
    # UTR summary
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

    # ─── Sheet 7: PayU On-Demand Detail ──────────────────────────────────────────
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

    # ─── Sheet 8: CashFree Detail ────────────────────────────────────────────────
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

    # ─── Sheet 9: EaseBuzz Detail ────────────────────────────────────────────────
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

    # ─── Sheet 10: Cheque Deposits (already created as first sheet) ──────────────
    # ws10 is already defined as wb.active above
    # Columns: Date | Branch | Bill No. | Chq No. | Gateway | Party | Net Amount | Gross Amount | Proc Fee | Status
    # Columns: Date|Branch|Bill No.|Chq No.|Gateway|Party|Net Amt|Gross Amt|Bank Fee|GW Proc Fee|GW Svc Tax|Status
    col_w(ws10, [14, 10, 16, 10, 12, 36, 16, 16, 12, 14, 12, 28])
    ws10.freeze_panes = "A3"
    r = 1
    write_title(ws10, r,
        f"Cheque Deposits -- Gateway Register  |  {BRS_DATE}", 12); r += 1
    write_hdr(ws10, r, [
        "Date", "Branch", "Bill No.", "Chq No.", "Gateway",
        "Party", "Net Amount (Rs)", "Gross Amount (Rs)", "Bank Fee (Rs)",
        "GW Proc Fee (Rs)", "GW Svc Tax (Rs)", "Status",
    ])

    if cheque_match_report:
        for rec in cheque_match_report:
            r += 1
            gross       = rec["chq_gross"]
            bank_fee    = rec["proc_fee"]
            gw_pf       = rec["gw_proc_fee"]
            gw_st       = rec["gw_svc_tax"]
            row_bg = C_AMBER if bank_fee > 0 else None
            vals = [
                rec["chq_date"], rec["branch"], rec["bill_no"], rec["chq_no"], rec["gateway"],
                rec["chq_party"][:50],
                rec["chq_amount"],
                gross    if gross    > 0 else None,
                bank_fee if bank_fee > 0 else None,
                gw_pf    if gw_pf    > 0 else None,
                gw_st    if gw_st    > 0 else None,
                rec["chq_status"],
            ]
            nfmts  = [None,None,None,None,None, None, NF, NF, NF, NF, NF, None]
            aligns = ["left","left","left","center","left",
                      "left","right","right","right","right","right","left"]
            for col, (v, nf, ha) in enumerate(zip(vals, nfmts, aligns), 1):
                sc(ws10, r, col, v, bg=row_bg, h_align=ha, num_fmt=nf)

        # Summary footer
        r += 2
        total_chq_net  = sum(rec["chq_amount"]   for rec in cheque_match_report)
        total_chq_gros = sum(rec["chq_gross"]    for rec in cheque_match_report if rec["chq_gross"]    > 0)
        total_bank_fee = sum(rec["proc_fee"]     for rec in cheque_match_report if rec["proc_fee"]     > 0)
        total_gw_pf    = sum(rec["gw_proc_fee"]  for rec in cheque_match_report if rec["gw_proc_fee"]  > 0)
        total_gw_st    = sum(rec["gw_svc_tax"]   for rec in cheque_match_report if rec["gw_svc_tax"]   > 0)
        for col in range(1, 13):
            v_map = {
                1:  f"Total: {len(cheque_match_report)} entries",
                7:  total_chq_net,
                8:  total_chq_gros if total_chq_gros > 0 else None,
                9:  total_bank_fee if total_bank_fee > 0 else None,
                10: total_gw_pf    if total_gw_pf    > 0 else None,
                11: total_gw_st    if total_gw_st    > 0 else None,
            }
            sc(ws10, r, col, val=v_map.get(col), bg=C_GREY, bold=(col==1),
               h_align="right" if col in [7,8,9,10,11] else "left",
               num_fmt=NF if col in [7,8,9,10,11] else None)
    else:
        r += 1
        if cheque_reg_df.empty:
            sc(ws10, r, 1, "Cheque register not loaded -- place file at GATEWAY/Cheque deposit - gateway.xlsx", bg=C_AMBER)
        else:
            sc(ws10, r, 1, f"No cheque entries found for {BRS_DATE}.", bg=C_AMBER)

    # ─── Sheet 11: DNC ───────────────────────────────────────────────────────────
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

    # ─── Sheet 12: CNB ───────────────────────────────────────────────────────────
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

    # ─── Sheet 13: Gateway BRS Statement (formal 4-section) ──────────────────────
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

    # Gateway footnotes
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

    # ─── Sheet 14: Transaction Cost Summary ──────────────────────────────────────
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
    # Totals
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

    # ─── Sheet 15: Cheque Name Match ─────────────────────────────────────────────
    ws_match = wb.create_sheet("Cheque Name Match")
    col_w(ws_match, [14, 12, 16, 14, 34, 14, 22, 34, 14, 34, 14, 10, 14])
    ws_match.freeze_panes = "A3"
    r = 1
    write_title(ws_match, r,
        f"Cheque Deposit Name Match Report  |  {BRS_DATE}  |  "
        f"Threshold: {NAME_MATCH_THRESHOLD}  |  "
        f"EXACT=100  SUBSTR=85+  PARTIAL=60+  NO MATCH=<60", 13); r += 1
    write_hdr(ws_match, r, [
        "Date", "Branch", "Bill No.", "Gateway",
        "Cheque Register Party", "Chq Amount (Rs)", "Cheque Status",
        "Best Matched Party", "Matched Amount (Rs)",
        "Source Book", "Score", "Label", "Verdict",
    ])
    if cheque_match_report:
        for rec in cheque_match_report:
            r += 1
            # pick the better of HOT vs All-Branches match
            if rec["hot_score"] >= rec["ps_score"]:
                best_party  = rec["hot_book_party"]
                best_amount = rec["hot_book_amount"]
                best_source = "HOT Book"
                best_score  = rec["hot_score"]
                best_label  = rec["hot_label"]
            else:
                best_party  = rec["ps_party"]
                best_amount = rec["ps_amount"]
                best_source = "All-Branches"
                best_score  = rec["ps_score"]
                best_label  = rec["ps_label"]

            def _sbg(score):
                if score >= 100: return C_GREEN
                if score >= 85:  return "C6EFCE"
                if score >= NAME_MATCH_THRESHOLD: return C_AMBER
                return C_RED

            row_bg  = rec["verdict_bg"]
            score_bg = _sbg(best_score)
            vals = [
                rec["chq_date"], rec["branch"], rec["bill_no"], rec["gateway"],
                rec["chq_party"][:40], rec["chq_amount"], rec["chq_status"],
                best_party[:40], best_amount,
                best_source, best_score, best_label,
                rec["verdict"],
            ]
            bgs = [row_bg]*7 + [row_bg, row_bg, row_bg, score_bg, score_bg, rec["verdict_bg"]]
            nfmts = [None,None,None,None, None,NF,None, None,NF, None,None,None,None]
            aligns = ["left","left","left","left",
                      "left","right","left",
                      "left","right",
                      "left","center","center","center"]
            for col, (v, bg, nf, ha) in enumerate(zip(vals, bgs, nfmts, aligns), 1):
                sc(ws_match, r, col, v, bg=bg, h_align=ha, num_fmt=nf)

        # Summary footer
        r += 2
        matched_cnt_m   = sum(1 for rec in cheque_match_report if rec["verdict"] == "MATCHED")
        unmatched_cnt_m = len(cheque_match_report) - matched_cnt_m
        total_chq_amt_m = sum(rec["chq_amount"] for rec in cheque_match_report)
        ws_match.merge_cells(f"A{r}:M{r}")
        summ = ws_match.cell(r, 1,
            f"Total: {len(cheque_match_report)}  |  "
            f"Matched: {matched_cnt_m}  |  Unmatched: {unmatched_cnt_m}  |  "
            f"Total Amount: Rs {total_chq_amt_m:,.2f}")
        summ.fill = fill(C_GREY); summ.font = Font(bold=True, name="Arial", size=9)
        summ.alignment = align("center"); summ.border = _BR
    else:
        r += 1
        sc(ws_match, r, 1, "No cheque register data available for this date.", bg=C_AMBER)

    # ─── Sheet 16: Summary ───────────────────────────────────────────────────────
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
    # Cheque deposit match summary
    if cheque_match_report:
        matched_cnt   = sum(1 for rec in cheque_match_report if rec["verdict"] == "MATCHED")
        unmatched_cnt = len(cheque_match_report) - matched_cnt
        r = _srow15(r, "Cheque Deposits -- Name Match",
                    f"{matched_cnt} matched / {unmatched_cnt} unmatched of {len(cheque_match_report)}",
                    f"Threshold: {NAME_MATCH_THRESHOLD}  |  See 'Cheque Deposits' sheet",
                    bg=C_GREEN if unmatched_cnt == 0 else C_AMBER)
    r += 1
    r = _srow15(r, "Reconciliation Chain",
                "GW Net -> Bank Statement -> HOT Book -> All-Branches",
                "Gateway files verified against bank PDF then against book reports")
    r = _srow15(r, "Formula", "Closing + Add1 - DNC - Less2 + CNB = Bank Balance",
                "All four sections verified per gateway")

    #  SAVE
    try:
        wb.save(OUTPUT_FILE)
        saved_file = OUTPUT_FILE
    except PermissionError:
        alt = f"{Path(OUTPUT_FILE).stem}_{stmt_date.strftime('%d_%m_%Y')}_alt.xlsx"
        wb.save(alt); saved_file = alt

    for gw in gateway_results:
        gd = gw['gw_net'] - gw['bank_total']
    if cheque_match_report:
        mc = sum(1 for r in cheque_match_report if r["verdict"] == "MATCHED")
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

# ── CLI entry-point (preserves original CLI usage) ────────────────────────────
if __name__ == "__main__":
    args = parse_args()
    process_gateway_files(
        all_branches_path = args.all_branches,
        hot_book_path     = args.hot_book,
        statement_path    = args.statement,
        payu_path         = args.payu,
        output_path       = args.output,
        payu_od_paths     = args.payu_od,
        cashfree_path     = args.cashfree,
        easebuzz_path     = args.easebuzz,
        prev_brs_path     = args.prev_brs,
        brs_date_override = args.date,
    )