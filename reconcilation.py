import os, re, subprocess, sys
import pandas as pd
from datetime import datetime, date as dt_date
from difflib import SequenceMatcher
from openpyxl import Workbook
from openpyxl.styles import PatternFill, Font, Alignment, Border, Side
from openpyxl.utils import get_column_letter

# -- CONFIG -------------------------------------------------------------------
OUTPUT_FILE        = "Bank_Reconciliation.xlsx"
FUZZY_THRESHOLD    = 65
DATE_THRESHOLD_DAYS = 3
COL_TXN      = 0   # Transaction type
COL_DATE     = 2   # Date
COL_BILL     = 3   # Bill No
COL_CHQ      = 4   # Chq No
COL_PARTY    = 6   # Party name
COL_RECEIPTS = 7   # Receipt amount
COL_PAYMENTS = 9   # Payment amount
COL_NARR     = 13  # Narration
# -----------------------------------------------------------------------------


# =============================================================================
# DYNAMIC EXTRACTION HELPERS
# =============================================================================

def extract_brs_date(prev_brs_path):
    FALLBACK = "DATE NOT PROVIDED — please include previous BRS file"
    if not prev_brs_path or not os.path.exists(prev_brs_path):
        return FALLBACK
    try:
        xl     = pd.ExcelFile(prev_brs_path)
        sheets = xl.sheet_names
        preferred = ["AXIS", "BRS Statement", "BRS", "Axis", "axis", "SBI", "sbi"]
        ordered = [s for s in preferred if s in sheets] + \
                  [s for s in sheets if s not in preferred]
    except Exception:
        return FALLBACK

    date_pattern = re.compile(
        r"(?:bank\s+reconciliation\s+statement\s+as\s+on[:\s.]+)"
        r"(\d{1,2}[.\-/]\d{1,2}[.\-/]\d{2,4}"
        r"|\d{1,2}[.\-/]\w{3,9}[.\-/]\d{2,4})",
        re.IGNORECASE
    )
    as_on_pattern = re.compile(
        r"as\s+on\s+(\d{1,2}[.\-/]\d{1,2}[.\-/]\d{2,4})",
        re.IGNORECASE
    )

    for sheet in ordered:
        try:
            raw = pd.read_excel(prev_brs_path, sheet_name=sheet, header=None)
        except Exception:
            continue
        for i, row in raw.iterrows():
            if i > 30:
                break
            for cell in row:
                if not isinstance(cell, str):
                    continue
                m = date_pattern.search(cell)
                if m:
                    return m.group(1).strip().replace(".", "-")
                m2 = as_on_pattern.search(cell)
                if m2:
                    return m2.group(1).strip().replace(".", "-")

    for sheet in ordered:
        try:
            raw = pd.read_excel(prev_brs_path, sheet_name=sheet, header=None)
        except Exception:
            continue
        for i, row in raw.iterrows():
            if i > 20:
                break
            for cell in row:
                if not isinstance(cell, str):
                    continue
                m = re.search(r"\b(\d{1,2}[.\-/]\d{1,2}[.\-/]\d{4})\b", cell)
                if m:
                    return m.group(1).strip().replace(".", "-")

    return FALLBACK


def detect_book_sheet(path):
    if path.lower().endswith(".xls"):
        try:
            pd.ExcelFile(path)
        except ImportError:
            converted = _xls_to_xlsx_via_libreoffice(os.path.abspath(path))
            if converted:
                path = converted
    try:
        xl     = pd.ExcelFile(path)
        sheets = xl.sheet_names
    except Exception:
        return None
    LEDGER_SIGNALS = {"transaction", "receipts", "payments", "narration", "chq", "cheque", "bill"}
    for sheet in sheets:
        try:
            sample = pd.read_excel(path, sheet_name=sheet, header=None, nrows=20)
            text   = " ".join(
                str(v).lower()
                for row in sample.values
                for v in row
                if pd.notna(v)
            )
            hits = sum(1 for sig in LEDGER_SIGNALS if sig in text)
            if hits >= 3:
                print(f"[Book] Auto-detected ledger sheet: '{sheet}'")
                return sheet
        except Exception:
            continue
    try:
        xl = pd.ExcelFile(path)
        print(f"[Book] Could not auto-detect sheet — using first sheet: '{xl.sheet_names[0]}'")
        return xl.sheet_names[0]
    except Exception:
        return None

def extract_company_name(raw_df):
    return "ORIENT EXCHANGE AND FINANCIAL SERVICES PVT LTD"


def extract_bank_identifier(raw_df):
    for _, row in raw_df.iterrows():
        for cell in row:
            if isinstance(cell, str):
                m = re.match(r"Summary\s+Of\s+(\S+)", cell, re.IGNORECASE)
                if m:
                    bank_id = m.group(1).strip()
                    print(f"[Book] Extracted bank identifier: '{bank_id}'")
                    return bank_id
    print("[Book] Bank identifier not found — using 'BANK'")
    return "BANK"


def find_book_bank_id(raw_df, bank_name_hint):
    hint = bank_name_hint.upper().strip()
    SKIP_TOKENS = {"BANK", "THE", "OF", "LTD", "PVT", "LIMITED"}

    all_ids = []
    for _, row in raw_df.iterrows():
        for cell in row:
            if isinstance(cell, str):
                m = re.match(r"Summary\s+Of\s+(\S+)", cell, re.IGNORECASE)
                if m:
                    bid = m.group(1).strip()
                    if bid not in all_ids:
                        all_ids.append(bid)

    if not all_ids:
        return None

    print(f"[Book] All Summary IDs found: {all_ids}")

    if hasattr(find_book_bank_id, '_account_no_hint'):
        acct = find_book_bank_id._account_no_hint
        best_bid   = None
        best_len   = 0
        for bid in all_ids:
            bid_up  = bid.upper()
            if not bid_up.startswith(hint[:3] if len(hint) >= 3 else hint):
                continue
            bid_nums = re.sub(r"[^0-9]", "", bid)
            if bid_nums and len(bid_nums) >= 3 and acct.endswith(bid_nums):
                if len(bid_nums) > best_len:
                    best_len = len(bid_nums)
                    best_bid = bid
        if best_bid:
            print(f"[Book] P0 acct-suffix: '{best_bid}' matched acct '{acct}' suffix '{re.sub(r'[^0-9]','',best_bid)}'")
            return best_bid

    p1_matches = [bid for bid in all_ids if bid.upper().startswith(hint)]
    if p1_matches:
        def _has_activity(bid):
            for _, row in raw_df.iterrows():
                for cell in row:
                    if isinstance(cell, str) and cell.strip() == f"Summary Of {bid}":
                        row_vals = [str(v).strip() for v in row if pd.notna(v) and str(v).strip()]
                        try:
                            tr_idx = next(i for i, v in enumerate(row_vals) if "total receipts" in v.lower())
                            receipts = float(row_vals[tr_idx + 1].replace(',', ''))
                            if receipts != 0:
                                return True
                        except (StopIteration, ValueError, IndexError):
                            pass
                        try:
                            tp_idx = next(i for i, v in enumerate(row_vals) if "total payments" in v.lower())
                            payments = float(row_vals[tp_idx + 1].replace(',', ''))
                            if payments != 0:
                                return True
                        except (StopIteration, ValueError, IndexError):
                            pass
                        return False
            return False

        active = [bid for bid in p1_matches if _has_activity(bid)]
        if active:
            chosen = active[0]
            print(f"[Book] P1 exact-prefix: '{chosen}' matched hint '{hint}'" +
                  (f" (active among {p1_matches})" if len(p1_matches) > 1 else ""))
            return chosen

        def _common_prefix_len(a, b):
            n = min(len(a), len(b))
            for i in range(n):
                if a[i] != b[i]:
                    return i
            return n

        broader = [((_common_prefix_len(hint, bid.upper()), bid))
                   for bid in all_ids
                   if bid.upper() not in [p.upper() for p in p1_matches]
                   and _common_prefix_len(hint, bid.upper()) >= 4
                   and _has_activity(bid)]
        if broader:
            broader.sort(reverse=True)
            chosen = broader[0][1]
            print(f"[Book] P1 broader-prefix fallback: '{chosen}'")
            return chosen

        chosen = p1_matches[0]
        print(f"[Book] P1 exact-prefix: '{chosen}' matched hint '{hint}' (no active alternatives)")
        return chosen

    for bid in all_ids:
        bid_up = bid.upper()
        pos = bid_up.find(hint)
        if pos == -1:
            continue
        if pos == 0:
            print(f"[Book] P2 prefix-sub: '{bid}' matched hint '{hint}'")
            return bid
        if not bid_up[pos - 1].isalpha():
            print(f"[Book] P2 mid-sub (after non-alpha): '{bid}' matched hint '{hint}'")
            return bid

    for bid in all_ids:
        bid_up = bid.upper()
        for word in hint.split():
            if word in SKIP_TOKENS:
                continue
            if bid_up.startswith(word):
                print(f"[Book] P3 word-prefix: '{bid}' matched word '{word}' of hint '{hint}'")
                return bid

    def _common_prefix_len(a, b):
        n = min(len(a), len(b))
        for i in range(n):
            if a[i] != b[i]:
                return i
        return n

    MIN_PREFIX = 3
    best_bid    = None
    best_prefix = 0
    for bid in all_ids:
        bid_up = bid.upper()
        plen = _common_prefix_len(hint, bid_up)
        if plen >= MIN_PREFIX and plen > best_prefix:
            best_prefix = plen
            best_bid    = bid

    if best_bid:
        print(f"[Book] P4 common-prefix({best_prefix}): '{best_bid}' matched hint '{hint}'")
        return best_bid

    FUZZY_MIN = 0.70
    best_bid   = None
    best_ratio = 0.0
    for bid in all_ids:
        bid_alpha = re.sub(r"[^A-Z]", "", bid.upper())
        if not bid_alpha:
            continue
        ratio = SequenceMatcher(None, hint, bid_alpha).ratio()
        if ratio > best_ratio:
            best_ratio = ratio
            best_bid   = bid

    if best_bid and best_ratio >= FUZZY_MIN:
        print(f"[Book] P5 fuzzy({best_ratio:.2f}): '{best_bid}' matched hint '{hint}'")
        return best_bid

    print(f"[Book] No match for hint '{hint}'. Available IDs: {all_ids}")
    return None


def extract_account_info(path, filename_hint=None):
    FALLBACK_ACC    = "ACCOUNT NO NOT FOUND"
    FALLBACK_BRANCH = "BANK"
    SKIP_LINE_PREFIXES = {"customer id", "ifsc code", "micr code", "ckyc", "nominee",
                          "joint holder", "mobile", "phone", "email"}

    BANK_KEYWORD_MAP = {
        "HDFC":     "HDFC",
        "SBI":      "SBI",
        "AXIS":     "AXIS",
        "ICICI":    "ICICI",
        "PNB":      "PNB",
        "CANARA":   "CANARA",
        "KOTAK":    "KOTAK",
        "INDUSIND": "INDUSIND",
        "YES":      "YES",
        "FEDERAL":  "FEDERAL",
        "BOB":      "BOB",
        "UNION":    "UNION",
        "UCO":      "UCO",
        "IDBI":     "IDBI",
        "IDFC":     "IDFC",
        "DCB":      "DCB",
        "SBM":      "SBM",
        "BANDHAN":  "BANDHAN",
    }

    def _detect_bank_from_text(text):
        text_up = text.upper()
        for kw, name in BANK_KEYWORD_MAP.items():
            if kw in text_up:
                return name
        return None

    bank_from_filename = None
    if filename_hint:
        bank_from_filename = _detect_bank_from_text(os.path.basename(filename_hint))
        if bank_from_filename:
            print(f"[Statement] Bank detected from filename: '{bank_from_filename}'")

    try:
        ext = os.path.splitext(path)[1].lower()
        if ext in (".xlsx", ".xlsm", ".xltx", ".xltm"):
            raw = pd.read_excel(path, header=None, engine="openpyxl")
        elif ext == ".xls":
            try:
                import xlrd  # noqa
                raw = pd.read_excel(path, header=None, engine="xlrd")
            except ImportError:
                converted = _xls_to_xlsx_via_libreoffice(os.path.abspath(path))
                if converted:
                    raw = pd.read_excel(converted, header=None, engine="openpyxl")
                else:
                    raw = pd.read_excel(path, header=None)
        else:
            raw = pd.read_excel(path, header=None)
    except Exception:
        return FALLBACK_ACC, FALLBACK_BRANCH, bank_from_filename or "UNKNOWN"

    account_no   = FALLBACK_ACC
    branch_label = FALLBACK_BRANCH

    bank_from_header = None
    for i, row in raw.iterrows():
        if i > 25:
            break
        cells    = [str(c).strip() if pd.notna(c) else "" for c in row.tolist()]
        combined = " ".join(cells)
        cells_lower = [c.lower() for c in cells]
        if ("bank reference" in cells_lower and
                any("payment narration" in c for c in cells_lower)):
            bank_from_header = "INDUSIND"
            print(f"[Statement] Bank detected from IndusInd header pattern at row {i}: 'INDUSIND'")
            break
        candidate = _detect_bank_from_text(combined)
        if candidate:
            bank_from_header = candidate
            print(f"[Statement] Bank detected from header row {i}: '{bank_from_header}'")
            break

    for i, row in raw.iterrows():
        cells    = [str(c).strip() if pd.notna(c) else "" for c in row.tolist()]
        combined = " ".join(cells).strip()
        HDR_STOP = {"tran date", "txn date", "transaction date", "value date",
                    "date", "posting date", "trans date"}
        HDR_AMT  = {"debit", "credit", "withdrawal", "deposit"}
        cells_l  = [c.lower() for c in cells]
        if any(s in cells_l for s in HDR_STOP) and any(s in cells_l for s in HDR_AMT):
            break
        combined_lower = combined.lower()

        if account_no == FALLBACK_ACC:
            m = re.search(r"statement\s+of\s+account\s+no[\s\-:]+(\d{9,18})",
                          combined_lower)
            if m:
                account_no = m.group(1)
                print(f"[Statement] Account number (Statement line): '{account_no}'")

        if account_no == FALLBACK_ACC:
            m = re.search(r"a/?c\s+no\.?\s+(\d{9,18})", combined, re.IGNORECASE)
            if m:
                account_no = m.group(1)
                print(f"[Statement] Account number (A/c no. pattern): '{account_no}'")

        if account_no == FALLBACK_ACC:
            skip_this_line = any(combined_lower.startswith(pfx) for pfx in SKIP_LINE_PREFIXES)
            if not skip_this_line:
                for cell in cells:
                    m = re.search(r"\b(\d{9,18})\b", cell)
                    if m:
                        account_no = m.group(1)
                        print(f"[Statement] Account number (numeric scan): '{account_no}'")
                        break

        if branch_label == FALLBACK_BRANCH:
            m3 = re.search(
                r"(?:branch\s*(?:name)?|sol\s*id|branch\s*code)[:\s\-]+([A-Za-z0-9 \-]{3,30})",
                combined, re.IGNORECASE
            )
            if m3:
                candidate = m3.group(1).strip().split()[0].upper()
                SKIP_BRANCH = {"BANK", "CODE", "NAME", "ID", "NO", "NUMBER"}
                if candidate not in SKIP_BRANCH and len(candidate) >= 3:
                    branch_label = candidate
                    print(f"[Statement] Branch from label: '{branch_label}'")

    bank_name_from_ifsc = "UNKNOWN"
    IFS_MAP = {
        "SBIN": "SBI", "UTIB": "AXIS", "HDFC": "HDFC", "ICIC": "ICICI",
        "PUNB": "PNB", "BARB": "BOB",  "CNRB": "CANARA", "IDIB": "INDIAN",
        "UBIN": "UBI", "BKID": "BOI",  "IOBA": "IOB",
        "INDB": "INDUSIND", "IBKL": "INDUSIND",
        "YESB": "YES", "KKBK": "KOTAK",
        "FDRL": "FEDERAL",  "DCBL": "DCB", "IDFC": "IDFC",
        "CORP": "CORPBANK", "SBMO": "SBM",
    }
    try:
        for _, row2 in raw.iterrows():
            for cell2 in row2:
                if not isinstance(cell2, str):
                    continue
                m2 = re.search(r"([A-Z]{4})\d{7}", cell2.upper())
                if m2:
                    prefix = m2.group(1)
                    bank_name_from_ifsc = IFS_MAP.get(prefix, prefix)
                    print(f"[Statement] Bank from IFSC code: '{bank_name_from_ifsc}' ({prefix})")
                    break
            if bank_name_from_ifsc != "UNKNOWN":
                break
    except Exception:
        pass

    if bank_from_filename:
        bank_name = bank_from_filename
        if bank_name_from_ifsc != "UNKNOWN" and bank_name_from_ifsc != bank_from_filename:
            print(f"[Statement] NOTE: IFSC says '{bank_name_from_ifsc}' but filename says "
                  f"'{bank_from_filename}' — using filename")
    elif bank_from_header:
        bank_name = bank_from_header
        if bank_name_from_ifsc != "UNKNOWN" and bank_name_from_ifsc != bank_from_header:
            print(f"[Statement] NOTE: IFSC says '{bank_name_from_ifsc}' but header says "
                  f"'{bank_from_header}' — using header")
    else:
        bank_name = bank_name_from_ifsc

    return account_no, branch_label, bank_name


def extract_account_from_book(book_path, bank_hint):
    try:
        sheet = detect_book_sheet(book_path)
        raw   = safe_read_excel(book_path, sheet_name=sheet, header=None)
    except Exception:
        return None

    hint_upper = bank_hint.upper().strip()
    for i, row in raw.iterrows():
        cells    = [str(c).strip() if pd.notna(c) else "" for c in row.tolist()]
        combined = " ".join(cells)
        combined_upper = combined.upper()
        if hint_upper not in combined_upper:
            continue
        m = re.search(r"a/?c\s+no\.?\s+(\d{9,18})", combined, re.IGNORECASE)
        if m:
            acc = m.group(1)
            print(f"[Book] Account number for '{hint_upper}' from book: '{acc}'")
            return acc
        m2 = re.search(r"\b(\d{11,18})\b", combined)
        if m2:
            acc = m2.group(1)
            print(f"[Book] Account number for '{hint_upper}' from book (long num): '{acc}'")
            return acc
    return None


# =============================================================================
# HELPERS
# =============================================================================

# FIX 3: clean_name now strips ANY leading "CODE - " prefix (not just INDIVI -)
# This fixes matching for entries like "TATVICDIGI - TATVIC DIGITAL ANALYTICS..."
# and "HARSHDE - HARSHDEEP INDUSTRIES..." which previously kept their prefixes.
def clean_name(n):
    if not isinstance(n, str):
        return ""
    # Strip any leading alphanumeric code prefix followed by " - " or " - "
    # Examples: "INDIVI - JOHN DOE" → "JOHN DOE"
    #           "TATVICDIGI - TATVIC DIGITAL..." → "TATVIC DIGITAL..."
    #           "HARSHDE - HARSHDEEP INDUSTRIES" → "HARSHDEEP INDUSTRIES"
    n = re.sub(r"^[A-Z0-9]{1,12}\s*[-–]\s*", "", n.strip(), flags=re.IGNORECASE)
    return n.strip().upper()


def fuzzy(a, b):
    a, b = clean_name(a), clean_name(b)
    if not a or not b:
        return 0
    original_score = round(SequenceMatcher(None, a, b).ratio() * 100)
    a_sorted = " ".join(sorted(a.split()))
    b_sorted = " ".join(sorted(b.split()))
    sorted_score = round(SequenceMatcher(None, a_sorted, b_sorted).ratio() * 100)
    shorter = a if len(a) <= len(b) else b
    longer  = a if len(a) >  len(b) else b
    if shorter in longer:
        substring_score = 90
    elif set(shorter.split()).issubset(set(longer.split())):
        substring_score = 85
    else:
        substring_score = 0
    return max(original_score, sorted_score, substring_score)


def to_amt(v):
    try:
        f = float(str(v).replace(",", "").strip())
        return f if f > 0 else 0.0
    except Exception:
        return 0.0

def to_signed_amt(v):
    try:
        f = float(str(v).replace(",", "").strip())
        return f
    except Exception:
        return 0.0

# FIX 4: extract_party_from_desc — improved TRF/ pattern to skip leading
# numeric-only segments (e.g. "003") and correctly extract the party name.
# Old pattern:  r"TRF/[^/]+/([^/]+)/"  → captured "003" for "TRF/003/PARTY/transfer"
# New patterns: try "TRF/<digits>/<party>/" first, then fallback "TRF/<party>/"
def extract_party_from_desc(desc):
    if not isinstance(desc, str):
        return ""

    SKIP = {"BANK", "NEFT", "RTGS", "UPI", "IMPS", "003", "001", "0001", "OTHER",
            "STATE BANK OF INDIA", "HDFC BANK", "ICICI BANK", "INDUSIND BANK",
            "PUNJAB NATIONAL BANK", "BANK OF BARODA", "CANARA BANK", "DEUTSCHE BANK",
            "SHREE KADI NAGARIK SAHAKARI"}

    # ── IndusInd RTGS/NEFT
    m = re.search(
        r"^[RN]/[A-Z0-9]+/[A-Z]{4}[A-Z0-9]*/([A-Za-z][A-Za-z .]{2,})(?:/|$)",
        desc, re.IGNORECASE
    )
    if m:
        name = m.group(1).strip().upper()
        if name and name not in SKIP and len(name) > 2 and "BANK" not in name:
            return name

    # ── HDFC-style RTGS Cr
    m = re.search(
        r"RTGS\s+[CDcd]r[-–][A-Z0-9]{11}[-–]([^-–]{3,}?)[-–][A-Za-z]",
        desc, re.IGNORECASE
    )
    if m:
        name = m.group(1).strip().upper()
        name = re.sub(r"\s+P\s*$", "", name).strip()
        if name and name not in SKIP and len(name) > 3:
            return name

    # ── HDFC RTGS Dr
    m = re.search(r"RTGS\s+Dr[-–][A-Z0-9]{11}[-–]([^-–]{3,}?)[-–]", desc, re.IGNORECASE)
    if m:
        name = m.group(1).strip().upper()
        if name and name not in SKIP and len(name) > 3:
            return name

    # ── HDFC RTGS Cr fallback
    m = re.search(r"RTGS\s+[CDcd]r[-–][^-–]+-(.+?)-[A-Z]{4}[A-Z0-9]*\d{6,}", desc, re.IGNORECASE)
    if m:
        name = m.group(1).strip().upper()
        if name and name not in SKIP and len(name) > 3:
            return name

    # ── HDFC FT
    m = re.search(
        r"^FT\s*[-–]\s*[A-Z0-9]+\s*[-–]\s*[-–]?\s*\S*\s*[-–]\s*([A-Za-z][A-Za-z .,&']{2,})",
        desc, re.IGNORECASE
    )
    if m:
        name = m.group(1).strip().upper().rstrip(" -")
        name = re.sub(r"\s{2,}", " ", name).strip()
        if name and name not in SKIP and len(name) > 3 and "BANK" not in name:
            return name

    # ── HDFC Cheque Paid
    m = re.search(r"^([A-Za-z][A-Za-z .,&]{2,}?)\s*[-–]\s*CHQ\s+PAID", desc, re.IGNORECASE)
    if m:
        name = m.group(1).strip().upper()
        if name and name not in SKIP and len(name) > 2:
            return name

    # ── RFX / forex deal
    m = re.search(r"RFX\s+(\S+)", desc, re.IGNORECASE)
    if m:
        return f"FOREX DEAL {m.group(1).strip().upper()}"
    
    HOT_TRANSFER_PATTERN = re.compile(
        r"HOT\s+(?:HDFC|AXIS|ICICI|SBI|INDUSIND|KOTAK|YES|PNB|CANARA|BOB|FEDERAL|RBL|DCB|IDFC|BANDHAN|UCO|UNION|IDBI|IOB|UBI|BOI|INDIAN)"  # HOT + any bank name
        r"|(?:HDFC|AXIS|ICICI|SBI|INDUSIND|KOTAK|YES|PNB|CANARA|BOB|FEDERAL|RBL|DCB|IDFC|BANDHAN|UCO|UNION|IDBI|IOB|UBI|BOI|INDIAN)\s+HOT"  # any bank + HOT
        r"|ORIENT.*HOT"             # ORIENT EXCHANGE ... HOT
        r"|HOT.*ORIENT"             # HOT ... ORIENT EXCHANGE
        r"|INB/IFT/ORIENT"          # IndusInd internal transfer
        r"|\bHOT\b.*\bBRANCH\b"    # HOT ... BRANCH
        r"|\bHEAD\s+OFFICE\s+TRANSFER\b"  # spelled out
        r"|\bH\.O\.T\b"             # abbreviated with dots
        r"|BEING\s+FUNDS\s+TRANSFERRED\s+FROM\s+HOT"  # your exact narration
        r"|FROM\s+HOT\s+\w+\s+TO\s+BRANCH",           # FROM HOT AXIS TO BRANCHES
        re.IGNORECASE
    )

    if HOT_TRANSFER_PATTERN.search(desc):
        return extract_company_name(None)

    # ── Smart IMPS extraction ─────────────────────────────────────────────────
    # IMPS/P2A/<ref>/<seg3>/<seg4>/...
    # seg3 is either the sender name OR a bank routing code.
    # If seg3 is a known bank code, the real name is in seg4; otherwise seg3 is the name.
    _IMPS_BANK_CODE = re.compile(
        r"^(?:SBIN|HDFC|ICIC|AXIS|KOTK|INDB|YESB|BARB|UBIN|PUNB|CNRB|UTIB|IDFB|DCBL|FDRL|BDBL|"
        r"STATEBAN|CANARABA|UNIONBAN|HDFCBANK|ICICIBAN|KOTAKMAH|BANKOFIN|KARNATAK|KKBKH?|"
        r"REMITTER|IMPS|NEFT|RTGS|UPI|INET|INWD)$",
        re.IGNORECASE
    )
    _imps_m = re.search(r"IMPS/P2A/[^/]+/([^/]+)/(.+)", desc, re.IGNORECASE)
    if _imps_m:
        _seg3 = _imps_m.group(1).strip()
        _rest = _imps_m.group(2)
        if _IMPS_BANK_CODE.match(_seg3):
            # seg3 is a bank code — name is the next slash-delimited segment
            _seg4 = _rest.split("/")[0].strip()
            if _seg4 and not _IMPS_BANK_CODE.match(_seg4) and "BANK" not in _seg4.upper():
                _imps_name = _seg4.upper()
                if _imps_name and _imps_name not in SKIP:
                    return _imps_name
        else:
            _imps_name = _seg3.upper()
            if _imps_name and _imps_name not in SKIP and "BANK" not in _imps_name:
                return _imps_name
    # ─────────────────────────────────────────────────────────────────────────

    patterns = [
        # Axis outward NEFT with SK prefix
        r"NEFT/SK/[^/]+/\d+/([^/]+)/",
        # Axis outward RTGS with SK prefix
        r"RTGS/SK/[^/]+/\d+/([^/]+)/",
        # Generic RTGS/SK fallback
        r"RTGS/SK/[^/]+/[^/]+/([^/]+)/",
        # Axis Bank inward NEFT with bank name as 4th segment
        r"NEFT/[^/]+/([A-Za-z][^/]{2,})/(?:[A-Za-z ]*BANK[A-Za-z ]*)/",
        r"NEFT/[^/]+/[^/]+/([^/]+)/",
        r"RTGS/[^/]+/([^/]+)/",
        # IndusInd UPI full-name: UPI/<ref>/CR/<code>/<bank>/<handle>/UPI/<handle>/<FULL NAME>/0000/
        r"UPI/[^/]+/(?:CR|DR)/[^/]+/[^/]+/[^/]+/UPI/[^/]+/([A-Za-z][A-Za-z ]{2,})/0*\s*/",
        # IndusInd UPI short-code fallback
        r"UPI/[^/]+/(?:CR|DR)/([A-Za-z][A-Za-z .]{2,})/",
        # Standard UPI with P2A
        r"UPI/P2A/[^/]+/([^/]+)/",
        # IMPS handled by smart bank-code block above
        r"MOB/TPFT/([^/]+)/",
        r"INB/IFT/([^/]+)/",
        # CLG 5-segment: party in last segment (Axis: CLG/000240/020226/Ahmedabad/JAINAM)
        r"(?i)CLG/[^/]+/[^/]+/[^/]*/([A-Za-z][^/\s]{1,})",
        # CLG with party name in 2nd segment (Axis: Clg/AMPO VALVES.../STATE BANK)
        r"(?i)CLG/([A-Za-z][^/]{2,})/[A-Za-z]",
        # CLG with bank/name in 4th segment (IndusInd: CLG/852759/020226/Punjab Nat/)
        r"(?i)CLG/[^/]+/[^/]+/([A-Za-z][^/]{1,})",
        # TRF with optional leading numeric segment
        r"TRF/\d+/([A-Za-z][^/]{2,})/",
        r"TRF/([A-Za-z][^/]{2,})/",
        r"MOB/TPFT/([^/]+)/",
        r"INB/IFT/([^/]+)/",
        # HDFC UPI
        r"UPI-(?:Mr\.?\s+|Mrs\.?\s+|Ms\.?\s+)?([A-Z][A-Za-z0-9 ]+?)\s*-[a-z]",
        # HDFC NEFT
        r"NEFT\s+[CDcd]r[-\u2013][A-Z0-9]{11}[-\u2013]([^-\u2013]{3,}?)[-\u2013][A-Za-z]",
    ]
    for p in patterns:
        m = re.search(p, desc, re.IGNORECASE)
        if m:
            name = m.group(1).strip().upper().split("/")[0].strip()
            name = re.sub(r"\s*\d+$", "", name).strip()
            if name and name not in SKIP and "BANK" not in name:
                return name

    desc_clean = re.sub(r"^[A-Z]+/[A-Z0-9]+/", "", desc).strip()
    person = desc_clean.split("/")[0].strip()
    return person


def _xls_to_xlsx_via_libreoffice(xls_path):
    import subprocess, tempfile
    out_dir = tempfile.gettempdir()
    basename_no_ext = os.path.splitext(os.path.basename(xls_path))[0]
    out_path = os.path.join(out_dir, basename_no_ext + ".xlsx")
    if os.path.exists(out_path):
        return out_path
    try:
        subprocess.run(
            ["libreoffice", "--headless", "--convert-to", "xlsx",
             "--outdir", out_dir, xls_path],
            capture_output=True, text=True, timeout=60
        )
        if os.path.exists(out_path):
            return out_path
    except Exception:
        pass
    return None


def safe_read_excel(path, **kwargs):
    abspath  = os.path.abspath(path)
    dirname  = os.path.dirname(abspath)
    basename = os.path.basename(abspath)
    ext      = os.path.splitext(abspath)[1].lower()

    if ext == ".xls":
        try:
            return pd.read_excel(path, engine="xlrd", **kwargs)
        except ImportError:
            converted = _xls_to_xlsx_via_libreoffice(abspath)
            if converted:
                try:
                    return pd.read_excel(converted, engine="openpyxl", **kwargs)
                except Exception:
                    kw2 = {k: v for k, v in kwargs.items() if k != "sheet_name"}
                    return pd.read_excel(converted, engine="openpyxl", sheet_name=0, **kw2)
        except Exception:
            pass

    try:
        return pd.read_excel(path, **kwargs)
    except ValueError:
        if basename.startswith("~$"):
            alt_path = os.path.join(dirname, basename[2:])
            if os.path.exists(alt_path):
                return pd.read_excel(alt_path, **kwargs)
        if ext in (".xlsx", ".xlsm", ".xltx", ".xltm"):
            try:
                return pd.read_excel(path, engine="openpyxl", **kwargs)
            except Exception:
                pass
        if ext == ".xls":
            try:
                return pd.read_excel(path, engine="xlrd", **kwargs)
            except Exception:
                pass
        raise


# =============================================================================
# DATE UTILITIES
# =============================================================================

def parse_date(v):
    if isinstance(v, datetime):
        return v.date()
    if isinstance(v, dt_date):
        return v
    if not isinstance(v, str):
        try:
            return pd.Timestamp(v).date()
        except Exception:
            return None
    v = v.strip()
    for fmt in ("%d-%m-%Y", "%d/%m/%Y", "%Y-%m-%d",
                "%d-%b-%Y", "%d %b %Y", "%d-%B-%Y",
                "%m/%d/%Y", "%d-%m-%y", "%d/%m/%y",
                "%d.%m.%Y", "%d.%m.%y",
                "%d %b %Y", "%d %B %Y",
                "%d-%b-%y", "%d-%B-%y"):
        try:
            v_clean = v.split(" ")[0] if re.search(r"\d{2}:\d{2}", v) else v
            return datetime.strptime(v_clean, fmt).date()
        except ValueError:
            continue
    return None


def date_diff(a, b):
    da, db = parse_date(a), parse_date(b)
    if da is None or db is None:
        return None
    return abs((da - db).days)


def within_date(book_date, stmt_date, threshold=DATE_THRESHOLD_DAYS):
    if not book_date or str(book_date).strip() in ("", "nan"):
        return True
    diff = date_diff(book_date, stmt_date)
    if diff is None:
        return True
    return diff <= threshold


# =============================================================================
# STATEMENT DATE RANGE EXTRACTION
# =============================================================================

def extract_statement_date_range(raw_df):
    start_date = None
    end_date   = None
    for i, row in raw_df.iterrows():
        cells = [str(c).strip() if pd.notna(c) else "" for c in row.tolist()]
        combined = " ".join(cells)
        m_start = re.search(r"start\s+date[:\s]+(\S+)", combined, re.IGNORECASE)
        m_end   = re.search(r"end\s+date[:\s]+(\S+)",   combined, re.IGNORECASE)
        if m_start:
            start_date = parse_date(m_start.group(1))
        if m_end:
            end_date = parse_date(m_end.group(1))
        if start_date and end_date:
            break
        if i > 20:
            break
    return start_date, end_date


# =============================================================================
# PARSE PREVIOUS BRS
# =============================================================================

def parse_previous_brs(path, bank_id=None):
    empty = {
        "issued_not_debited":      [],
        "deposited_not_credited":  [],
        "debited_not_book":        [],
        "credited_not_book":       [],
        "prev_book_closing_bal":   0.0,
        "prev_bank_closing_bal":   0.0,
    }
    if not path or not os.path.exists(path):
        return empty

    try:
        xl     = pd.ExcelFile(path)
        sheets = xl.sheet_names
        print(f"[Previous BRS] Sheets found: {sheets}")
    except Exception as e:
        print(f"[WARN] Could not read previous BRS: {path} -- {e}")
        return empty

    bank_prefix = ""
    if bank_id:
        m = re.match(r"([A-Za-z]+)", bank_id)
        bank_prefix = m.group(1).upper() if m else bank_id.upper()

    KNOWN_BANK_PREFIXES = [
        "AXIS", "HDFC", "ICICI", "SBI", "PNB", "CANARA", "KOTAK", "INDUSIND",
        "YES", "FEDERAL", "BOB", "UNION", "UCO", "IDBI", "IDFC", "DCB", "SBM",
        "BANDHAN", "RBL", "CSB", "KARNATAKA", "INDIAN", "IOB", "UBI", "BOI",
    ]
    bank_short_prefix = bank_prefix
    for kp in sorted(KNOWN_BANK_PREFIXES, key=len, reverse=True):
        if bank_prefix.startswith(kp):
            bank_short_prefix = kp
            break
    if bank_short_prefix != bank_prefix:
        print(f"[Previous BRS] Bank short prefix: '{bank_short_prefix}' (from bank_id='{bank_id}')")

    # ── Output-format detection ────────────────────────────────────────────────
    # When the previous BRS file is itself an output file produced by this script
    # (e.g. Bank_Reconciliation_AHMD_AXIS_12_03_2026.xlsx), it contains sheets like
    # "Book Entries (AXIS846)", "Bank Statement (AXIS846)", "BRS Statement", etc.
    # In that case the "BRS Statement" sheet is the correct source for outstanding
    # items — NOT "Book Entries (…)" which has a ledger layout, not a BRS layout.
    OUTPUT_FORMAT_PREFIXES = ("BOOK ENTRIES", "BANK STATEMENT", "BOOK ONLY", "BANK ONLY",
                              "MATCHED", "CF AUDIT TRAIL", "SUMMARY")
    is_output_format = any(
        any(s.upper().startswith(pfx) for pfx in OUTPUT_FORMAT_PREFIXES)
        for s in sheets
    )
    if is_output_format and "BRS Statement" in sheets:
        print(f"[Previous BRS] Detected output-format file — using 'BRS Statement' sheet directly")
        target = "BRS Statement"

    target = None if not is_output_format else (
        "BRS Statement" if "BRS Statement" in sheets else None
    )

    if bank_prefix and not target:
        for s in sheets:
            s_up = s.upper()
            # Skip output-format non-BRS sheets even if they contain the bank name
            if any(s_up.startswith(pfx) for pfx in OUTPUT_FORMAT_PREFIXES):
                continue
            if (bank_prefix in s_up or bank_id.upper() in s_up or
                    bank_short_prefix in s_up or s_up in bank_prefix):
                target = s
                print(f"[Previous BRS] Sheet '{s}' matched bank '{bank_id}' by name")
                break

    if target is None and bank_prefix:
        for s in sheets:
            s_up = s.upper()
            # Skip output-format non-BRS sheets
            if any(s_up.startswith(pfx) for pfx in OUTPUT_FORMAT_PREFIXES):
                continue
            try:
                sample = safe_read_excel(path, sheet_name=s, header=None, nrows=10)
                text = " ".join(str(v) for row in sample.values
                                for v in row if pd.notna(v)).upper()
                if bank_prefix in text or bank_short_prefix in text:
                    target = s
                    print(f"[Previous BRS] Sheet '{s}' content mentions bank '{bank_short_prefix}'")
                    break
            except Exception:
                continue

    if target is None:
        generic = ["BRS Statement", "AXIS", "Axis", "axis", "SBI", "sbi"]
        for s in generic:
            if s not in sheets:
                continue
            s_up = s.upper()
            # Skip output-format non-BRS sheets in generic scan
            if any(s_up.startswith(pfx) for pfx in OUTPUT_FORMAT_PREFIXES):
                continue
            if bank_prefix:
                try:
                    sample = safe_read_excel(path, sheet_name=s, header=None, nrows=10)
                    text = " ".join(str(v) for row in sample.values
                                    for v in row if pd.notna(v)).upper()
                    other_banks = {"AXIS", "HDFC", "ICICI", "SBI", "PNB", "CANARA", "KOTAK"}
                    other_banks.discard(bank_prefix)
                    other_banks.discard(bank_short_prefix)
                    found_other = [b for b in other_banks if b in text]
                    if found_other and bank_prefix not in text and bank_short_prefix not in text:
                        print(f"[Previous BRS] SKIP: Sheet '{s}' is for {found_other}, "
                              f"not '{bank_short_prefix}'. Ignoring.")
                        continue
                except Exception:
                    pass
            target = s
            print(f"[Previous BRS] Using sheet: '{s}'")
            break

    if target is None:
        target = sheets[0]
        print(f"[Previous BRS] Fallback to first sheet: '{target}'")

    try:
        raw = safe_read_excel(path, sheet_name=target, header=None)
    except Exception as e:
        print(f"[WARN] Could not read sheet '{target}': {e}")
        return empty

    prev_book_closing = 0.0
    prev_bank_closing = 0.0
    for i, row in raw.iterrows():
        cells    = [str(c).strip() if pd.notna(c) else "" for c in row.tolist()]
        combined = " ".join(cells).lower()
        signed_amounts = [to_signed_amt(c) for c in cells
                          if to_signed_amt(c) != 0.0]
        if not signed_amounts:
            continue
        if "closing balance as per company books" in combined or \
           "closing balance as per book" in combined:
            prev_book_closing = max(signed_amounts, key=abs)
            print(f"[Previous BRS] Prev book closing balance: {prev_book_closing}")
        if "closing balance as per bank" in combined or \
           "closing balance as per bank book" in combined or \
           "closing balanace as per bank" in combined:
            prev_bank_closing = max(signed_amounts, key=abs)
            print(f"[Previous BRS] Prev bank closing balance: {prev_bank_closing}")

    SECTION_MAP = {
        "issued_not_debited":     [
            "cheques issued but not debited in bank book",
            "cheques issued but not debited in bank",
            "cheques issued but not debited",
            "cheques issued but not",
        ],
        "deposited_not_credited": [
            "cheques deposited but not credited in bank book",
            "cheques deposited but not credited in bank",
            "cheques deposited but not credited",
            "deposited but not credited",
        ],
        "debited_not_book":       [
            "debited in pass book but not credited in our book",
            "debited in pass book but not",
            "debited in bank but not credited in our book",
            "debited in bank but not",
        ],
        "credited_not_book":      [
            "credited in pass book but not debited in our book",
            "credited in pass book but not",
            "credited in bank but not debited in our book",
            "credited in bank but not",
        ],
    }
    END_SECTIONS = [
        "closing balance as per bank",
        "closing balance as per book",
        "closing balanace as per bank",
        "closing balanace as per book",
        "difference",
    ]
    current_section = None
    result = {k: [] for k in SECTION_MAP}
    result["prev_book_closing_bal"] = prev_book_closing
    result["prev_bank_closing_bal"] = prev_bank_closing

    for _, row in raw.iterrows():
        cells    = [str(c).strip() if pd.notna(c) else "" for c in row.tolist()]
        combined = " ".join(cells).lower()
        matched_section = None
        for sec, keywords in SECTION_MAP.items():
            if any(kw in combined for kw in keywords):
                matched_section = sec
                break
        if matched_section:
            current_section = matched_section
            continue
        if any(kw in combined for kw in END_SECTIONS):
            current_section = None
            continue
        if current_section is None:
            continue
        amounts = [to_amt(c) for c in cells if to_amt(c) > 0]
        if not amounts:
            continue
        SKIP_WORDS = {"Add", "Less", "Nil", "nan", "-", "Being", "Total",
                      "Opening Balance", "Closing Balance", "Summary"}

        def fmt_date(v):
            if not v or v in ("nan", ""):
                return ""
            if re.search(r"\d{2}[-/]\d{2}[-/]\d{4}", str(v)):
                return str(v)[:10]
            m = re.match(r"(\d{4})-(\d{2})-(\d{2})", str(v))
            if m:
                return f"{m.group(3)}-{m.group(2)}-{m.group(1)}"
            return str(v)

        non_numeric_cells = []
        for c in cells:
            if c in SKIP_WORDS or c == "":
                continue
            try:
                float(c.replace(",", ""))
            except ValueError:
                if not re.search(r"\d{2}[-/]\d{2}[-/]\d{2,4}", c) and \
                   not re.match(r"\d{4}-\d{2}-\d{2}", c):
                    non_numeric_cells.append(c)
        if not non_numeric_cells:
            continue

        date_str = fmt_date(cells[0]) if cells else ""
        txn_type = cells[1] if len(cells) > 1 else ""

        bill_no   = cells[2].replace(".0", "").strip() if len(cells) > 2 else ""
        # Validate bill_no is actually a bill number (7 digits) else blank it
        if not re.fullmatch(r"\d{7}", bill_no):
            bill_no = ""

        chq_no    = cells[3].replace(".0", "").strip() if len(cells) > 3 else ""
        # Validate chq_no is numeric, else blank it
        if not re.fullmatch(r"\d+", chq_no):
            chq_no = ""

        party     = ""
        raw_party = cells[4] if len(cells) > 4 else ""
        if (raw_party and raw_party not in SKIP_WORDS
                and not re.fullmatch(r"[\d,. ]+", raw_party)
                and not re.match(r"\d{4}-\d{2}-\d{2}", raw_party)
                and not re.search(r"\d{2}[-/]\d{2}[-/]\d{4}", raw_party)):
            party = raw_party
        if not party:
            party = max(non_numeric_cells, key=len)


        item_amt    = to_amt(cells[5]) if len(cells) > 5 else 0.0
        running_amt = to_amt(cells[6]) if len(cells) > 6 else 0.0
        if item_amt > 0 and item_amt != running_amt:
            amount = item_amt
        else:
            candidates = [a for a in amounts if a != running_amt]
            amount = min(candidates) if candidates else max(amounts)

        narration = ""
        if len(cells) > 7 and cells[7] not in ("nan", "", "-"):
            narration = cells[7]
        else:
            for c in reversed(cells):
                if c in SKIP_WORDS or c == "":
                    continue
                try:
                    float(c.replace(",", ""))
                    continue
                except ValueError:
                    pass
                if (c != party and len(c) > 3
                        and not re.search(r"\d{2}[-/]\d{2}[-/]\d{4}", c)
                        and not re.match(r"\d{4}-\d{2}-\d{2}", c)):
                    narration = c
                    break

        clean_party = clean_name(party)
        if current_section in ("debited_not_book", "credited_not_book"):
            extracted = extract_party_from_desc(party)
            if extracted and len(extracted) > 2:
                clean_party = extracted.upper()

        result[current_section].append({
            "date":      date_str,
            "txn_type":  txn_type,
            "bill_no":   bill_no,
            "chq_no":    chq_no,
            "party":     clean_party,
            "amount":    amount,
            "narration": narration if narration else party,
            "source":    "carried_forward",
        })

    total = sum(len(v) for k, v in result.items() if isinstance(v, list))
    print(f"[Previous BRS] Loaded: {total} outstanding items")
    for k, v in result.items():
        if isinstance(v, list):
            print(f"   {k}: {len(v)} items")
    print(f"[Prev BRS Debug] Sheet used: '{target}'")
    print(f"[Prev BRS Debug] Total rows in sheet: {len(raw)}")
    print(f"[Prev BRS Debug] issued_not_debited entries:")
    for item in result["issued_not_debited"]:
        print(f"   chq={item['chq_no']}  party={item['party']}  amt={item['amount']}")
    return result

# =============================================================================
# CARRY-FORWARD LOGIC
# =============================================================================
def carry_forward(prev_brs, stmt_df, book_only, stmt_only, book_df, company_name,
                  book_opening_bal=None):
    stmt = stmt_df.copy()
    stmt["_used_cf"] = False

    def _norm_chq(c):
        s = str(c).strip().lstrip("0")
        return s if s else "0"

    def _parse_date(d):
        s = str(d).strip()[:10].replace(".", "-").replace("/", "-")
        for fmt in ["%d-%m-%Y", "%Y-%m-%d", "%m-%d-%Y"]:
            try:
                from datetime import datetime
                return datetime.strptime(s, fmt)
            except ValueError:
                continue
        return None

    def _date_diff(d1, d2):
        dt1 = _parse_date(d1)
        dt2 = _parse_date(d2)
        if dt1 and dt2:
            return abs((dt2 - dt1).days)
        return None

    GENERIC_CHQ = {"", "nan", "99", "511", "0"}

    def _is_reversal_inflow(br):
        inflow_chq = str(br.get("Chq No", "")).strip()
        inflow_amt = float(br.get("Book Amt (Rs)", 0))
        if inflow_chq in GENERIC_CHQ:
            return False
        for _, out_row in book_df.iterrows():
            if out_row.get("Direction") != "OUTFLOW":
                continue
            out_chq = str(out_row.get("Chq No", "")).strip()
            out_amt = float(out_row.get("Book Amt (Rs)", 0))
            if out_chq == inflow_chq and abs(out_amt - inflow_amt) < 0.01:
                return True
        return False

    def find_stmt_match(item, direction):
        if item["chq_no"]:
            norm_item_chq = _norm_chq(item["chq_no"])
            hits = stmt[
                (~stmt["_used_cf"]) &
                (stmt["Chq No"].apply(_norm_chq) == norm_item_chq)
            ]
            if not hits.empty:
                stmt.at[hits.index[0], "_used_cf"] = True
                return True

        for si, sr in stmt[(stmt["Direction"] == direction) & (~stmt["_used_cf"])].iterrows():
            score     = fuzzy(item["party"], sr["Party"])
            amt_match = abs(float(sr["Bank Amt (Rs)"]) - float(item["amount"])) < 0.01
            if score >= FUZZY_THRESHOLD and amt_match:
                stmt.at[si, "_used_cf"] = True
                return True

        if item["chq_no"]:
            hits = stmt[
                (stmt["Direction"] == direction) &
                (~stmt["_used_cf"]) &
                (abs(stmt["Bank Amt (Rs)"] - float(item["amount"])) < 0.01)
            ]
            if len(hits) == 1:
                si        = hits.index[0]
                sr        = stmt.loc[si]
                item_date = item.get("date", "")
                if item_date:
                    diff = _date_diff(item_date, sr["Date"])
                    if diff is not None and diff > DATE_THRESHOLD_DAYS * 10:
                        print(f"[CF] Skipping amount-only match for {item['party']} "
                              f"₹{item['amount']:,.2f} — date gap {diff} days too large")
                        return False
                stmt.at[si, "_used_cf"] = True
                return True

        return False

    def chq_cleared_in_stmt(chq_no, party, amount):
        norm_chq = _norm_chq(chq_no)
        hits = stmt[
            (~stmt["_used_cf"]) &
            (stmt["Chq No"].apply(_norm_chq) == norm_chq)
        ]
        if not hits.empty:
            hit_idx = hits.index[0]
            bank_amt = float(stmt.at[hit_idx, "Bank Amt (Rs)"])
            # If cheque found but amount differs by more than 1 paisa,
            # do NOT clear — the difference must surface in the BRS properly.
            if abs(bank_amt - float(amount)) > 0.01:
                print(f"[CF] chq_cleared P1 BLOCKED (amount mismatch): chq={chq_no} "
                      f"book_amt={amount:,.2f} bank_amt={bank_amt:,.2f} "
                      f"diff={bank_amt - amount:+,.2f}")
                return False, None
            print(f"[CF] chq_cleared P1 (chq match): chq={chq_no} → stmt idx={hit_idx}")
            return True, hit_idx

        best_score, best_si = 0, None
        for si, sr in stmt[(stmt["Direction"] == "OUTFLOW") & (~stmt["_used_cf"])].iterrows():
            amt_ok = abs(float(sr["Bank Amt (Rs)"]) - float(amount)) < 0.01
            if not amt_ok:
                continue
            score = fuzzy(party, sr["Party"])
            if score >= FUZZY_THRESHOLD and score > best_score:
                best_score = score
                best_si    = si

        if best_si is not None:
            bank_chq = str(stmt.at[best_si, "Chq No"]).strip()
            norm_orig = _norm_chq(chq_no)
            norm_bank = _norm_chq(bank_chq)
            if (bank_chq not in ("", "nan") and
                    norm_orig not in ("", "nan", "0") and
                    norm_orig != norm_bank):
                # Cheque numbers differ. Allow clearing only when the party name
                # matches strongly (>=80%) — this handles bank cheque-swap errors
                # where the bank processes a cheque under a different number but
                # the correct party name appears in the bank description.
                if best_score >= 80:
                    print(f"[CF] chq_cleared P2 (chq-swap allowed): party={party} "
                          f"amt={amount:,.2f} score={best_score}% "
                          f"orig_chq='{chq_no}' bank_chq='{bank_chq}' -> stmt idx={best_si}")
                else:
                    print(f"[CF] chq_cleared P2 BLOCKED: party={party} amt={amount:,.2f} "
                          f"— orig chq '{chq_no}' != bank chq '{bank_chq}' "
                          f"(party score {best_score}% < 80)")
                    return False, None
            print(f"[CF] chq_cleared P2 (fuzzy fallback): party={party} "
                  f"amt={amount:,.2f} score={best_score}% -> stmt idx={best_si}")
            return True, best_si

        return False, None

    def consume_chq_in_stmt(stmt_idx):
        if stmt_idx is not None:
            stmt.at[stmt_idx, "_used_cf"] = True

    cf_book_rows     = []
    cf_stmt_rows     = []
    cleared_log      = []
    carryforward_log = []

    _cross_cleared_ind_keys = set()
    _cross_cleared_dnb_keys = set()
    for _dnb in prev_brs["debited_not_book"]:
        for _ind in prev_brs["issued_not_debited"]:
            if (fuzzy(_dnb["party"], _ind["party"]) >= FUZZY_THRESHOLD and
                    abs(_dnb["amount"] - _ind["amount"]) < 0.01):
                if _dnb.get("chq_no") or _ind.get("chq_no"):
                    key = (_ind["party"].upper().strip(), round(_ind["amount"], 2))
                    _cross_cleared_ind_keys.add(key)
                    _cross_cleared_dnb_keys.add((_dnb["party"].upper().strip(), round(_dnb["amount"], 2)))
                    print(f"[CF] Pre-pass CROSS-CLEAR: issued_not_debited '{_ind['party']}' "
                          f"Rs{_ind['amount']:,.2f} chq={_ind['chq_no']} <-> "
                          f"debited_not_book chq={_dnb['chq_no']}")

    from collections import defaultdict
    chq_groups   = defaultdict(list)
    no_chq_items = []

    for item in prev_brs["issued_not_debited"]:
        _key = (item["party"].upper().strip(), round(item["amount"], 2))
        if _key in _cross_cleared_ind_keys:
            cleared_log.append({**item, "section": "issued_not_debited",
                                 "status": "CLEARED (cross-matched with debited_not_book)"})
            continue
        if item["chq_no"]:
            chq_groups[item["chq_no"]].append(item)
        else:
            no_chq_items.append(item)

    for chq_no, items in chq_groups.items():
        rep_party    = items[0]["party"]
        rep_amount   = sum(i["amount"] for i in items)
        check_amount = items[0]["amount"] if len(items) == 1 else rep_amount

        cleared, stmt_idx = chq_cleared_in_stmt(chq_no, rep_party, check_amount)
        if cleared:
            consume_chq_in_stmt(stmt_idx)
        for item in items:
            if cleared:
                cleared_log.append({**item, "section": "issued_not_debited", "status": "CLEARED"})
            else:
                carryforward_log.append({**item, "section": "issued_not_debited"})
                cf_book_rows.append({
                    "Date":          item.get("date", ""),
                    "Txn Type":      item.get("txn_type", "PB"),
                    "Bill No":       item["bill_no"],
                    "Chq No":        item["chq_no"],
                    "Party":         item["party"],
                    "Direction":     "OUTFLOW",
                    "Sender":        company_name,
                    "Recipient":     item["party"],
                    "Book Amt (Rs)": item["amount"],
                    "Narration":     item["narration"] + " [CF from prev BRS]",
                })

    for item in no_chq_items:
        cleared = find_stmt_match(item, "OUTFLOW")
        if cleared:
            cleared_log.append({**item, "section": "issued_not_debited", "status": "CLEARED"})
        else:
            carryforward_log.append({**item, "section": "issued_not_debited"})
            cf_book_rows.append({
                "Date":          item.get("date", ""),
                "Txn Type":      item.get("txn_type", "PB"),
                "Bill No":       item["bill_no"],
                "Chq No":        item["chq_no"],
                "Party":         item["party"],
                "Direction":     "OUTFLOW",
                "Sender":        company_name,
                "Recipient":     item["party"],
                "Book Amt (Rs)": item["amount"],
                "Narration":     item["narration"] + " [CF from prev BRS]",
            })

    for item in prev_brs["deposited_not_credited"]:
        cleared = find_stmt_match(item, "INFLOW")
        if cleared:
            cleared_log.append({**item, "section": "deposited_not_credited", "status": "CLEARED"})
        else:
            carryforward_log.append({**item, "section": "deposited_not_credited"})
            cf_book_rows.append({
                "Date":          item.get("date", ""),
                "Txn Type":      item.get("txn_type", "PS"),
                "Bill No":       item["bill_no"],
                "Chq No":        item["chq_no"],
                "Party":         item["party"],
                "Direction":     "INFLOW",
                "Sender":        item["party"],
                "Recipient":     company_name,
                "Book Amt (Rs)": item["amount"],
                "Narration":     item["narration"] + " [CF from prev BRS]",
            })

    debited_nb_book_only_to_remove = []

    for item in prev_brs["debited_not_book"]:
        already_recorded = False
        matched_outflow_idx = None

        _dnb_key = (item["party"].upper().strip(), round(item["amount"], 2))
        if _dnb_key in _cross_cleared_dnb_keys:
            cleared_log.append({**item, "section": "debited_not_book",
                                 "status": "CLEARED (cross-matched with issued_not_debited)"})
            continue

        for bo_idx, br in book_only.iterrows():
            if (br["Direction"] == "OUTFLOW" and
                    fuzzy(item["party"], br["Party"]) >= FUZZY_THRESHOLD and
                    abs(float(br["Book Amt (Rs)"]) - item["amount"]) < 0.01):
                already_recorded = True
                matched_outflow_idx = bo_idx
                print(f"[CF] debited_not_book CLEARED (book_only match): '{item['party']}' "
                      f"Rs{item['amount']:,.2f} <-> book_only idx={bo_idx} '{br['Party']}'")
                break
        if already_recorded:
            cleared_log.append({**item, "section": "debited_not_book", "status": "CLEARED"})
            if matched_outflow_idx is not None:
                debited_nb_book_only_to_remove.append(matched_outflow_idx)
        else:
            carryforward_log.append({**item, "section": "debited_not_book"})
            cf_stmt_rows.append({
                "Date":          item["date"],
                "Chq No":        item["chq_no"],
                "Description":   item["narration"],
                "Party":         item["party"],
                "Direction":     "OUTFLOW",
                "Sender":        company_name,
                "Recipient":     item["party"],
                "Debit (Rs)":    item["amount"],
                "Credit (Rs)":   "",
                "Bank Amt (Rs)": item["amount"],
                "Balance (Rs)":  0,
            })

    if debited_nb_book_only_to_remove:
        valid_removals = [i for i in debited_nb_book_only_to_remove if i in book_only.index]
        if valid_removals:
            book_only = book_only.drop(index=valid_removals)
            print(f"[CF] FIX H: Removed {len(valid_removals)} book_only OUTFLOW entries")

    # def _is_internal_transfer(item):
    #     narr = str(item.get("narration", "")).upper()
    #     party = str(item.get("party", "")).upper()
    #     return (narr.startswith("INB/IFT/ORIENT") or party.startswith("INB/IFT/ORIENT") or
    #             narr.startswith("INB/IFT") and "ORIENT" in narr)

    book_only_indices_to_remove = []

    # Build RT/PT pair set: Receipts INFLOW entries in the current period book that have a
    # matching Payments OUTFLOW for the same party+amount. These must NOT be used to clear
    # CF credited_not_book items — the Receipts entry records receiving a cheque that hasn't
    # been deposited yet, so the CF bank credit is a genuinely unrecorded separate transaction.
    _cf_rtpt_keys = set()
    for _, _br in book_df.iterrows():
        if str(_br.get("Txn Type", "")).strip() == "Receipts" and _br["Direction"] == "INFLOW":
            _key = (str(_br["Party"]).strip().upper(), round(float(_br["Book Amt (Rs)"]), 2))
            _has_payment = any(
                str(_pr.get("Txn Type", "")).strip() == "Payments"
                and _pr["Direction"] == "OUTFLOW"
                and abs(float(_pr["Book Amt (Rs)"]) - float(_br["Book Amt (Rs)"])) < 0.01
                and str(_pr["Party"]).strip().upper() == str(_br["Party"]).strip().upper()
                for _, _pr in book_df.iterrows()
            )
            if _has_payment:
                _cf_rtpt_keys.add(_key)
                print(f"[CF] RT/PT pair detected — Receipts entry will not clear CF items: "
                      f"party={_br['Party']} Rs{_br['Book Amt (Rs)']:,.2f}")

    # ── Pre-pass: clear credited_not_book items absorbed into current book opening ──
    # When the company records a prev-BRS "credited_not_book" item in the book AFTER
    # the previous BRS was prepared (but before the current period starts), the current
    # book opening balance will be higher than prev_book_closing by exactly that amount.
    # We detect this gap and auto-clear ONLY when the gap is an EXACT match to either
    # a single item OR the complete sum of all credited_not_book items.
    # Greedy/partial matching is avoided because the book opening gap can also arise
    # from normal transactions between periods, causing false clears.
    _prev_book_closing = prev_brs.get("prev_book_closing_bal", None)
    _auto_cleared_cnb_keys = set()
    if (book_opening_bal is not None and _prev_book_closing is not None
            and abs(_prev_book_closing) > 0.01):
        _gap = round(book_opening_bal - _prev_book_closing, 2)
        if abs(_gap) > 0.01:
            print(f"[CF] Book opening gap detected: prev_closing={_prev_book_closing:,.2f}  "
                  f"book_opening={book_opening_bal:,.2f}  gap={_gap:+,.2f}")
            _cnb_items = list(prev_brs["credited_not_book"])
            _gap_abs = abs(_gap)

            # Case 1: gap exactly matches a SINGLE credited_not_book item
            _single_match = None
            for _ci in _cnb_items:
                if abs(_ci["amount"] - _gap_abs) < 0.01:
                    _single_match = _ci
                    break
            if _single_match is not None:
                _key = (_single_match["party"].upper().strip(),
                        round(_single_match["amount"], 2))
                _auto_cleared_cnb_keys.add(_key)
                print(f"[CF] Book-opening-gap auto-clear (single exact match): "
                      f"party='{_single_match['party']}' amt={_single_match['amount']:,.2f}")

            # Case 2: gap exactly matches the COMPLETE sum of all credited_not_book items
            elif _cnb_items:
                _total_cnb = round(sum(_ci["amount"] for _ci in _cnb_items), 2)
                if abs(_total_cnb - _gap_abs) < 0.01:
                    for _ci in _cnb_items:
                        _key = (_ci["party"].upper().strip(), round(_ci["amount"], 2))
                        _auto_cleared_cnb_keys.add(_key)
                    print(f"[CF] Book-opening-gap auto-clear (full set match): "
                          f"{len(_cnb_items)} items, total={_total_cnb:,.2f}")
                else:
                    print(f"[CF] Book-opening-gap: gap={_gap_abs:,.2f} does not match any "
                          f"single item or full set ({_total_cnb:,.2f}) — "
                          f"gap likely from normal transactions, no items auto-cleared")

    for item in prev_brs["credited_not_book"]:
        already_recorded   = False
        matched_book_only_idx = None

        # Auto-clear items identified via book-opening-gap analysis
        _item_key = (item["party"].upper().strip(), round(item["amount"], 2))
        if _item_key in _auto_cleared_cnb_keys:
            cleared_log.append({**item, "section": "credited_not_book",
                                 "status": "CLEARED (absorbed in book opening balance)"})
            print(f"[CF] credited_not_book auto-cleared via book-opening-gap: "
                  f"party='{item['party']}' amt={item['amount']:,.2f}")
            continue

        def _find_in_book_only(amt, cf_party=""):
            if cf_party:
                for bo_idx, bo_row in book_only.iterrows():
                    if bo_idx in book_only_indices_to_remove:
                        continue
                    if bo_row["Direction"] != "INFLOW":
                        continue
                    if abs(float(bo_row["Book Amt (Rs)"]) - amt) >= 0.01:
                        continue
                    if fuzzy(cf_party, str(bo_row["Party"])) >= FUZZY_THRESHOLD:
                        return bo_idx

            if cf_party:
                cf_words = set(cf_party.upper().split())
                for bo_idx, bo_row in book_only.iterrows():
                    if bo_idx in book_only_indices_to_remove:
                        continue
                    if bo_row["Direction"] != "INFLOW":
                        continue
                    if abs(float(bo_row["Book Amt (Rs)"]) - amt) >= 1.0:
                        continue
                    bo_words = set(str(bo_row["Party"]).upper().split())
                    if cf_words & bo_words:
                        return bo_idx

            for bo_idx, bo_row in book_only.iterrows():
                if bo_idx in book_only_indices_to_remove:
                    continue
                if bo_row["Direction"] != "INFLOW":
                    continue
                if abs(float(bo_row["Book Amt (Rs)"]) - amt) < 1.0:
                    return bo_idx

            return None

        book_only_inflow_ids = set(book_only[book_only["Direction"] == "INFLOW"].index)

        def _truncated_name_match(cf_party, book_party):
            cp = cf_party.upper().strip()
            bp = book_party.upper().strip()
            for length in range(min(len(cp), 8), 4, -1):
                if cp[:length] in bp:
                    return True
            for word in bp.split():
                if len(word) >= 5 and word in cp:
                    return True
            return False

        for bi, br in book_df.iterrows():
            if br["Direction"] != "INFLOW":
                continue
            if _is_reversal_inflow(br):
                continue
            # Skip Receipts entries that are part of an RT/PT refund pair —
            # these must not be used to clear CF credited_not_book items
            if (str(br.get("Txn Type", "")).strip() == "Receipts" and
                    (str(br["Party"]).strip().upper(),
                     round(float(br["Book Amt (Rs)"]), 2)) in _cf_rtpt_keys):
                continue
            if abs(float(br["Book Amt (Rs)"]) - item["amount"]) >= 1.0:
                continue
            name_ok = (fuzzy(item["party"], br["Party"]) >= FUZZY_THRESHOLD or
                       _truncated_name_match(item["party"], br["Party"]))
            if not name_ok:
                continue
            if bi in book_only_inflow_ids:
                # Skip if this book_only entry was already consumed by a previous CF item
                if bi in book_only_indices_to_remove:
                    continue
                already_recorded = True
                matched_book_only_idx = bi
                book_only_indices_to_remove.append(bi)
                print(f"[CF] Check1 cleared (was book_only): "
                      f"CF={item['party']} ₹{item['amount']:,.2f} ↔ book={br['Party']}")
                break
            already_recorded = True
            matched_book_only_idx = _find_in_book_only(item["amount"], item["party"])
            print(f"[CF] Check1 cleared: CF={item['party']} ₹{item['amount']:,.2f} "
                  f"↔ book={br['Party']}  book_only_idx={matched_book_only_idx}")
            break

        if not already_recorded:
            for bi, br in book_df.iterrows():
                if br["Direction"] != "INFLOW":
                    continue
                if _is_reversal_inflow(br):
                    continue
                # Skip Receipts entries that are part of an RT/PT refund pair —
                # these must not be used to clear CF credited_not_book items
                if (str(br.get("Txn Type", "")).strip() == "Receipts" and
                        (str(br["Party"]).strip().upper(),
                        round(float(br["Book Amt (Rs)"]), 2)) in _cf_rtpt_keys):
                    continue
                if abs(float(br["Book Amt (Rs)"]) - item["amount"]) >= 1.0:
                        continue
                if bi in book_only_inflow_ids:
                        continue
                item_words  = set(item["party"].upper().split())
                narr_upper  = str(br.get("Narration", "")).upper()
                party_upper = str(br["Party"]).upper()
                if item_words & set(narr_upper.split()) or item_words & set(party_upper.split()):
                    already_recorded = True
                    matched_book_only_idx = _find_in_book_only(item["amount"], item["party"])
                    print(f"[CF] Check2 cleared (word overlap): CF={item['party']} "
                        f"₹{item['amount']:,.2f} ↔ book={br['Party']}")
                    break

        excess_amount = None
        if not already_recorded:
            for bi, br in book_df.iterrows():
                if br["Direction"] != "INFLOW":
                    continue
                if _is_reversal_inflow(br):
                    continue
                # Skip Receipts entries that are part of an RT/PT refund pair —
                # these must not be used to clear CF credited_not_book items
                if (str(br.get("Txn Type", "")).strip() == "Receipts" and
                        (str(br["Party"]).strip().upper(),
                        round(float(br["Book Amt (Rs)"]), 2)) in _cf_rtpt_keys):
                    continue
                if bi in book_only_inflow_ids:
                    continue
                book_amt = float(br["Book Amt (Rs)"])
                cf_amt   = float(item["amount"])
                if book_amt < cf_amt and abs(cf_amt - book_amt * 2) < 0.01:
                    score = fuzzy(item["party"], br["Party"])
                    if score >= 40:
                        already_recorded = True
                        matched_book_only_idx = _find_in_book_only(book_amt, item["party"])
                        excess_amount    = round(cf_amt - book_amt, 2)
                        print(f"[CF] Check3 partial: {item['party']} "
                              f"CF=₹{cf_amt:,.2f} Book=₹{book_amt:,.2f} "
                              f"Excess=₹{excess_amount:,.2f}")
                        break

        if not already_recorded:
            bo_inflow = book_only[
                (book_only["Direction"] == "INFLOW") &
                (~book_only.index.isin(book_only_indices_to_remove))
            ]
            cf_amt = float(item["amount"])
            bo_indices = list(bo_inflow.index)
            for _ii in range(len(bo_indices)):
                if already_recorded:
                    break
                for _jj in range(_ii + 1, len(bo_indices)):
                    bi1, bi2 = bo_indices[_ii], bo_indices[_jj]
                    combined_amt = (float(book_only.at[bi1, "Book Amt (Rs)"]) +
                                    float(book_only.at[bi2, "Book Amt (Rs)"]))
                    if abs(combined_amt - cf_amt) >= 0.01:
                        continue
                    score1 = fuzzy(item["party"], str(book_only.at[bi1, "Party"]))
                    score2 = fuzzy(item["party"], str(book_only.at[bi2, "Party"]))
                    if max(score1, score2) < 30:
                        continue
                    _in_stmt = any(
                        abs(float(r["Bank Amt (Rs)"]) - cf_amt) < 0.01 and r["Direction"] == "INFLOW"
                        for _, r in stmt_only.iterrows()
                    )
                    if _in_stmt:
                        continue
                    already_recorded = True
                    book_only_indices_to_remove.extend([bi1, bi2])
                    print(f"[CF] Check4b split-booking cleared: CF={item['party']} "
                          f"₹{cf_amt:,.2f} = book[{bi1}] + book[{bi2}]")
                    break

        if not already_recorded:
            found_in_stmt_only = False
            for _, so_row in stmt_only.iterrows():
                amt_ok = abs(float(so_row["Bank Amt (Rs)"]) - float(item["amount"])) < 0.01
                dir_ok = so_row["Direction"] == "INFLOW"
                if not (amt_ok and dir_ok):
                    continue
                item_date = item.get("date", "")
                so_date   = so_row.get("Date", "")
                if item_date:
                    diff = _date_diff(item_date, so_date)
                    if diff is not None and diff <= DATE_THRESHOLD_DAYS:
                        found_in_stmt_only = True
                        break
                else:
                    found_in_stmt_only = True
                    break

            if not found_in_stmt_only:
                for bi, br in book_df.iterrows():
                    if br["Direction"] != "INFLOW":
                        continue
                    if _is_reversal_inflow(br):
                        continue
                    # Skip Receipts entries that are part of an RT/PT refund pair
                    if (str(br.get("Txn Type", "")).strip() == "Receipts" and
                            (str(br["Party"]).strip().upper(),
                             round(float(br["Book Amt (Rs)"]), 2)) in _cf_rtpt_keys):
                        continue
                    if abs(float(br["Book Amt (Rs)"]) - float(item["amount"])) < 1.0:
                        if bi not in book_only_inflow_ids:
                            name_score = fuzzy(item["party"], br["Party"])
                            bank_score = 0
                            for _, sr in stmt_df[stmt_df["Direction"] == "INFLOW"].iterrows():
                                if abs(float(sr["Bank Amt (Rs)"]) - float(item["amount"])) < 1.0:
                                    s = fuzzy(item["party"], str(sr.get("Party", "")))
                                    if s > bank_score:
                                        bank_score = s
                            if max(name_score, bank_score) < FUZZY_THRESHOLD:
                                continue

                        if bi in book_only_inflow_ids:
                            if (fuzzy(item["party"], br["Party"]) < FUZZY_THRESHOLD and
                                    not _truncated_name_match(item["party"], br["Party"])):
                                continue

                        already_recorded = True
                        matched_book_only_idx = _find_in_book_only(item["amount"], item["party"])
                        print(f"[CF] Check4 cleared (absent from stmt_only + book match): "
                              f"CF={item['party']} ₹{item['amount']:,.2f} "
                              f"↔ book={br['Party']}  book_only_idx={matched_book_only_idx}")
                        break

        if already_recorded:
            cleared_log.append({**item, "section": "credited_not_book", "status": "CLEARED"})

            if matched_book_only_idx is not None:
                book_only_indices_to_remove.append(matched_book_only_idx)
                print(f"[CF] Scheduled book_only removal: idx={matched_book_only_idx} "
                      f"party={item['party']} ₹{item['amount']:,.2f}")

            if excess_amount and excess_amount > 0:
                cf_stmt_rows.append({
                    "Date":          item["date"],
                    "Chq No":        item["chq_no"],
                    "Description":   item["narration"],
                    "Party":         item["party"],
                    "Direction":     "INFLOW",
                    "Sender":        item["party"],
                    "Recipient":     company_name,
                    "Debit (Rs)":    "",
                    "Credit (Rs)":   excess_amount,
                    "Bank Amt (Rs)": excess_amount,
                    "Balance (Rs)":  0,
                })
        else:
            already_in_stmt_only = False
            item_date = item.get("date", "")

            if item_date:
                for _, so_row in stmt_only.iterrows():
                    amt_ok   = abs(float(so_row["Bank Amt (Rs)"]) - float(item["amount"])) < 0.01
                    dir_ok   = so_row["Direction"] == "INFLOW"
                    party_ok = fuzzy(item["party"], str(so_row.get("Party", ""))) >= FUZZY_THRESHOLD
                    if not (amt_ok and dir_ok and party_ok):
                        continue
                    so_date = so_row.get("Date", "")
                    diff    = _date_diff(item_date, so_date)
                    if diff is not None and diff <= DATE_THRESHOLD_DAYS:
                        already_in_stmt_only = True
                        print(f"[CF] Dedup: skipping cf_stmt_rows for "
                              f"{item['party']} ₹{item['amount']:,.2f}")
                        break

            carryforward_log.append({**item, "section": "credited_not_book"})
            if not already_in_stmt_only:
                cf_stmt_rows.append({
                    "Date":          item["date"],
                    "Chq No":        item["chq_no"],
                    "Description":   item["narration"],
                    "Party":         item["party"],
                    "Direction":     "INFLOW",
                    "Sender":        item["party"],
                    "Recipient":     company_name,
                    "Debit (Rs)":    "",
                    "Credit (Rs)":   item["amount"],
                    "Bank Amt (Rs)": item["amount"],
                    "Balance (Rs)":  0,
                })

    if book_only_indices_to_remove:
        valid_removals = [i for i in book_only_indices_to_remove if i in book_only.index]
        if valid_removals:
            book_only = book_only.drop(index=valid_removals)
            print(f"[CF] Removed {len(valid_removals)} book_only entries "
                  f"(cleared by credited_not_book CF): {valid_removals}")

    _CF_SECTION_BANK_DIR = {
        "issued_not_debited":     "OUTFLOW",
        "deposited_not_credited": "INFLOW",
        "debited_not_book":       "OUTFLOW",
        "credited_not_book":      "INFLOW",
    }
    stmt_only = stmt_only.copy()
    stmt_only["_remove"] = False

    # Build combined-amount groups: when multiple cleared items share the same party
    # and section (e.g. JCB split across 3 cheques combined by bank into one debit),
    # also try matching the SUM against stmt_only so the combined bank entry is removed.
    from collections import defaultdict
    _grp_key = lambda it: (it.get("section", ""), it.get("party", "").upper().strip())
    _grp_sums = defaultdict(float)
    for _it in cleared_log:
        _grp_sums[_grp_key(_it)] += float(_it.get("amount", 0))

    for item in cleared_log:
        expected_dir = _CF_SECTION_BANK_DIR.get(item.get("section", ""), None)
        for si, sr in stmt_only.iterrows():
            if stmt_only.at[si, "_remove"]:
                continue
            if expected_dir and sr.get("Direction") != expected_dir:
                continue
            item_chq = _norm_chq(item.get("chq_no", ""))
            sr_chq   = _norm_chq(str(sr.get("Chq No", "")))
            if item_chq != "0" and item_chq == sr_chq:
                stmt_only.at[si, "_remove"] = True
                break
            try:
                amt_ok = abs(float(sr["Bank Amt (Rs)"]) - float(item["amount"])) < 0.01
            except Exception:
                amt_ok = False
            # Also check combined amount (multiple cleared items grouped by bank into one)
            if not amt_ok:
                _combined = _grp_sums.get(_grp_key(item), 0.0)
                try:
                    amt_ok = abs(float(sr["Bank Amt (Rs)"]) - _combined) < 0.01
                except Exception:
                    pass
            name_ok = fuzzy(item["party"], str(sr.get("Party", ""))) >= FUZZY_THRESHOLD
            if amt_ok and name_ok:
                stmt_only.at[si, "_remove"] = True
                break
    stmt_only = stmt_only[~stmt_only["_remove"]].drop(columns=["_remove"])

    if cf_book_rows:
        cf_book_df = pd.DataFrame(cf_book_rows)
        book_only  = pd.concat([cf_book_df, book_only], ignore_index=True)

    if cf_stmt_rows:
        cf_stmt_df = pd.DataFrame(cf_stmt_rows)
        stmt_only  = pd.concat([cf_stmt_df, stmt_only], ignore_index=True)

    print(f"\n[Carry-Forward Summary]")
    print(f"   Items cleared (now in bank): {len(cleared_log)}")
    print(f"   Items carried forward      : {len(carryforward_log)}")
    return book_only, stmt_only, cleared_log, carryforward_log

# =============================================================================
# 1. PARSE BOOK REPORT
# =============================================================================

BOOK_COLS = [
    "Date", "Txn Type", "Bill No", "Chq No", "Party",
    "Direction", "Sender", "Recipient", "Book Amt (Rs)", "Narration"
]

def _fmt_book_date(v):
    """Normalise a raw date cell from the book report to dd-mm-yyyy string."""
    if v is None:
        return ""
    try:
        if hasattr(v, 'strftime'):          # datetime / Timestamp
            return v.strftime("%d-%m-%Y")
    except Exception:
        pass
    s = str(v).strip()
    if not s or s.lower() == "nan":
        return ""
    # Already dd-Mon-yy  e.g. 02-Feb-26
    m = re.match(r"(\d{1,2})-([A-Za-z]{3})-(\d{2,4})$", s)
    if m:
        try:
            from datetime import datetime
            yr = m.group(3)
            if len(yr) == 2:
                yr = "20" + yr
            return datetime.strptime(f"{m.group(1)}-{m.group(2)}-{yr}", "%d-%b-%Y").strftime("%d-%m-%Y")
        except Exception:
            pass
    # Already dd-mm-yyyy or similar
    d = parse_date(s)
    if d:
        return d.strftime("%d-%m-%Y")
    return s

def parse_book(path, target_bank_id=None):
    sheet_name = detect_book_sheet(path)
    raw        = safe_read_excel(path, sheet_name=sheet_name, header=None)
    company_name = extract_company_name(raw)
    if target_bank_id:
        bank_id = target_bank_id
        print(f"[Book] Using target bank: '{bank_id}'")
    else:
        bank_id = extract_bank_identifier(raw)

    summary_banks = []
    for _, row in raw.iterrows():
        r = row.tolist()
        if r and isinstance(r[0], str) and r[0].startswith("Summary Of "):
            _m = re.match(r"Summary Of\s+(\S+)", r[0], re.IGNORECASE)
            if _m:
                summary_banks.append(_m.group(1).strip())

    multiple_banks = len(summary_banks) > 1
    if multiple_banks:
        print(f"[Book] Multiple banks found: {summary_banks}")
        print(f"[Book] Filtering for bank: '{bank_id}'")
    else:
        print(f"[Book] Single bank: '{bank_id}'")

    all_rows = raw.values.tolist()
    target_summary_idx  = None
    prev_summary_idx    = -1

    for i, r in enumerate(all_rows):
        if r and isinstance(r[0], str) and r[0].startswith("Summary Of "):
            _m = re.match(r"Summary Of\s+(\S+)", r[0], re.IGNORECASE)
            tok = _m.group(1).strip() if _m else ""
            if tok == bank_id:
                target_summary_idx = i
                break
            else:
                prev_summary_idx = i

    book_closing_bal  = 0.0
    book_closing_drcr = "Dr"
    book_opening_bal  = 0.0
    book_opening_drcr = "Dr"

    if target_summary_idx is not None:
        sr = all_rows[target_summary_idx]
        while len(sr) <= COL_NARR:
            sr.append(None)
        try:
            for idx, val in enumerate(sr):
                if isinstance(val, str) and "Closing Balance" in val:
                    raw_bal           = sr[idx + 1]
                    book_closing_drcr = (str(sr[idx + 2]).strip()
                                        if len(sr) > idx + 2 and pd.notna(sr[idx + 2]) else "Dr")
                    try:
                        bal = float(str(raw_bal).replace(",", "").strip())
                    except Exception:
                        bal = 0.0
                    if book_closing_drcr.upper().startswith("CR"):
                        book_closing_bal = -abs(bal)
                    else:
                        book_closing_bal = abs(bal)
                    print(f"[Book] Closing balance: {book_closing_bal} ({book_closing_drcr})")
                    break
        except Exception:
            pass

        try:
            for idx, val in enumerate(sr):
                if isinstance(val, str) and val.strip() == "Opening Balance":
                    raw_ob = None
                    for offset in range(1, 4):
                        if idx + offset >= len(sr):
                            break
                        candidate = sr[idx + offset]
                        if candidate is None:
                            continue
                        try:
                            if pd.isna(candidate):
                                continue
                        except Exception:
                            pass
                        if str(candidate).strip() in ("", "nan"):
                            continue
                        raw_ob = candidate
                        ob_drcr_idx = idx + offset + 1
                        break
                    if raw_ob is None:
                        break
                    try:
                        ob_val = float(str(raw_ob).replace(",", "").strip())
                    except Exception:
                        break
                    ob_drcr = "Dr"
                    if ob_drcr_idx < len(sr) and pd.notna(sr[ob_drcr_idx]):
                        ob_drcr = str(sr[ob_drcr_idx]).strip()
                    if ob_drcr.upper().startswith("CR"):
                        book_opening_bal  = -abs(ob_val)
                        book_opening_drcr = "Cr"
                    else:
                        book_opening_bal  = abs(ob_val)
                        book_opening_drcr = "Dr"
                    print(f"[Book] Opening balance: {book_opening_bal} ({book_opening_drcr})")
                    break
        except Exception:
            pass

    if target_summary_idx is None:
        row_slice = all_rows
    else:
        row_slice = all_rows[prev_summary_idx + 1 : target_summary_idx]

    rows = []
    for r in row_slice:
        while len(r) <= COL_NARR:
            r.append(None)
        txn = r[COL_TXN]
        if not isinstance(txn, str):
            continue
        if txn.strip() in ("Transaction", "") or txn.startswith("Summary"):
            continue

        chq_no    = str(r[COL_CHQ]).strip().replace(".0", "")  if pd.notna(r[COL_CHQ])  else ""
        bill_no   = str(r[COL_BILL]).strip().replace(".0", "") if pd.notna(r[COL_BILL]) else ""
        date_raw  = r[COL_DATE] if len(r) > COL_DATE and pd.notna(r[COL_DATE]) else None  # ← ADD
        txn_date  = _fmt_book_date(date_raw)
        party_raw = str(r[COL_PARTY]).strip()                  if pd.notna(r[COL_PARTY]) else ""
        receipts  = to_amt(r[COL_RECEIPTS])
        payments  = to_amt(r[COL_PAYMENTS])
        narration = str(r[COL_NARR]).strip()                   if pd.notna(r[COL_NARR]) else ""

        is_hot_transfer = (party_raw == "HOT - HOT")

        if receipts > 0:
            direction, amount = "INFLOW",  receipts
        elif payments > 0:
            direction, amount = "OUTFLOW", payments
        else:
            continue

        if is_hot_transfer:
            name = extract_company_name(None)
            print(f"[Book] HOT entry — party set to company name for matching: '{name}'")
            narration = f"[HOT Transfer] {narration}".strip() if narration else "[HOT Transfer]"
        else:
            name = clean_name(party_raw)
        chq_display   = chq_no                                              
        chq_for_match = chq_no if chq_no not in ("99", "511", "") else ""

        rows.append({
            "Date":          txn_date,
            "Txn Type":      txn,
            "Bill No":       bill_no,
            "Chq No":        chq_display,
            "Party":         name,
            "Direction":     direction,
            "Sender":        name         if direction == "INFLOW"  else company_name,
            "Recipient":     name         if direction == "OUTFLOW" else company_name,
            "Book Amt (Rs)": amount,
            "Narration":     narration,
        })

    if not rows and book_closing_bal == 0.0:
        for r in all_rows:
            if r and isinstance(r[0], str):
                if r[0].strip() == f"Summary Of {bank_id}":
                    for idx, val in enumerate(r):
                        if isinstance(val, str) and "Closing Balance" in val:
                            if len(r) > idx + 1:
                                book_closing_bal = to_amt(r[idx + 1])
                            break
                    break

    if rows:
        df = pd.DataFrame(rows)
    else:
        print(f"[Book] No transaction rows found for bank '{bank_id}' — "
              f"this is normal if there were no transactions in this period.")
        df = pd.DataFrame(columns=BOOK_COLS)

    print(f"[Book] Parsed {len(df)} transaction rows  |  sheet='{sheet_name}'  |  bank='{bank_id}'")
    return (df,
            book_opening_bal, book_opening_drcr,
            book_closing_bal, book_closing_drcr,
            company_name, bank_id)


# =============================================================================
# 2. PARSE BANK STATEMENT
# =============================================================================

STMT_COLS = [
    "Date", "Chq No", "Description", "Party", "Direction",
    "Sender", "Recipient", "Debit (Rs)", "Credit (Rs)",
    "Bank Amt (Rs)", "Balance (Rs)"
]


def parse_statement(path):
    account_no, branch_label, bank_name_from_stmt = extract_account_info(
        path, filename_hint=path
    )
    ext = os.path.splitext(path)[1].lower()
    raw = None
    is_no_transactions = False

    if ext in (".xlsx", ".xlsm", ".xltx", ".xltm"):
        try:
            raw = pd.read_excel(path, header=None, engine="openpyxl")
        except Exception as e:
            sys.exit(f"[ERROR] Cannot read xlsx statement file: {e}")
    elif ext == ".xls":
        try:
            import xlrd  # noqa
            raw = pd.read_excel(path, header=None, engine="xlrd")
        except ImportError:
            print("[Statement] xlrd not found — attempting auto-convert via LibreOffice...")
            import shutil, subprocess, tempfile
            lo = shutil.which("libreoffice") or shutil.which("soffice")
            if lo:
                try:
                    tmpdir = tempfile.mkdtemp()
                    result = subprocess.run(
                        [lo, "--headless", "--convert-to", "xlsx", path, "--outdir", tmpdir],
                        capture_output=True, text=True, timeout=60
                    )
                    base = os.path.splitext(os.path.basename(path))[0]
                    xlsx_path = os.path.join(tmpdir, base + ".xlsx")
                    if os.path.exists(xlsx_path):
                        print(f"[Statement] LibreOffice converted to: {xlsx_path}")
                        raw = pd.read_excel(xlsx_path, header=None, engine="openpyxl")
                    else:
                        sys.exit(f"[ERROR] LibreOffice conversion failed: {result.stderr}")
                except Exception as e:
                    sys.exit(f"[ERROR] LibreOffice conversion error: {e}")
            else:
                sys.exit(
                    "[ERROR] Cannot read .xls file.\n"
                    "  Option 1: pip install xlrd==1.2.0\n"
                    "  Option 2: Install LibreOffice\n"
                    "  Option 3: Open the .xls file in Excel and Save As .xlsx"
                )
        except Exception as e:
            sys.exit(f"[ERROR] Cannot read xls statement file: {e}")
    elif ext == ".csv":
        try:
            raw = pd.read_csv(path, header=None, on_bad_lines="skip")
        except Exception as e:
            sys.exit(f"[ERROR] Cannot read CSV statement file: {e}")
    else:
        for attempt in [
            lambda: pd.read_excel(path, header=None, engine="openpyxl"),
            lambda: pd.read_excel(path, header=None),
            lambda: pd.read_csv(path, header=None, on_bad_lines="skip"),
        ]:
            try:
                raw = attempt()
                break
            except Exception:
                continue
        if raw is None:
            sys.exit(f"[ERROR] Could not read statement file: {path}")

    DATE_RE = re.compile(
        r"\d{2}[-/]\d{2}[-/]\d{4}"
        r"|\d{4}[-/]\d{2}[-/]\d{2}"
        r"|\d{2}[-/]\w{3}[-/]\d{4}"
        r"|\d{2}\s+\w{3}\s+\d{4}"
        r"|\d{2}-[A-Za-z]{3}-\d{2}"
    )

    def _is_date_val(v):
        if isinstance(v, (datetime, dt_date)):
            return True
        if hasattr(v, 'date') or hasattr(v, 'strftime'):
            return True
        return bool(DATE_RE.search(str(v).strip()))

    def _fmt_date(v):
        if not isinstance(v, (datetime, dt_date)) and not hasattr(v, 'strftime'):
            try:
                if pd.isna(v):
                    return ""
            except Exception:
                pass
        if isinstance(v, (datetime, dt_date)) or hasattr(v, 'strftime'):
            try:
                return v.strftime("%d-%m-%Y")
            except Exception:
                pass
        s = str(v).strip()
        m = re.match(r"(\d{4})-(\d{2})-(\d{2})", s)
        if m:
            return f"{m.group(3)}-{m.group(2)}-{m.group(1)}"
        return s

    HDR_DATE_LABELS = {
        "tran date", "txn date", "transaction date", "date", "value date",
        "posting date", "trans date", "dt",
        "transaction date(chq dt for chq txn)",
        "tran. date", "trans. date", "posted date", "sl.no.",
        "valuedate", "value date", "transaction date & time",
        "transaction date", "booking date",
    }
    HDR_AMT_LABELS = {
        "debit", "credit", "withdrawal", "deposit", "amount",
        "debit amount", "credit amount", "dr", "cr",
        "withdrawal amt (inr)", "deposit amt (inr)",
        "debit amount (inr)", "credit amount (inr)",
        "withdrawal amt.(inr)", "deposit amt.(inr)",
        "debit (inr)", "credit (inr)",
        "dr amount", "cr amount", "dr amt", "cr amt",
        "debit amt", "credit amt",
        "debit(inr)", "credit(inr)",
    }
    HDR_DESC_LABELS = {
        "description", "particulars", "narration", "remarks",
        "transaction details", "details", "trans details",
        "transaction remarks", "particulars/description",
        "transaction particular", "transaction narration",
        "transaction description", "transaction particulars",
        "payment narration",
        "transaction remarks", "transaction description",
    }
    HDR_CHQ_LABELS = {
        "chq no", "chq. no.", "cheque no", "cheque number",
        "ref no", "ref. no.", "reference no", "instrument no",
        "chq/ref no", "chq/ref number", "cheque/ref no",
        "chq./ref.no.", "ref.no./chq.no.", "chq no.", "reference number",
        "instrument no.", "transaction id", "ref no./cheque no.",
        "chq / ref no.", "cheque / ref no",
        "chqno",
        "bank reference",
        "reference number", "utr number", "utr no",
        "reference no.",
    }
    HDR_BAL_LABELS = {
        "balance", "closing balance", "balance (inr)", "running balance",
        "balance (rs)", "balance amount", "closing balance (inr)",
        "available balance", "book balance",
        "balance(inr)",
        "available balance",
    }
    HDR_DRCR_LABELS = {
        "dr/cr", "cr/dr", "type", "txn type", "dr / cr", "cr / dr",
        "debit/credit", "transaction type", "mode",
        "type",
        "debit / credit", "credit / debit",
    }
    ALL_KNOWN = (HDR_DATE_LABELS | HDR_AMT_LABELS | HDR_DESC_LABELS
                 | HDR_CHQ_LABELS | HDR_BAL_LABELS | HDR_DRCR_LABELS)

    def _clean_cell(v):
        if pd.isna(v) if not isinstance(v, (datetime, dt_date, str)) else False:
            return ""
        s = str(v).strip()
        if s.startswith("'"):
            s = s[1:].strip()
        return s

    hdr     = None
    col_map = {}

    for i, row in raw.iterrows():
        cells_raw   = row.tolist()
        cells_lower = [_clean_cell(v).lower() for v in cells_raw]
        ts_count = sum(1 for v in cells_raw
                       if hasattr(v, 'strftime') or isinstance(v, (datetime, dt_date)))
        if ts_count >= 2:
            continue
        has_date_lbl = any(c in HDR_DATE_LABELS for c in cells_lower)
        has_amt_lbl  = any(c in HDR_AMT_LABELS  for c in cells_lower)
        has_bal_lbl  = any(c in HDR_BAL_LABELS  for c in cells_lower)
        has_desc_lbl = any(c in HDR_DESC_LABELS for c in cells_lower)
        has_drcr_lbl = any(c in HDR_DRCR_LABELS for c in cells_lower)
        triggered = (
            (has_date_lbl and has_amt_lbl) or
            (has_bal_lbl and has_amt_lbl and has_desc_lbl) or
            (has_bal_lbl and has_drcr_lbl and has_desc_lbl)
        )
        if triggered:
            hdr = i
            for ci, c in enumerate(cells_lower):
                if c in HDR_DATE_LABELS and "date" not in col_map:
                    col_map["date"] = ci
                if c in HDR_CHQ_LABELS  and "chq"  not in col_map:
                    col_map["chq"]  = ci
                if c in HDR_DESC_LABELS and "desc" not in col_map:
                    col_map["desc"] = ci
                if c in HDR_AMT_LABELS:
                    if c in ("debit","withdrawal","dr","debit amount","dr amount","dr amt",
                             "withdrawal amt (inr)","debit amount (inr)","withdrawal amt.(inr)",
                             "debit (inr)","debit amt","debit(inr)") and "debit" not in col_map:
                        col_map["debit"] = ci
                    if c in ("credit","deposit","cr","credit amount","cr amount","cr amt",
                             "deposit amt (inr)","credit amount (inr)","deposit amt.(inr)",
                             "credit (inr)","credit amt","credit(inr)") and "credit" not in col_map:
                        col_map["credit"] = ci
                if c in HDR_BAL_LABELS and "balance" not in col_map:
                    col_map["balance"] = ci
                if c in HDR_DRCR_LABELS and "drcr_flag" not in col_map:
                    col_map["drcr_flag"] = ci
            if "date" not in col_map:
                for ci, c in enumerate(cells_lower):
                    if "date" in c or "time" in c:
                        col_map["date"] = ci
                        break
            print(f"[Statement] Strategy 1 (multi-col hdr) at row {i}: {[c for c in cells_lower if c]}")
            print(f"[Statement] col_map (S1): {col_map}")
            break

    if hdr is None:
        print("[Statement] Strategy 1 failed → trying Strategy 2 (Axis/single-col-A rebuild)")

        total_rows = len(raw)
        single_col_rows = sum(
            1 for _, row in raw.iterrows()
            if sum(1 for v in row.tolist() if pd.notna(v) and str(v).strip()) == 1
               and pd.notna(row.tolist()[0]) and str(row.tolist()[0]).strip()
        )
        single_col_ratio = single_col_rows / max(total_rows, 1)
        print(f"[Statement] Single-col-A ratio: {single_col_rows}/{total_rows} = {single_col_ratio:.0%}")

        if single_col_ratio >= 0.70:
            print("[Statement] Strategy 2: Axis single-column format detected — rebuilding table")
            col_a_strings = []
            for _, row in raw.iterrows():
                v = row.tolist()[0]
                col_a_strings.append(str(v).strip() if pd.notna(v) and str(v).strip() else "")

            hdr_line_idx   = None
            axis_col_names = []

            for i, s in enumerate(col_a_strings):
                s_lower = s.lower()
                hits = sum(1 for kw in ALL_KNOWN if kw in s_lower)
                if hits >= 3:
                    parts = [p.strip() for p in re.split(r"\t|  {2,}", s) if p.strip()]
                    if len(parts) >= 3:
                        axis_col_names = parts
                        hdr_line_idx   = i
                        print(f"[Statement] S2 single-row header at line {i}: {parts}")
                        break

            if hdr_line_idx is None:
                label_run   = []
                label_start = None
                for i, s in enumerate(col_a_strings):
                    s_lower = s.lower()
                    if any(kw in s_lower for kw in ALL_KNOWN) and len(s) < 60:
                        if label_start is None:
                            label_start = i
                        label_run.append((i, s))
                    else:
                        if len(label_run) >= 3:
                            axis_col_names = [l for _, l in label_run]
                            hdr_line_idx   = label_run[-1][0]
                            print(f"[Statement] S2 multi-row header ending at line {hdr_line_idx}: {axis_col_names}")
                            break
                        label_run   = []
                        label_start = None

            if hdr_line_idx is not None and axis_col_names:
                def _axis_col_role(name):
                    n = name.lower().strip()
                    if any(k in n for k in HDR_DATE_LABELS):    return "date"
                    if any(k in n for k in HDR_CHQ_LABELS):     return "chq"
                    if any(k in n for k in HDR_DESC_LABELS):    return "desc"
                    if any(k in n for k in ("withdrawal","debit"," dr "," dr","debit amount","withdrawal amt")):
                        return "debit"
                    if any(k in n for k in ("deposit","credit"," cr "," cr","credit amount","deposit amt")):
                        return "credit"
                    if any(k in n for k in HDR_BAL_LABELS):     return "balance"
                    return "other"

                role_order = [_axis_col_role(c) for c in axis_col_names]
                print(f"[Statement] S2 column roles: {list(zip(axis_col_names, role_order))}")

                rebuilt_rows = []
                for i in range(hdr_line_idx + 1, len(col_a_strings)):
                    s = col_a_strings[i]
                    if not s:
                        continue
                    if "\t" in s:
                        parts = [p.strip() for p in s.split("\t")]
                    else:
                        parts = [p.strip() for p in re.split(r"  {2,}", s)]
                    if len(parts) < 2:
                        continue
                    while len(parts) < len(role_order):
                        parts.append("")
                    row_dict = {r: parts[ci] for ci, r in enumerate(role_order) if ci < len(parts)}
                    rebuilt_rows.append(row_dict)

                if rebuilt_rows:
                    raw = pd.DataFrame(rebuilt_rows)
                    hdr     = -1
                    col_map = {}
                    for ci, role in enumerate(role_order):
                        if role != "other" and role not in col_map:
                            col_map[role] = ci
                    print(f"[Statement] S2 rebuilt DataFrame: {len(raw)} rows, col_map={col_map}")
                else:
                    print("[Statement] S2: no data rows found after header")

        if hdr is None:
            col_a_labels = []
            for i, row in raw.iterrows():
                cells_lower = [str(v).strip().lower() if pd.notna(v) else "" for v in row.tolist()]
                non_empty_idx = [j for j, v in enumerate(cells_lower) if v]
                if non_empty_idx == [0]:
                    lbl = cells_lower[0]
                    if any(kw in lbl for kw in ALL_KNOWN):
                        col_a_labels.append((i, lbl))
                elif len(non_empty_idx) <= 2:
                    lbl = cells_lower[0] if cells_lower else ""
                    hits = sum(1 for kw in ALL_KNOWN if kw in lbl)
                    if hits >= 3:
                        hdr = i
                        print(f"[Statement] Strategy 2c: merged hdr row {i}: '{lbl[:80]}'")
                        break
            if hdr is None and len(col_a_labels) >= 3:
                hdr = col_a_labels[-1][0]
                print(f"[Statement] Strategy 2d: multi-row col-A, last={hdr}")

    if hdr is None:
        print("[Statement] Strategy 2 failed → trying Strategy 3 (data-row scan)")
        for i, row in raw.iterrows():
            cells = row.tolist()
            if not cells:
                continue
            has_leading_date = any(_is_date_val(cells[j])
                                   for j in range(min(2, len(cells)))
                                   if pd.notna(cells[j]))
            if not has_leading_date:
                continue
            nums = sum(1 for v in cells if isinstance(v, (int, float)) and v > 0)
            strs = sum(1 for v in cells
                       if isinstance(v, str) and len(v.strip()) > 3 and not _is_date_val(v))
            if nums >= 1 and (nums + strs) >= 3:
                hdr = max(i - 1, 0)
                print(f"[Statement] Strategy 3: first data row={i}, header={hdr}")
                break

    if hdr is None:
        print("[Statement] Strategy 3 failed → trying Strategy 4 (brute force)")
        for i, row in raw.iterrows():
            cells    = row.tolist()
            has_date = any(_is_date_val(v) for v in cells if pd.notna(v))
            has_num  = any(isinstance(v, (int, float)) and v > 0 for v in cells)
            if has_date and has_num:
                hdr = max(i - 1, 0)
                print(f"[Statement] Strategy 4: first date+num row={i}, header={hdr}")
                break

    if hdr is None:
        print("[ERROR] All strategies failed. First 15 rows:")
        for i, row in raw.head(15).iterrows():
            print(f"  Row {i}: {[str(v)[:35] for v in row.tolist()]}")
        sys.exit(
            "Cannot detect header row in bank statement.\n"
            "Supported: .xlsx/.xls/.csv exports from SBI, Axis, HDFC, ICICI, "
            "IndusInd, Kotak, PNB, Canara, BOB, Yes Bank, Federal Bank, etc."
        )

    ncols      = len(raw.columns)
    first_data = None
    for ri in range(hdr + 1, min(hdr + 15, len(raw))):
        candidate  = raw.iloc[ri]
        cells_c    = candidate.tolist()
        non_empty  = [v for v in cells_c if pd.notna(v) and str(v).strip() not in ("", "nan")]
        has_d = any(_is_date_val(v) for v in non_empty)
        has_n = any(isinstance(v, (int, float)) and v > 0 for v in non_empty)
        if has_d and has_n and len(non_empty) >= 3:
            first_data = candidate
            print(f"[Statement] First data row for col-map inference: {ri}")
            break

    def _fallback(key, *candidates):
        if key not in col_map:
            for c in candidates:
                if 0 <= c < ncols:
                    col_map[key] = c
                    return

    if first_data is not None:
        fvals     = first_data.tolist()
        date_cols = [ci for ci, v in enumerate(fvals)
                     if pd.notna(v) and _is_date_val(v)]
        num_cols  = [ci for ci, v in enumerate(fvals)
                     if isinstance(v, (int, float)) and v > 0 and not _is_date_val(v)]
        str_cols  = [ci for ci, v in enumerate(fvals)
                     if isinstance(v, str) and len(v.strip()) > 4 and not _is_date_val(v)]

        if date_cols:
            _fallback("date", *date_cols)
        else:
            _fallback("date", 0, 1)

        if len(num_cols) >= 3:
            _fallback("balance", num_cols[-1])
            _fallback("credit",  num_cols[-2])
            _fallback("debit",   num_cols[-3])
        elif len(num_cols) == 2:
            _fallback("balance", num_cols[-1])
            _fallback("credit",  num_cols[0])
            _fallback("debit",   num_cols[0])
        elif len(num_cols) == 1:
            _fallback("balance", num_cols[0])

        if "desc" not in col_map and str_cols:
            used_now = set(col_map.values())
            best     = max(
                ((ci, len(str(fvals[ci]))) for ci in str_cols if ci not in used_now),
                key=lambda x: x[1], default=None
            )
            if best:
                col_map["desc"] = best[0]

        if "chq" not in col_map:
            used_now = set(col_map.values())
            for ci, v in enumerate(fvals):
                if ci in used_now or not pd.notna(v):
                    continue
                sv = str(v).strip()
                if 4 <= len(sv) <= 16 and re.fullmatch(r"[A-Za-z0-9/ \-]+", sv):
                    col_map["chq"] = ci
                    break
    else:
        _fallback("date",    0, 1)
        _fallback("desc",    2, 3)
        _fallback("debit",   3, 5)
        _fallback("credit",  4, 6)
        _fallback("balance", 5, 7)

    _fallback("date",    0)
    _fallback("desc",    2, 3)
    _fallback("debit",   3, 5)
    _fallback("credit",  4, 6)
    _fallback("balance", 5, 7)
    _fallback("chq",     1, 3, 2)

    hdr_row   = raw.iloc[hdr].tolist() if (hdr >= 0 and hdr < len(raw)) else []
    hdr_lower = [_clean_cell(v).lower() for v in hdr_row]
    for ci, c in enumerate(hdr_lower):
        if c in HDR_DATE_LABELS and "date" not in col_map:
            col_map["date"] = ci
        if c in HDR_CHQ_LABELS and "chq" not in col_map:
            col_map["chq"]  = ci
        if c in HDR_DESC_LABELS and "desc" not in col_map:
            col_map["desc"] = ci
        if c in HDR_AMT_LABELS:
            if c in ("debit","withdrawal","dr","debit amount","dr amount","dr amt",
                     "withdrawal amt (inr)","debit amount (inr)","withdrawal amt.(inr)",
                     "debit (inr)","debit amt","debit(inr)") and "debit" not in col_map:
                col_map["debit"] = ci
            if c in ("credit","deposit","cr","credit amount","cr amount","cr amt",
                     "deposit amt (inr)","credit amount (inr)","deposit amt.(inr)",
                     "credit (inr)","credit amt","credit(inr)") and "credit" not in col_map:
                col_map["credit"] = ci
        if c in HDR_BAL_LABELS:
            col_map["balance"] = ci
        if c in HDR_DRCR_LABELS and "drcr_flag" not in col_map:
            col_map["drcr_flag"] = ci
        if "date" not in col_map and "date" in c:
            col_map["date"] = ci

    single_amt_col = None
    drcr_col       = None
    for ci, c in enumerate(hdr_lower):
        if c in ("amount", "transaction amount", "txn amount", "debit/credit amount"):
            single_amt_col = ci
        if c in HDR_DRCR_LABELS:
            drcr_col = ci
    if single_amt_col is not None:
        col_map["single_amt"] = single_amt_col
        col_map["debit"]      = single_amt_col
        col_map["credit"]     = single_amt_col
        if drcr_col is not None:
            col_map["drcr_flag"] = drcr_col
    elif drcr_col is not None and "drcr_flag" not in col_map:
        col_map["drcr_flag"] = drcr_col

    print(f"[Statement] Final column map: {col_map}")

    data             = raw.iloc[hdr + 1:].reset_index(drop=True)
    rows             = []
    bank_closing_bal = 0.0

    _chq_return_refs = set()
    _ref_col = col_map.get("chq")
    for _, _row in data.iterrows():
        _r = _row.tolist()
        _row_text = " ".join(str(v).strip() for v in _r if pd.notna(v) and str(v).strip())
        if re.search(r"cheque\s+return\s+issued.*item\s+listed\s+twice", _row_text, re.IGNORECASE):
            if _ref_col is not None and _ref_col < len(_r):
                _ref = str(_r[_ref_col]).strip()
                if _ref and _ref != "nan":
                    _chq_return_refs.add(_ref)

    for _, row in data.iterrows():
        r = row.tolist()

        def _get_raw(key):
            idx = col_map.get(key)
            if idx is None or idx >= len(r):
                return None
            v = r[idx]
            if isinstance(v, (datetime, dt_date)) or hasattr(v, 'strftime'):
                return v
            try:
                return None if pd.isna(v) else v
            except Exception:
                return v

        def _get_str(key, default=""):
            v = _get_raw(key)
            if v is None:
                return default
            s = str(v).strip()
            if s.startswith("'"):
                s = s[1:].strip()
            return s

        row_text = " ".join(_clean_cell(v) for v in r if pd.notna(v) and str(v).strip())
        if re.search(r"no\s+transactions", row_text, re.IGNORECASE):
            is_no_transactions = True
            continue
        if re.search(r"cheque\s+return\s+issued.*item\s+listed\s+twice", row_text, re.IGNORECASE):
            continue
        if _chq_return_refs:
            _row_ref = str(r[col_map["chq"]]).strip() if col_map.get("chq") is not None and col_map["chq"] < len(r) else ""
            if _row_ref and _row_ref in _chq_return_refs:
                continue
        non_empty = [str(v).strip() for v in r if pd.notna(v) and str(v).strip()]
        if not non_empty:
            continue
        if re.search(
            r"^\s*(total|opening\s+balance|closing\s+balance|grand\s+total"
            r"|brought\s+forward|carry\s+forward)\s*$",
            row_text, re.IGNORECASE
        ):
            for v in r:
                if isinstance(v, (int, float)) and v > 1000:
                    bank_closing_bal = max(bank_closing_bal, v)
            continue

        date_raw = _get_raw("date")
        if date_raw is None:
            for v in r:
                if pd.notna(v) and _is_date_val(v):
                    date_raw = v
                    break
        if date_raw is None:
            continue
        if hasattr(date_raw, 'strftime') or isinstance(date_raw, (datetime, dt_date)):
            date = _fmt_date(date_raw)
        else:
            date = str(date_raw).strip()
            if re.search(r"\d{2}:\d{2}", date):
                date = date.split()[0].strip()
            if not DATE_RE.search(date):
                continue
            m = re.match(r"(\d{4})-(\d{2})-(\d{2})", date)
            if m:
                date = f"{m.group(3)}-{m.group(2)}-{m.group(1)}"

        chq  = _get_str("chq").replace(".0", "")
        desc = _get_str("desc")

        debit_raw  = _get_str("debit")
        credit_raw = _get_str("credit")
        debit  = to_amt(debit_raw)  if debit_raw  not in ("", "-", "nan") else 0.0
        credit = to_amt(credit_raw) if credit_raw not in ("", "-", "nan") else 0.0

        if "drcr_flag" in col_map:
            flag = _get_str("drcr_flag").upper().strip()
            if "single_amt" in col_map:
                amt = debit
                if flag == "C" or any(x in flag for x in ("CR", "CREDIT", "DEP", "DEPOSIT")):
                    debit, credit = 0.0, amt
                elif flag == "D" or any(x in flag for x in ("DR", "DEBIT", "WDL", "WITHDRAWAL")):
                    debit, credit = amt, 0.0
            else:
                if debit == 0.0 and credit == 0.0:
                    pass
        elif "single_amt" in col_map and debit == credit and debit > 0:
            credit = debit
            debit  = 0.0

        bal = to_amt(_get_str("balance"))
        if bal == 0.0:
            nums = sorted(
                [v for v in r if isinstance(v, (int, float)) and v > max(debit, credit, 0.01)],
                reverse=True
            )
            if nums:
                bal = nums[0]

        if bal > 0:
            bank_closing_bal = bal

        if credit > 0:
            direction, bank_amt = "INFLOW",  credit
        elif debit > 0:
            direction, bank_amt = "OUTFLOW", debit
        else:
            if bal == 0.0:
                for v in r:
                    if isinstance(v, (int, float)) and v > 0:
                        bal = v
                        break
            if bal > 0:
                bank_closing_bal = bal
            continue

        chq_clean = ""
        if chq and chq not in ("-", "nan", "") and len(chq) <= 15:
            try:
                int(chq); chq_clean = chq
            except ValueError:
                if re.fullmatch(r"[A-Z0-9]{4,15}", chq.upper()):
                    chq_clean = chq

        party = extract_party_from_desc(desc)
        rows.append({
            "Date":          date,
            "Chq No":        chq_clean,
            "Description":   desc,
            "Party":         party,
            "Direction":     direction,
            "Sender":        party  if direction == "INFLOW"  else "COMPANY",
            "Recipient":     party  if direction == "OUTFLOW" else "COMPANY",
            "Debit (Rs)":    debit  if debit  > 0 else "",
            "Credit (Rs)":   credit if credit > 0 else "",
            "Bank Amt (Rs)": bank_amt,
            "Balance (Rs)":  bal,
        })

    if bank_closing_bal == 0.0:
        for i, row in raw.iterrows():
            if i > 20:
                break
            cells    = [str(c).strip() if pd.notna(c) else "" for c in row.tolist()]
            combined = " ".join(cells)
            for pat in [
                r"book\s+balance\s*[:\s]+([0-9,. ]+)",
                r"available\s+balance\s*[:\s]+([0-9,. ]+)",
                r"closing\s+balance\s*[:\s]+([0-9,. ]+)",
            ]:
                m = re.search(pat, combined, re.IGNORECASE)
                if m:
                    v = to_amt(m.group(1).replace(" ", ""))
                    if v > 0:
                        bank_closing_bal = v
                        print(f"[Statement] Closing balance from header: {bank_closing_bal}")
                        break
            if bank_closing_bal == 0.0 and len(cells) >= 2:
                if re.search(r"closing\s+balance", cells[0], re.IGNORECASE):
                    v = to_amt(cells[1])
                    if v > 0:
                        bank_closing_bal = v
                        print(f"[Statement] Closing balance from HDFC header key-value: {bank_closing_bal}")
            if bank_closing_bal > 0:
                break
    
    if bank_closing_bal == 0.0:
        _bal_col = col_map.get("balance")
        for _, _bal_row in data.iterrows():
            _r = _bal_row.tolist()
            # Try mapped balance column first
            if _bal_col is not None and _bal_col < len(_r):
                _v = to_amt(str(_r[_bal_col]).replace(",", ""))
                if _v > 0:
                    bank_closing_bal = _v
                    print(f"[Statement] Closing balance from data balance-col fallback: {bank_closing_bal}")
                    break
            # Fallback: scan all numeric values in the row
            for _v in _r:
                if isinstance(_v, (int, float)) and _v > 1000:
                    bank_closing_bal = _v
                    print(f"[Statement] Closing balance from data row numeric scan: {bank_closing_bal}")
                    break
            if bank_closing_bal > 0:
                break

    if rows:
        df = pd.DataFrame(rows)
    else:
        print("[Statement] No transaction rows parsed from bank statement.")
        df = pd.DataFrame(columns=STMT_COLS)

    print(f"[Statement] Parsed {len(df)} transaction rows | Bank closing bal: {bank_closing_bal}")
    return df, bank_closing_bal, account_no, branch_label, bank_name_from_stmt,is_no_transactions


# =============================================================================
# 3. RECONCILE — 5-pass matching engine (+ new Pass 3e)
# =============================================================================

def reconcile(book_df, stmt_df):
    if book_df.empty or stmt_df.empty:
        print(f"[WARN] Reconcile called with empty data: book={len(book_df)} rows, stmt={len(stmt_df)} rows")
        empty_matched = pd.DataFrame(columns=[
            "Match Method","Name Match","Fuzzy Score %","Amount Match",
            "Book Date","Book Txn","Book Bill No","Book Chq","Book Party",
            "Book Direction","Book Sender","Book Recipient","Book Amt (Rs)",
            "Bank Date","Bank Chq","Bank Description","Bank Party",
            "Bank Direction","Bank Sender","Bank Recipient",
            "Debit (Rs)","Credit (Rs)","Bank Amt (Rs)","Difference (Rs)",
            "Partial Payment","Bank Full Amt","Flags"])
        book_only = book_df.copy() if not book_df.empty else pd.DataFrame(columns=BOOK_COLS)
        stmt_only = stmt_df.copy() if not stmt_df.empty else pd.DataFrame(columns=STMT_COLS)
        return empty_matched, book_only, stmt_only

    book = book_df.copy(); stmt = stmt_df.copy()

    book["_used"] = False; stmt["_used"] = False; matched_rows = []
    book["Chq No"] = book["Chq No"].astype(str).str.strip()
    stmt["Chq No"] = stmt["Chq No"].astype(str).str.strip()

    # ── Helpers ───────────────────────────────────────────────────────────────
    CHQ_ABSENT = {"", "nan", "0"}

    def _norm_chq(c):
        s = str(c).strip().lstrip("0")
        return s if s else "0"

    def _chq_verdict(book_chq, bank_chq):
        b1 = _norm_chq(book_chq); b2 = _norm_chq(bank_chq)
        if b1 in CHQ_ABSENT or b2 in CHQ_ABSENT:
            return "ignore"
        if b1 == b2:
            return "match"
        # Allow near-match for single-digit INSERTION/DELETION typos only
        # (e.g. book chq=2333383, bank chq=233383 — extra repeated digit in book).
        # We do NOT allow substitutions (same length, one digit changed) because
        # that would incorrectly merge distinct cheques like 154184 vs 154189.
        # Only apply when the lengths differ by exactly 1 (pure insert/delete).
        if abs(len(b1) - len(b2)) == 1:
            longer, shorter = (b1, b2) if len(b1) > len(b2) else (b2, b1)
            # Check if shorter is obtainable by deleting exactly one char from longer
            for skip in range(len(longer)):
                if longer[:skip] + longer[skip+1:] == shorter:
                    return "ignore"   # one-char insertion typo — allow match
        return "reject"

    def _core_match(br, sr):
        if br["Direction"] != sr["Direction"]: return False
        if abs(float(sr["Bank Amt (Rs)"]) - float(br["Book Amt (Rs)"])) >= 0.01: return False
        if not within_date(br.get("Date", ""), sr["Date"]): return False
        if _chq_verdict(br["Chq No"], sr["Chq No"]) == "reject": return False
        return True

    # ── Pre-pass: RT/PT refund pair detection ────────────────────────────────
    # When the book has a 'Receipts' INFLOW (chq=generic) AND a 'Payments' OUTFLOW
    # (chq=real number) for the SAME party and SAME amount in the same period,
    # this is a receipt+refund pair where the refund approval has not been taken.
    # Example: company received a customer cheque (Receipts), then issued a refund
    # cheque (Payments/PT). The bank cleared the refund cheque as a debit.
    # Manual BRS treatment: Payments goes to "issued-not-debited", bank debit goes
    # to "debited-not-book" — they are NOT matched to each other.
    # Without this pre-pass, Pass 1 would match the Payments OUTFLOW to the bank
    # OUTFLOW by cheque number, making both disappear from the BRS sections.
    _refund_pair_chqs = set()  # cheque numbers of Payments entries that are RT/PT pairs
    _receipt_keys = set()      # (cleaned_party, amount) of all Receipts INFLOW entries
    for bi, br in book[book["Txn Type"] == "Receipts"].iterrows():
        if br["Direction"] == "INFLOW":
            _receipt_keys.add((br["Party"], round(float(br["Book Amt (Rs)"]), 2)))
    for bi, br in book[book["Txn Type"] == "Payments"].iterrows():
        if br["Direction"] == "OUTFLOW" and br["Chq No"] not in ("", "nan", "0"):
            key = (br["Party"], round(float(br["Book Amt (Rs)"]), 2))
            if key in _receipt_keys:
                _refund_pair_chqs.add(br["Chq No"])
                print(f"[Reconcile] RT/PT refund pair detected: chq={br['Chq No']} "
                      f"party={br['Party']} Rs{br['Book Amt (Rs)']:,.2f} — will not match to bank")
    book["_refund_pair"] = book["Chq No"].isin(_refund_pair_chqs) & (book["Txn Type"] == "Payments")
    if _refund_pair_chqs:
        print(f"[Reconcile] {len(_refund_pair_chqs)} refund pair cheques excluded from all matching passes")

    # ── Pass 0: Internal Fund Transfer (HOT/IFT) matching ───────────────────
    # Book entries tagged as HOT transfers (narration contains "[HOT Transfer]")
    # are matched to bank statement entries whose description matches the
    # HOT_TRANSFER_PATTERN (INB/IFT/ORIENT, HOT AXIS, BEING FUNDS TRANSFERRED
    # FROM HOT, etc.).  These entries carry the company's own name on both sides
    # so the fuzzy-name threshold is irrelevant; we match purely on
    # Direction + Amount + Date and mark both sides as used so they appear in
    # the Matched sheet for checking purposes.
    _IFT_STMT_PATTERN = re.compile(
        r"HOT\s+(?:HDFC|AXIS|ICICI|SBI|INDUSIND|KOTAK|YES|PNB|CANARA|BOB|FEDERAL|RBL|DCB|IDFC|BANDHAN|UCO|UNION|IDBI|IOB|UBI|BOI|INDIAN)"
        r"|(?:HDFC|AXIS|ICICI|SBI|INDUSIND|KOTAK|YES|PNB|CANARA|BOB|FEDERAL|RBL|DCB|IDFC|BANDHAN|UCO|UNION|IDBI|IOB|UBI|BOI|INDIAN)\s+HOT"
        r"|ORIENT.*HOT"
        r"|HOT.*ORIENT"
        r"|INB/IFT/ORIENT"
        r"|INB/IFT"
        r"|\bHOT\b.*\bBRANCH\b"
        r"|\bHEAD\s+OFFICE\s+TRANSFER\b"
        r"|\bH\.O\.T\b"
        r"|BEING\s+FUNDS\s+TRANSFERRED\s+FROM\s+HOT"
        r"|FROM\s+HOT\s+\w+\s+TO\s+BRANCH",
        re.IGNORECASE
    )
    print("[Reconcile] Pass 0: Internal Fund Transfer (HOT/IFT) matching")
    p0_start = len(matched_rows)
    _ift_book = book[
        (~book["_used"]) &
        (book["Narration"].str.contains(r"\[HOT Transfer\]", na=False, regex=True))
    ]
    _ift_stmt = stmt[
        (~stmt["_used"]) &
        (stmt["Description"].apply(lambda d: bool(_IFT_STMT_PATTERN.search(str(d)))))
    ]
    for bi, br in _ift_book.iterrows():
        b_dir = br["Direction"]
        b_amt = round(float(br["Book Amt (Rs)"]), 2)
        b_date = br.get("Date", "")
        candidates = _ift_stmt[
            (~_ift_stmt["_used"]) &
            (_ift_stmt["Direction"] == b_dir) &
            (abs(_ift_stmt["Bank Amt (Rs)"] - b_amt) < 0.01)
        ]
        candidates = candidates[candidates.apply(
            lambda sr: within_date(b_date, sr["Date"]), axis=1)]
        if candidates.empty:
            # Relax date constraint for IFT entries — try any unmatched IFT stmt row
            candidates = _ift_stmt[
                (~_ift_stmt["_used"]) &
                (_ift_stmt["Direction"] == b_dir) &
                (abs(_ift_stmt["Bank Amt (Rs)"] - b_amt) < 0.01)
            ]
        if candidates.empty:
            continue
        # Pick closest date if multiple candidates
        def _ift_sort(idx):
            d = date_diff(b_date, _ift_stmt.loc[idx]["Date"])
            return d if d is not None else 999
        si = sorted(candidates.index, key=_ift_sort)[0]
        sr = stmt.loc[si]
        matched_rows.append(_make_row(br, sr, "0-InternalFundTransfer", 100))
        book.at[bi, "_used"] = True
        stmt.at[si, "_used"] = True
        _ift_stmt = stmt[
            (~stmt["_used"]) &
            (stmt["Description"].apply(lambda d: bool(_IFT_STMT_PATTERN.search(str(d)))))
        ]
        print(f"[Reconcile] Pass 0 matched IFT: dir={b_dir} Rs{b_amt:,.2f} "
              f"book_narr='{str(br.get('Narration',''))[:50]}' "
              f"stmt_desc='{str(sr.get('Description',''))[:50]}'")
    print(f"   -> {len(matched_rows) - p0_start} matched")

    # ── Pass 1: Party Name + Direction + Amount + Cheque match ──────────────
    # Primary match requires all four: Party Name (fuzzy), Direction,
    # Amount, and Cheque Number (when present). Date is also checked.
    print("[Reconcile] Pass 1: Party Name + Direction + Amount + Cheque number match")
    processed_chqs = set()
    for bi, br in book[(book["Chq No"].str.len() > 0) & (~book["_used"])].iterrows():
        if br["Chq No"] in ("nan", ""): continue
        if br.get("_refund_pair", False): continue  # RT/PT refund pair — skip matching
        chq = br["Chq No"]
        if chq in processed_chqs: continue

        hits = stmt[
            (~stmt["_used"]) &
            (stmt["Chq No"].apply(_norm_chq) == _norm_chq(chq)) &
            (stmt["Direction"] == br["Direction"]) &
            (abs(stmt["Bank Amt (Rs)"] - float(br["Book Amt (Rs)"])) < 0.01)
        ]
        hits = hits[hits.apply(lambda sr: within_date(br.get("Date",""), sr["Date"]), axis=1)]
        # Apply party name filter: keep only candidates where name fuzzy score >= threshold
        # If NO candidate passes the name filter, fall back to all hits (cheque is authoritative)
        name_hits = hits[hits.apply(lambda sr: fuzzy(br["Party"], sr["Party"]) >= FUZZY_THRESHOLD, axis=1)]
        if not name_hits.empty:
            hits = name_hits

        if hits.empty:
            same_chq_bank = stmt[
                (~stmt["_used"]) &
                (stmt["Chq No"].apply(_norm_chq) == _norm_chq(chq)) &
                (stmt["Direction"] == br["Direction"])
            ]
            if same_chq_bank.empty: continue
            si = same_chq_bank.index[0]; sr = stmt.loc[si]
            same_chq_book = book[(book["Chq No"] == chq) & (~book["_used"])]
            same_chq_book = same_chq_book[same_chq_book.apply(
                lambda r: r["Direction"] == sr["Direction"] and within_date(r.get("Date",""), sr["Date"]), axis=1)]
            if same_chq_book.empty: continue
            combined_book_amt = float(same_chq_book["Book Amt (Rs)"].sum())
            bank_amt = float(sr["Bank Amt (Rs)"])
            if abs(combined_book_amt - bank_amt) < 0.01:
                for grp_bi, grp_br in same_chq_book.iterrows():
                    matched_rows.append(_make_row(grp_br, sr, "1-Party+Chq+Dir+Date+Amt (split)", fuzzy(grp_br["Party"],sr["Party"])))
                    book.at[grp_bi, "_used"] = True
                stmt.at[si, "_used"] = True
                print(f"[Reconcile] Pass 1 split: chq={chq} {len(same_chq_book)} entries = bank Rs{bank_amt:,.2f}")
                processed_chqs.add(chq)
            continue

        si = hits.index[0]; sr = stmt.loc[si]
        same_chq_book = book[(book["Chq No"] == chq) & (~book["_used"])]
        same_chq_book = same_chq_book[same_chq_book.apply(
            lambda r: r["Direction"] == sr["Direction"] and within_date(r.get("Date",""), sr["Date"]), axis=1)]

        if len(same_chq_book) == 1:
            matched_rows.append(_make_row(br, sr, "1-Party+Chq+Dir+Date+Amt", fuzzy(br["Party"],sr["Party"])))
            book.at[bi, "_used"] = True; stmt.at[si, "_used"] = True
        else:
            combined_book_amt = float(same_chq_book["Book Amt (Rs)"].sum())
            bank_amt = float(sr["Bank Amt (Rs)"])
            if abs(combined_book_amt - bank_amt) < 0.01:
                for grp_bi, grp_br in same_chq_book.iterrows():
                    matched_rows.append(_make_row(grp_br, sr, "1-Party+Chq+Dir+Date+Amt (split)", fuzzy(grp_br["Party"],sr["Party"])))
                    book.at[grp_bi, "_used"] = True
                stmt.at[si, "_used"] = True
                print(f"[Reconcile] Pass 1 split: chq={chq} {len(same_chq_book)} entries = bank Rs{bank_amt:,.2f}")
                processed_chqs.add(chq)
            else:
                matched_rows.append(_make_row(br, sr, "1-Party+Chq+Dir+Date+Amt", fuzzy(br["Party"],sr["Party"])))
                book.at[bi, "_used"] = True; stmt.at[si, "_used"] = True

    p1 = len(matched_rows)
    print(f"   -> {p1} matched")

    # ── Pass 2: Party Name + Direction + Date + Amount (cheque absent/ignored) ──
    print("[Reconcile] Pass 2: Party Name + Direction + Date + Amount (cheque absent/ignored)")
    p2_start = len(matched_rows)
    for bi, br in book[~book["_used"]].iterrows():
        if br.get("_refund_pair", False): continue
        book_date = br.get("Date", "")
        candidates = stmt[
            (~stmt["_used"]) &
            (stmt["Direction"] == br["Direction"]) &
            (abs(stmt["Bank Amt (Rs)"] - float(br["Book Amt (Rs)"])) < 0.01)
        ]
        if candidates.empty: continue
        candidates = candidates[candidates.apply(lambda sr: within_date(book_date, sr["Date"]), axis=1)]
        if candidates.empty: continue
        candidates = candidates[candidates.apply(
            lambda sr: _chq_verdict(br["Chq No"], sr["Chq No"]) != "reject", axis=1)]
        if candidates.empty: continue
        # Apply party name filter — soft: fall back to all candidates if none pass threshold
        name_cands = candidates[candidates.apply(
            lambda sr: fuzzy(br["Party"], sr["Party"]) >= FUZZY_THRESHOLD, axis=1)]
        if not name_cands.empty:
            candidates = name_cands

        if len(candidates) == 1:
            si = candidates.index[0]; sr = stmt.loc[si]
            matched_rows.append(_make_row(br, sr, "2-Party+Dir+Date+Amt", fuzzy(br["Party"],sr["Party"])))
            book.at[bi, "_used"] = True; stmt.at[si, "_used"] = True
        else:
            def _sort_key(idx):
                sr = stmt.loc[idx]
                d = date_diff(book_date, sr["Date"])
                return (d if d is not None else 999, -fuzzy(br["Party"], sr["Party"]))
            si = sorted(candidates.index, key=_sort_key)[0]; sr = stmt.loc[si]
            matched_rows.append(_make_row(br, sr, "2-Party+Dir+Date+Amt(closest)", fuzzy(br["Party"],sr["Party"])))
            book.at[bi, "_used"] = True; stmt.at[si, "_used"] = True

    print(f"   -> {len(matched_rows) - p2_start} matched")

    # ── Pass 2b: Absorb companion Re1 bank entries ───────────────────────────
    # Banks sometimes send two NEFT credits for the same remitter: Rs1 (test/advance)
    # followed by the main amount. The book records only the main amount.
    # When a bank INFLOW of Rs1 shares the same UTR/reference and party as another bank
    # entry already consumed in a previous pass, we mark the Rs1 as used so it does not
    # float into stmt_only (credited-not-book).
    # IMPORTANT: party-name alone is NOT sufficient — two different UPI/NEFT payments
    # from the same remitter have different UTRs and are independent transactions.
    # We require EITHER a description-prefix match (shared UTR segment, min 10 chars)
    # OR the same cheque/reference number. Party-name-only matches are rejected to
    # avoid incorrectly absorbing genuine separate Re1 payments (which would cause a
    # Rs 1 difference in the BRS).
    print("[Reconcile] Pass 2b: Absorb companion Re1 bank entries (UTR/ref match required)")
    p2b_start = len(matched_rows)
    for si, sr in stmt[(~stmt["_used"]) &
                       (stmt["Direction"] == "INFLOW") &
                       (stmt["Bank Amt (Rs)"] == 1.0)].iterrows():
        desc_re1  = sr["Description"].strip().upper()
        chq_re1   = str(sr.get("Chq No", "")).strip()
        # Extract a meaningful UTR/ref prefix from the description (strip NEFT/RTGS/UPI/<refno>/)
        # e.g. "NEFT/HDFCH00123456/JOHN DOE/HDFC BANK" -> "HDFCH00123456/JOHN DOE/HDFC"
        desc_prefix_re1 = re.sub(r"^(NEFT|RTGS|IMPS|UPI)\b[^/]*/", "", desc_re1)[:25]
        # Only absorb if we have a meaningful shared description segment (UTR-based match)
        # or the same non-trivial cheque/reference number.
        # Do NOT absorb on party-name alone — different transactions can share a party name.
        has_meaningful_prefix = len(desc_prefix_re1) >= 10

        if not has_meaningful_prefix and not (chq_re1 and chq_re1 not in ("", "-", "nan")):
            # No UTR prefix and no reference number — cannot safely absorb
            print(f"[Reconcile] Pass 2b: SKIPPED Re1 (no UTR/ref to confirm linkage) — "
                  f"party='{sr['Party']}' desc='{sr['Description'][:50]}'")
            continue

        matched_peer = stmt[
            stmt["_used"] &
            (stmt["Direction"] == "INFLOW") &
            (stmt["Bank Amt (Rs)"] > 1.0) &
            (stmt.apply(lambda r: (
                (has_meaningful_prefix and
                 desc_prefix_re1 in r["Description"].strip().upper()) or
                (chq_re1 and chq_re1 not in ("", "-", "nan") and
                 str(r.get("Chq No", "")).strip() == chq_re1)
            ), axis=1))
        ]
        if not matched_peer.empty:
            stmt.at[si, "_used"] = True
            print(f"[Reconcile] Pass 2b: absorbed Re1 bank entry — "
                  f"party='{sr['Party']}' desc='{sr['Description'][:50]}'")
    print(f"   -> {len(matched_rows) - p2b_start} matched (Re1 entries absorbed into stmt)")

    # ── Pass 3: Fuzzy Name + Direction + Date + Amount ────────────────────────
    print("[Reconcile] Pass 3: Fuzzy Name + Direction + Date + Amount")
    p3_start = len(matched_rows)
    for bi, br in book[~book["_used"]].iterrows():
        if br.get("_refund_pair", False): continue
        best_score, best_si = 0, None
        for si, sr in stmt[~stmt["_used"]].iterrows():
            if not _core_match(br, sr): continue
            s = fuzzy(br["Party"], sr["Party"])
            if s > best_score: best_score = s; best_si = si
        if best_si is not None and best_score >= FUZZY_THRESHOLD:
            sr = stmt.loc[best_si]
            matched_rows.append(_make_row(br, sr, "3-Fuzzy+Dir+Date+Amt", best_score))
            book.at[bi, "_used"] = True; stmt.at[best_si, "_used"] = True
    print(f"   -> {len(matched_rows) - p3_start} matched")

    # ── Pass 3b: Two book INFLOW entries combined = one bank INFLOW entry ─────
    print("[Reconcile] Pass 3b: Combined book amount -> single bank entry")
    p3b_start = len(matched_rows)
    for si, sr in stmt[~stmt["_used"]].iterrows():
        if sr["Direction"] != "INFLOW": continue
        cands = book[(~book["_used"]) & (book["Direction"] == "INFLOW")]
        if len(cands) < 2: continue
        target = float(sr["Bank Amt (Rs)"]); s_date = sr["Date"]; found = False
        cidx = list(cands.index)
        for i in range(len(cidx)):
            for j in range(i+1, len(cidx)):
                bi1, bi2 = cidx[i], cidx[j]
                if abs(float(book.at[bi1,"Book Amt (Rs)"]) + float(book.at[bi2,"Book Amt (Rs)"]) - target) >= 0.01: continue
                if not within_date(book.at[bi1,"Date"] if "Date" in book.columns else "", s_date): continue
                if not within_date(book.at[bi2,"Date"] if "Date" in book.columns else "", s_date): continue
                if _chq_verdict(book.at[bi1,"Chq No"], sr["Chq No"]) == "reject": continue
                if _chq_verdict(book.at[bi2,"Chq No"], sr["Chq No"]) == "reject": continue
                score = max(fuzzy(book.at[bi1,"Party"],sr["Party"]), fuzzy(book.at[bi2,"Party"],sr["Party"]))
                if score < FUZZY_THRESHOLD: continue  # name must match for at least one book entry
                bank_total = float(sr["Bank Amt (Rs)"])
                bank_dt    = sr["Date"]
                amt1 = float(book.at[bi1,"Book Amt (Rs)"])
                amt2 = float(book.at[bi2,"Book Amt (Rs)"])
                note1 = (f"PARTIAL PAYMENT — Part 1 of 2: Book Rs{amt1:,.2f} + Rs{amt2:,.2f} "
                         f"= Bank Rs{bank_total:,.2f} dated {bank_dt} — "
                         f"confirm both parts are recorded in books")
                note2 = (f"PARTIAL PAYMENT — Part 2 of 2: Book Rs{amt2:,.2f} + Rs{amt1:,.2f} "
                         f"= Bank Rs{bank_total:,.2f} dated {bank_dt} — "
                         f"confirm both parts are recorded in books")
                matched_rows.append(_make_row(book.loc[bi1], sr, "3b-Party+Combined Amt+Date", score, partial_note=note1))
                matched_rows.append(_make_row(book.loc[bi2], sr, "3b-Party+Combined Amt+Date", score, partial_note=note2))
                book.at[bi1,"_used"] = True; book.at[bi2,"_used"] = True; stmt.at[si,"_used"] = True
                found = True; break
            if found: break
    print(f"   -> {len(matched_rows) - p3b_start} matched")

    # ── Pass 3c: Single book entry = two bank entries (split payment) ─────────
    print("[Reconcile] Pass 3c: Single book entry = combined bank amount (split payment)")
    p3c_start = len(matched_rows)
    for bi, br in book[~book["_used"]].iterrows():
        if br.get("_refund_pair", False): continue
        b_dir = br["Direction"]; b_amt = float(br["Book Amt (Rs)"]); b_date = br.get("Date","")
        cands = stmt[(~stmt["_used"]) & (stmt["Direction"] == b_dir)]
        if len(cands) < 2: continue
        cidx = list(cands.index); found = False
        for _ii in range(len(cidx)):
            if found: break
            for _jj in range(_ii+1, len(cidx)):
                si1, si2 = cidx[_ii], cidx[_jj]
                if abs(float(stmt.at[si1,"Bank Amt (Rs)"]) + float(stmt.at[si2,"Bank Amt (Rs)"]) - b_amt) >= 0.01: continue
                if not within_date(b_date, stmt.at[si1,"Date"]): continue
                if not within_date(b_date, stmt.at[si2,"Date"]): continue
                if _chq_verdict(br["Chq No"], stmt.at[si1,"Chq No"]) == "reject": continue
                if _chq_verdict(br["Chq No"], stmt.at[si2,"Chq No"]) == "reject": continue
                score = max(fuzzy(br["Party"],stmt.at[si1,"Party"]), fuzzy(br["Party"],stmt.at[si2,"Party"]))
                if score < FUZZY_THRESHOLD: continue  # name must match for at least one bank entry
                bk_amt  = float(br["Book Amt (Rs)"])
                b1_amt  = float(stmt.at[si1,"Bank Amt (Rs)"])
                b2_amt  = float(stmt.at[si2,"Bank Amt (Rs)"])
                b1_dt   = stmt.at[si1,"Date"]
                b2_dt   = stmt.at[si2,"Date"]
                note = (f"SPLIT PAYMENT — Book Rs{bk_amt:,.2f} matches two bank entries: "
                        f"Rs{b1_amt:,.2f} on {b1_dt} + Rs{b2_amt:,.2f} on {b2_dt} — "
                        f"confirm full payment cleared in bank")
                matched_rows.append(_make_row(br, stmt.loc[si1], "3c-Party+Split Payment", score, partial_note=note))
                book.at[bi,"_used"] = True; stmt.at[si1,"_used"] = True; stmt.at[si2,"_used"] = True
                found = True; break
    print(f"   -> {len(matched_rows) - p3c_start} matched")

    # ── Pass 3d: N book entries (N>2) combined = single bank entry ────────────
    print("[Reconcile] Pass 3d: N book entries (N>2) combined = single bank entry")
    p3d_start = len(matched_rows)
    for si, sr in stmt[~stmt["_used"]].iterrows():
        s_dir = sr["Direction"]; s_amt = float(sr["Bank Amt (Rs)"]); s_date = sr["Date"]
        cands_book = book[(~book["_used"]) & (book["Direction"] == s_dir)]
        if len(cands_book) < 3: continue
        book_idxs = list(cands_book.index); found = False
        party_groups = {}
        for bii in book_idxs:
            pname = str(book.at[bii,"Party"]).upper()
            party_groups.setdefault(pname, []).append(bii)
        for pname, idxs in party_groups.items():
            if len(idxs) < 3: continue
            ok_idxs = [idx for idx in idxs
                       if within_date(book.at[idx,"Date"] if "Date" in book.columns else "", s_date)
                       and _chq_verdict(book.at[idx,"Chq No"], sr["Chq No"]) != "reject"]
            if len(ok_idxs) < 3: continue
            group_sum = sum(float(book.at[idx,"Book Amt (Rs)"]) for idx in ok_idxs)
            if abs(group_sum - s_amt) < 0.01:
                score = fuzzy(pname, sr["Party"])
                if score < FUZZY_THRESHOLD: continue  # name must match bank party
                n_parts   = len(ok_idxs)
                bank_total = float(sr["Bank Amt (Rs)"])
                bank_dt    = sr["Date"]
                for part_num, idx in enumerate(ok_idxs, 1):
                    part_amt = float(book.at[idx,"Book Amt (Rs)"])
                    note = (f"PARTIAL PAYMENT — Part {part_num} of {n_parts}: "
                            f"Book Rs{part_amt:,.2f} (of {n_parts} parts) = "
                            f"Bank Rs{bank_total:,.2f} dated {bank_dt} — "
                            f"confirm all {n_parts} parts are recorded in books")
                    matched_rows.append(_make_row(book.loc[idx], sr, "3d-N-to-1 Aggregation", score, partial_note=note))
                    book.at[idx,"_used"] = True
                stmt.at[si,"_used"] = True
                print(f"[Reconcile] Pass 3d: {len(ok_idxs)} '{pname}' entries = bank Rs{s_amt:,.2f}")
                found = True; break
        if found: continue
    print(f"   -> {len(matched_rows) - p3d_start} matched")

    # ── Pass 4: Direction-flip (FFMC / forex / settlement) ───────────────────
    FLIP_KEYWORDS = re.compile(
        r"\b(FFMC|RFX|FOREX|FX|SWIFT|SETTLEMENT|NOSTRO|TT\b|FCY|USD|EUR|GBP"
        r"|REMIT|BUYING|SELLING|EXCHANGE)\b", re.IGNORECASE)
    print("[Reconcile] Pass 4: Direction-flip match (FFMC/forex/settlement)")
    p4_start = len(matched_rows)
    for bi, br in book[~book["_used"]].iterrows():
        if br.get("_refund_pair", False): continue
        txn_text = f"{br['Txn Type']} {br['Party']} {br.get('Narration','')}"
        if not FLIP_KEYWORDS.search(txn_text): continue
        opp_dir = "INFLOW" if br["Direction"] == "OUTFLOW" else "OUTFLOW"
        candidates = stmt[
            (~stmt["_used"]) &
            (stmt["Direction"] == opp_dir) &
            (abs(stmt["Bank Amt (Rs)"] - float(br["Book Amt (Rs)"])) < 0.01)
        ]
        if candidates.empty: continue
        candidates = candidates[candidates.apply(
            lambda sr: _chq_verdict(br["Chq No"], sr["Chq No"]) != "reject", axis=1)]
        if candidates.empty: continue
        forex_cands = candidates[candidates.apply(
            lambda sr: bool(FLIP_KEYWORDS.search(f"{sr['Description']} {sr['Party']}")), axis=1)]
        pool = forex_cands if not forex_cands.empty else candidates
        # Apply name filter — soft: fall back to full pool if no name hit
        name_pool = pool[pool.apply(lambda sr: fuzzy(br["Party"], sr["Party"]) >= FUZZY_THRESHOLD, axis=1)]
        if not name_pool.empty:
            pool = name_pool
        if len(pool) == 1:
            si = pool.index[0]; sr = stmt.loc[si]
            matched_rows.append(_make_row(br, sr, "4-DirectionFlip(Forex)", fuzzy(br["Party"],sr["Party"])))
            book.at[bi,"_used"] = True; stmt.at[si,"_used"] = True
    print(f"   -> {len(matched_rows) - p4_start} matched")

    # ── Collect results ───────────────────────────────────────────────────────
    matched = pd.DataFrame(matched_rows) if matched_rows else pd.DataFrame(columns=[
        "Match Method","Name Match","Fuzzy Score %","Amount Match",
        "Book Date","Book Txn","Book Bill No","Book Chq","Book Party","Book Direction","Book Sender","Book Recipient","Book Amt (Rs)",
        "Bank Date","Bank Chq","Bank Description","Bank Party","Bank Direction","Bank Sender","Bank Recipient",
        "Debit (Rs)","Credit (Rs)","Bank Amt (Rs)","Difference (Rs)","Partial Payment","Bank Full Amt","Flags"])
    # Ensure new columns exist even when matched_rows came from older code paths
    if "Partial Payment" not in matched.columns:
        matched["Partial Payment"] = False
    if "Bank Full Amt" not in matched.columns:
        matched["Bank Full Amt"] = matched["Bank Amt (Rs)"] if "Bank Amt (Rs)" in matched.columns else 0.0
    book_only = book[~book["_used"]].drop(columns=["_used", "_refund_pair"])
    stmt_only = stmt[~stmt["_used"]].drop(columns=["_used"])

    # Drop internal book cancellations (same party, same amount, opposite direction).
    # EXCEPTION: never drop Receipts INFLOW entries — they are part of RT/PT refund
    # pairs and must stay in book_only as "deposited-not-credited" entries.
    book_only = book_only.copy(); book_only["_drop"] = False
    for bi, br in book_only[book_only["Direction"] == "INFLOW"].iterrows():
        if str(br.get("Txn Type", "")).strip() == "Receipts":
            continue  # RT/PT pair — keep in book_only
        match_out = book_only[
            (~book_only["_drop"]) & (book_only.index != bi) &
            (book_only["Direction"] == "OUTFLOW") &
            (abs(book_only["Book Amt (Rs)"] - br["Book Amt (Rs)"]) < 0.01) &
            (book_only["Party"] == br["Party"])
        ]
        if not match_out.empty: book_only.at[bi,"_drop"] = True
    book_only = book_only[~book_only["_drop"]].drop(columns=["_drop"])

    print(f"[Reconcile] Pass 5 (unmatched):")
    print(f"   Book only (not in bank)  : {len(book_only)}")
    print(f"   Bank only (not in book)  : {len(stmt_only)}")
    print(f"   Total matched            : {len(matched)}")
    return matched, book_only, stmt_only

# =============================================================================
# HELPER: _make_row
# =============================================================================

def _make_row(br, sr, method, score, partial_note=""):
    book_amt = float(br["Book Amt (Rs)"])
    bank_amt = float(sr["Bank Amt (Rs)"])
    diff     = bank_amt - book_amt

    if   score >= 80: name_flag = "Match"
    elif score >= 65: name_flag = "Partial"
    else:             name_flag = "Mismatch"

    if   abs(diff) < 0.01:                               amt_flag = "Exact"
    elif abs(diff) / max(bank_amt, book_amt, 1) < 0.005: amt_flag = f"Minor  Rs{diff:+,.2f}"
    else:                                                 amt_flag = f"Diff   Rs{diff:+,.2f}"

    dir_flag = ""
    if br["Direction"] != sr["Direction"]:
        if "DirectionFlip" in method or "Forex" in method:
            dir_flag = f"Forex/Settlement: Book={br['Direction']} Bank={sr['Direction']} (expected)"
        else:
            dir_flag = f"Dir mismatch: Book={br['Direction']} Bank={sr['Direction']}"

    book_date = br.get("Date", "")
    bank_date = sr.get("Date", "")
    d_diff    = date_diff(book_date, bank_date)
    date_note = ""
    if d_diff is not None and d_diff > 0:
        date_note = f"Date gap: {d_diff}d"

    flags = [x for x in [
        f"Name {score}% -- verify"            if name_flag != "Match"                  else "",
        ""                                    if amt_flag  == "Exact"                  else amt_flag,
        dir_flag,
        date_note,
        "Third party payment -- verify name"  if "3rd Party" in method                 else "",
        "Combined entry -- verify split"      if method.startswith("3b")               else "",
        partial_note                          if partial_note                           else "",
        "HOT Transfer — Head Office Transfer" if "[HOT Transfer]" in str(br.get("Narration", "")) else "",
    ] if x]

    return {
        "Match Method":     method,
        "Name Match":       name_flag,
        "Fuzzy Score %":    score,
        "Amount Match":     amt_flag,
        "Book Date":        br.get("Date", ""),
        "Book Txn":         br["Txn Type"],
        "Book Bill No":     br["Bill No"],
        "Book Chq":         br["Chq No"],
        "Book Party":       br["Party"],
        "Book Direction":   br["Direction"],
        "Book Sender":      br["Sender"],
        "Book Recipient":   br["Recipient"],
        "Book Amt (Rs)":    book_amt,
        "Bank Date":        sr["Date"],
        "Bank Chq":         sr["Chq No"],
        "Bank Description": sr["Description"],
        "Bank Party":       sr["Party"],
        "Bank Direction":   sr["Direction"],
        "Bank Sender":      sr["Sender"],
        "Bank Recipient":   sr["Recipient"],
        "Debit (Rs)":       sr["Debit (Rs)"],
        "Credit (Rs)":      sr["Credit (Rs)"],
        "Bank Amt (Rs)":    bank_amt,
        "Difference (Rs)":  round(diff, 2),
        "Flags":            " | ".join(flags),
        "Partial Payment":  bool(partial_note),
        "Bank Full Amt":    bank_amt,   # preserved for BRS section display
    }


# =============================================================================
# NO-TRANSACTION RECONCILIATION CHECK
# =============================================================================

def check_no_transaction_reconciliation(book_df, stmt_df, book_closing_bal,
                                         bank_closing_bal, prev_brs):
    if not book_df.empty:
        return False, ""

    prev_book = prev_brs.get("prev_book_closing_bal", 0.0) if prev_brs else 0.0
    prev_bank = prev_brs.get("prev_bank_closing_bal", 0.0) if prev_brs else 0.0

    if abs(bank_closing_bal - book_closing_bal) < 0.01:
        return True, (f"No book entries for this bank in current period. "
                      f"Bank closing (₹{bank_closing_bal:,.2f}) = Book closing (₹{book_closing_bal:,.2f}). "
                      f"Fully reconciled — all bank transactions already recorded in prior period.")

    if prev_book > 0 and abs(prev_bank - prev_book) < 0.01:
        if abs(bank_closing_bal - book_closing_bal) < 0.01:
            return True, "Reconciled from previous BRS — no new transactions in book."

    return False, ""


# =============================================================================
# STYLE CONSTANTS
# =============================================================================

_DK = PatternFill("solid", fgColor="1F3864")
_MD = PatternFill("solid", fgColor="2E75B6")
_RH = PatternFill("solid", fgColor="C00000")
_G  = PatternFill("solid", fgColor="C6EFCE")
_R  = PatternFill("solid", fgColor="FFC7CE")
_Y  = PatternFill("solid", fgColor="FFEB9C")
_O  = PatternFill("solid", fgColor="FCE4D6")
_W  = PatternFill("solid", fgColor="FFFFFF")
_GR = PatternFill("solid", fgColor="F2F2F2")
_CF = PatternFill("solid", fgColor="E2EFDA")

WF = Font(bold=True, color="FFFFFF", name="Arial", size=10)
NF = Font(name="Arial", size=9)
BF = Font(bold=True, name="Arial", size=9)
_s = Side(style="thin", color="BFBFBF")
BR = Border(left=_s, right=_s, top=_s, bottom=_s)


def _c(ws, r, c, v=None, fill=_W, font=None, center=False):
    cell           = ws.cell(r, c, v)
    cell.fill      = fill
    cell.font      = font or NF
    cell.border    = BR
    cell.alignment = Alignment(
        horizontal="center" if center else "left",
        vertical="center", wrap_text=True)


def _title(ws, ncols, text, fill=_DK):
    ws.merge_cells(f"A1:{get_column_letter(ncols)}1")
    _c(ws, 1, 1, text, fill=fill,
       font=Font(bold=True, color="FFFFFF", name="Arial", size=12), center=True)
    ws.row_dimensions[1].height = 28


def _hdr(ws, r, cols, fill=_DK):
    for c, h in enumerate(cols, 1):
        _c(ws, r, c, h, fill=fill, font=WF, center=True)


def _drow(ws, r, vals, fills):
    for c, (v, f) in enumerate(zip(vals, fills), 1):
        _c(ws, r, c, v, fill=f)


def _w(ws, ww):
    for i, w in enumerate(ww, 1):
        ws.column_dimensions[get_column_letter(i)].width = w


# =============================================================================
# BRS SHEET
# =============================================================================

def build_brs_sheet(wb, book_only, stmt_only,
                    book_closing_bal, book_closing_drcr,
                    bank_closing_bal,
                    company_name, account_no, branch_label, brs_date,
                    cleared_log=None, carryforward_log=None,
                    no_txn_note="", matched_df=None):

    ws = wb.create_sheet("BRS Statement")

    HDR   = PatternFill("solid", fgColor="1F3864")
    SEC   = PatternFill("solid", fgColor="2E75B6")
    SEC_W = PatternFill("solid", fgColor="C55A11")   # Amber section header for mismatches
    SUB   = PatternFill("solid", fgColor="DCE6F1")
    SUB_W = PatternFill("solid", fgColor="FCE4D6")   # Amber subheader for mismatches
    ITM   = PatternFill("solid", fgColor="FFFFFF")
    ITM_CF= PatternFill("solid", fgColor="EBF5EB")
    ITM_W = PatternFill("solid", fgColor="FFF2CC")   # Yellow row for mismatch items
    ITM_E = PatternFill("solid", fgColor="FFE0CC")   # Orange row for name mismatch items
    BAL   = PatternFill("solid", fgColor="C6EFCE")
    DIF_G = PatternFill("solid", fgColor="C6EFCE")
    DIF_R = PatternFill("solid", fgColor="FFC7CE")

    _th = Side(style="thin", color="BFBFBF")
    bdr = Border(left=_th, right=_th, top=_th, bottom=_th)

    for col, w in [("A", 12), ("B", 4), ("C", 10), ("D", 10),
                   ("E", 34), ("F", 18), ("G", 18), ("H", 60)]:
        ws.column_dimensions[col].width = w

    r = 1

    def merge_label(row, col_start, col_end, text, fill, font):
        ws.merge_cells(f"{get_column_letter(col_start)}{row}:{get_column_letter(col_end)}{row}")
        c           = ws.cell(row, col_start)
        c.value     = text
        c.fill      = fill
        c.font      = font
        c.border    = bdr
        c.alignment = Alignment(horizontal="left", vertical="center", wrap_text=True)
        for col in range(col_start + 1, col_end + 1):
            ws.cell(row, col).border = bdr
            ws.cell(row, col).fill   = fill

    def set_amt(row, col, value, fill, font, fmt="#,##0.00"):
        cell               = ws.cell(row, col)
        cell.value         = value
        cell.fill          = fill
        cell.font          = font
        cell.border        = bdr
        cell.alignment     = Alignment(horizontal="right", vertical="center")
        if isinstance(value, (int, float)):
            cell.number_format = fmt

    def set_narration(row, col, value, fill):
        cell           = ws.cell(row, col)
        cell.value     = value
        cell.fill      = fill
        cell.font      = Font(name="Arial", size=8, italic=True, color="555555")
        cell.border    = bdr
        cell.alignment = Alignment(horizontal="left", vertical="center", wrap_text=True)

    def blank_row():
        nonlocal r
        ws.merge_cells(f"A{r}:H{r}")
        ws.row_dimensions[r].height = 6
        r += 1

    def header_row(text, fill=HDR, font_size=11):
        nonlocal r
        merge_label(r, 1, 8, text, fill,
                    Font(bold=True, color="FFFFFF", name="Arial", size=font_size))
        ws.row_dimensions[r].height = 20
        r += 1

    def section_row(text, fill=None):
        nonlocal r
        use_fill = fill if fill is not None else SEC
        merge_label(r, 1, 8, text, use_fill,
                    Font(bold=True, color="FFFFFF", name="Arial", size=10))
        ws.row_dimensions[r].height = 18
        r += 1

    def mismatch_col_header_row():
        nonlocal r
        hdrs = ["Book Date", "Book Party", "Book Chq", "Book Amt (Rs)",
                "Bank Date", "Bank Party", "Bank Amt (Rs)", "Flags / Action Required"]
        for ci, h in enumerate(hdrs, 1):
            cell           = ws.cell(r, ci)
            cell.value     = h
            cell.fill      = SUB_W
            cell.font      = BF
            cell.border    = bdr
            cell.alignment = Alignment(horizontal="center", vertical="center")
        ws.row_dimensions[r].height = 16
        r += 1

    def mismatch_item_row(book_date, book_party, book_chq, book_amt,
                          bank_date, bank_party, bank_amt, flags,
                          is_name_mismatch=False, is_partial=False):
        nonlocal r
        if is_name_mismatch:
            fill      = ITM_E   # orange-red
            flag_color = "C00000"
        elif is_partial:
            fill      = PatternFill("solid", fgColor="FCE4D6")   # peach/orange
            flag_color = "833C00"
        else:
            fill      = ITM_W   # yellow
            flag_color = "7F4F00"
        def _set(col, val, align="left", number_fmt=None):
            c = ws.cell(r, col, val)
            c.fill = fill; c.border = bdr; c.font = NF
            c.alignment = Alignment(horizontal=align, vertical="center", wrap_text=True)
            if number_fmt:
                c.number_format = number_fmt
        _set(1, book_date,   "center")
        _set(2, book_party,  "left")
        _set(3, book_chq,    "center")
        _set(4, book_amt,    "right",  "#,##0.00")
        _set(5, bank_date,   "center")
        _set(6, bank_party,  "left")
        _set(7, bank_amt,    "right",  "#,##0.00")
        flag_cell = ws.cell(r, 8, flags)
        flag_cell.fill      = fill
        flag_cell.border    = bdr
        flag_cell.font      = Font(name="Arial", size=8, bold=True, color=flag_color)
        flag_cell.alignment = Alignment(horizontal="left", vertical="center", wrap_text=True)
        ws.row_dimensions[r].height = 30
        r += 1

    def col_header_row():
        nonlocal r
        hdrs = ["Date", "Type", "Bill No", "Chq No",
                "Party / Description", "Amount (Rs)", "Running Bal (Rs)", "Narration / Remarks"]
        for ci, h in enumerate(hdrs, 1):
            cell           = ws.cell(r, ci)
            cell.value     = h
            cell.fill      = SUB
            cell.font      = BF
            cell.border    = bdr
            cell.alignment = Alignment(horizontal="center", vertical="center")
        ws.row_dimensions[r].height = 16
        r += 1

    def item_row(date, txn_type, bill_no, chq_no, party, amt, narration="", is_cf=False):
        nonlocal r
        fill = ITM_CF if is_cf else ITM
        if is_cf:
            display_narration = ("Carried Fwd" if not narration else f"CF | {narration}")
        else:
            display_narration = narration
        display_narration = display_narration.replace("[CF from prev BRS]", "").strip(" |")

        def _set(col, val, align="left"):
            c = ws.cell(r, col, val)
            c.fill = fill; c.border = bdr; c.font = NF
            c.alignment = Alignment(horizontal=align, vertical="center")

        _set(1, date,     "center")
        _set(2, txn_type, "center")
        _set(3, bill_no,  "center")
        _set(4, chq_no,   "center")
        _set(5, party,    "left")
        set_amt(r, 6, amt, fill, NF)
        ws.cell(r, 7, "").fill = fill; ws.cell(r, 7).border = bdr
        set_narration(r, 8, display_narration, fill)
        ws.row_dimensions[r].height = 16
        r += 1

    def nil_row():
        nonlocal r
        merge_label(r, 1, 5, "      -  (Nil)", ITM, NF)
        set_amt(r, 6, "-", ITM, NF, fmt="@")
        ws.cell(r, 7, "").fill = ITM; ws.cell(r, 7).border = bdr
        ws.cell(r, 8, "").fill = ITM; ws.cell(r, 8).border = bdr
        ws.row_dimensions[r].height = 16
        r += 1

    def subtotal_row(total):
        nonlocal r
        merge_label(r, 1, 5, "", SUB, BF)
        set_amt(r, 6, total, SUB, BF)
        ws.cell(r, 7, "").fill = SUB; ws.cell(r, 7).border = bdr
        ws.cell(r, 8, "").fill = SUB; ws.cell(r, 8).border = bdr
        ws.row_dimensions[r].height = 16
        r += 1

    def running_row(running_bal):
        nonlocal r
        merge_label(r, 1, 5, "", SUB, BF)
        ws.cell(r, 6, "").fill = SUB; ws.cell(r, 6).border = bdr
        set_amt(r, 7, running_bal, SUB, BF)
        ws.cell(r, 8, "").fill = SUB; ws.cell(r, 8).border = bdr
        ws.row_dimensions[r].height = 17
        r += 1

    def balance_row(label, bal, fill=BAL):
        nonlocal r
        merge_label(r, 1, 5, label, fill,
                    Font(bold=True, name="Arial", size=10))
        ws.cell(r, 6, "").fill = fill; ws.cell(r, 6).border = bdr
        set_amt(r, 7, bal, fill, BF)
        ws.cell(r, 8, "").fill = fill; ws.cell(r, 8).border = bdr
        ws.row_dimensions[r].height = 20
        r += 1

    header_row(company_name, font_size=13)
    header_row(f"{branch_label} :- {account_no}", font_size=10)

    ws.merge_cells(f"A{r}:E{r}")
    c           = ws[f"A{r}"]
    c.value     = f"Bank Reconciliation Statement As On {brs_date}"
    c.fill      = HDR
    c.font      = Font(bold=True, color="FFFFFF", name="Arial", size=11)
    c.border    = bdr
    c.alignment = Alignment(horizontal="left", vertical="center")
    for col in range(2, 6):
        ws.cell(r, col).border = bdr
        ws.cell(r, col).fill   = HDR
    for ci, txt in [(6, "AMOUNT IN RS"), (7, "AMOUNT IN RS"), (8, "")]:
        cell           = ws.cell(r, ci, txt)
        cell.fill      = HDR
        cell.font      = Font(bold=True, color="FFFFFF", name="Arial", size=10)
        cell.border    = bdr
        cell.alignment = Alignment(horizontal="center", vertical="center")
    ws.row_dimensions[r].height = 20
    r += 1

    blank_row()
    balance_row(f"Closing Balance as per Company Books  ({book_closing_drcr})", book_closing_bal)
    blank_row()

    running = book_closing_bal

    cf_parties = set()
    if carryforward_log:
        for item in carryforward_log:
            cf_parties.add(item["party"].upper())

    def is_cf(party):
        return clean_name(party).upper() in cf_parties

    issued = book_only[book_only["Direction"] == "OUTFLOW"]
    section_row("Add :  Cheques issued but not debited in Bank")
    col_header_row()
    total_issued = 0.0
    if issued.empty:
        nil_row()
    else:
        for _, row_data in issued.iterrows():
            amt  = float(row_data["Book Amt (Rs)"])
            narr = str(row_data.get("Narration", ""))
            cf   = is_cf(row_data["Party"])
            item_row(row_data.get("Date", ""), row_data["Txn Type"], row_data["Bill No"], row_data["Chq No"],
                     row_data["Party"], amt, narr, is_cf=cf)
            total_issued += amt
    subtotal_row(total_issued)
    running += total_issued
    running_row(running)
    blank_row()

    deposited = book_only[book_only["Direction"] == "INFLOW"]
    section_row("Less :  Cheques deposited but not Credited in Bank")
    col_header_row()
    total_deposited = 0.0
    if deposited.empty:
        nil_row()
    else:
        for _, row_data in deposited.iterrows():
            amt  = float(row_data["Book Amt (Rs)"])
            narr = str(row_data.get("Narration", ""))
            cf   = is_cf(row_data["Party"])
            item_row(row_data.get("Date", ""), row_data["Txn Type"], row_data["Bill No"], row_data["Chq No"],
                     row_data["Party"], amt, narr, is_cf=cf)
            total_deposited += amt
    subtotal_row(total_deposited)
    running -= total_deposited
    running_row(running)
    blank_row()

    debited_not_book = stmt_only[stmt_only["Direction"] == "OUTFLOW"]
    section_row("Less :  Debited in Bank but not credited in Our Book")
    col_header_row()
    total_debited = 0.0
    if debited_not_book.empty:
        nil_row()
    else:
        for _, row_data in debited_not_book.iterrows():
            amt  = float(row_data["Bank Amt (Rs)"])
            desc = str(row_data.get("Description", ""))
            cf   = is_cf(row_data["Party"])
            item_row(row_data.get("Date", ""), "", "", row_data.get("Chq No", ""),
                     row_data["Party"] if row_data["Party"] else desc,
                     amt, desc, is_cf=cf)
            total_debited += amt
    subtotal_row(total_debited)
    running -= total_debited
    running_row(running)
    blank_row()

    credited_not_book = stmt_only[stmt_only["Direction"] == "INFLOW"]
    section_row("Add :  Credited in Bank but not debited in Our Book")
    col_header_row()
    total_credited = 0.0
    if credited_not_book.empty:
        nil_row()
    else:
        for _, row_data in credited_not_book.iterrows():
            amt  = float(row_data["Bank Amt (Rs)"])
            desc = str(row_data.get("Description", ""))
            cf   = is_cf(row_data["Party"])
            item_row(row_data.get("Date", ""), "", "", row_data.get("Chq No", ""),
                     row_data["Party"] if row_data["Party"] else desc,
                     amt, desc, is_cf=cf)
            total_credited += amt
    subtotal_row(total_credited)
    running += total_credited
    running_row(running)
    blank_row()

    balance_row("Closing Balance as per Bank", bank_closing_bal)
    blank_row()

    difference = round(bank_closing_bal - running, 2)
    if abs(difference) < 0.01:
        diff_fill  = DIF_G
        diff_label = "Difference  -  Fully Reconciled"
        diff_val   = "-"
    else:
        diff_fill  = DIF_R
        diff_label = "Difference  -  Investigate"
        diff_val   = difference

    merge_label(r, 1, 5, diff_label, diff_fill, BF)
    ws.cell(r, 6, "").fill = diff_fill; ws.cell(r, 6).border = bdr
    set_amt(r, 7, diff_val, diff_fill, BF)
    ws.cell(r, 8, "").fill = diff_fill; ws.cell(r, 8).border = bdr
    ws.row_dimensions[r].height = 20
    r += 1

    blank_row()

    # ── Section: Matched with Discrepancies (Name/Amount mismatches + Partial Payments) ──
    # Filter matched rows that have name mismatches, amount differences, or partial payments.
    # These are technically reconciled but need human verification.
    if matched_df is not None and not matched_df.empty:
        discrepancy_mask = (
            (matched_df["Name Match"].isin(["Mismatch", "Partial"])) |
            (matched_df["Amount Match"].str.startswith("Diff")) |
            (matched_df.get("Partial Payment", pd.Series(False, index=matched_df.index)).astype(bool))
        )
        discrepancies = matched_df[discrepancy_mask]
        if not discrepancies.empty:
            # Count by type for the section header
            n_partial  = int(discrepancies.get("Partial Payment", pd.Series(False, index=discrepancies.index)).sum())
            n_mismatch = int((discrepancies["Name Match"] == "Mismatch").sum())
            n_amt_diff = int(discrepancies["Amount Match"].str.startswith("Diff").sum())
            type_parts = []
            if n_partial:  type_parts.append(f"{n_partial} partial payment{'s' if n_partial>1 else ''}")
            if n_mismatch: type_parts.append(f"{n_mismatch} name mismatch{'es' if n_mismatch>1 else ''}")
            if n_amt_diff: type_parts.append(f"{n_amt_diff} amount difference{'s' if n_amt_diff>1 else ''}")
            type_summary = ", ".join(type_parts)

            section_row(
                f"⚠  Matched Transactions with Discrepancies — Requires Verification  "
                f"({len(discrepancies)} items: {type_summary})",
                fill=SEC_W
            )
            mismatch_col_header_row()
            for _, mr in discrepancies.iterrows():
                is_partial = bool(mr.get("Partial Payment", False))
                is_nm      = mr["Name Match"] == "Mismatch"
                # Build a concise flag string for this row
                flag_parts = []
                if is_partial and mr.get("Flags", ""):
                    # Extract the PARTIAL/SPLIT note already embedded in Flags
                    for seg in mr["Flags"].split(" | "):
                        if seg.startswith("PARTIAL PAYMENT") or seg.startswith("SPLIT PAYMENT"):
                            flag_parts.append(seg)
                            break
                if mr["Name Match"] == "Mismatch":
                    flag_parts.append(
                        f"NAME MISMATCH (score {mr['Fuzzy Score %']}%): "
                        f"Book='{mr['Book Party']}' vs Bank='{mr['Bank Party']}' — "
                        f"Verify party identity before clearance"
                    )
                elif mr["Name Match"] == "Partial":
                    flag_parts.append(
                        f"PARTIAL NAME MATCH (score {mr['Fuzzy Score %']}%): "
                        f"Book='{mr['Book Party']}' vs Bank='{mr['Bank Party']}' — "
                        f"Confirm same party"
                    )
                if mr["Amount Match"].startswith("Diff"):
                    dv = mr["Difference (Rs)"]
                    flag_parts.append(
                        f"AMOUNT DIFFERENCE: Rs{dv:+,.2f} — "
                        f"Book Rs{mr['Book Amt (Rs)']:,.2f} vs Bank Rs{mr['Bank Amt (Rs)']:,.2f}"
                    )
                # Any other flags (date gap, dir mismatch, etc.)
                for seg in mr["Flags"].split(" | "):
                    if seg and not seg.startswith(("PARTIAL PAYMENT", "SPLIT PAYMENT",
                                                    "NAME MISMATCH", "PARTIAL NAME",
                                                    "AMOUNT DIFFERENCE", "Name ")):
                        flag_parts.append(seg)
                flag_text = " | ".join(dict.fromkeys(filter(None, flag_parts)))  # deduplicate
                # Row colour: orange-red for name mismatch, peach for partial, yellow for others
                is_name_mismatch_row = is_nm
                mismatch_item_row(
                    book_date        = mr.get("Book Date", ""),
                    book_party       = mr["Book Party"],
                    book_chq         = mr.get("Book Chq", ""),
                    book_amt         = float(mr["Book Amt (Rs)"]),
                    bank_date        = mr.get("Bank Date", ""),
                    bank_party       = mr["Bank Party"],
                    bank_amt         = float(mr["Bank Amt (Rs)"]),
                    flags            = flag_text,
                    is_name_mismatch = is_name_mismatch_row,
                    is_partial       = is_partial and not is_nm,
                )
            # Legend for the mismatch section
            legend_fill = PatternFill("solid", fgColor="FFF2CC")
            merge_label(r, 1, 8,
                        "🔴 Red = Name Mismatch — verify party before sign-off   "
                        "🟠 Orange = Partial/Split Payment — confirm all parts recorded   "
                        "🟡 Yellow = Amount diff or partial name — review and confirm",
                        legend_fill,
                        Font(name="Arial", size=8, italic=True, color="7F4F00"))
            ws.row_dimensions[r].height = 16
            r += 1
            blank_row()

    if no_txn_note:
        note_fill = PatternFill("solid", fgColor="EBF5EB")
        merge_label(r, 1, 8, f"ℹ  {no_txn_note}", note_fill,
                    Font(name="Arial", size=9, italic=True, color="2E75B6"))
        ws.row_dimensions[r].height = 28
        r += 1
        blank_row()

    if carryforward_log:
        r += 1
        merge_label(r, 1, 8,
                    "CF = Carried Forward from Previous BRS "
                    "(outstanding cheques not yet cleared in bank)",
                    PatternFill("solid", fgColor="EBF5EB"),
                    Font(name="Arial", size=8, italic=True, color="2E75B6"))
        ws.row_dimensions[r].height = 14
        r += 1


# =============================================================================
# CARRY-FORWARD AUDIT SHEET
# =============================================================================

def build_cf_audit_sheet(wb, cleared_log, carryforward_log):
    ws = wb.create_sheet("CF Audit Trail")
    _DK2 = PatternFill("solid", fgColor="1F3864")
    _GRN = PatternFill("solid", fgColor="C6EFCE")
    _ORG = PatternFill("solid", fgColor="FFE699")
    _th  = Side(style="thin", color="BFBFBF")
    bdr2 = Border(left=_th, right=_th, top=_th, bottom=_th)

    ws.merge_cells("A1:H1")
    c           = ws["A1"]
    c.value     = "CARRY-FORWARD AUDIT TRAIL — Previous BRS Outstanding Items"
    c.fill      = _DK2
    c.font      = Font(bold=True, color="FFFFFF", name="Arial", size=12)
    c.border    = bdr2
    c.alignment = Alignment(horizontal="center", vertical="center")
    ws.row_dimensions[1].height = 24

    headers = ["Date", "Section", "Party", "Chq No", "Bill No", "Amount (Rs)", "Status", "Narration"]
    for ci, h in enumerate(headers, 1):
        cell           = ws.cell(2, ci, h)
        cell.fill      = _DK2
        cell.font      = Font(bold=True, color="FFFFFF", name="Arial", size=9)
        cell.border    = bdr2
        cell.alignment = Alignment(horizontal="center", vertical="center")
    ws.row_dimensions[2].height = 16

    row = 3
    for item in cleared_log:
        fill = _GRN
        vals = [item.get("date", ""), item.get("section", ""), item.get("party", ""), item.get("chq_no", ""),
                item.get("bill_no", ""), item.get("amount", 0), "CLEARED",
                item.get("narration", "")]
        for ci, v in enumerate(vals, 1):
            cell           = ws.cell(row, ci, v)
            cell.fill      = fill
            cell.font      = Font(name="Arial", size=9)
            cell.border    = bdr2
            cell.alignment = Alignment(horizontal="left", vertical="center")
        row += 1

    for item in carryforward_log:
        fill = _ORG
        vals = [item.get("date", ""), item.get("section", ""), item.get("party", ""), item.get("chq_no", ""),
                item.get("bill_no", ""), item.get("amount", 0), "CARRIED FORWARD",
                item.get("narration", "")]
        for ci, v in enumerate(vals, 1):
            cell           = ws.cell(row, ci, v)
            cell.fill      = fill
            cell.font      = Font(name="Arial", size=9)
            cell.border    = bdr2
            cell.alignment = Alignment(horizontal="left", vertical="center")
        row += 1

    for col, w in zip("ABCDEFGH", [11, 28, 34, 12, 12, 16, 20, 50]):
        ws.column_dimensions[col].width = w


# =============================================================================
# BUILD FULL EXCEL
# =============================================================================

def build_excel(book_df, stmt_df, matched, book_only, stmt_only,
                book_opening_bal, book_opening_drcr,
                book_closing_bal, book_closing_drcr,
                bank_closing_bal, path,
                company_name, account_no, branch_label, brs_date,
                cleared_log=None, carryforward_log=None,
                no_txn_note=""):

    cleared_log      = cleared_log      or []
    carryforward_log = carryforward_log or []
    # title_suffix = f"{branch_label}  |  {brs_date}"

    if not book_df.empty and "Date" in book_df.columns:
        valid_dates = [parse_date(d) for d in book_df["Date"] if d and str(d).strip() not in ("", "nan")]
        valid_dates = [d for d in valid_dates if d is not None]
        if valid_dates:
            title_date = max(valid_dates).strftime("%d-%m-%Y")
        else:
            title_date = brs_date
    else:
        title_date = brs_date
    title_suffix = f"{branch_label}  |  {title_date}"
    wb = Workbook()

    # Sheet 1: Book Entries
    ws1       = wb.active
    ws1.title = f"Book Entries ({branch_label})"
    H1 = ["Date", "Txn Type", "Bill No", "Chq No", "Party",
          "Direction", "Sender", "Recipient", "Amount (Rs)", "Narration"]
    _title(ws1, len(H1), f"BANK - Book Ledger Entries  |  {title_suffix}")
    _hdr(ws1, 2, H1)
    for i, (_, r) in enumerate(book_df.iterrows(), 3):
        df    = _G if r["Direction"] == "INFLOW" else _R
        vals  = [r.get("Date",""),r["Txn Type"], r["Bill No"], r["Chq No"], r["Party"],
                 r["Direction"], r["Sender"], r["Recipient"], r["Book Amt (Rs)"], r["Narration"]]
        fills = [_W,_GR, _W, _W, _W, df, df, df, _W, _W]
        _drow(ws1, i, vals, fills)
    closing_row = len(book_df) + 3
    _BAL = PatternFill("solid", fgColor="C6EFCE")
    ws1.merge_cells(f"A{closing_row}:H{closing_row}")
    cell           = ws1["A" + str(closing_row)]
    cell.value     = f"Closing Balance as per Company Books  ({book_closing_drcr})"
    cell.fill      = _BAL
    cell.font      = BF
    cell.border    = BR
    cell.alignment = Alignment(horizontal="left", vertical="center")
    amt_cell               = ws1.cell(closing_row, 9, book_closing_bal)
    amt_cell.fill          = _BAL
    amt_cell.font          = BF
    amt_cell.border        = BR
    amt_cell.alignment     = Alignment(horizontal="right", vertical="center")
    amt_cell.number_format = '#,##0.00'
    ws1.cell(closing_row, 9).fill   = _BAL
    ws1.cell(closing_row, 9).border = BR
    ws1.row_dimensions[closing_row].height = 18
    _w(ws1, [12,14, 10, 10, 32, 10, 30, 30, 14, 50])

    # Sheet 2: Bank Statement
    ws2 = wb.create_sheet(f"Bank Statement ({branch_label})")
    H2  = ["Date", "Chq No", "Description", "Party",
           "Direction", "Sender", "Recipient",
           "Debit (Rs)", "Credit (Rs)", "Balance (Rs)"]
    _title(ws2, len(H2), f"Bank Statement - All Transactions  |  {title_suffix}")
    _hdr(ws2, 2, H2)
    for i, (_, r) in enumerate(stmt_df.iterrows(), 3):
        df    = _G if r["Direction"] == "INFLOW" else _R
        vals  = [r["Date"], r["Chq No"], r["Description"], r["Party"],
                 r["Direction"], r["Sender"], r["Recipient"],
                 r["Debit (Rs)"], r["Credit (Rs)"], r["Balance (Rs)"]]
        fills = [_W, _W, _W, _W, df, df, df, _W, _W, _W]
        _drow(ws2, i, vals, fills)
    _w(ws2, [12, 10, 50, 30, 10, 30, 30, 14, 14, 14])

    # Sheet 3: Matched
    ws3 = wb.create_sheet("Matched")
    H3  = ["Method", "Name Match", "Score %", "Amt Match",
           "Book Date","Book Txn", "Book Bill", "Book Chq", "Book Party",
           "Book Dir", "Book Sender", "Book Recipient", "Book Amt (Rs)",
           "Bank Date", "Bank Chq", "Bank Description", "Bank Party",
           "Bank Dir", "Bank Sender", "Bank Recipient",
           "Debit (Rs)", "Credit (Rs)", "Bank Amt (Rs)",
           "Difference (Rs)", "Partial Payment", "Flags"]
    _title(ws3, len(H3), f"BANK - Matched: Book vs Statement  |  {title_suffix}")
    _hdr(ws3, 2, H3)
    _PP = PatternFill("solid", fgColor="FCE4D6")   # peach for partial payment rows
    for i, (_, r) in enumerate(matched.iterrows(), 3):
        nm        = r["Name Match"]
        am        = r["Amount Match"]
        diff      = r["Difference (Rs)"]
        is_pp     = bool(r.get("Partial Payment", False))
        nf   = _G  if nm == "Match"  else (_Y if "Partial" in nm else _R)
        af   = _G  if am == "Exact"  else (_Y if "Minor"   in am else _R)
        df   = _G  if abs(diff) < 0.01 else (_Y if abs(diff) < 500 else _R)
        ff   = _PP if is_pp else (_R if r["Flags"] else _W)
        pp_label = "YES — verify" if is_pp else ""
        vals = [r["Match Method"], r["Name Match"], r["Fuzzy Score %"], r["Amount Match"],
                r.get("Book Date", ""), r["Book Txn"], r["Book Bill No"], r["Book Chq"], r["Book Party"],
                r["Book Direction"], r["Book Sender"], r["Book Recipient"], r["Book Amt (Rs)"],
                r["Bank Date"], r["Bank Chq"], r["Bank Description"], r["Bank Party"],
                r["Bank Direction"], r["Bank Sender"], r["Bank Recipient"],
                r["Debit (Rs)"], r["Credit (Rs)"], r["Bank Amt (Rs)"],
                diff, pp_label, r["Flags"]]
        fills = [_W, nf, nf, af,
                 _W, _GR, _W, _W, nf, _W, _G, _G, _G,
                 _W, _W, _W, nf, _W, _G, _G, _W, _W, _G,
                 df, _PP if is_pp else _W, ff]
        _drow(ws3, i, vals, fills)
    _w(ws3, [18, 12, 7, 16,
             11, 12, 10, 10, 28, 8, 28, 28, 14,
             11, 10, 44, 28, 8, 28, 28, 12, 12, 14,
             14, 14, 56])

    # Sheet 4: Book Only
    ws4 = wb.create_sheet("Book Only (Not in Bank)")
    H4  = ["Date", "Txn Type", "Bill No", "Chq No", "Party",
           "Direction", "Sender", "Recipient", "Book Amt (Rs)", "Narration", "Issue"]
    _title(ws4, len(H4),
           f"IN BOOK - NOT FOUND IN BANK STATEMENT  |  Pending Clearance / Timing  |  {title_suffix}",
           fill=_MD)
    _hdr(ws4, 2, H4, fill=_MD)
    for i, (_, r) in enumerate(book_only.iterrows(), 3):
        cf    = "[CF from prev BRS]" in str(r.get("Narration", ""))
        fill  = _CF if cf else _O
        issue = ("Carried Forward from Previous BRS" if cf else
                 "Entry recorded in book but NOT reflected in bank statement")
        vals  = [r.get("Date", ""), r["Txn Type"], r["Bill No"], r["Chq No"], r["Party"],
                 r["Direction"], r["Sender"], r["Recipient"], r["Book Amt (Rs)"],
                 r.get("Narration", ""), issue]
        _drow(ws4, i, vals, [fill] * 11)
    _w(ws4, [11, 14, 10, 10, 30, 10, 28, 28, 14, 50, 62])

    # Sheet 5: Bank Only
    ws5 = wb.create_sheet("Bank Only (Not in Book)")
    H5  = ["Date", "Chq No", "Description", "Party",
           "Direction", "Sender", "Recipient",
           "Debit (Rs)", "Credit (Rs)", "Bank Amt (Rs)", "Issue"]
    _title(ws5, len(H5),
           f"IN BANK STATEMENT - NOT FOUND IN BOOK  |  UNRECORDED - INVESTIGATE  |  {title_suffix}",
           fill=_RH)
    _hdr(ws5, 2, H5, fill=PatternFill("solid", fgColor="FF0000"))
    for i, (_, r) in enumerate(stmt_only.iterrows(), 3):
        cf    = (str(r.get("Description", "")).endswith("[CF from prev BRS]") or
                 r.get("Balance (Rs)", 1) == 0)
        fill  = _CF if cf else _R
        issue = ("Carried Forward from Previous BRS" if cf else
                 "Bank has this transaction but company books have NO matching entry")
        vals  = [r["Date"], r["Chq No"], r["Description"], r["Party"],
                 r["Direction"], r["Sender"], r["Recipient"],
                 r["Debit (Rs)"], r["Credit (Rs)"], r["Bank Amt (Rs)"], issue]
        _drow(ws5, i, vals, [fill] * 11)
    _w(ws5, [11, 10, 50, 28, 10, 28, 28, 13, 13, 13, 64])

    # Sheet 6: BRS Statement
    build_brs_sheet(
        wb, book_only, stmt_only,
        book_closing_bal, book_closing_drcr,
        bank_closing_bal,
        company_name=company_name,
        account_no=account_no,
        branch_label=branch_label,
        brs_date=title_date,
        cleared_log=cleared_log,
        carryforward_log=carryforward_log,
        no_txn_note=no_txn_note,
        matched_df=matched,
    )

    # Sheet 7: CF Audit Trail
    build_cf_audit_sheet(wb, cleared_log, carryforward_log)

    # Sheet 8: Summary
    ws6 = wb.create_sheet("Summary")
    _title(ws6, 3, f"RECONCILIATION SUMMARY  |  {branch_label}  |  {brs_date}")
    _hdr(ws6, 2, ["Item", "Value", "Notes"], fill=_MD)

    p  = len(matched[matched["Name Match"]  == "Match"])    if not matched.empty else 0
    pa = len(matched[matched["Name Match"]  == "Partial"])  if not matched.empty else 0
    mm = len(matched[matched["Name Match"]  == "Mismatch"]) if not matched.empty else 0
    ae = len(matched[matched["Amount Match"] == "Exact"])   if not matched.empty else 0
    ad = len(matched[matched["Amount Match"].str.startswith("Diff")]) if not matched.empty else 0
    tb = matched["Book Amt (Rs)"].sum()   if not matched.empty else 0
    ts = matched["Bank Amt (Rs)"].sum()   if not matched.empty else 0
    td = matched["Difference (Rs)"].sum() if not matched.empty else 0

    if not matched.empty:
        m0  = len(matched[matched["Match Method"].str.startswith("0-")])
        m1  = len(matched[matched["Match Method"].str.startswith("1-")])
        m2  = len(matched[matched["Match Method"].str.startswith("2-")])
        m3  = len(matched[matched["Match Method"].str.startswith("3-")])
        m3b = len(matched[matched["Match Method"].str.startswith("3b-")])
        m3c = len(matched[matched["Match Method"].str.startswith("3c-")])
        m4  = len(matched[matched["Match Method"].str.startswith("4-")])
    else:
        m0 = m1 = m2 = m3 = m3b = m3c = m4 = 0

    fully_reconciled = abs(bank_closing_bal - book_closing_bal) < 0.01 and \
                       book_only.empty and stmt_only.empty
    reconciliation_status = "FULLY RECONCILED" if fully_reconciled else "DIFFERENCES EXIST — INVESTIGATE"

    rows_s = [
        ("Company",                                company_name,          "Extracted from book file"),
        ("Account Number",                         account_no,            "Extracted from bank statement/book"),
        ("Branch / Bank Label",                    branch_label,          "Extracted from bank statement"),
        ("BRS Date",                               brs_date,              "Extracted from previous BRS file"),
        ("Date Threshold (days)",                  DATE_THRESHOLD_DAYS,   "Max days apart for date-based matching"),
        ("Reconciliation Status",                  reconciliation_status, ""),
        ("", "", ""),
        ("Book entries (excl internal)",           len(book_df),          "Entries from book for this bank only"),
        ("Bank statement entries",                 len(stmt_df),          "Entries from bank statement"),
        ("", "", ""),
        ("Matched",                                len(matched),          "Found in both book and bank"),
        ("  Pass 0: Internal Fund Transfer",       m0,                    "HOT/IFT entries knocked off"),
        ("  Pass 1: Cheque No exact",              m1,                    "Most reliable"),
        ("  Pass 2: Amount + Direction + Date",    m2,                    "Exact amount, same dir, date ok"),
        ("  Pass 3: Fuzzy Name + Amt + Dir + Date",m3,                    "Name fuzzy-matched"),
        ("  Pass 3b: Combined Amt + Date",         m3b,                   "Two book entries = one bank entry"),
        ("  Pass 3c: Split Payment",               m3c,                   "One book entry = two bank entries"),
        ("  Pass 4: Direction-Flip (Forex/FFMC)",  m4,                    "Same amt, opposite dir — forex/settlement"),
        ("  Pass 5: Unmatched (book only)",        len(book_only),        ""),
        ("  Pass 5: Unmatched (bank only)",        len(stmt_only),        ""),
        ("", "", ""),
        ("  Name: Perfect match (>= 80%)",         p,                     ""),
        ("  Name: Partial match (65-79%)",         pa,                    "Names differ -- verify"),
        ("  Name: Mismatch (< 65%)",               mm,                    "May be wrong -- investigate"),
        ("  Amount: Exact",                        ae,                    "Book amount = Bank amount"),
        ("  Amount: Differs",                      ad,                    "Amounts do not match"),
        ("", "", ""),
        ("Total Book Amt -- matched rows",         f"Rs{tb:,.2f}",        ""),
        ("Total Bank Amt -- matched rows",         f"Rs{ts:,.2f}",        ""),
        ("Net Difference (Bank - Book)",           f"Rs{td:+,.2f}",       "Should be 0 if fully reconciled"),
        ("", "", ""),
        ("Book Closing Balance",                   f"Rs{book_closing_bal:,.2f}", ""),
        ("Bank Closing Balance",                   f"Rs{bank_closing_bal:,.2f}", ""),
        ("Balance Difference",                     f"Rs{bank_closing_bal - book_closing_bal:+,.2f}",
                                                   "Should be 0 if reconciled"),
        ("", "", ""),
        ("In Book NOT in Bank",                    len(book_only),        "Pending clearance or timing difference"),
        ("  of which: Carried Forward",            len(carryforward_log), "From previous BRS"),
        ("In Bank NOT in Book",                    len(stmt_only),        "UNRECORDED -- investigate immediately"),
        ("", "", ""),
        ("Items Cleared from Prev BRS",            len(cleared_log),      "Previously outstanding, now cleared"),
        ("Items Still Outstanding (CF)",           len(carryforward_log), "Still pending bank clearance"),
    ]
    if no_txn_note:
        rows_s.insert(6, ("Note", no_txn_note, ""))

    for rn, (a, b, c) in enumerate(rows_s, 3):
        ws6.cell(rn, 1, a); ws6.cell(rn, 2, b); ws6.cell(rn, 3, c)
        if a in ("Company", "Account Number", "Branch / Bank Label", "BRS Date",
                 "Date Threshold (days)"):
            for cc in range(1, 4): ws6.cell(rn, cc).fill = _GR
            ws6.cell(rn, 1).font = BF
        elif a == "Reconciliation Status":
            fill = _G if "FULLY" in str(b) else _R
            for cc in range(1, 4): ws6.cell(rn, cc).fill = fill
            ws6.cell(rn, 1).font = BF
            ws6.cell(rn, 2).font = BF
        elif a == "Matched":
            ws6.cell(rn, 1).fill = _G; ws6.cell(rn, 1).font = BF
        elif a == "Net Difference (Bank - Book)":
            fill = _G if abs(td) < 0.01 else _R
            for cc in range(1, 4): ws6.cell(rn, cc).fill = fill
            ws6.cell(rn, 1).font = BF
        elif a == "Balance Difference":
            diff_val = bank_closing_bal - book_closing_bal
            fill = _G if abs(diff_val) < 0.01 else _R
            for cc in range(1, 4): ws6.cell(rn, cc).fill = fill
            ws6.cell(rn, 1).font = BF
        elif a.startswith("In Bank NOT") and b:
            for cc in range(1, 4): ws6.cell(rn, cc).fill = _R
            ws6.cell(rn, 1).font = BF
        elif a == "Items Cleared from Prev BRS":
            for cc in range(1, 4): ws6.cell(rn, cc).fill = _G
            ws6.cell(rn, 1).font = BF
        elif a == "Items Still Outstanding (CF)":
            for cc in range(1, 4): ws6.cell(rn, cc).fill = _Y
            ws6.cell(rn, 1).font = BF
        elif a.startswith("  Pass"):
            for cc in range(1, 4): ws6.cell(rn, cc).fill = _GR
        elif a == "Note":
            for cc in range(1, 4): ws6.cell(rn, cc).fill = PatternFill("solid", fgColor="EBF5EB")
            ws6.cell(rn, 1).font = BF
        else:
            for cc in range(1, 4): ws6.cell(rn, cc).font = NF
    _w(ws6, [42, 22, 60])

    wb.save(path)
    print(f"\nSaved -> {path}")
    print(f"   Company               : {company_name}")
    print(f"   Account No            : {account_no}")
    print(f"   Branch / Bank         : {branch_label}")
    print(f"   BRS Date              : {brs_date}")
    print(f"   Book entries          : {len(book_df)}")
    print(f"   Bank stmt entries     : {len(stmt_df)}")
    print(f"   Matched               : {len(matched)}")
    print(f"     Pass 1 (Chq)        : {m1}")
    print(f"     Pass 2 (Amt+Dir+Dt) : {m2}")
    print(f"     Pass 3 (Fuzzy)      : {m3}")
    print(f"     Pass 3b (Combined)  : {m3b}")
    print(f"     Pass 3c (Split Pay) : {m3c}")
    print(f"     Pass 4 (Dir-Flip)   : {m4}")
    print(f"   Book only (pending)   : {len(book_only)}")
    print(f"   Bank only (unrecorded): {len(stmt_only)}")
    print(f"   Cleared from prev BRS : {len(cleared_log)}")
    print(f"   Carried forward       : {len(carryforward_log)}")
    print(f"   Book closing bal      : Rs{book_closing_bal:,.2f}")
    print(f"   Bank closing bal      : Rs{bank_closing_bal:,.2f}")
    issued_total     = float(book_only["Book Amt (Rs)"][book_only["Direction"] == "OUTFLOW"].sum()) \
                    if not book_only.empty else 0.0
    deposited_total  = float(book_only["Book Amt (Rs)"][book_only["Direction"] == "INFLOW"].sum()) \
                    if not book_only.empty else 0.0
    debited_nb_total = float(stmt_only["Bank Amt (Rs)"][stmt_only["Direction"] == "OUTFLOW"].sum()) \
                    if not stmt_only.empty else 0.0
    credited_nb_total= float(stmt_only["Bank Amt (Rs)"][stmt_only["Direction"] == "INFLOW"].sum()) \
                    if not stmt_only.empty else 0.0
    reconciled       = book_closing_bal + issued_total - deposited_total - debited_nb_total + credited_nb_total
    brs_diff         = round(bank_closing_bal - reconciled, 2)
    if abs(brs_diff) < 0.01:
        print(f"   Status                : FULLY RECONCILED")
    else:
        print(f"   Status                : BRS DIFFERENCE Rs{brs_diff:+,.2f} — INVESTIGATE")


# =============================================================================
# PUBLIC API
# =============================================================================

def get_all_sheets(file_path):
    sheets_data = {}
    try:
        xl_file = pd.ExcelFile(file_path)
        for sheet_name in xl_file.sheet_names:
            try:
                df = pd.read_excel(file_path, sheet_name=sheet_name)
                sheets_data[sheet_name] = df.to_dict('records')
            except Exception as e:
                sheets_data[sheet_name] = [{"error": str(e)}]
    except Exception as e:
        try:
            df = pd.read_csv(file_path)
            sheets_data["Data"] = df.to_dict('records')
        except Exception:
            sheets_data["Error"] = [{"message": f"Could not read file: {str(e)}"}]
    return sheets_data


def get_sheet_metadata(file_path):
    metadata = {}
    try:
        xl_file = pd.ExcelFile(file_path)
        for sheet_name in xl_file.sheet_names:
            try:
                df = pd.read_excel(file_path, sheet_name=sheet_name)
                metadata[sheet_name] = {
                    "rows": len(df),
                    "columns": len(df.columns),
                    "column_names": df.columns.tolist()
                }
            except Exception as e:
                metadata[sheet_name] = {"error": str(e)}
    except Exception as e:
        try:
            df = pd.read_csv(file_path)
            metadata["Data"] = {"rows": len(df), "columns": len(df.columns),
                                 "column_names": df.columns.tolist()}
        except Exception:
            metadata["Error"] = {"message": "Could not read file"}
    return metadata


def _extract_account_from_prev_brs(prev_brs_path, bank_hint):
    if not prev_brs_path or not os.path.exists(prev_brs_path):
        return None
    hint_upper = bank_hint.upper().strip()
    try:
        xl = pd.ExcelFile(prev_brs_path)
        sheets = xl.sheet_names
        ordered = [s for s in sheets if hint_upper in s.upper()] + \
                  [s for s in sheets if hint_upper not in s.upper()]
        for sheet in ordered:
            try:
                raw = pd.read_excel(prev_brs_path, sheet_name=sheet, header=None)
            except Exception:
                continue
            for i, row in raw.iterrows():
                if i > 10: break
                cells    = [str(c).strip() if pd.notna(c) else "" for c in row.tolist()]
                combined = " ".join(cells)
                m = re.search(r"a/?c\s+no\.?\s*(\d{9,18})", combined, re.IGNORECASE)
                if m:
                    acc = m.group(1)
                    print(f"[Prev BRS] Account number: '{acc}'")
                    return acc
                if hint_upper in combined.upper():
                    m2 = re.search(r"\b(\d{11,18})\b", combined)
                    if m2:
                        return m2.group(1)
    except Exception:
        pass
    return None


def process_files(book_path, stmt_path, output_path, prev_brs_path=None):
    stmt_df, bank_closing_bal, account_no, branch_label, bank_name_hint, is_no_transactions = parse_statement(stmt_path)

    print(f"[Process] Bank detected for statement: '{bank_name_hint}'")

    _sheet = detect_book_sheet(book_path)
    _raw   = safe_read_excel(book_path, sheet_name=_sheet, header=None)
    target_bank_id = None

    if account_no and account_no != "ACCOUNT NO NOT FOUND":
        find_book_bank_id._account_no_hint = account_no
        _all_book_ids = []
        for _, _row in _raw.iterrows():
            for _cell in _row:
                if isinstance(_cell, str):
                    _m = re.match(r"Summary\s+Of\s+(\S+)", _cell, re.IGNORECASE)
                    if _m:
                        _bid = _m.group(1).strip()
                        if _bid not in _all_book_ids:
                            _all_book_ids.append(_bid)
        _acct_matched_bid = None
        _best_acct_len = 0
        for _bid in _all_book_ids:
            _bid_nums = re.sub(r"[^0-9]", "", _bid)
            if _bid_nums and len(_bid_nums) >= 3 and account_no.endswith(_bid_nums):
                if len(_bid_nums) > _best_acct_len:
                    _best_acct_len = len(_bid_nums)
                    _acct_matched_bid = _bid
        if _acct_matched_bid:
            _alpha_m = re.match(r"([A-Za-z]+)", _acct_matched_bid)
            if _alpha_m:
                _derived_bank = _alpha_m.group(1).upper()
                _KNOWN_BANK_NAMES = {
                    "AXIS", "HDFC", "ICICI", "SBI", "PNB", "CANARA", "KOTAK",
                    "INDUSIND", "YES", "FEDERAL", "BOB", "UNION", "UCO", "IDBI",
                    "IDFC", "DCB", "SBM", "BANDHAN", "RBL", "CSB", "INDIAN",
                    "IOB", "UBI", "BOI",
                }
                _hint_starts_with_derived = (bank_name_hint or "").upper().startswith(_derived_bank)
                _derived_is_known         = _derived_bank in _KNOWN_BANK_NAMES
                _should_override = (
                    _derived_bank != bank_name_hint and
                    _derived_is_known and
                    not _hint_starts_with_derived
                )
                if _should_override:
                    _bid_nums_display = re.sub(r"[^0-9]", "", _acct_matched_bid)
                    print(f"[Process] FIX: Account suffix match overrides bank hint "
                          f"'{bank_name_hint}' -> '{_derived_bank}'")
                    bank_name_hint = _derived_bank
                else:
                    print(f"[Process] FIX: Account-suffix found book ID '{_acct_matched_bid}', "
                          f"keeping current hint '{bank_name_hint}'")
            target_bank_id = _acct_matched_bid
            print(f"[Process] FIX: Account-suffix resolved target_bank_id='{target_bank_id}'")
    elif hasattr(find_book_bank_id, '_account_no_hint'):
        del find_book_bank_id._account_no_hint

    if target_bank_id is None and bank_name_hint and bank_name_hint != "UNKNOWN":
        if account_no and account_no != "ACCOUNT NO NOT FOUND":
            find_book_bank_id._account_no_hint = account_no
        target_bank_id = find_book_bank_id(_raw, bank_name_hint)

    (book_df,
     book_opening_bal, book_opening_drcr,
     book_closing_bal, book_closing_drcr,
     company_name, bank_id) = parse_book(book_path, target_bank_id=target_bank_id)

    if account_no == "ACCOUNT NO NOT FOUND" and bank_name_hint and bank_name_hint != "UNKNOWN":
        acc_from_book = extract_account_from_book(book_path, bank_name_hint)
        if acc_from_book:
            account_no = acc_from_book
    if account_no == "ACCOUNT NO NOT FOUND" and prev_brs_path and bank_name_hint:
        acc_from_prev = _extract_account_from_prev_brs(prev_brs_path, bank_name_hint)
        if acc_from_prev:
            account_no = acc_from_prev

    if bank_id and bank_id not in ("BANK", "UNKNOWN"):
        branch_label = bank_id
        print(f"[Statement] Label set to bank_id: '{branch_label}'")

    brs_date = extract_brs_date(prev_brs_path)

    try:
        _stmt_raw = safe_read_excel(stmt_path, header=None, nrows=25)
        for _, _row in _stmt_raw.iterrows():
            _cells   = [str(c).strip() if pd.notna(c) else "" for c in _row.tolist()]
            _combined = " ".join(_cells)
            _m = re.search(
                r"(?:to\s*date|end\s*date)\s*[:\-]?\s*(\d{1,2}[-/\.]\d{1,2}[-/\.]\d{2,4})",
                _combined, re.IGNORECASE
            )
            if _m:
                brs_date = _m.group(1).strip().replace(".", "-").replace("/", "-")
                print(f"[Process] BRS date updated from statement end date: '{brs_date}'")
                break
    except Exception as _e:
        print(f"[Process] Could not extract statement end date: {_e}")

    stmt_df["Sender"]    = stmt_df["Sender"].replace("COMPANY",    company_name)
    stmt_df["Recipient"] = stmt_df["Recipient"].replace("COMPANY", company_name)

    matched, book_only, stmt_only = reconcile(book_df, stmt_df)

    print(f"\n[Book Debug] All OUTFLOW entries in current book:")
    for _, row in book_df.iterrows():
        if row.get("Direction") == "OUTFLOW":
            print(f"   chq={str(row.get('Chq No','')):<8}  "
                f"bill={str(row.get('Bill No','')):<8}  "
                f"amt=Rs{row.get('Book Amt (Rs)',0):>10,.2f}  "
                f"party={row.get('Party','')}")

    cleared_log      = []
    carryforward_log = []
    prev_brs         = {}

    if prev_brs_path:
        prev_brs = parse_previous_brs(prev_brs_path, bank_id=bank_id)
        if is_no_transactions and bank_closing_bal == 0.0:
            prev_bank_bal = prev_brs.get("prev_bank_closing_bal", 0.0)
            if prev_bank_bal != 0.0:
                bank_closing_bal = prev_bank_bal
            else:
                bank_closing_bal = book_closing_bal
        if book_df.empty and stmt_only is not None and not stmt_only.empty:
            is_recon, no_txn_note = check_no_transaction_reconciliation(
                book_df, stmt_df, book_closing_bal, bank_closing_bal, prev_brs
            )
            if is_recon:
                print(f"\n[No-Transaction Reconciliation] All bank transactions "
                      f"in this period were recorded in prior period.")
                print(f"   Clearing {len(stmt_only)} bank-only entries.")
                stmt_only = pd.DataFrame(columns=STMT_COLS)
            else:
                no_txn_note = ""
        else:
            no_txn_note = ""

        full_book_df, *_ = parse_book(book_path, target_bank_id=target_bank_id)
        book_only, stmt_only, cleared_log, carryforward_log = carry_forward(
            prev_brs, stmt_df, book_only, stmt_only, full_book_df,
            company_name=company_name,
            book_opening_bal=book_opening_bal
        )
        _issued      = float(book_only["Book Amt (Rs)"][book_only["Direction"] == "OUTFLOW"].sum()) if not book_only.empty else 0.0
        _deposited   = float(book_only["Book Amt (Rs)"][book_only["Direction"] == "INFLOW"].sum())  if not book_only.empty else 0.0
        _debited_nb  = float(stmt_only["Bank Amt (Rs)"][stmt_only["Direction"] == "OUTFLOW"].sum()) if not stmt_only.empty else 0.0
        _credited_nb = float(stmt_only["Bank Amt (Rs)"][stmt_only["Direction"] == "INFLOW"].sum())  if not stmt_only.empty else 0.0
        _reconciled  = book_closing_bal + _issued - _deposited - _debited_nb + _credited_nb
        _brs_diff    = round(bank_closing_bal - _reconciled, 2)

        # ── Post-carry-forward BRS correction ─────────────────────────────────
        # If there is still a residual BRS difference, check whether it is caused
        # by a credited_not_book CF item that was recorded in the book BETWEEN the
        # prev BRS date and the current period opening (i.e. the book opening gap
        # didn't match directly because there were concurrent bank transactions).
        # Strategy: if abs(brs_diff) exactly matches a SINGLE outstanding CF item
        # in stmt_only that originated as a credited_not_book carry-forward, remove
        # it — it has already been captured in the current book closing balance.
        if abs(_brs_diff) > 0.01:
            _cf_descs = {str(item.get("narration", "")).strip().upper()
                         for item in prev_brs.get("credited_not_book", [])}
            _cf_amts  = {round(item["amount"], 2)
                         for item in prev_brs.get("credited_not_book", [])}
            _abs_diff = round(abs(_brs_diff), 2)
            # Only act when the diff magnitude matches a SINGLE known CF credited amount
            if _abs_diff in _cf_amts and _brs_diff < 0:
                # negative diff = credited_nb over-counted -> find and remove the CF item
                _removal_candidates = stmt_only[
                    (stmt_only["Direction"] == "INFLOW") &
                    (abs(stmt_only["Bank Amt (Rs)"] - _abs_diff) < 0.01)
                ]
                if not _removal_candidates.empty:
                    _rc_idx = _removal_candidates.index[0]
                    _rc_row = stmt_only.loc[_rc_idx]
                    print(f"\n[BRS Correction] Residual diff Rs{_brs_diff:+,.2f} matches a "
                          f"credited_not_book CF item — removing from stmt_only:")
                    print(f"   party='{_rc_row.get('Party','')}' "
                          f"amt={_rc_row.get('Bank Amt (Rs)',0):,.2f} "
                          f"(already absorbed into current book balance)")
                    cleared_log.append({
                        "section":   "credited_not_book",
                        "party":     str(_rc_row.get("Party", "")),
                        "chq_no":    str(_rc_row.get("Chq No", "")),
                        "bill_no":   "",
                        "amount":    float(_rc_row.get("Bank Amt (Rs)", 0)),
                        "narration": str(_rc_row.get("Description", "")),
                        "status":    "CLEARED (absorbed in book balance — post-BRS correction)",
                    })
                    stmt_only = stmt_only.drop(index=_rc_idx)
                    # Recompute BRS components
                    _credited_nb = float(stmt_only["Bank Amt (Rs)"][stmt_only["Direction"] == "INFLOW"].sum())  if not stmt_only.empty else 0.0
                    _debited_nb  = float(stmt_only["Bank Amt (Rs)"][stmt_only["Direction"] == "OUTFLOW"].sum()) if not stmt_only.empty else 0.0
                    _reconciled  = book_closing_bal + _issued - _deposited - _debited_nb + _credited_nb
                    _brs_diff    = round(bank_closing_bal - _reconciled, 2)

        print(f"\n[BRS Verification]")
        print(f"   Book closing       : Rs{book_closing_bal:+,.2f}")
        print(f"   Add issued         : Rs{_issued:,.2f}")
        print(f"   Less deposited     : Rs{_deposited:,.2f}")
        print(f"   Less debited NB    : Rs{_debited_nb:,.2f}")
        print(f"   Add credited NB    : Rs{_credited_nb:,.2f}")
        print(f"   Reconciled balance : Rs{_reconciled:+,.2f}")
        print(f"   Bank closing       : Rs{bank_closing_bal:+,.2f}")
        print(f"   BRS Difference     : Rs{_brs_diff:+,.2f}")

        print(f"\n[Bank Only Debug] {len(stmt_only)} entries:")
        for _, _row in stmt_only.iterrows():
            print(f"   {_row.get('Date',''):<12}  "
                  f"{_row.get('Direction',''):<8}  "
                  f"Rs{_row.get('Bank Amt (Rs)', 0):>12,.2f}  "
                  f"{_row.get('Party',''):<30}  "
                  f"{_row.get('Description','')[:50]}")

        print(f"\n[Book Only Debug] {len(book_only)} entries:")
        for _, _row in book_only.iterrows():
            print(f"   chq={_row.get('Chq No',''):<8}  "
                  f"{_row.get('Direction',''):<8}  "
                  f"Rs{_row.get('Book Amt (Rs)', 0):>12,.2f}  "
                  f"{_row.get('Party',''):<30}  "
                  f"{str(_row.get('Narration',''))[:40]}")
    else:
        if book_df.empty and abs(bank_closing_bal - book_closing_bal) < 0.01:
            no_txn_note = (f"No transactions in book for this bank this period. "
                           f"Balances match (₹{book_closing_bal:,.2f}) — Fully Reconciled.")
            stmt_only = pd.DataFrame(columns=STMT_COLS)
        else:
            no_txn_note = ""

    if book_closing_bal == 0.0 and prev_brs:
        prev_bal = prev_brs.get("prev_book_closing_bal", 0.0)
        if prev_bal > 0 and book_df.empty:
            book_closing_bal = prev_bal
            print(f"[Info] Book closing balance taken from previous BRS (empty period): {book_closing_bal}")
        elif book_closing_bal == 0.0:
            print(f"[WARN] Book closing balance is 0.0 — "
                f"may be a Cr balance that failed to parse. Check book summary row.")

    build_excel(
        book_df, stmt_df, matched, book_only, stmt_only,
        book_opening_bal, book_opening_drcr,
        book_closing_bal, book_closing_drcr,
        bank_closing_bal, output_path,
        company_name=company_name,
        account_no=account_no,
        branch_label=branch_label,
        brs_date=brs_date,
        cleared_log=cleared_log,
        carryforward_log=carryforward_log,
        no_txn_note=no_txn_note,
    )
    return matched, book_only, stmt_only


# =============================================================================
# MAIN
# =============================================================================

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(
        description="Bank Reconciliation — with optional previous BRS carry-forward."
    )
    parser.add_argument("book_file", help="Current day book/ledger Excel file.")
    parser.add_argument(
        "statement_file",
        nargs="?",
        default=None,
        help="Primary bank statement Excel file (positional, for backward compatibility)."
    )
    parser.add_argument(
        "--stmt", "-s",
        action="append",
        dest="statements",
        metavar="STATEMENT_FILE",
        help="Bank statement Excel file. Repeat to process multiple banks in one run.",
    )
    parser.add_argument("-o", "--output", default=OUTPUT_FILE, help="Output workbook path.")
    parser.add_argument(
        "-p", "--prev-brs",
        default=None,
        help="(Optional) Previous day BRS Excel file for carry-forward and BRS date extraction."
    )
    parser.add_argument(
        "--date-threshold",
        type=int,
        default=DATE_THRESHOLD_DAYS,
        help=f"Max calendar days apart for date-based matching (default: {DATE_THRESHOLD_DAYS})."
    )
    args = parser.parse_args()

    DATE_THRESHOLD_DAYS = args.date_threshold

    stmt_files = list(args.statements or [])
    if args.statement_file and args.statement_file not in stmt_files:
        stmt_files.append(args.statement_file)

    if not stmt_files:
        parser.error("At least one statement file is required (positional or via --stmt/-s).")

    print(f"Book             : {args.book_file}")
    for sf in stmt_files:
        print(f"Statement        : {sf}")
    print(f"Date threshold   : ±{DATE_THRESHOLD_DAYS} days")
    if args.prev_brs:
        print(f"Prev BRS         : {args.prev_brs}")

    if len(stmt_files) == 1:
        process_files(args.book_file, stmt_files[0], args.output, args.prev_brs)
    else:
        base, ext = os.path.splitext(args.output)
        for i, sf in enumerate(stmt_files, 1):
            bank_output = f"{base}_bank{i}{ext}"
            print(f"\n{'='*60}")
            print(f"Processing bank {i}/{len(stmt_files)}: {os.path.basename(sf)}")
            print(f"Output           : {bank_output}")
            print(f"{'='*60}")
            process_files(args.book_file, sf, bank_output, args.prev_brs)
        print(f"\nAll {len(stmt_files)} banks processed.")
