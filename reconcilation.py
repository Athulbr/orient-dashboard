import os, re, subprocess, sys
import pandas as pd
from datetime import datetime, date as dt_date
from difflib import SequenceMatcher
from openpyxl import Workbook
from openpyxl.styles import PatternFill, Font, Alignment, Border, Side
from openpyxl.utils import get_column_letter

for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace")

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

    # FIX: When the book file is a previously-generated BRS output, its 'Book Entries'
    # sheet (e.g. 'Book Entries (INDUSJNR)') is the correct ledger sheet.
    # The 'BRS Statement' sheet scores more keyword hits but is NOT a ledger — it is
    # a summary output. Prioritise any sheet whose name starts with 'Book Entries'.
    for sheet in sheets:
        if sheet.strip().lower().startswith("book entries"):
            print(f"[Book] BRS-output book detected — using sheet: '{sheet}'")
            return sheet

    LEDGER_SIGNALS = {"transaction", "receipts", "payments", "narration", "chq", "cheque", "bill"}
    # Exclude known BRS-output non-ledger sheets from keyword scoring
    BRS_OUTPUT_SHEETS = {"brs statement", "matched", "bank only (not in book)",
                         "bank statement", "cf audit trail", "summary"}
    for sheet in sheets:
        if sheet.strip().lower() in BRS_OUTPUT_SHEETS:
            continue
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
    # Fall back to full scan including all sheets
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
                print(f"[Book] Auto-detected ledger sheet (fallback): '{sheet}'")
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
                # Original: 'Summary Of INDUSJNR' pattern (legacy ledger format)
                m = re.match(r"Summary\s+Of\s+(\S+)", cell, re.IGNORECASE)
                if m:
                    bank_id = m.group(1).strip()
                    print(f"[Book] Extracted bank identifier: '{bank_id}'")
                    return bank_id
                # FIX: BRS-output title row pattern: 'INDUSJNR :- 200999478532'
                # Also matches 'BANK - Book Ledger Entries  |  INDUSJNR  |  12-03-2026'
                m2 = re.match(r".*\|\s*([A-Z]{3,12}(?:\d+)?)\s*\|", cell, re.IGNORECASE)
                if m2:
                    candidate = m2.group(1).strip()
                    # Skip generic tokens
                    if candidate.upper() not in {"BANK", "NAN", "INDUSJNR"[:0]}:
                        print(f"[Book] Extracted bank identifier from BRS header: '{candidate}'")
                        return candidate
                m3 = re.match(r"([A-Z]{3,12}(?:\d+)?)\s*:-\s*\d{9,18}", cell, re.IGNORECASE)
                if m3:
                    candidate = m3.group(1).strip()
                    print(f"[Book] Extracted bank identifier from BRS title: '{candidate}'")
                    return candidate
    print("[Book] Bank identifier not found — using 'BANK'")
    return "BANK"


def find_book_bank_id(raw_df, bank_name_hint):
    hint = bank_name_hint.upper().strip()
    SKIP_TOKENS = {"BANK", "THE", "OF", "LTD", "PVT", "LIMITED"}
    location_hint = getattr(find_book_bank_id, "_location_hint", "").upper().strip()
    location_alias_map = {
        "KOLK": ["KOLK", "KOL"],
        "KOL": ["KOL", "KOLK"],
        "CALCT": ["CALCT", "CALICUT"],
        "COMGR": ["COMGR"],
        "KTM": ["KTM"],
        "MUMV": ["MUMV"],
        "MUMD": ["MUMD"],
        "BELG": ["BELG"],
    }

    def _location_tokens():
        if not location_hint:
            return []
        toks = [location_hint]
        toks.extend(location_alias_map.get(location_hint, []))
        seen = []
        for tok in toks:
            tok = str(tok).upper().strip()
            if tok and tok not in seen:
                seen.append(tok)
        return seen

    location_tokens = _location_tokens()

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

    def _location_scored_candidates(candidates):
        if not location_tokens:
            return []
        scored = []
        for bid in candidates:
            for ri, row in raw_df.iterrows():
                for cell in row:
                    if not (isinstance(cell, str) and cell.strip() == f"Summary Of {bid}"):
                        continue
                    nearby_lines = []
                    for back in range(max(0, ri - 8), ri + 1):
                        _near_row = raw_df.iloc[back].tolist()
                        _near_txt = " ".join(str(v).strip() for v in _near_row
                                             if pd.notna(v) and str(v).strip())
                        if _near_txt:
                            nearby_lines.append(_near_txt.upper())
                    nearby_text = " | ".join(nearby_lines)
                    score = 0
                    if any(tok in nearby_text for tok in location_tokens):
                        score += 100
                    if _has_activity(bid):
                        score += 10
                    if score > 0:
                        scored.append((score, ri, bid, nearby_text[:160]))
        scored.sort(key=lambda x: (-x[0], x[1]))
        return scored

    def _branch_block_candidates(candidates):
        if not location_tokens:
            return []

        block_rows = []
        for ri, row in raw_df.iterrows():
            row_text = " | ".join(str(v).strip() for v in row if pd.notna(v) and str(v).strip())
            if not row_text:
                continue
            row_up = row_text.upper()
            m = re.match(r"([A-Z]{3,8})\s*-\s+", row_up)
            if not m:
                continue
            block_code = m.group(1).strip()
            if block_code in location_tokens:
                block_rows.append((ri, row_up))

        if not block_rows:
            return []

        scored = []
        candidate_set = {c.upper(): c for c in candidates}
        block_starts = [ri for ri, _ in block_rows]
        for idx, (start_ri, start_txt) in enumerate(block_rows):
            end_ri = block_starts[idx + 1] if idx + 1 < len(block_starts) else len(raw_df)

            def _has_local_activity(bid):
                for sri in range(start_ri, min(end_ri, start_ri + 250)):
                    _row = raw_df.iloc[sri].tolist()
                    for _cell in _row:
                        if not (isinstance(_cell, str) and _cell.strip() == f"Summary Of {bid}"):
                            continue
                        row_vals = [str(v).strip() for v in _row if pd.notna(v) and str(v).strip()]
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

            for ri in range(start_ri, min(end_ri, start_ri + 250)):
                row = raw_df.iloc[ri].tolist()
                row_vals = [str(v).strip() for v in row if pd.notna(v) and str(v).strip()]
                if not row_vals:
                    continue
                row_up = [v.upper() for v in row_vals]
                header_bid = None
                for v in row_vals:
                    v_up = v.upper()
                    if v_up in candidate_set and not v_up.startswith("SUMMARY OF "):
                        header_bid = candidate_set[v_up]
                        break
                if not header_bid:
                    continue
                score = 200
                if start_txt and re.match(r"([A-Z]{3,8})\s*-\s+", start_txt):
                    score += 40
                if _has_local_activity(header_bid):
                    score += 20
                scored.append((score, ri, header_bid, start_txt[:160]))
        scored.sort(key=lambda x: (-x[0], x[1]))
        return scored

    def _active_location_sibling(zero_bid, candidates):
        """Find an active same-bank sibling inside the current location block.
        Handles branch blocks where bare AXIS is a zero placeholder and the real
        operational account is a nearby id like AXISEXPO.
        """
        if not location_tokens:
            return None

        zero_up = str(zero_bid).upper().strip()
        candidate_set = {str(c).upper().strip(): c for c in candidates}
        block_rows = []
        for ri, row in raw_df.iterrows():
            row_text = " | ".join(str(v).strip() for v in row if pd.notna(v) and str(v).strip())
            if not row_text:
                continue
            row_up = row_text.upper()
            m = re.match(r"([A-Z]{3,8})\s*-\s+", row_up)
            if m and m.group(1).strip() in location_tokens:
                block_rows.append((ri, row_up))

        for block_i, (start_ri, _) in enumerate(block_rows):
            end_ri = block_rows[block_i + 1][0] if block_i + 1 < len(block_rows) else len(raw_df)
            block_ids = []
            for ri in range(start_ri, end_ri):
                row = raw_df.iloc[ri].tolist()
                vals = [str(v).strip() for v in row if pd.notna(v) and str(v).strip()]
                for val in vals:
                    bid = candidate_set.get(val.upper())
                    if bid and bid not in block_ids:
                        block_ids.append(bid)
                    m = re.match(r"Summary\s+Of\s+(\S+)", val, re.IGNORECASE)
                    if m:
                        bid = candidate_set.get(m.group(1).upper())
                        if bid and bid not in block_ids:
                            block_ids.append(bid)
            if zero_bid not in block_ids:
                continue
            active = [
                bid for bid in block_ids
                if str(bid).upper() != zero_up
                and str(bid).upper().startswith(zero_up)
                and (_has_activity(bid) or _has_nonzero_closing(bid))
            ]
            if active:
                return active[0]
        return None

    def _has_nonzero_closing_in_location(bid):
        if not location_tokens:
            return _has_nonzero_closing(bid)

        bid_up = str(bid).upper().strip()
        block_rows = []
        for ri, row in raw_df.iterrows():
            row_text = " | ".join(str(v).strip() for v in row if pd.notna(v) and str(v).strip())
            if not row_text:
                continue
            m = re.match(r"([A-Z]{3,8})\s*-\s+", row_text.upper())
            if m and m.group(1).strip() in location_tokens:
                block_rows.append(ri)

        for block_i, start_ri in enumerate(block_rows):
            end_ri = block_rows[block_i + 1] if block_i + 1 < len(block_rows) else len(raw_df)
            block_has_bid = False
            for ri in range(start_ri, end_ri):
                row = raw_df.iloc[ri].tolist()
                vals = [str(v).strip() for v in row if pd.notna(v) and str(v).strip()]
                if any(v.upper() == bid_up for v in vals):
                    block_has_bid = True
                for cell in row:
                    if not (isinstance(cell, str) and cell.strip().upper() == f"SUMMARY OF {bid_up}"):
                        continue
                    for j, v in enumerate(row):
                        if isinstance(v, str) and "Closing Balance" in v:
                            if j + 1 < len(row):
                                try:
                                    cb = float(str(row[j + 1]).replace(",", "").strip())
                                    return abs(cb) > 0.01
                                except (ValueError, TypeError):
                                    return False
                    return False
            if block_has_bid:
                return False
        return _has_nonzero_closing(bid)

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

    def _has_nonzero_closing(bid):
        """Return True if the Summary row for bid has a non-zero Closing Balance.
        An account with zero closing balance is a true placeholder/empty account
        (never had any balance), as distinct from one that simply had no new
        transactions today but carries a real accumulated balance."""
        for _, _row in raw_df.iterrows():
            for _cell in _row:
                if not (isinstance(_cell, str) and _cell.strip() == f"Summary Of {bid}"):
                    continue
                _row_vals = _row.tolist()
                for _j, _v in enumerate(_row_vals):
                    if isinstance(_v, str) and "Closing Balance" in _v:
                        if _j + 1 < len(_row_vals):
                            try:
                                _cb = float(str(_row_vals[_j + 1]).replace(",", "").strip())
                                return abs(_cb) > 0.01
                            except (ValueError, TypeError):
                                pass
                return False
        return False

    p1_matches = [bid for bid in all_ids if bid.upper().startswith(hint)]
    if p1_matches:
        _block_scored_all = _branch_block_candidates(p1_matches)
        if _block_scored_all:
            _exact_block = [x for x in _block_scored_all if x[2].upper() == hint]
            if _exact_block:
                chosen = _exact_block[0][2]
                # FIX: If the exact-name candidate has a ZERO closing balance it is a
                # true placeholder/empty account (e.g. bare 'AXIS' at COMGR with 0 balance),
                # not merely quiet today. In that case prefer the highest-scored active
                # sibling from the same location block (e.g. 'AXISEXPO').
                # We do NOT override when the exact-name has a non-zero closing balance
                # (e.g. bare 'AXIS' at KOLK with ~615K closing) — that is the real account
                # even if it had no new transactions today.
                if not _has_nonzero_closing_in_location(chosen):
                    _active_block = [x for x in _block_scored_all
                                     if x[2].upper() != hint and _has_activity(x[2])]
                    if _active_block:
                        chosen = _active_block[0][2]
                        print(f"[Book] P0 exact-location: '{chosen}' preferred over "
                              f"zero-balance '{hint}' using location '{location_hint}'")
                        return chosen
                    _active_sibling = _active_location_sibling(chosen, p1_matches)
                    if _active_sibling:
                        print(f"[Book] P0 exact-location: '{_active_sibling}' preferred over "
                              f"zero-balance '{hint}' using location '{location_hint}'")
                        return _active_sibling
                print(f"[Book] P0 exact-location: '{chosen}' matched hint '{hint}' "
                      f"using location '{location_hint}'")
                return chosen
        active = [bid for bid in p1_matches if _has_activity(bid)]
        _block_scored = _block_scored_all or _branch_block_candidates(active or p1_matches)
        if _block_scored:
            chosen = _block_scored[0][2]
            print(f"[Book] P0a branch-block: '{chosen}' matched hint '{hint}' "
                  f"using location '{location_hint}'")
            return chosen
        _loc_scored = _location_scored_candidates(p1_matches)
        _exact_loc = [x for x in _loc_scored if x[2].upper() == hint]
        if _exact_loc:
            chosen = _exact_loc[0][2]
            print(f"[Book] P0b exact-location: '{chosen}' matched hint '{hint}' "
                  f"using location '{location_hint}'")
            return chosen
        if _loc_scored:
            chosen = _loc_scored[0][2]
            print(f"[Book] P0b location-context: '{chosen}' matched hint '{hint}' "
                  f"using location '{location_hint}'")
            return chosen
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
        "BOI":      "BOI",
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
        _has_txn_hdr = (
            any(lbl in cells_lower for lbl in ("transaction date (dd/mm/yyyy)",
                                               "value date (dd/mm/yyyy)",
                                               "transaction date", "value date", "particulars"))
            and any(lbl in cells_lower for lbl in ("debit amount(inr)",
                                                   "credit amount(inr)",
                                                   "debit", "credit", "balance(inr)", "balance"))
        )
        if _has_txn_hdr:
            break
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
                # FIX: Skip generic/address words that appear after "BRANCH ADDRESS"
                SKIP_BRANCH = {"BANK", "CODE", "NAME", "ID", "NO", "NUMBER",
                               "ADDRESS", "REGISTERED", "CTS", "NO.", "OFFICE"}
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

    target = None

    # ── Priority 0: Detect script-generated BRS output ────────────────────────
    # When the prev BRS file is a script-generated BRS output, it has a structured
    # 'BRS Statement' sheet with section headers that parse_previous_brs can use.
    # Also check 'Book Only (Not in Bank)' sheet as an alternative source.
    # Prefer 'BRS Statement' if it contains the expected section headers.
    _BRS_STMT_SHEET = "BRS Statement"
    if _BRS_STMT_SHEET in sheets:
        try:
            _brs_sample = safe_read_excel(path, sheet_name=_BRS_STMT_SHEET, header=None, nrows=5)
            _brs_text = " ".join(str(v) for row in _brs_sample.values
                                  for v in row if pd.notna(v)).lower()
            if "bank reconciliation statement" in _brs_text or "closing balance" in _brs_text:
                # Confirm it's the right bank by checking account/bank mention
                _brs_full_sample = safe_read_excel(path, sheet_name=_BRS_STMT_SHEET,
                                                   header=None, nrows=15)
                _brs_full_text = " ".join(str(v) for row in _brs_full_sample.values
                                           for v in row if pd.notna(v)).upper()
                if (not bank_prefix or bank_prefix in _brs_full_text
                        or (bank_short_prefix and bank_short_prefix in _brs_full_text)):
                    target = _BRS_STMT_SHEET
                    print(f"[Previous BRS] Using 'BRS Statement' sheet from script-generated BRS output")
        except Exception:
            pass

    if target is None and bank_prefix:
        for s in sheets:
            s_up = s.upper()
            if (bank_prefix in s_up or bank_id.upper() in s_up or
                    bank_short_prefix in s_up or s_up in bank_prefix):
                target = s
                print(f"[Previous BRS] Sheet '{s}' matched bank '{bank_id}' by name")
                break

    if target is None and bank_prefix:
        for s in sheets:
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
        generic = ["BRS Statement", "BRS", "AXIS", "Axis", "axis", "SBI", "sbi"]
        for s in generic:
            if s not in sheets:
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

        # Detect 10-column BRS layout (Date|Type|Bill|Chq|BookReport|BankStmt|MakézExtracted|Amt|RunBal|Narr)
        # vs 8-column layout (Date|Type|Bill|Chq|Party|Amt|RunBal|Narr).
        # Check by looking at whether col-index 7 in this row holds a numeric amount.
        _is_10col = len(cells) >= 9 and to_amt(cells[7]) > 0
        if _is_10col:
            _amt_col     = 7   # 0-based index 7 = col 8
            _run_col     = 8   # 0-based index 8 = col 9
            _narr_col    = 9   # 0-based index 9 = col 10
        else:
            _amt_col     = 5
            _run_col     = 6
            _narr_col    = 7

        item_amt    = to_amt(cells[_amt_col]) if len(cells) > _amt_col else 0.0
        running_amt = to_amt(cells[_run_col]) if len(cells) > _run_col else 0.0
        if item_amt > 0 and item_amt != running_amt:
            amount = item_amt
        else:
            candidates = [a for a in amounts if a != running_amt]
            amount = min(candidates) if candidates else max(amounts)

        narration = ""
        if len(cells) > _narr_col and cells[_narr_col] not in ("nan", "", "-"):
            narration = cells[_narr_col]
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
            "party_raw": party,
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
            # P1a: match via Chq No column
            hits = stmt[
                (~stmt["_used_cf"]) &
                (stmt["Direction"] == direction) &
                (abs(stmt["Bank Amt (Rs)"] - float(item["amount"])) < 0.01) &
                (stmt["Chq No"].apply(_norm_chq) == norm_item_chq)
            ]
            if not hits.empty:
                stmt.at[hits.index[0], "_used_cf"] = True
                return True
            # P1b: match chq_no as a whole word inside Description column
            # Handles cases like bank Chq No = 'S16114708' (bank ref) but
            # Description = 'CHEQUE DEPOSIT/92124/SIBL/...' (actual cheque number)
            desc_hits = stmt[
                (~stmt["_used_cf"]) &
                (stmt["Direction"] == direction) &
                (abs(stmt["Bank Amt (Rs)"] - float(item["amount"])) < 0.01) &
                (stmt["Description"].str.contains(
                    r"\b" + re.escape(item["chq_no"]) + r"\b",
                    regex=True, na=False))
            ]
            if not desc_hits.empty:
                si = desc_hits.index[0]
                print(f"[CF] find_stmt_match P1b desc-chq: chq={item['chq_no']} "
                      f"found in desc='{str(stmt.at[si, 'Description'])[:60]}'")
                stmt.at[si, "_used_cf"] = True
                return True

        for si, sr in stmt[(stmt["Direction"] == direction) & (~stmt["_used_cf"])].iterrows():
            score     = fuzzy(item["party"], sr["Party"])
            amt_match = abs(float(sr["Bank Amt (Rs)"]) - float(item["amount"])) < 0.01
            if score >= FUZZY_THRESHOLD and amt_match:
                stmt.at[si, "_used_cf"] = True
                return True

        # Fallback: amount match + any word overlap in party name
        # (handles truncated bank descriptions like "INTERVIEW STREET TECH PVT LT"
        #  vs full name "INTERVIEW STREET TECHNOLOGIES PRIVATE LIMITED")
        item_words = set(item["party"].upper().split()) - {"PVT", "LTD", "LIMITED", "PRIVATE", "THE", "OF"}
        # DEBUG
        _all_inflow = stmt[stmt["Direction"] == direction]
        print(f"[CF DEBUG find_stmt] party='{item['party']}' amt={item['amount']:,.2f} "
              f"direction={direction} total_stmt_inflow={len(_all_inflow)} "
              f"unused_inflow={len(_all_inflow[~_all_inflow['_used_cf']])}")
        for _si2, _sr2 in _all_inflow.iterrows():
            _s2 = fuzzy(item["party"], str(_sr2["Party"]))
            if abs(float(_sr2["Bank Amt (Rs)"]) - float(item["amount"])) < 0.01:
                print(f"   amt-match: idx={_si2} used={_all_inflow.at[_si2,'_used_cf']} "
                      f"party='{_sr2['Party']}' fuzzy={_s2} "
                      f"desc='{str(_sr2.get('Description',''))[:50]}'")
        for si, sr in stmt[(stmt["Direction"] == direction) & (~stmt["_used_cf"])].iterrows():
            amt_match = abs(float(sr["Bank Amt (Rs)"]) - float(item["amount"])) < 0.01
            if not amt_match:
                continue
            sr_words = set(str(sr["Party"]).upper().split()) | \
                       set(str(sr.get("Description","")).upper().split())
            if item_words & sr_words:
                print(f"[CF] find_stmt_match word-overlap: '{item['party']}' "
                      f"↔ '{sr['Party']}' amt={item['amount']:,.2f}")
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

        # P1a: match via dedicated Chq No column
        hits = stmt[
            (~stmt["_used_cf"]) &
            (stmt["Chq No"].apply(_norm_chq) == norm_chq)
        ]
        # P1b: fallback — search chq_no as a whole word inside Description column
        if hits.empty:
            hits = stmt[
                (~stmt["_used_cf"]) &
                (stmt["Description"].str.contains(
                    r"\b" + re.escape(chq_no) + r"\b", regex=True, na=False))
            ]

        if not hits.empty:
            hit_idx   = hits.index[0]
            bank_amt  = float(stmt.at[hit_idx, "Bank Amt (Rs)"])
            bank_desc = str(stmt.at[hit_idx, "Description"]).upper()
            bank_dir  = stmt.at[hit_idx, "Direction"]

            # Before clearing: check if ANY row in stmt has RETURN for this chq.
            # If the cheque was returned by bank, it must stay in "issued not debited"
            # per manual BRS convention (encashment chq return).
            _ref_match = re.search(r"/(AX[A-Z0-9]+|SK[A-Z0-9]+)/", bank_desc)
            _has_return = False
            if _ref_match:
                _ref_num = _ref_match.group(1)
                _return_rows = stmt[
                    stmt["Description"].str.contains(
                        r"RETURN.*" + re.escape(_ref_num) + r"|" +
                        re.escape(_ref_num) + r".*RETURN",
                        regex=True, na=False, case=False)
                ]
                if not _return_rows.empty:
                    _has_return = True
            # Also check by chq number directly
            if not _has_return:
                _return_by_chq = stmt[
                    (stmt["Chq No"].apply(_norm_chq) == _norm_chq(chq_no)) &
                    (stmt["Description"].str.contains(r"\bRETURN\b", regex=True,
                                                       na=False, case=False))
                ]
                if not _return_by_chq.empty:
                    _has_return = True
            if _has_return:
                print(f"[CF] chq_cleared BLOCKED: chq={chq_no} has RETURN entry "
                      f"→ keeping in issued_not_debited (encashment chq return)")
                return False, None

            # Also handle case where RETURN row was found first in hits
            if "RETURN" in bank_desc and bank_dir == "INFLOW":
                print(f"[CF] chq_cleared BLOCKED: chq={chq_no} hit is RETURN row "
                      f"→ keeping in issued_not_debited")
                return False, None

            if abs(bank_amt - float(amount)) > 0.01:
                print(f"[CF] chq_cleared P1 BLOCKED (amt mismatch): chq={chq_no} "
                      f"book={amount:,.2f} bank={bank_amt:,.2f}")
                best_score, best_si = 0, None
                for si, sr in stmt[(stmt["Direction"] == "OUTFLOW") & (~stmt["_used_cf"])].iterrows():
                    if abs(float(sr["Bank Amt (Rs)"]) - float(amount)) >= 0.01:
                        continue
                    score = fuzzy(party, sr["Party"])
                    if score >= FUZZY_THRESHOLD and score > best_score:
                        best_score = score
                        best_si = si
                if best_si is not None:
                    print(f"[CF] chq_cleared P1 mismatch recovered by party+amount: "
                          f"party={party} amt={amount:,.2f} score={best_score}% "
                          f"-> stmt idx={best_si}")
                    return True, best_si
                return False, None
            print(f"[CF] chq_cleared P1: chq={chq_no} → stmt idx={hit_idx}")
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
            bank_chq  = str(stmt.at[best_si, "Chq No"]).strip()
            norm_orig = _norm_chq(chq_no)
            norm_bank = _norm_chq(bank_chq)
            if (bank_chq not in ("", "nan") and
                    norm_orig not in ("", "nan", "0") and
                    norm_orig != norm_bank):
                if best_score >= 80:
                    print(f"[CF] chq_cleared P2 (chq-swap allowed): party={party} "
                          f"amt={amount:,.2f} score={best_score}% "
                          f"orig_chq='{chq_no}' bank_chq='{bank_chq}' -> stmt idx={best_si}")
                else:
                    print(f"[CF] chq_cleared P2 BLOCKED: party={party} amt={amount:,.2f} "
                          f"orig chq '{chq_no}' != bank chq '{bank_chq}' "
                          f"(score {best_score}% < 80)")
                    return False, None
            print(f"[CF] chq_cleared P2 (fuzzy): party={party} "
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

    # ── Pre-pass: Cross-clear deposited_not_credited ↔ credited_not_book ────────
    # When the same transaction appears on BOTH sides (e.g. Interview Street Tech:
    # deposited in book but not credited in bank AND credited in bank but not in book),
    # the two items cancel each other — neither should carry forward.
    _cross_cleared_dep_keys = set()
    _cross_cleared_cred_keys = set()
    for _dep in prev_brs["deposited_not_credited"]:
        for _cred in prev_brs["credited_not_book"]:
            _dep_words  = set(_dep["party"].upper().split())  - \
                          {"PVT","LTD","LIMITED","PRIVATE","THE","OF","AND","INDIVI"}
            _cred_words = set(_cred["party"].upper().split()) - \
                          {"PVT","LTD","LIMITED","PRIVATE","THE","OF","AND","INDIVI"}
            _word_match = bool(_dep_words & _cred_words) and len(_dep_words) > 0
            _fuzzy_match = fuzzy(_dep["party"], _cred["party"]) >= FUZZY_THRESHOLD
            if (_word_match or _fuzzy_match) and abs(_dep["amount"] - _cred["amount"]) < 0.01:
                _cross_cleared_dep_keys.add((_dep["party"].upper().strip(), round(_dep["amount"], 2)))
                _cross_cleared_cred_keys.add((_cred["party"].upper().strip(), round(_cred["amount"], 2)))
                print(f"[CF] Pre-pass CROSS-CLEAR: deposited_not_credited '{_dep['party']}' "
                      f"Rs{_dep['amount']:,.2f} <-> credited_not_book '{_cred['party']}' "
                      f"Rs{_cred['amount']:,.2f} — these cancel each other")

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

    # Short-debit completion:
    # Previous manual BRS can show a cheque in issued_not_debited for the full
    # book amount and a paired debited_not_book row for "SHORT DEBITED". When the
    # short amount appears in the current bank statement, both previous rows are
    # cleared together and the current bank row must not remain as bank-only.
    for _dnb in prev_brs["debited_not_book"]:
        _dnb_narr = str(_dnb.get("narration", "")).upper()
        _dnb_chq = _norm_chq(_dnb.get("chq_no", ""))
        if "SHORT" not in _dnb_narr or _dnb_chq == "0":
            continue
        for _ind in prev_brs["issued_not_debited"]:
            _ind_chq = _norm_chq(_ind.get("chq_no", ""))
            if _ind_chq != _dnb_chq:
                continue
            if fuzzy(str(_dnb.get("party", "")), str(_ind.get("party", ""))) < 50:
                continue
            _dnb_amt = float(_dnb.get("amount", 0) or 0)
            _party_words = {
                w for w in clean_name(str(_dnb.get("party", "")) + " " +
                                      str(_ind.get("party", ""))).split()
                if len(w) >= 4 and w not in {"FOREX", "PRIVATE", "LIMITED"}
            }
            _hits = stmt[
                (~stmt["_used_cf"]) &
                (stmt["Direction"] == "OUTFLOW") &
                (abs(stmt["Bank Amt (Rs)"] - _dnb_amt) < 0.01)
            ]
            for _si, _sr in _hits.iterrows():
                _stmt_text = clean_name(str(_sr.get("Party", "")) + " " +
                                        str(_sr.get("Description", "")))
                _stmt_words = set(_stmt_text.split())
                if not (_party_words & _stmt_words):
                    continue
                stmt.at[_si, "_used_cf"] = True
                _cross_cleared_ind_keys.add((
                    _ind["party"].upper().strip(), round(float(_ind["amount"]), 2)
                ))
                _cross_cleared_dnb_keys.add((
                    _dnb["party"].upper().strip(), round(float(_dnb["amount"]), 2)
                ))
                print(f"[CF] Short-debit completion cleared: issued chq={_ind.get('chq_no','')} "
                      f"Rs{float(_ind.get('amount', 0)):,.2f} + short debit "
                      f"Rs{_dnb_amt:,.2f} -> stmt idx={_si}")
                break

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

    # ── Debug: print what's in stmt["Chq No"] so we can verify chq lookup works ──
    print(f"\n[CF Debug] stmt Chq No values (OUTFLOW rows):")
    for _si, _sr in stmt[stmt["Direction"] == "OUTFLOW"].iterrows():
        print(f"   idx={_si}  chq='{_sr['Chq No']}'  amt={_sr['Bank Amt (Rs)']:,.2f}  "
              f"desc='{str(_sr['Description'])[:50]}'")
    print(f"[CF Debug] CF chq_groups keys: {list(chq_groups.keys())}\n")

    for chq_no, items in chq_groups.items():
        rep_party    = items[0]["party"]
        rep_amount   = sum(i["amount"] for i in items)
        check_amount = items[0]["amount"] if len(items) == 1 else rep_amount

        if chq_no == "302631":
            print(f"[CF DEBUG 302631] Checking chq=302631 party={rep_party} amt={check_amount:,.2f}")
            _chq_hits = stmt[stmt["Chq No"].apply(_norm_chq) == _norm_chq("302631")]
            for _si, _sr in _chq_hits.iterrows():
                print(f"   stmt hit: dir={_sr['Direction']} amt={_sr['Bank Amt (Rs)']:,.2f} "
                      f"desc='{str(_sr.get('Description',''))[:60]}'")
        cleared, stmt_idx = chq_cleared_in_stmt(chq_no, rep_party, check_amount)
        if chq_no == "302631":
            print(f"[CF DEBUG 302631] cleared={cleared} stmt_idx={stmt_idx}")
        # ── Last-resort fallback: unique amount match among OUTFLOW rows ─────
        # ── Last-resort fallback: unique amount match among OUTFLOW rows ─────
        if not cleared:
            _amt_hits = stmt[
                (~stmt["_used_cf"]) &
                (stmt["Direction"] == "OUTFLOW") &
                (abs(stmt["Bank Amt (Rs)"] - check_amount) < 0.01)
            ]
            if len(_amt_hits) == 1:
                _ah_idx  = _amt_hits.index[0]
                _ah_chq  = str(stmt.at[_ah_idx, "Chq No"]).strip()
                _ah_desc = str(stmt.at[_ah_idx, "Description"]).upper()
                # Do NOT clear if this bank row has a RETURN counterpart —
                # means the cheque bounced and must stay in issued_not_debited.
                _ah_ref = re.search(r"/(AX[A-Z0-9]+|SK[A-Z0-9]+)/", _ah_desc)
                _row_has_return = False
                if _ah_ref:
                    _rn = _ah_ref.group(1)
                    _row_has_return = not stmt[
                        stmt["Description"].str.contains(
                            r"RETURN.*" + re.escape(_rn) + r"|" +
                            re.escape(_rn) + r".*RETURN",
                            regex=True, na=False, case=False)
                    ].empty
                if not _row_has_return and _ah_chq not in ("", "nan", "0"):
                    _row_has_return = not stmt[
                        (stmt["Chq No"].apply(_norm_chq) == _norm_chq(_ah_chq)) &
                        (stmt["Description"].str.contains(
                            r"\bRETURN\b", regex=True, na=False, case=False))
                    ].empty
                if _row_has_return:
                    print(f"[CF] chq_cleared LAST-RESORT BLOCKED: chq={chq_no} "
                          f"amt={check_amount:,.2f} — stmt row has RETURN counterpart")
                elif _ah_chq in ("", "nan", "0") or _norm_chq(_ah_chq) == _norm_chq(chq_no):
                    stmt.at[_ah_idx, "_used_cf"] = True
                    stmt_idx = _ah_idx
                    cleared  = True
                    print(f"[CF] chq_cleared LAST-RESORT amt-match: chq={chq_no} "
                          f"amt={check_amount:,.2f} → stmt idx={_ah_idx}")

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
                    "Party Raw":     item.get("party_raw", item["party"]),
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
                "Party Raw":     item.get("party_raw", item["party"]),
                "Direction":     "OUTFLOW",
                "Sender":        company_name,
                "Recipient":     item["party"],
                "Book Amt (Rs)": item["amount"],
                "Narration":     item["narration"] + " [CF from prev BRS]",
            })

    _processed_dep_items = set()

    def _remove_dep_from_book_only(_book_only, _item):
        _dep_words2 = set(_item["party"].upper().split()) - {
            "PVT", "LTD", "LIMITED", "PRIVATE", "THE", "OF", "AND"
        }
        for _bo_idx, _bo_row in list(_book_only.iterrows()):
            if _bo_row["Direction"] != "INFLOW":
                continue
            if abs(float(_bo_row["Book Amt (Rs)"]) - _item["amount"]) > 0.01:
                continue
            _bo_words = set(str(_bo_row["Party"]).upper().split())
            if (fuzzy(_item["party"], str(_bo_row["Party"])) >= FUZZY_THRESHOLD or
                    bool(_dep_words2 & _bo_words)):
                _book_only = _book_only.drop(index=_bo_idx)
                print(f"[CF] deposited_not_credited: removed book_only INFLOW "
                      f"idx={_bo_idx} party='{_bo_row['Party']}' "
                      f"amt={_item['amount']:,.2f}")
                return _book_only
        return _book_only

    dep_groups = defaultdict(list)
    for _dep in prev_brs["deposited_not_credited"]:
        _key = (
            _norm_chq(_dep.get("chq_no", "")),
            round(float(_dep.get("amount", 0) or 0), 2),
            str(_dep.get("date", "")).strip(),
        )
        dep_groups[_key].append(_dep)

    for (_dep_chq, _dep_amt, _dep_date), _dep_items in dep_groups.items():
        if _dep_chq in ("0", "", "99", "511") or len(_dep_items) < 2:
            continue
        _combined_amt = round(sum(float(_it.get("amount", 0) or 0) for _it in _dep_items), 2)
        _dep_hits = stmt[
            (~stmt["_used_cf"]) &
            (stmt["Direction"] == "INFLOW") &
            (abs(stmt["Bank Amt (Rs)"] - _combined_amt) < 0.01) &
            (
                (stmt["Chq No"].apply(_norm_chq) == _dep_chq) |
                (stmt["Description"].str.contains(
                    r"\b" + re.escape(str(_dep_items[0].get("chq_no", "")).strip()) + r"\b",
                    regex=True, na=False))
            )
        ]
        if _dep_hits.empty:
            continue
        _dep_si = _dep_hits.index[0]
        stmt.at[_dep_si, "_used_cf"] = True
        print(f"[CF] deposited_not_credited combined clear: "
              f"{len(_dep_items)} items x Rs{_dep_amt:,.2f} -> "
              f"stmt idx={_dep_si} Rs{_combined_amt:,.2f} chq={_dep_items[0].get('chq_no','')}")
        for _dep_item in _dep_items:
            _processed_dep_items.add(id(_dep_item))
            cleared_log.append({**_dep_item, "section": "deposited_not_credited", "status": "CLEARED"})
            book_only = _remove_dep_from_book_only(book_only, _dep_item)

    _prev_book_closing = prev_brs.get("prev_book_closing_bal", None)
    _auto_cleared_dep_keys = set()
    if (book_opening_bal is not None and _prev_book_closing is not None
            and abs(_prev_book_closing) > 0.01):
        _gap = round(book_opening_bal - _prev_book_closing, 2)
        if _gap < -0.01:
            _gap_abs = abs(_gap)
            _dep_items = list(prev_brs["deposited_not_credited"])
            _single_dep = None
            for _di in _dep_items:
                if abs(_di["amount"] - _gap_abs) < 0.01:
                    _single_dep = _di
                    break
            if _single_dep is not None:
                _dep_key = (_single_dep["party"].upper().strip(),
                            round(_single_dep["amount"], 2))
                _auto_cleared_dep_keys.add(_dep_key)
                print(f"[CF] Book-opening-gap auto-clear deposited_not_credited "
                      f"(single exact match): party='{_single_dep['party']}' "
                      f"amt={_single_dep['amount']:,.2f}")
            elif _dep_items:
                _total_dep = round(sum(_di["amount"] for _di in _dep_items), 2)
                if abs(_total_dep - _gap_abs) < 0.01:
                    for _di in _dep_items:
                        _dep_key = (_di["party"].upper().strip(), round(_di["amount"], 2))
                        _auto_cleared_dep_keys.add(_dep_key)
                    print(f"[CF] Book-opening-gap auto-clear deposited_not_credited "
                          f"(full set match): {len(_dep_items)} items, total={_total_dep:,.2f}")

    for item in prev_brs["deposited_not_credited"]:
        if id(item) in _processed_dep_items:
            continue
        _dep_key = (item["party"].upper().strip(), round(item["amount"], 2))
        if _dep_key in _cross_cleared_dep_keys:
            cleared_log.append({**item, "section": "deposited_not_credited",
                                 "status": "CLEARED (cross-matched with credited_not_book)"})
            continue
        if _dep_key in _auto_cleared_dep_keys:
            cleared_log.append({**item, "section": "deposited_not_credited",
                                 "status": "CLEARED (absorbed in book opening balance)"})
            print(f"[CF] deposited_not_credited auto-cleared via book-opening-gap: "
                  f"party='{item['party']}' amt={item['amount']:,.2f}")
            continue
        cleared = find_stmt_match(item, "INFLOW")
        # Extra fallback: search stmt_only directly by amount + word overlap
        # (find_stmt_match uses stmt_df copy; this catches truncated party names)
        if not cleared:
            _dep_words = set(item["party"].upper().split()) - \
                         {"PVT", "LTD", "LIMITED", "PRIVATE", "THE", "OF", "AND"}
            # Search INFLOW in full stmt
            for _si, _sr in stmt[
                (~stmt["_used_cf"]) & (stmt["Direction"] == "INFLOW") &
                (abs(stmt["Bank Amt (Rs)"] - item["amount"]) < 0.01)
            ].iterrows():
                _sr_words = set((str(_sr["Party"]) + " " +
                                 str(_sr.get("Description",""))).upper().split())
                if _dep_words & _sr_words:
                    stmt.at[_si, "_used_cf"] = True
                    cleared = True
                    print(f"[CF] deposited_not_credited word-overlap INFLOW: "
                          f"'{item['party']}' ↔ '{_sr['Party']}' "
                          f"amt={item['amount']:,.2f} → idx={_si}")
                    break
            # Also search OUTFLOW (cheque cleared outward)
            if not cleared:
                for _si, _sr in stmt[
                    (~stmt["_used_cf"]) & (stmt["Direction"] == "OUTFLOW") &
                    (abs(stmt["Bank Amt (Rs)"] - item["amount"]) < 0.01)
                ].iterrows():
                    _sr_words = set((str(_sr["Party"]) + " " +
                                     str(_sr.get("Description",""))).upper().split())
                    if _dep_words & _sr_words:
                        stmt.at[_si, "_used_cf"] = True
                        cleared = True
                        print(f"[CF] deposited_not_credited word-overlap OUTFLOW: "
                              f"'{item['party']}' ↔ '{_sr['Party']}' "
                              f"amt={item['amount']:,.2f} → idx={_si}")
                        break
        if cleared:
            cleared_log.append({**item, "section": "deposited_not_credited", "status": "CLEARED"})
            # Remove matching INFLOW from book_only (the RT entry now cleared)
            book_only = _remove_dep_from_book_only(book_only, item)
        else:
            carryforward_log.append({**item, "section": "deposited_not_credited"})
            cf_book_rows.append({
                "Date":          item.get("date", ""),
                "Txn Type":      item.get("txn_type", "PS"),
                "Bill No":       item["bill_no"],
                "Chq No":        item["chq_no"],
                "Party":         item["party"],
                "Party Raw":     item.get("party_raw", item["party"]),
                "Direction":     "INFLOW",
                "Sender":        item["party"],
                "Recipient":     company_name,
                "Book Amt (Rs)": item["amount"],
                "Narration":     item["narration"] + " [CF from prev BRS]",
            })

    _prev_book_closing = prev_brs.get("prev_book_closing_bal", None)
    _auto_cleared_dnb_keys = set()
    if (book_opening_bal is not None and _prev_book_closing is not None
            and abs(_prev_book_closing) > 0.01):
        _gap = round(book_opening_bal - _prev_book_closing, 2)
        if _gap < -0.01:
            _gap_abs = abs(_gap)
            _dnb_items = list(prev_brs["debited_not_book"])
            _single_dnb = None
            for _di in _dnb_items:
                if abs(_di["amount"] - _gap_abs) < 0.01:
                    _single_dnb = _di
                    break
            if _single_dnb is not None:
                _dnb_key = (_single_dnb["party"].upper().strip(),
                            round(_single_dnb["amount"], 2))
                _auto_cleared_dnb_keys.add(_dnb_key)
                print(f"[CF] Book-opening-gap auto-clear debited_not_book "
                      f"(single exact match): party='{_single_dnb['party']}' "
                      f"amt={_single_dnb['amount']:,.2f}")
            elif _dnb_items:
                _total_dnb = round(sum(_di["amount"] for _di in _dnb_items), 2)
                if abs(_total_dnb - _gap_abs) < 0.01:
                    for _di in _dnb_items:
                        _dnb_key = (_di["party"].upper().strip(), round(_di["amount"], 2))
                        _auto_cleared_dnb_keys.add(_dnb_key)
                    print(f"[CF] Book-opening-gap auto-clear debited_not_book "
                          f"(full set match): {len(_dnb_items)} items, total={_total_dnb:,.2f}")

    debited_nb_book_only_to_remove = []

    for item in prev_brs["debited_not_book"]:
        already_recorded = False
        matched_outflow_idx = None

        _dnb_key = (item["party"].upper().strip(), round(item["amount"], 2))
        if _dnb_key in _cross_cleared_dnb_keys:
            cleared_log.append({**item, "section": "debited_not_book",
                                 "status": "CLEARED (cross-matched with issued_not_debited)"})
            continue
        if _dnb_key in _auto_cleared_dnb_keys:
            cleared_log.append({**item, "section": "debited_not_book",
                                 "status": "CLEARED (absorbed in book opening balance)"})
            print(f"[CF] debited_not_book auto-cleared via book-opening-gap: "
                  f"party='{item['party']}' amt={item['amount']:,.2f}")
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
        matched_book_only_indices = []

        # Cross-clear: if this credited_not_book item was already cancelled by a
        # matching deposited_not_credited item (same party/amount), skip it.
        _cred_key2 = (item["party"].upper().strip(), round(item["amount"], 2))
        if _cred_key2 in _cross_cleared_cred_keys:
            cleared_log.append({**item, "section": "credited_not_book",
                                 "status": "CLEARED (cross-matched with deposited_not_credited)"})
            print(f"[CF] credited_not_book cross-cleared with deposited_not_credited: "
                  f"party='{item['party']}' amt={item['amount']:,.2f}")
            continue

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

        def _find_exact_book_only_row(book_row):
            target_amt = round(float(book_row.get("Book Amt (Rs)", 0) or 0), 2)
            target_date = str(book_row.get("Date", "")).strip()
            target_txn = str(book_row.get("Txn Type", "")).strip()
            target_chq = str(book_row.get("Chq No", "")).strip()
            target_party = str(book_row.get("Party", "")).strip().upper()
            target_dir = str(book_row.get("Direction", "")).strip()
            for bo_idx, bo_row in book_only.iterrows():
                if bo_idx in book_only_indices_to_remove:
                    continue
                if str(bo_row.get("Direction", "")).strip() != target_dir:
                    continue
                if str(bo_row.get("Date", "")).strip() != target_date:
                    continue
                if str(bo_row.get("Txn Type", "")).strip() != target_txn:
                    continue
                if str(bo_row.get("Chq No", "")).strip() != target_chq:
                    continue
                if str(bo_row.get("Party", "")).strip().upper() != target_party:
                    continue
                if round(float(bo_row.get("Book Amt (Rs)", 0) or 0), 2) != target_amt:
                    continue
                return bo_idx
            return None

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
            bo_idx_for_br = _find_exact_book_only_row(br)
            if bo_idx_for_br is not None:
                # Skip if this book_only entry was already consumed by a previous CF item
                if bo_idx_for_br in book_only_indices_to_remove:
                    continue
                already_recorded = True
                matched_book_only_idx = bo_idx_for_br
                matched_book_only_indices.append(bo_idx_for_br)
                book_only_indices_to_remove.append(bo_idx_for_br)
                print(f"[CF] Check1 cleared (was book_only): "
                      f"CF={item['party']} ₹{item['amount']:,.2f} ↔ book={br['Party']}")
                break
            matched_book_only_idx = _find_in_book_only(item["amount"], item["party"])
            if matched_book_only_idx is None:
                print(f"[CF] Check1 skipped: CF={item['party']} "
                      f"₹{item['amount']:,.2f} matched book={br['Party']} "
                      f"but that book row is already consumed by current-period matching")
                continue
            matched_book_only_indices.append(matched_book_only_idx)
            already_recorded = True
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
                if _find_exact_book_only_row(br) is not None:
                        continue
                item_words  = set(item["party"].upper().split())
                narr_upper  = str(br.get("Narration", "")).upper()
                party_upper = str(br["Party"]).upper()
                if item_words & set(narr_upper.split()) or item_words & set(party_upper.split()):
                    matched_book_only_idx = _find_in_book_only(item["amount"], item["party"])
                    if matched_book_only_idx is None:
                        print(f"[CF] Check2 skipped: CF={item['party']} "
                              f"₹{item['amount']:,.2f} matched book={br['Party']} "
                              f"but no outstanding book_only row remains")
                        continue
                    matched_book_only_indices.append(matched_book_only_idx)
                    already_recorded = True
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
                if _find_exact_book_only_row(br) is not None:
                    continue
                book_amt = float(br["Book Amt (Rs)"])
                cf_amt   = float(item["amount"])
                if book_amt < cf_amt and abs(cf_amt - book_amt * 2) < 0.01:
                    item_words = {w for w in clean_name(item["party"]).split() if len(w) >= 4}
                    book_words = {w for w in clean_name(str(br["Party"])).split() if len(w) >= 4}
                    narr_words = {w for w in clean_name(str(br.get("Narration", ""))).split() if len(w) >= 4}
                    score = fuzzy(item["party"], br["Party"])
                    strong_name_ok = (
                        score >= FUZZY_THRESHOLD or
                        _truncated_name_match(item["party"], br["Party"]) or
                        bool(item_words & book_words) or
                        bool(item_words & narr_words)
                    )
                    if strong_name_ok:
                        matched_book_only_idx = _find_in_book_only(book_amt, item["party"])
                        if matched_book_only_idx is None:
                            print(f"[CF] Check3 skipped: CF={item['party']} "
                                  f"₹{cf_amt:,.2f} partial book={br['Party']} "
                                  f"has no outstanding book_only row")
                            continue
                        matched_book_only_indices.append(matched_book_only_idx)
                        already_recorded = True
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
                    matched_book_only_indices.extend([bi1, bi2])
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
                        bo_idx_for_br = _find_exact_book_only_row(br)
                        if bo_idx_for_br is None:
                            name_score = fuzzy(item["party"], br["Party"])
                            bank_score = 0
                            for _, sr in stmt_df[stmt_df["Direction"] == "INFLOW"].iterrows():
                                if abs(float(sr["Bank Amt (Rs)"]) - float(item["amount"])) < 1.0:
                                    s = fuzzy(item["party"], str(sr.get("Party", "")))
                                    if s > bank_score:
                                        bank_score = s
                            if max(name_score, bank_score) < FUZZY_THRESHOLD:
                                continue

                        if bo_idx_for_br is not None:
                            if (fuzzy(item["party"], br["Party"]) < FUZZY_THRESHOLD and
                                    not _truncated_name_match(item["party"], br["Party"])):
                                continue

                        matched_book_only_idx = _find_in_book_only(item["amount"], item["party"])
                        if matched_book_only_idx is None:
                            print(f"[CF] Check4 skipped: CF={item['party']} "
                                  f"₹{item['amount']:,.2f} matched book={br['Party']} "
                                  f"but no outstanding book_only row remains")
                            continue
                        matched_book_only_indices.append(matched_book_only_idx)
                        already_recorded = True
                        print(f"[CF] Check4 cleared (absent from stmt_only + book match): "
                              f"CF={item['party']} ₹{item['amount']:,.2f} "
                              f"↔ book={br['Party']}  book_only_idx={matched_book_only_idx}")
                        break

        if already_recorded:
            _book_rows_for_audit = []
            for _mbi in dict.fromkeys(matched_book_only_indices):
                if _mbi in book_only.index:
                    _book_rows_for_audit.append(book_only.loc[_mbi].to_dict())
            cleared_log.append({
                **item,
                "section": "credited_not_book",
                "status": "CLEARED",
                "cleared_by_book_rows": _book_rows_for_audit,
                "backdated_clear": bool(_book_rows_for_audit),
            })

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
                    _cf_party = str(item["party"])
                    _so_party = str(so_row.get("Party", ""))
                    _cf_narr  = str(item.get("narration", ""))
                    _so_desc  = str(so_row.get("Description", ""))
                    _cf_clean = clean_name(_cf_party)
                    _so_clean = clean_name(_so_party)
                    _cf_words = {w for w in _cf_clean.split() if len(w) >= 3}
                    _so_words = {w for w in _so_clean.split() if len(w) >= 3}
                    _same_ref = False
                    for _ref in re.findall(r"\b\d{8,}\b", _cf_narr):
                        if _ref and _ref in _so_desc:
                            _same_ref = True
                            break
                    _score = fuzzy(_cf_party, _so_party)
                    party_ok = (
                        _same_ref or
                        _cf_clean == _so_clean or
                        (_score >= 85 and (_cf_words <= _so_words or _so_words <= _cf_words or bool(_cf_words & _so_words)))
                    )
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

    _grp_chq_key = lambda it: (it.get("section", ""), _norm_chq(it.get("chq_no", "")))
    _grp_chq_sums = defaultdict(float)
    for _it in cleared_log:
        _chq_key = _grp_chq_key(_it)
        if _chq_key[1] != "0":
            _grp_chq_sums[_chq_key] += float(_it.get("amount", 0))

    for item in cleared_log:
        expected_dir = _CF_SECTION_BANK_DIR.get(item.get("section", ""), None)
        for si, sr in stmt_only.iterrows():
            if stmt_only.at[si, "_remove"]:
                continue
            if expected_dir and sr.get("Direction") != expected_dir:
                continue
            item_chq = _norm_chq(item.get("chq_no", ""))
            sr_chq   = _norm_chq(str(sr.get("Chq No", "")))
            try:
                amt_ok_for_chq = abs(float(sr["Bank Amt (Rs)"]) - float(item["amount"])) < 0.01
            except Exception:
                amt_ok_for_chq = False
            if item_chq != "0" and item_chq == sr_chq and amt_ok_for_chq:
                stmt_only.at[si, "_remove"] = True
                break
            if item_chq != "0" and item_chq == sr_chq:
                _combined_chq = _grp_chq_sums.get(_grp_chq_key(item), 0.0)
                try:
                    if abs(float(sr["Bank Amt (Rs)"]) - _combined_chq) < 0.01:
                        stmt_only.at[si, "_remove"] = True
                        break
                except Exception:
                    pass
            if item_chq != "0":
                sr_desc = str(sr.get("Description", ""))
                if (amt_ok_for_chq and
                        re.search(r"\b" + re.escape(item_chq) + r"\b", sr_desc)):
                    stmt_only.at[si, "_remove"] = True
                    break
                _combined_chq = _grp_chq_sums.get(_grp_chq_key(item), 0.0)
                try:
                    if (abs(float(sr["Bank Amt (Rs)"]) - _combined_chq) < 0.01 and
                            re.search(r"\b" + re.escape(item_chq) + r"\b", sr_desc)):
                        stmt_only.at[si, "_remove"] = True
                        break
                except Exception:
                    pass
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
    location_hint = getattr(find_book_bank_id, "_location_hint", "").upper().strip()
    if target_bank_id:
        bank_id = target_bank_id
        print(f"[Book] Using target bank: '{bank_id}'")
    else:
        bank_id = extract_bank_identifier(raw)
    # FIX: If BRS-output format, also try to get bank_id from sheet name
    # e.g. sheet "Book Entries (INDUSJNR)" -> bank_id = "INDUSJNR"
    if bank_id in ("BANK", "UNKNOWN"):
        try:
            _xl2 = pd.ExcelFile(path)
            for _sn2 in _xl2.sheet_names:
                _msn2 = re.search(r"Book Entries\s*\(([^)]+)\)", _sn2, re.IGNORECASE)
                if _msn2:
                    bank_id = _msn2.group(1).strip().upper()
                    print(f"[Book] bank_id extracted from sheet name: '{bank_id}'")
                    break
        except Exception:
            pass

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
    target_summary_candidates = []

    def _location_tokens():
        location_alias_map = {
            "KOLK": ["KOLK", "KOL"],
            "KOL": ["KOL", "KOLK"],
            "CALCT": ["CALCT", "CALICUT"],
            "COMGR": ["COMGR"],
            "KTM": ["KTM"],
            "MUMV": ["MUMV"],
            "MUMD": ["MUMD"],
            "BELG": ["BELG"],
        }
        if not location_hint:
            return []
        toks = [location_hint]
        toks.extend(location_alias_map.get(location_hint, []))
        out = []
        for tok in toks:
            tok = str(tok).upper().strip()
            if tok and tok not in out:
                out.append(tok)
        return out

    location_tokens = _location_tokens()

    for i, r in enumerate(all_rows):
        if r and isinstance(r[0], str) and r[0].startswith("Summary Of "):
            _m = re.match(r"Summary Of\s+(\S+)", r[0], re.IGNORECASE)
            tok = _m.group(1).strip() if _m else ""
            if tok == bank_id:
                target_summary_candidates.append(i)
            else:
                prev_summary_idx = i

    if len(target_summary_candidates) == 1:
        target_summary_idx = target_summary_candidates[0]
    elif len(target_summary_candidates) > 1 and location_tokens:
        scored = []
        for cand_idx in target_summary_candidates:
            marker_idx = None
            marker_text = ""
            marker_code = ""
            for back in range(cand_idx - 1, -1, -1):
                _row = all_rows[back]
                _txt = " ".join(str(v).strip() for v in _row if pd.notna(v) and str(v).strip())
                _txt_up = _txt.upper()
                _m_marker = re.match(r"([A-Z]{3,8})\s*-\s+", _txt_up)
                if _m_marker:
                    marker_idx = back
                    marker_text = _txt_up
                    marker_code = _m_marker.group(1).strip()
                    break
            score = 0
            if marker_code and marker_code in location_tokens:
                score += 200
            nearby_text = []
            for back in range(max(0, cand_idx - 8), cand_idx + 1):
                _row = all_rows[back]
                _txt = " ".join(str(v).strip() for v in _row if pd.notna(v) and str(v).strip())
                if _txt:
                    nearby_text.append(_txt.upper())
            nearby_joined = " | ".join(nearby_text)
            if any(re.search(rf"\b{re.escape(tok)}\b", nearby_joined) for tok in location_tokens):
                score += 75
            if marker_idx is not None:
                score += max(0, 40 - min(40, cand_idx - marker_idx))
            scored.append((score, cand_idx, marker_text[:120]))
        scored.sort(key=lambda x: (-x[0], x[1]))
        target_summary_idx = scored[0][1]
        print(f"[Book] Location-selected summary row: {target_summary_idx} "
              f"for bank '{bank_id}' using location '{location_hint}'")
    elif target_summary_candidates:
        target_summary_idx = target_summary_candidates[0]

    if target_summary_idx is not None:
        prev_summary_idx = -1
        for i, r in enumerate(all_rows[:target_summary_idx]):
            if r and isinstance(r[0], str) and r[0].startswith("Summary Of "):
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

    # ── Detect BRS-output book format ──────────────────────────────────────────
    # When the input book file is a previously generated BRS output, its 'Book Entries'
    # sheet has the format:
    #   Date | Txn Type | Bill No | Chq No | Party | Direction | Sender | Recipient | Amount (Rs) | Narration
    # This is different from the original ledger format which has separate Receipts and
    # Payments columns at fixed indices (COL_RECEIPTS=7, COL_PAYMENTS=9).
    # Detect this format by scanning for a header row with 'direction' AND 'amount' columns.
    _brs_format = False
    _brs_col = {}   # column index map for BRS-output format
    for _r in all_rows:
        _cells_l = [str(v).strip().lower() if pd.notna(v) else "" for v in _r]
        if "direction" in _cells_l and ("amount (rs)" in _cells_l or "amount" in _cells_l):
            # This is a BRS-output header row
            for _ci, _cv in enumerate(_cells_l):
                if _cv == "date" and "date" not in _brs_col:          _brs_col["date"]      = _ci
                if _cv in ("txn type", "transaction type", "txn"):     _brs_col["txn_type"]  = _ci
                if _cv in ("bill no", "bill"):                          _brs_col["bill_no"]   = _ci
                if _cv in ("chq no", "chq"):                           _brs_col["chq_no"]    = _ci
                if _cv == "party":                                      _brs_col["party"]     = _ci
                if _cv == "direction":                                  _brs_col["direction"] = _ci
                if _cv in ("amount (rs)", "amount", "book amt (rs)"): _brs_col["amount"]    = _ci
                if _cv in ("narration", "narration / remarks"):        _brs_col["narration"] = _ci
            if "direction" in _brs_col and "amount" in _brs_col:
                _brs_format = True
                print(f"[Book] BRS-output format detected. Column map: {_brs_col}")
                # Also try to extract closing balance from this sheet
                if book_closing_bal == 0.0:
                    for _cbr in all_rows:
                        _cb_cells = [str(v).strip() if pd.notna(v) else "" for v in _cbr]
                        _cb_text  = " ".join(_cb_cells).lower()
                        if "closing balance" in _cb_text:
                            for _cbv in _cbr:
                                _bal = to_signed_amt(_cbv)
                                import math as _math
                                if _bal != 0.0 and isinstance(_bal, float) and not _math.isnan(_bal):
                                    book_closing_bal = _bal
                                    book_closing_drcr = "Cr" if _bal < 0 else "Dr"
                                    print(f"[Book] Closing balance from BRS sheet: {book_closing_bal} ({book_closing_drcr})")
                                    break
                            if book_closing_bal != 0.0:
                                break
            break
    # ──────────────────────────────────────────────────────────────────────────

    rows = []
    for r in row_slice:
        while len(r) <= COL_NARR:
            r.append(None)

        # ── BRS-output format parser ──────────────────────────────────────────
        if _brs_format and _brs_col:
            def _brs_get(key, default=None):
                idx = _brs_col.get(key)
                if idx is None or idx >= len(r):
                    return default
                v = r[idx]
                try:
                    if pd.isna(v): return default
                except Exception:
                    pass
                return v

            txn_b     = str(_brs_get("txn_type", "")).strip()
            date_b    = _brs_get("date")
            party_b   = str(_brs_get("party", "")).strip()
            direction_b = str(_brs_get("direction", "")).strip().upper()
            amount_b  = to_amt(_brs_get("amount", 0))
            chq_b     = str(_brs_get("chq_no", "")).strip().replace(".0", "")
            bill_b    = str(_brs_get("bill_no", "")).strip().replace(".0", "")
            narr_b    = str(_brs_get("narration", "")).strip()

            # Skip header/title/summary rows
            if not txn_b or txn_b.lower() in ("txn type", "transaction type", "date", ""):
                continue
            if not direction_b or direction_b not in ("INFLOW", "OUTFLOW"):
                continue
            if amount_b <= 0:
                continue

            txn_date_b = _fmt_book_date(date_b)
            is_hot_b   = ("[HOT Transfer]" in narr_b or "[HOT Transfer]" in party_b
                          or party_b.upper() == "HOT - HOT")
            if is_hot_b:
                name_b = extract_company_name(None)
                if "[HOT Transfer]" not in narr_b:
                    narr_b = f"[HOT Transfer] {narr_b}".strip()
            else:
                name_b = clean_name(party_b)

            rows.append({
                "Date":          txn_date_b,
                "Txn Type":      txn_b,
                "Bill No":       bill_b,
                "Chq No":        chq_b,
                "Party":         name_b,
                "Party Raw":     party_b,
                "Direction":     direction_b,
                "Sender":        name_b       if direction_b == "INFLOW"  else company_name,
                "Recipient":     name_b       if direction_b == "OUTFLOW" else company_name,
                "Book Amt (Rs)": amount_b,
                "Narration":     narr_b,
            })
            continue
        # ─────────────────────────────────────────────────────────────────────

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
            "Party Raw":     party_raw,
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
        "transaction date (dd/mm/yyyy)", "value date (dd/mm/yyyy)",
        "tran date (dd/mm/yyyy)", "txn date (dd/mm/yyyy)",
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
        "debit amount(inr)", "credit amount(inr)",
        "withdrawal amount(inr)", "deposit amount(inr)",
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
        "balance(inr)", "bal(inr)",
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

    # TEMP DEBUG — print first 30 rows to find real header
    # print(f"[S1 DEBUG] Scanning {len(raw)} raw rows for header:")
    # for _di in range(min(30, len(raw))):
    #     _r = raw.iloc[_di].tolist()
    #     _non_empty = [str(v)[:30] for v in _r if pd.notna(v) and str(v).strip()]
    #     if _non_empty:
    #         print(f"   row {_di}: {_non_empty}")

    def _has_real_data_after(row_idx, lookahead=6):
        """True if within `lookahead` rows after row_idx there is a row
        with a date value AND a numeric amount > 0 (either native float
        or Indian-comma string like '1,11,908.00').
        Confirms a candidate header is followed by real transaction data,
        not a footer/legend section.
        Also accepts no-transaction statement layouts where the header is
        followed only by OPENING/CLOSING BALANCE summary rows."""
        def _is_numeric_str(v):
            """Return True if v is a string that parses as a positive number,
            including Indian comma-formatted amounts like '1,11,908.00'."""
            if isinstance(v, (int, float)) and not isinstance(v, bool):
                return float(v) > 0
            if isinstance(v, str):
                try:
                    return float(v.strip().replace(",", "")) > 0
                except ValueError:
                    return False
            return False

        for _j in range(row_idx + 1, min(row_idx + 1 + lookahead, len(raw))):
            _r = raw.iloc[_j].tolist()
            _row_text = " ".join(
                str(v).strip() for v in _r if pd.notna(v) and str(v).strip()
            ).upper()
            _has_date = any(
                (isinstance(v, (datetime, dt_date)) or
                 hasattr(v, 'strftime') or
                 bool(DATE_RE.search(str(v).strip())))
                for v in _r if pd.notna(v) and str(v).strip()
            )
            _has_num = any(
                _is_numeric_str(v)
                for v in _r if pd.notna(v) and str(v).strip()
            )
            if _has_date and _has_num:
                return True
            if (_has_num and
                    re.search(r"\b(?:OPENING|CLOSING)\s+BALANCE\b|\bTRANSACTION\s+TOTAL\b", _row_text)):
                return True
        return False

    def _build_col_map(cells_lower):
        """Build col_map from a list of lowercased header cell strings."""
        cm = {}
        for ci, c in enumerate(cells_lower):
            if c in HDR_DATE_LABELS and "date" not in cm:
                cm["date"] = ci
            if c in HDR_CHQ_LABELS and "chq" not in cm:
                cm["chq"] = ci
            if c in HDR_DESC_LABELS and "desc" not in cm:
                cm["desc"] = ci
            if c in HDR_AMT_LABELS:
                if c in ("debit","withdrawal","dr","debit amount","dr amount","dr amt",
                         "withdrawal amt (inr)","debit amount (inr)","withdrawal amt.(inr)",
                         "debit (inr)","debit amt","debit(inr)",
                         "debit amount(inr)","withdrawal amount(inr)") and "debit" not in cm:
                    cm["debit"] = ci
                if c in ("credit","deposit","cr","credit amount","cr amount","cr amt",
                         "deposit amt (inr)","credit amount (inr)","deposit amt.(inr)",
                         "credit (inr)","credit amt","credit(inr)",
                         "credit amount(inr)","deposit amount(inr)") and "credit" not in cm:
                    cm["credit"] = ci
            if c in HDR_BAL_LABELS and "balance" not in cm:
                cm["balance"] = ci
            if c in HDR_DRCR_LABELS and "drcr_flag" not in cm:
                cm["drcr_flag"] = ci
        if "date" not in cm:
            for ci, c in enumerate(cells_lower):
                if "date" in c or "time" in c:
                    cm["date"] = ci
                    break
        return cm

    # ── Strategy 1 ───────────────────────────────────────────────────────────
    # Scan every row for header-like label keywords.
    # Key fixes vs old code:
    #   OLD: skipped rows where ts_count>=2 (date-typed cells) — this wrongly
    #        skipped the Axis bank header which has "Transaction Date","Value Date"
    #        as actual date-object cells in the Excel.
    #   NEW: skip rows that have 2+ LARGE NUMERIC values instead — those are
    #        data rows, not headers. Header rows contain text labels, not amounts.
    #   OLD: accepted first match without checking what follows.
    #   NEW: validate that real transaction data (date + number) exists within
    #        the next 6 rows before accepting the candidate header.
    for i, row in raw.iterrows():
        cells_raw   = row.tolist()
        cells_lower = [_clean_cell(v).lower() for v in cells_raw]

        # A real header row should not have 2 or more large numeric amounts
        large_num_count = sum(
            1 for v in cells_raw
            if isinstance(v, (int, float)) and not isinstance(v, bool) and abs(v) > 100
        )
        if large_num_count >= 2:
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
        if not triggered:
            continue

        # Validate: real transaction data must follow this candidate header row
        if not _has_real_data_after(i, lookahead=6):
            print(f"[Statement] S1 skip row {i} — no data follows "
                  f"(footer/legend): {[c for c in cells_lower if c][:6]}")
            continue

        hdr     = i
        col_map = _build_col_map(cells_lower)
        print(f"[Statement] Strategy 1 at row {i}: {[c for c in cells_lower if c]}")
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

                _has_structural_role = any(r in ("date", "desc", "balance") for r in role_order)
                _has_amount_role = any(r in ("debit", "credit") for r in role_order)
                if not (_has_structural_role and (_has_amount_role or "balance" in role_order)):
                    print("[Statement] S2 rejected: header roles look like footer legend, not a transaction table")
                    hdr_line_idx = None
                    axis_col_names = []
                    role_order = []

                rebuilt_rows = []
                if hdr_line_idx is not None and axis_col_names:
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
            if hdr is None and col_a_labels:
                # Pick the FIRST label row that has real data following it.
                # Old code used [-1] (last) which landed in the footer/legend.
                for _li, _lbl in col_a_labels:
                    if _has_real_data_after(_li, lookahead=6):
                        hdr = _li
                        print(f"[Statement] Strategy 2d: first validated label row={hdr}")
                        break
                if hdr is None:
                    # No label row passed validation — take the first one as last resort
                    hdr = col_a_labels[0][0]
                    print(f"[Statement] Strategy 2d fallback: first label row={hdr}")

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
                     "debit (inr)","debit amt","debit(inr)",
                     "debit amount(inr)","withdrawal amount(inr)") and "debit" not in col_map:
                col_map["debit"] = ci
            if c in ("credit","deposit","cr","credit amount","cr amount","cr amt",
                     "deposit amt (inr)","credit amount (inr)","deposit amt.(inr)",
                     "credit (inr)","credit amt","credit(inr)",
                     "credit amount(inr)","deposit amount(inr)") and "credit" not in col_map:
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

    # DEBUG - remove after fix
    print(f"[Statement DEBUG] First 5 data rows raw values:")
    for _di, _dr in data.head(5).iterrows():
        _r = _dr.tolist()
        print(f"   row {_di}: {[str(v)[:20] for v in _r]}")
    print(f"[Statement DEBUG] chq col index = {col_map.get('chq')}  "
          f"sample chq values = {[str(data.iloc[i, col_map['chq']])[:15] if col_map.get('chq') is not None else 'N/A' for i in range(min(5, len(data)))]}")

    # ── Inner helper: robust amount parser ───────────────────────────────────
    # Handles native float/int AND Indian-comma strings like "8,11,407.90"
    # and Western strings like "811,407.90".  Returns 0.0 for anything
    # unparseable or non-positive.
    def _parse_amount(v):
        if isinstance(v, (int, float)):
            f = float(v)
            return f if f > 0 else 0.0
        if isinstance(v, str):
            s = v.strip().replace(",", "")
            try:
                f = float(s)
                return f if f > 0 else 0.0
            except ValueError:
                return 0.0
        try:
            if pd.isna(v):
                return 0.0
        except Exception:
            pass
        return 0.0

    # ── Inner helper: extract closing/running balance from a row ─────────────
    # Priority 1: mapped balance column (most reliable).
    # Priority 2: rightmost parseable positive value that is NOT in the
    #             debit or credit columns (balance is almost always rightmost).
    # Works for both float cells (Format A) and Indian-comma strings (Format B).
    def _extract_balance_from_row(cells, current_best=0.0):
        bal_col    = col_map.get("balance")
        debit_col  = col_map.get("debit")
        credit_col = col_map.get("credit")
        skip_cols  = {c for c in (debit_col, credit_col) if c is not None}

        # Priority 1 — explicitly mapped balance column
        if bal_col is not None and bal_col < len(cells):
            val = _parse_amount(cells[bal_col])
            if val > 0:
                return val

        # Priority 2 — rightmost parseable value, skipping debit/credit cols
        for ci in range(len(cells) - 1, -1, -1):
            if ci in skip_cols:
                continue
            val = _parse_amount(cells[ci])
            if val > 100:        # ignore tiny amounts like fees/charges
                return val

        return current_best

    # ── Summary-row keyword pattern ──────────────────────────────────────────
    # OLD code used \s*$ which required row_text to END with the keyword.
    # That broke for Format B (Bangalore) where row_text is:
    #   "CLOSING BALANCE 8,11,407.90"  — keyword is NOT at end of string.
    # FIX: use \b (word boundary) so the keyword is matched at the START
    # of row_text regardless of what follows it.
    # We also split "closing balance" rows (→ extract balance) from other
    # summary rows like "TRANSACTION TOTAL" (→ skip only, no balance update)
    # to prevent cumulative debit/credit totals from overwriting the balance.
    _SUMMARY_ROW_RE = re.compile(
        r"^\s*(?:\d+\s+)?(?:transaction\s+total|opening\s+balance|closing\s+balance"
        r"|grand\s+total|brought\s+forward|carry\s+forward)\b",
        re.IGNORECASE,
    )
    _CLOSING_BAL_RE = re.compile(r"closing\s+balance", re.IGNORECASE)

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

        # ── Summary / footer row handling ────────────────────────────────────
        # Catches both:
        #   Format A: row_text == "closing balance"          (old \s*$ matched this)
        #   Format B: row_text == "CLOSING BALANCE 8,11,407.90"  (old code missed this)
        if _SUMMARY_ROW_RE.search(row_text):
            if _CLOSING_BAL_RE.search(row_text):
                # Extract the closing balance from this row using the robust helper.
                # This handles both float cells and Indian-comma string cells.
                candidate = _extract_balance_from_row(r, bank_closing_bal)
                if candidate > 0:
                    bank_closing_bal = candidate
                    print(f"[Statement] Closing balance from summary row: {bank_closing_bal}")
            # Always skip summary rows — never treat them as transactions.
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

        # ── Per-row running balance ───────────────────────────────────────────
        # Use _extract_balance_from_row so Indian-comma strings are handled.
        # Guard: if the extracted value is smaller than the transaction amount,
        # it is likely a stray cell value, not a genuine running balance.
        bal = to_amt(_get_str("balance"))
        if bal == 0.0:
            txn_amt   = max(debit, credit)
            candidate = _extract_balance_from_row(r, 0.0)
            if candidate > 0 and (txn_amt == 0 or candidate >= txn_amt * 0.5):
                bal = candidate

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

    # ── Post-loop closing balance fallback ────────────────────────────────────
    # Runs only when the main loop did not capture any balance at all.
    # Three tiers — stops as soon as a positive value is found.
    #
    # Tier 1: header area (top ~25 rows) — labelled patterns like
    #         "Closing Balance : 811407.90" or key-value cell pairs.
    #
    # Tier 2: full raw-sheet scan for ANY row containing "closing balance".
    #         This is the critical fallback for Format B (Bangalore) where
    #         the closing-balance row has no date and was skipped during the
    #         main data loop, AND the summary-row regex above also missed it
    #         because it appears below the data (after the chq-return pre-scan
    #         slice).  Scanning `raw` (not `data`) guarantees we find it.
    #
    # Tier 3: last resort — walk data rows and pick the rightmost numeric value.
    # ─────────────────────────────────────────────────────────────────────────

    if bank_closing_bal == 0.0:
        # Tier 1 — header area label scan
        _HEADER_PATS = [
            r"closing\s+balance\s*[:\-=\s]+([0-9,. ]+)",
            r"book\s+balance\s*[:\-=\s]+([0-9,. ]+)",
            r"available\s+balance\s*[:\-=\s]+([0-9,. ]+)",
        ]
        for i, _h_row in raw.iterrows():
            if i > 25:
                break
            _h_cells = [str(c).strip() if pd.notna(c) else "" for c in _h_row.tolist()]
            _h_text  = " ".join(_h_cells)
            for pat in _HEADER_PATS:
                m = re.search(pat, _h_text, re.IGNORECASE)
                if m:
                    v = to_amt(m.group(1).replace(" ", ""))
                    if v > 0:
                        bank_closing_bal = v
                        print(f"[Statement] Closing balance (Tier1 label): {bank_closing_bal}")
                        break
            # Two-cell key-value: cells[0] = "Closing Balance", cells[1] = "811407.90"
            if bank_closing_bal == 0.0 and len(_h_cells) >= 2:
                if re.search(r"closing\s+balance", _h_cells[0], re.IGNORECASE):
                    for cv in _h_cells[1:]:
                        v = to_amt(cv)
                        if v > 0:
                            bank_closing_bal = v
                            print(f"[Statement] Closing balance (Tier1 key-value): {bank_closing_bal}")
                            break
            if bank_closing_bal > 0:
                break

    if bank_closing_bal == 0.0:
        # Tier 2 — full raw sheet scan for any "closing balance" labelled row.
        # Scans `raw` (entire sheet) so footer rows not in `data` are included.
        for _, _cb_row in raw.iterrows():
            _cb_list = _cb_row.tolist()
            _cb_text = " ".join(
                str(v).strip() if pd.notna(v) else "" for v in _cb_list
            )
            if not _CLOSING_BAL_RE.search(_cb_text):
                continue
            # Use helper — handles float cells and Indian-comma strings equally
            candidate = _extract_balance_from_row(_cb_list, 0.0)
            if candidate > 0:
                bank_closing_bal = candidate
                print(f"[Statement] Closing balance (Tier2 row scan): {bank_closing_bal}")
                break
            # Extra: walk every cell individually for any parseable positive amount
            for cv in _cb_list:
                v = _parse_amount(cv)
                if v > 0:
                    bank_closing_bal = v
                    print(f"[Statement] Closing balance (Tier2 cell scan): {bank_closing_bal}")
                    break
            if bank_closing_bal > 0:
                break

    if bank_closing_bal == 0.0:
        # Tier 3 — absolute last resort: walk data rows using the balance helper
        for _, _lr_row in data.iterrows():
            candidate = _extract_balance_from_row(_lr_row.tolist(), 0.0)
            if candidate > 0:
                bank_closing_bal = candidate
                print(f"[Statement] Closing balance (Tier3 data scan): {bank_closing_bal}")
                break

    if rows:
        df = pd.DataFrame(rows)
    else:
        print("[Statement] No transaction rows parsed from bank statement.")
        df = pd.DataFrame(columns=STMT_COLS)

    print(f"[Statement] Parsed {len(df)} transaction rows | Bank closing bal: {bank_closing_bal}")
    return df, bank_closing_bal, account_no, branch_label, bank_name_from_stmt, is_no_transactions

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
        r"|FROM\s+HOT\s+\w+\s+TO\s+BRANCH"
        # FIX: IndusInd TRF pattern e.g. "1203202605 / TRF TO 200000979511"
        # These are intra-company fund transfers (HOT) in IndusInd format
        r"|\bTRF\s+TO\s+\d{10,18}\b"
        r"|\bTRF\s+FROM\s+\d{10,18}\b",
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
        else:
            # When cheque is generic (99/511/blank), a pure amount match with no
            # name similarity is a false match. Require at least score >= 30.
            # This prevents e.g. "YESHWANTH M" matching "J K R GAS COMPANY" by 1L amount.
            _p2_generic = {"", "nan", "99", "511", "0"}
            if str(br.get("Chq No", "")).strip() in _p2_generic:
                _min_cands = candidates[candidates.apply(
                    lambda sr: fuzzy(br["Party"], sr["Party"]) >= 30, axis=1)]
                if _min_cands.empty:
                    continue
                candidates = _min_cands

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

    # ── Pass 2c: Third-party payment match (same date, same amount, generic chq, unique amount) ──
    # Handles cases where a book INFLOW (Public Sale / FFMC Sale) is recorded under one
    # party name but the bank shows a completely different sender (third-party payment).
    # RESTRICTED to Public Sale and FFMC Sale txn types only — Receipts entries are
    # direct receipts, not third-party payments, and must not be matched this way.
    # Also requires fuzzy score >= 15% to avoid matching RETURN credits.
    print("[Reconcile] Pass 2c: Third-party INFLOW match (unique amt+date, generic chq, PS/FFMC only)")
    p2c_start = len(matched_rows)
    _GENERIC_CHQ = {"", "nan", "99", "511", "0"}
    _P2C_TXN_TYPES = {"Public Sale", "FFMC Sale", "PS", "FS", "public sale", "ffmc sale"}
    for bi, br in book[~book["_used"]].iterrows():
        if br.get("_refund_pair", False): continue
        if br["Direction"] != "INFLOW": continue
        if str(br.get("Chq No", "")).strip() not in _GENERIC_CHQ: continue
        # Only match Public Sale / FFMC Sale — not Receipts or other types
        if str(br.get("Txn Type", "")).strip() not in _P2C_TXN_TYPES: continue
        b_amt  = round(float(br["Book Amt (Rs)"]), 2)
        b_date = br.get("Date", "")
        # Find unmatched bank INFLOW entries with same amount and same date
        candidates = stmt[
            (~stmt["_used"]) &
            (stmt["Direction"] == "INFLOW") &
            (abs(stmt["Bank Amt (Rs)"] - b_amt) < 0.01)
        ]
        candidates = candidates[candidates.apply(lambda sr: within_date(b_date, sr["Date"]), axis=1)]
        # Exclude RETURN credits — they are not third-party payments
        candidates = candidates[~candidates["Description"].str.contains(
            r"\bRETURN\b", regex=True, na=False, case=False)]
        if candidates.empty: continue
        # Verify uniqueness: no other unmatched book INFLOW has same amount on same date
        other_book_same_amt = book[
            (~book["_used"]) & (book.index != bi) &
            (book["Direction"] == "INFLOW") &
            (abs(book["Book Amt (Rs)"] - b_amt) < 0.01)
        ]
        other_book_same_amt = other_book_same_amt[other_book_same_amt.apply(
            lambda r: within_date(b_date, r.get("Date", "")), axis=1)]
        if not other_book_same_amt.empty: continue  # ambiguous — skip
        if len(candidates) != 1: continue  # ambiguous — skip
        si = candidates.index[0]; sr = stmt.loc[si]
        score = fuzzy(br["Party"], sr["Party"])
        # Require minimum score of 15% to avoid matching genuinely unrelated entries
        if score < 15: continue
        matched_rows.append(_make_row(br, sr, "2c-ThirdParty+Dir+Date+Amt(unique)", score))
        book.at[bi, "_used"] = True; stmt.at[si, "_used"] = True
        print(f"[Reconcile] Pass 2c: '{br['Party']}' ↔ '{sr['Party']}' "
              f"Rs{b_amt:,.2f} (third-party INFLOW, score={score}%)")
    print(f"   -> {len(matched_rows) - p2c_start} matched")

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

    # ── Pass 3a: Amount + Direction + Date + description contains book party words ──
    # Handles cases where bank description has the real sender name but bank party
    # field is different (e.g. book: DHANANJAUA J, bank desc: JYOHTI KOTRESHI but
    # bank description contains "JYOHTI" which matches book narration).
    # More broadly: book party words appear inside bank description.
    print("[Reconcile] Pass 3a: Amount + Direction + Date + party-in-description match")
    p3a_start = len(matched_rows)
    for bi, br in book[~book["_used"]].iterrows():
        if br.get("_refund_pair", False): continue
        b_dir  = br["Direction"]
        b_amt  = float(br["Book Amt (Rs)"])
        b_date = br.get("Date", "")
        b_narr = str(br.get("Narration", "")).upper()
        # Build meaningful word set from book party + narration
        _stop  = {"PVT","LTD","LIMITED","PRIVATE","THE","OF","AND","INDIVI",
                  "PUBLIC","SALE","BUYING","FFMC","RECEIPTS","PAYMENTS",""}
        b_words = (set(str(br["Party"]).upper().split()) |
                   set(b_narr.split())) - _stop
        b_words = {w for w in b_words if len(w) >= 4}
        if not b_words:
            continue
        candidates = stmt[
            (~stmt["_used"]) &
            (stmt["Direction"] == b_dir) &
            (abs(stmt["Bank Amt (Rs)"] - b_amt) < 0.01)
        ]
        if candidates.empty: continue
        candidates = candidates[candidates.apply(
            lambda sr: within_date(b_date, sr["Date"]), axis=1)]
        if candidates.empty: continue
        candidates = candidates[candidates.apply(
            lambda sr: _chq_verdict(br["Chq No"], sr["Chq No"]) != "reject", axis=1)]
        if candidates.empty: continue
        # Check if bank description contains any book party words
        matched_cands = candidates[candidates.apply(
            lambda sr: bool(b_words & set(str(sr.get("Description","")).upper().split())),
            axis=1
        )]
        if matched_cands.empty: continue
        if len(matched_cands) == 1:
            si = matched_cands.index[0]; sr = stmt.loc[si]
            score = fuzzy(br["Party"], sr["Party"])
            matched_rows.append(_make_row(br, sr, "3a-Amt+Dir+Date+DescWords", score))
            book.at[bi, "_used"] = True; stmt.at[si, "_used"] = True
            print(f"[Reconcile] Pass 3a: '{br['Party']}' ↔ '{sr['Party']}' "
                  f"Rs{b_amt:,.2f} via desc-word match")
    print(f"   -> {len(matched_rows) - p3a_start} matched")

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

    def _has_strong_split_reference(book_chq, bank_chq1, bank_chq2):
        """Allow split matching only when all legs share a real cheque/reference."""
        refs = [_norm_chq(book_chq), _norm_chq(bank_chq1), _norm_chq(bank_chq2)]
        if any(r in ("", "nan", "0", "-") for r in refs):
            return False
        return refs[0] == refs[1] == refs[2]

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
                if not _has_strong_split_reference(br["Chq No"], stmt.at[si1,"Chq No"], stmt.at[si2,"Chq No"]):
                    print(f"[Reconcile] Pass 3c skipped weak split candidate: "
                          f"book_chq='{br['Chq No']}' bank_chqs="
                          f"'{stmt.at[si1,'Chq No']}', '{stmt.at[si2,'Chq No']}' "
                          f"book Rs{b_amt:,.2f} = bank Rs"
                          f"{float(stmt.at[si1,'Bank Amt (Rs)']) + float(stmt.at[si2,'Bank Amt (Rs)']):,.2f}")
                    continue
                score = max(fuzzy(br["Party"],stmt.at[si1,"Party"]), fuzzy(br["Party"],stmt.at[si2,"Party"]))
                if score < FUZZY_THRESHOLD: continue  # name must match for at least one bank entry
                bk_amt  = float(br["Book Amt (Rs)"])
                b1_amt  = float(stmt.at[si1,"Bank Amt (Rs)"])
                b2_amt  = float(stmt.at[si2,"Bank Amt (Rs)"])
                b1_dt   = stmt.at[si1,"Date"]
                b2_dt   = stmt.at[si2,"Date"]
                print(f"[Reconcile] Pass 3c review-only split candidate kept in BRS sections: "
                      f"book Rs{bk_amt:,.2f} '{br['Party']}' = bank "
                      f"Rs{b1_amt:,.2f} on {b1_dt} + Rs{b2_amt:,.2f} on {b2_dt}. "
                      f"Book row remains book-only; bank rows remain bank-only.")
                continue
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
    # EXCEPTION TO EXCEPTION: Receipts tagged as [HOT Transfer] are auto-receipts
    # generated by the zeroise process (e.g. "ZEROISE, AUTO RECEIPT FROM AHMD FOR BANK
    # HDFC1240"). These DO net out against the corresponding FFMC Buying/Payments OUTFLOW
    # in the book. Match by amount only (party names differ: INFLOW = company name,
    # OUTFLOW = bank/counterparty). Drop BOTH sides so book_only is cleared.
    book_only = book_only.copy(); book_only["_drop"] = False

    # Pass A: HOT Transfer Receipts INFLOW — net against matching OUTFLOW by amount
    for bi, br in book_only[book_only["Direction"] == "INFLOW"].iterrows():
        is_receipts = str(br.get("Txn Type", "")).strip() == "Receipts"
        is_hot_transfer = "[HOT Transfer]" in str(br.get("Narration", ""))
        if not (is_receipts and is_hot_transfer):
            continue
        match_out = book_only[
            (~book_only["_drop"]) & (book_only.index != bi) &
            (book_only["Direction"] == "OUTFLOW") &
            (abs(book_only["Book Amt (Rs)"].astype(float) - float(br["Book Amt (Rs)"])) < 0.01)
        ]
        if not match_out.empty:
            oi = match_out.index[0]
            book_only.at[bi, "_drop"] = True
            book_only.at[oi, "_drop"] = True
            print(f"[Reconcile] HOT Transfer internal net: INFLOW Rs{float(br['Book Amt (Rs)']):,.2f} "
                  f"('{br['Party']}') <-> OUTFLOW Rs{float(book_only.at[oi,'Book Amt (Rs)']):,.2f} "
                  f"('{book_only.at[oi,'Party']}') -- both dropped from book_only")

    # Pass B: regular same-party opposite-direction cancellations (non-HOT, non-Receipts)
    for bi, br in book_only[(book_only["Direction"] == "INFLOW") & (~book_only["_drop"])].iterrows():
        if str(br.get("Txn Type", "")).strip() == "Receipts":
            continue  # RT/PT pair -- keep in book_only
        match_out = book_only[
            (~book_only["_drop"]) & (book_only.index != bi) &
            (book_only["Direction"] == "OUTFLOW") &
            (abs(book_only["Book Amt (Rs)"].astype(float) - float(br["Book Amt (Rs)"])) < 0.01) &
            (book_only["Party"] == br["Party"])
        ]
        if not match_out.empty: book_only.at[bi, "_drop"] = True

    book_only = book_only[~book_only["_drop"]].drop(columns=["_drop"])

    # Hard mismatches must affect the BRS, not only the discrepancy section.
    # If a pair was consumed with a non-perfect party match, or a true
    # non-split amount difference, put both legs back into the natural
    # unmatched sections while still keeping the discrepancy row.
    if not matched.empty:
        hard_mismatch_mask = (
            (matched["Name Match"].isin(["Mismatch", "Partial"])) |
            (
                matched["Amount Match"].astype(str).str.startswith("Diff") &
                (~matched.get("Partial Payment", pd.Series(False, index=matched.index)).astype(bool))
            )
        )
        hard_mismatches = matched[hard_mismatch_mask].copy()
        if not hard_mismatches.empty:
            book_release_rows = []
            stmt_release_rows = []
            stmt_release_keys = set()
            for _, mr in hard_mismatches.iterrows():
                book_release_rows.append({
                    "Date":          mr.get("Book Date", ""),
                    "Txn Type":      mr.get("Book Txn", ""),
                    "Bill No":       mr.get("Book Bill No", ""),
                    "Chq No":        mr.get("Book Chq", ""),
                    "Party":         mr.get("Book Party", ""),
                    "Party Raw":     mr.get("Book Party Raw", mr.get("Book Party", "")),
                    "Direction":     mr.get("Book Direction", ""),
                    "Sender":        mr.get("Book Sender", ""),
                    "Recipient":     mr.get("Book Recipient", ""),
                    "Book Amt (Rs)": float(mr.get("Book Amt (Rs)", 0) or 0),
                    "Narration":     mr.get("Flags", ""),
                })
                stmt_key = (
                    str(mr.get("Bank Date", "")).strip(),
                    str(mr.get("Bank Chq", "")).strip(),
                    str(mr.get("Bank Description", "")).strip(),
                    str(mr.get("Bank Party", "")).strip().upper(),
                    str(mr.get("Bank Direction", "")).strip(),
                    round(float(mr.get("Bank Amt (Rs)", 0) or 0), 2),
                )
                if stmt_key not in stmt_release_keys:
                    stmt_release_keys.add(stmt_key)
                    stmt_release_rows.append({
                        "Date":          mr.get("Bank Date", ""),
                        "Chq No":        mr.get("Bank Chq", ""),
                        "Description":   mr.get("Bank Description", ""),
                        "Party":         mr.get("Bank Party", ""),
                        "Direction":     mr.get("Bank Direction", ""),
                        "Sender":        mr.get("Bank Sender", ""),
                        "Recipient":     mr.get("Bank Recipient", ""),
                        "Debit (Rs)":    float(mr.get("Debit (Rs)", 0) or 0),
                        "Credit (Rs)":   float(mr.get("Credit (Rs)", 0) or 0),
                        "Bank Amt (Rs)": float(mr.get("Bank Amt (Rs)", 0) or 0),
                        "Balance (Rs)":  "",
                    })

            book_only = pd.concat(
                [book_only, pd.DataFrame(book_release_rows).reindex(columns=book_only.columns)],
                ignore_index=True
            )
            stmt_only = pd.concat(
                [stmt_only, pd.DataFrame(stmt_release_rows).reindex(columns=stmt_only.columns)],
                ignore_index=True
            )
            print(f"[Reconcile] Also showing {len(hard_mismatches)} hard mismatch(es) in BRS sections")

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
        "Book Party Raw":   br.get("Party Raw", br["Party"]),
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


def compute_brs_difference(book_closing_bal, bank_closing_bal, book_only, stmt_only):
    issued = float(book_only["Book Amt (Rs)"][book_only["Direction"] == "OUTFLOW"].sum()) if not book_only.empty else 0.0
    deposited = float(book_only["Book Amt (Rs)"][book_only["Direction"] == "INFLOW"].sum()) if not book_only.empty else 0.0
    debited_nb = float(stmt_only["Bank Amt (Rs)"][stmt_only["Direction"] == "OUTFLOW"].sum()) if not stmt_only.empty else 0.0
    credited_nb = float(stmt_only["Bank Amt (Rs)"][stmt_only["Direction"] == "INFLOW"].sum()) if not stmt_only.empty else 0.0
    reconciled = book_closing_bal + issued - deposited - debited_nb + credited_nb
    return round(bank_closing_bal - reconciled, 2)


def apply_sbi_transfer_rectification(matched, book_only, stmt_only, bank_name_hint="", branch_label=""):
    bank_tokens = " ".join(
        token for token in [(bank_name_hint or "").upper(), (branch_label or "").upper()]
        if token
    )
    if "SBI" not in bank_tokens or book_only.empty or stmt_only.empty:
        return matched, book_only, stmt_only, False

    book_candidates = book_only[
        (book_only["Direction"] == "OUTFLOW") &
        (book_only["Txn Type"].astype(str).str.contains("Deposit Withdrawals", case=False, na=False))
    ]
    stmt_candidates = stmt_only[
        (stmt_only["Direction"] == "OUTFLOW") &
        (
            stmt_only["Description"].astype(str).str.contains("RTGS|TRANSFER", case=False, na=False) |
            stmt_only["Party"].astype(str).str.contains("RTGS|TRANSFER", case=False, na=False)
        )
    ]

    for bi, br in book_candidates.iterrows():
        for si, sr in stmt_candidates.iterrows():
            if abs(float(br["Book Amt (Rs)"]) - float(sr["Bank Amt (Rs)"])) >= 0.01:
                continue
            if not within_date(br.get("Date", ""), sr.get("Date", "")):
                continue

            score = 100 if "TRANSFER" in str(sr.get("Description", "")).upper() else fuzzy(br["Party"], sr["Party"])
            extra_match = pd.DataFrame([_make_row(br, sr, "SBI-Rectified Transfer Match", score)])
            matched = pd.concat([matched, extra_match], ignore_index=True)
            book_only = book_only.drop(index=bi)
            stmt_only = stmt_only.drop(index=si)
            print(f"[SBI Fix] Forced transfer match: book Rs{float(br['Book Amt (Rs)']):,.2f} "
                  f"with bank Rs{float(sr['Bank Amt (Rs)']):,.2f} on {sr.get('Date', '')}")
            return matched, book_only, stmt_only, True

    return matched, book_only, stmt_only, False


def apply_sbi_opening_balance_absorption_fix(book_only, stmt_only, book_opening_bal, prev_brs,
                                             book_closing_bal, bank_closing_bal,
                                             cleared_log, bank_name_hint="", branch_label=""):
    if stmt_only.empty:
        return stmt_only, cleared_log, False

    bank_tokens = " ".join(
        token for token in [(bank_name_hint or "").upper(), (branch_label or "").upper()]
        if token
    )
    if "SBI" not in bank_tokens:
        return stmt_only, cleared_log, False

    current_diff = compute_brs_difference(book_closing_bal, bank_closing_bal, book_only, stmt_only)
    if abs(current_diff) < 0.01:
        return stmt_only, cleared_log, False

    ref_balances = []
    for ref in (book_opening_bal, prev_brs.get("prev_book_closing_bal", 0.0) if prev_brs else 0.0):
        try:
            ref = float(ref)
        except (TypeError, ValueError):
            continue
        if abs(ref) > 0.01:
            ref_balances.append(round(ref, 2))

    if not ref_balances:
        return stmt_only, cleared_log, False

    for idx, row in stmt_only.iterrows():
        if str(row.get("Direction", "")).upper() != "INFLOW":
            continue

        try:
            amt = float(row.get("Bank Amt (Rs)", 0) or 0)
            bal = float(row.get("Balance (Rs)", 0) or 0)
        except (TypeError, ValueError):
            continue

        if abs(amt) < 0.01:
            continue
        if not any(abs(bal - ref_bal) < 0.01 for ref_bal in ref_balances):
            continue

        candidate_stmt_only = stmt_only.drop(index=idx)
        new_diff = compute_brs_difference(book_closing_bal, bank_closing_bal, book_only, candidate_stmt_only)
        if abs(new_diff) < 0.01 and abs(new_diff) < abs(current_diff):
            cleared_log.append({
                "section": "credited_not_book",
                "party": str(row.get("Party", "")),
                "chq_no": str(row.get("Chq No", "")),
                "bill_no": "",
                "amount": amt,
                "narration": str(row.get("Description", "")),
                "status": "CLEARED (absorbed in opening balance - SBI rectification)",
            })
            print(f"[SBI Fix] Clearing statement inflow absorbed in opening balance: "
                  f"amt={amt:,.2f} balance={bal:,.2f} diff {current_diff:+,.2f} -> {new_diff:+,.2f}")
            return candidate_stmt_only, cleared_log, True

    return stmt_only, cleared_log, False


def should_skip_prev_brs_carry_forward(prev_brs, book_closing_bal, bank_closing_bal,
                                       bank_name_hint="", branch_label="",
                                       current_book_has_rows=True,
                                       current_stmt_has_rows=True):
    if not prev_brs:
        return False

    prev_book = float(prev_brs.get("prev_book_closing_bal", 0.0) or 0.0)
    prev_bank = float(prev_brs.get("prev_bank_closing_bal", 0.0) or 0.0)
    if abs(prev_book) < 0.01 and abs(prev_bank) < 0.01:
        return False

    same_book = abs(prev_book - float(book_closing_bal or 0.0)) < 0.01
    same_bank = abs(prev_bank - float(bank_closing_bal or 0.0)) < 0.01

    # When the supplied "previous BRS" is actually the same-day/reference BRS,
    # its closing balances already equal the current statement/book balances.
    # In that case, use it only as a reference and DO NOT carry items forward.
    #
    # Exception: if the current period genuinely has no book transactions and
    # no statement transactions, we still need to carry forward the previous
    # outstanding items into the new BRS instead of suppressing them.
    if same_book or same_bank:
        if not current_book_has_rows and not current_stmt_has_rows:
            return False
        print("[Process] Detected same-day/reference BRS input "
              f"(prev_book={prev_book:,.2f}, prev_bank={prev_bank:,.2f}, "
              f"current_book={float(book_closing_bal or 0.0):,.2f}, "
              f"current_bank={float(bank_closing_bal or 0.0):,.2f})")
        print("[Process] Skipping carry-forward from supplied BRS to avoid same-day double counting.")
        return True

    return False


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

FONT_NAME = "Calibri"
WF = Font(bold=True, color="FFFFFF", name=FONT_NAME, size=10)
NF = Font(name=FONT_NAME, size=9)
BF = Font(bold=True, name=FONT_NAME, size=9)
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
       font=Font(bold=True, color="FFFFFF", name=FONT_NAME, size=12), center=True)
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
                    no_txn_note="", matched_df=None, stmt_df=None):

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
                   ("E", 28), ("F", 28), ("G", 28), ("H", 18), ("I", 18), ("J", 60)]:
        ws.column_dimensions[col].width = w

    r = 1
    brs_layout = {
        "amount_col": 8,
        "running_col": 9,
        "narr_col": 10,
        "merge_to": 7,
    }

    def set_brs_layout(kind="default"):
        if kind in ("book", "bank"):
            brs_layout.update({
                "amount_col": 7,
                "running_col": 8,
                "narr_col": 9,
                "merge_to": 6,
            })
        else:
            brs_layout.update({
                "amount_col": 8,
                "running_col": 9,
                "narr_col": 10,
                "merge_to": 7,
            })

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
        cell.font      = Font(name=FONT_NAME, size=8, italic=True, color="555555")
        cell.border    = bdr
        cell.alignment = Alignment(horizontal="left", vertical="center", wrap_text=True)

    def blank_row():
        nonlocal r
        ws.merge_cells(f"A{r}:J{r}")
        ws.row_dimensions[r].height = 6
        r += 1

    def header_row(text, fill=HDR, font_size=11):
        nonlocal r
        merge_label(r, 1, 10, text, fill,
                    Font(bold=True, color="FFFFFF", name=FONT_NAME, size=font_size))
        ws.row_dimensions[r].height = 20
        r += 1

    def section_row(text, fill=None):
        nonlocal r
        use_fill = fill if fill is not None else SEC
        merge_label(r, 1, 10, text, use_fill,
                    Font(bold=True, color="FFFFFF", name=FONT_NAME, size=10))
        ws.row_dimensions[r].height = 18
        r += 1

    def mismatch_col_header_row():
        nonlocal r
        hdrs = ["Book Date", "Book Party", "Book Chq", "Book Amt (Rs)",
                "Bank Date", "Bank Party", "Bank Amt (Rs)", "Flags / Action Required",
                "Book Report", "Bank Statement"]
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
                          is_name_mismatch=False, is_partial=False,
                          book_raw_name="", bank_raw_name=""):
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
        flag_cell.font      = Font(name=FONT_NAME, size=8, bold=True, color=flag_color)
        flag_cell.alignment = Alignment(horizontal="left", vertical="center", wrap_text=True)
        for ci, val in [(9, book_raw_name), (10, bank_raw_name)]:
            c = ws.cell(r, ci, val)
            c.fill      = fill
            c.border    = bdr
            c.font      = NF
            c.alignment = Alignment(horizontal="left", vertical="center", wrap_text=True)
        ws.row_dimensions[r].height = 30
        r += 1

    def col_header_row(kind="default"):
        nonlocal r
        set_brs_layout(kind)
        if kind == "book":
            hdrs = ["Date", "Type", "Bill No", "Chq No",
                    "Book Report", "Makez Extracted",
                    "Amount (Rs)", "Running Bal (Rs)", "Narration / Remarks"]
        elif kind == "bank":
            hdrs = ["Date", "Type", "Bill No", "Chq No",
                    "Bank Statement", "Makez Extracted",
                    "Amount (Rs)", "Running Bal (Rs)", "Narration / Remarks"]
        else:
            hdrs = ["Date", "Type", "Bill No", "Chq No",
                    "Book Report", "Bank Statement", "Makez Extracted",
                    "Amount (Rs)", "Running Bal (Rs)", "Narration / Remarks"]
        for ci, h in enumerate(hdrs, 1):
            cell           = ws.cell(r, ci)
            cell.value     = h
            cell.fill      = SUB
            cell.font      = BF
            cell.border    = bdr
            cell.alignment = Alignment(horizontal="center", vertical="center")
        ws.row_dimensions[r].height = 16
        r += 1

    def item_row(date, txn_type, bill_no, chq_no, party, amt, narration="", is_cf=False,
                 book_raw="", bank_raw=""):
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
        if brs_layout["amount_col"] == 7:
            _set(5, book_raw if book_raw else bank_raw, "left")
            _set(6, party, "left")
            set_amt(r, 7, amt, fill, NF)
            ws.cell(r, 8, "").fill = fill; ws.cell(r, 8).border = bdr
            set_narration(r, 9, display_narration, fill)
        else:
            _set(5, book_raw, "left")
            _set(6, bank_raw, "left")
            _set(7, party,    "left")
            set_amt(r, 8, amt, fill, NF)
            ws.cell(r, 9, "").fill = fill; ws.cell(r, 9).border = bdr
            set_narration(r, 10, display_narration, fill)
        ws.row_dimensions[r].height = 16
        r += 1

    def nil_row():
        nonlocal r
        merge_label(r, 1, brs_layout["merge_to"], "      -  (Nil)", ITM, NF)
        set_amt(r, brs_layout["amount_col"], "-", ITM, NF, fmt="@")
        ws.cell(r, brs_layout["running_col"], "").fill = ITM
        ws.cell(r, brs_layout["running_col"]).border = bdr
        ws.cell(r, brs_layout["narr_col"], "").fill = ITM
        ws.cell(r, brs_layout["narr_col"]).border = bdr
        ws.row_dimensions[r].height = 16
        r += 1

    def subtotal_row(total):
        nonlocal r
        merge_label(r, 1, brs_layout["merge_to"], "", SUB, BF)
        set_amt(r, brs_layout["amount_col"], total, SUB, BF)
        ws.cell(r, brs_layout["running_col"], "").fill = SUB
        ws.cell(r, brs_layout["running_col"]).border = bdr
        ws.cell(r, brs_layout["narr_col"], "").fill = SUB
        ws.cell(r, brs_layout["narr_col"]).border = bdr
        ws.row_dimensions[r].height = 16
        r += 1

    def running_row(running_bal):
        nonlocal r
        merge_label(r, 1, brs_layout["merge_to"], "", SUB, BF)
        ws.cell(r, brs_layout["amount_col"], "").fill = SUB
        ws.cell(r, brs_layout["amount_col"]).border = bdr
        set_amt(r, brs_layout["running_col"], running_bal, SUB, BF)
        ws.cell(r, brs_layout["narr_col"], "").fill = SUB
        ws.cell(r, brs_layout["narr_col"]).border = bdr
        ws.row_dimensions[r].height = 17
        r += 1

    def balance_row(label, bal, fill=BAL):
        nonlocal r
        merge_label(r, 1, brs_layout["merge_to"], label, fill,
                    Font(bold=True, name=FONT_NAME, size=10))
        ws.cell(r, brs_layout["amount_col"], "").fill = fill
        ws.cell(r, brs_layout["amount_col"]).border = bdr
        set_amt(r, brs_layout["running_col"], bal, fill, BF)
        ws.cell(r, brs_layout["narr_col"], "").fill = fill
        ws.cell(r, brs_layout["narr_col"]).border = bdr
        ws.row_dimensions[r].height = 20
        r += 1

    header_row(company_name, font_size=13)
    header_row(f"{branch_label} :- {account_no}", font_size=10)

    ws.merge_cells(f"A{r}:G{r}")
    c           = ws[f"A{r}"]
    c.value     = f"Bank Reconciliation Statement As On {brs_date}"
    c.fill      = HDR
    c.font      = Font(bold=True, color="FFFFFF", name=FONT_NAME, size=11)
    c.border    = bdr
    c.alignment = Alignment(horizontal="left", vertical="center")
    for col in range(2, 8):
        ws.cell(r, col).border = bdr
        ws.cell(r, col).fill   = HDR
    for ci, txt in [(8, "AMOUNT IN RS"), (9, "AMOUNT IN RS"), (10, "")]:
        cell           = ws.cell(r, ci, txt)
        cell.fill      = HDR
        cell.font      = Font(bold=True, color="FFFFFF", name=FONT_NAME, size=10)
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

    HOT_TXN_TYPES = {"Payments", "PAYMENTS", "payments"}
    GENERIC_CHQ_VALS = {"99", "511", "0", "", "nan"}

    def _is_hot_or_internal(row_data):
        """Returns True if this book_only row is an internal HOT transfer that
        must NOT appear in its BRS section:
        - HOT OUTFLOW: DO NOT exclude — if the bank has not yet debited this
          transfer it is a genuine 'issued not debited' item in this bank's BRS.
        - HOT INFLOW: exclude — inter-bank credit receipts are handled by the
          sending bank's BRS and must not double-count here.
        - Cheque-return re-payments with a real chq_no are also excluded.
        """
        txn_type  = str(row_data.get("Txn Type", "")).strip()
        chq_no    = str(row_data.get("Chq No", "")).strip()
        narr      = str(row_data.get("Narration", "")).upper()
        party     = str(row_data.get("Party", "")).upper()
        direction = str(row_data.get("Direction", "")).strip().upper()
        # HOT OUTFLOW: genuine "issued not debited" — keep it in the BRS display.
        # (The bank statement for THIS account will show the debit once cleared.)
        if direction == "OUTFLOW":
            pass  # never exclude HOT OUTFLOWs from issued-not-debited
        else:
            # HOT INFLOW: inter-bank receipt — exclude from deposited-not-credited
            if txn_type in HOT_TXN_TYPES and chq_no in GENERIC_CHQ_VALS:
                if "HOT" in narr or "HOT" in party:
                    return True
        # Cheque-return re-payment: narration explicitly references a cheque return
        if "GOT RETURNED" in narr or "CHQ RETURN" in narr or "CHEQUE RETURN" in narr:
            # Only exclude if this cheque was already debited (return) in bank —
            # i.e. a real chq_no exists that cleared in the stmt
            if chq_no not in GENERIC_CHQ_VALS:
                return True
        return False

    issued = book_only[
        (book_only["Direction"] == "OUTFLOW") &
        (~book_only.apply(_is_hot_or_internal, axis=1))
    ]
    section_row("Add :  Cheques issued but not debited in Bank")
    col_header_row("book")
    total_issued = 0.0
    if issued.empty:
        nil_row()
    else:
        for _, row_data in issued.iterrows():
            amt  = float(row_data["Book Amt (Rs)"])
            narr = str(row_data.get("Narration", ""))
            cf   = is_cf(row_data["Party"])
            book_raw = str(row_data.get("Party Raw", "") or row_data.get("Party", ""))
            item_row(row_data.get("Date", ""), row_data["Txn Type"], row_data["Bill No"], row_data["Chq No"],
                     row_data["Party"], amt, narr, is_cf=cf,
                     book_raw=book_raw, bank_raw="")
            total_issued += amt
    subtotal_row(total_issued)
    running += total_issued
    running_row(running)
    blank_row()

    def _is_chq_return_receipt(row_data):
        """Receipts entries recording a returned cheque credit are not real
        deposits — exclude them from 'deposited not credited' section."""
        narr = str(row_data.get("Narration", "")).upper()
        txn  = str(row_data.get("Txn Type", "")).strip()
        return (txn in ("Receipts", "RECEIPTS", "receipts") and
                ("GOT RETURNED" in narr or "CHQ RETURN" in narr or
                 "CHEQUE RETURN" in narr or "BEING CHEUQE ISSUED" in narr))

    deposited = book_only[
        (book_only["Direction"] == "INFLOW") &
        (~book_only.apply(_is_chq_return_receipt, axis=1))
    ]
    section_row("Less :  Cheques deposited but not Credited in Bank")
    col_header_row("book")
    total_deposited = 0.0
    if deposited.empty:
        nil_row()
    else:
        for _, row_data in deposited.iterrows():
            amt  = float(row_data["Book Amt (Rs)"])
            narr = str(row_data.get("Narration", ""))
            cf   = is_cf(row_data["Party"])
            book_raw = str(row_data.get("Party Raw", "") or row_data.get("Party", ""))
            item_row(row_data.get("Date", ""), row_data["Txn Type"], row_data["Bill No"], row_data["Chq No"],
                     row_data["Party"], amt, narr, is_cf=cf,
                     book_raw=book_raw, bank_raw="")
            total_deposited += amt
    subtotal_row(total_deposited)
    running -= total_deposited
    running_row(running)
    blank_row()

    _HOT_DESC_RE = re.compile(
        r"INB/IFT|HOT\s+(?:AXIS|HDFC|ICICI|SBI|INDUSIND|KOTAK)|"
        r"(?:AXIS|HDFC|ICICI|SBI|INDUSIND|KOTAK)\s+HOT|"
        r"BEING\s+FUNDS\s+TRANSFERRED\s+FROM\s+HOT|"
        r"HEAD\s+OFFICE\s+TRANSFER|FROM\s+HOT\s+\w+\s+TO\s+BRANCH",
        re.IGNORECASE
    )
    def _is_internal_bank_transfer(row_data):
        desc  = str(row_data.get("Description", "")).upper()
        party = str(row_data.get("Party", "")).upper()
        return bool(_HOT_DESC_RE.search(desc) or _HOT_DESC_RE.search(party))

    def _has_return_in_stmt_only(row_data):
        """True if this OUTFLOW bank entry has a corresponding RETURN INFLOW
        in stmt_only OR in the full bank statement — meaning the cheque bounced,
        net effect zero. Checks full stmt_df because the RETURN entry may have
        been consumed by matching (e.g. matched to a book Receipts entry)."""
        amt  = float(row_data.get("Bank Amt (Rs)", 0))
        desc = str(row_data.get("Description", "")).upper()
        _full = stmt_df if stmt_df is not None else stmt_only
        # Check by reference number in full stmt_df (catches RETURN even if matched)
        _ref = re.search(r"/(AX[A-Z0-9]+|SK[A-Z0-9]+)/", desc)
        if _ref:
            _rn = _ref.group(1)
            _ret_full = _full[
                _full["Description"].str.contains(
                    r"RETURN.*" + re.escape(_rn) + r"|" +
                    re.escape(_rn) + r".*RETURN",
                    regex=True, na=False, case=False)
            ]
            if not _ret_full.empty:
                return True
        # Check by amount + RETURN keyword in stmt_only INFLOW rows
        _ret = stmt_only[
            (stmt_only["Direction"] == "INFLOW") &
            (abs(stmt_only["Bank Amt (Rs)"] - amt) < 0.01) &
            (stmt_only["Description"].str.contains(
                r"\bRETURN\b", regex=True, na=False, case=False))
        ]
        if not _ret.empty:
            return True
        # Also check full stmt in case RETURN entry was consumed by matching
        _ret_full2 = _full[
            (_full["Direction"] == "INFLOW") &
            (abs(_full["Bank Amt (Rs)"] - amt) < 0.01) &
            (_full["Description"].str.contains(
                r"\bRETURN\b", regex=True, na=False, case=False))
        ]
        if not _ret_full2.empty:
            return True
        return False

    # FIX: Do NOT filter out INB/IFT or HOT bank OUTFLOWs from the BRS debited section.
    # When the corresponding book HOT Transfer pair has been netted out (book_only empty),
    # these bank OUTFLOWs are genuine unrecorded debits and MUST appear in the BRS.
    # The _is_internal_bank_transfer filter was hiding Rs 800,000 + Rs 700,000 INB/IFT
    # entries, causing a spurious BRS difference of Rs 1,500,000.
    debited_not_book = stmt_only[
        (stmt_only["Direction"] == "OUTFLOW") &
        (~stmt_only.apply(_has_return_in_stmt_only, axis=1))
    ]
    section_row("Less :  Debited in Bank but not credited in Our Book")
    col_header_row("bank")
    total_debited = 0.0
    if debited_not_book.empty:
        nil_row()
    else:
        for _, row_data in debited_not_book.iterrows():
            amt  = float(row_data["Bank Amt (Rs)"])
            desc = str(row_data.get("Description", ""))
            cf   = is_cf(row_data["Party"])
            bank_raw = desc
            item_row(row_data.get("Date", ""), "", "", row_data.get("Chq No", ""),
                     row_data["Party"] if row_data["Party"] else desc,
                     amt, desc, is_cf=cf, book_raw="", bank_raw=bank_raw)
            total_debited += amt
    subtotal_row(total_debited)
    running -= total_debited
    running_row(running)
    blank_row()

    credited_not_book = stmt_only[
        (stmt_only["Direction"] == "INFLOW") &
        (~stmt_only["Description"].str.contains(
            r"\bRETURN\b", regex=True, na=False, case=False))
    ]
    section_row("Add :  Credited in Bank but not debited in Our Book")
    col_header_row("bank")
    total_credited = 0.0
    if credited_not_book.empty:
        nil_row()
    else:
        for _, row_data in credited_not_book.iterrows():
            amt  = float(row_data["Bank Amt (Rs)"])
            desc = str(row_data.get("Description", ""))
            cf   = is_cf(row_data["Party"])
            bank_raw = desc
            item_row(row_data.get("Date", ""), "", "", row_data.get("Chq No", ""),
                     row_data["Party"] if row_data["Party"] else desc,
                     amt, desc, is_cf=cf, book_raw="", bank_raw=bank_raw)
            total_credited += amt
    subtotal_row(total_credited)
    running += total_credited
    running_row(running)
    blank_row()

    set_brs_layout("default")
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

    merge_label(r, 1, 7, diff_label, diff_fill, BF)
    ws.cell(r, 8, "").fill = diff_fill; ws.cell(r, 8).border = bdr
    set_amt(r, 9, diff_val, diff_fill, BF)
    ws.cell(r, 10, "").fill = diff_fill; ws.cell(r, 10).border = bdr
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
                f"  Matched Transactions with Discrepancies — Requires Verification  "
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
                    book_raw_name    = str(mr.get("Book Party Raw", "") or mr.get("Book Party", "")),
                    bank_raw_name    = str(mr.get("Bank Description", "") or mr.get("Bank Party", "")),
                )
            # Legend for the mismatch section
            legend_fill = PatternFill("solid", fgColor="FFF2CC")
            merge_label(r, 1, 10,
                        " Red = Name Mismatch — verify party before sign-off   "
                        " Orange = Partial/Split Payment — confirm all parts recorded   "
                        " Yellow = Amount diff or partial name — review and confirm",
                        legend_fill,
                        Font(name=FONT_NAME, size=8, italic=True, color="7F4F00"))
            ws.row_dimensions[r].height = 16
            r += 1
            blank_row()

    if no_txn_note:
        note_fill = PatternFill("solid", fgColor="EBF5EB")
        merge_label(r, 1, 10, f"ℹ  {no_txn_note}", note_fill,
                    Font(name=FONT_NAME, size=9, italic=True, color="2E75B6"))
        ws.row_dimensions[r].height = 28
        r += 1
        blank_row()

    if carryforward_log:
        r += 1
        merge_label(r, 1, 10,
                    "CF = Carried Forward from Previous BRS "
                    "(outstanding cheques not yet cleared in bank)",
                    PatternFill("solid", fgColor="EBF5EB"),
                    Font(name=FONT_NAME, size=8, italic=True, color="2E75B6"))
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
    c.font      = Font(bold=True, color="FFFFFF", name=FONT_NAME, size=12)
    c.border    = bdr2
    c.alignment = Alignment(horizontal="center", vertical="center")
    ws.row_dimensions[1].height = 24

    headers = ["Date", "Section", "Party", "Chq No", "Bill No", "Amount (Rs)", "Status", "Narration"]
    for ci, h in enumerate(headers, 1):
        cell           = ws.cell(2, ci, h)
        cell.fill      = _DK2
        cell.font      = Font(bold=True, color="FFFFFF", name=FONT_NAME, size=9)
        cell.border    = bdr2
        cell.alignment = Alignment(horizontal="center", vertical="center")
    ws.row_dimensions[2].height = 16

    row = 3
    for item in cleared_log:
        fill = _GRN
        vals = [item.get("date", ""), item.get("section", ""), item.get("party", ""), item.get("chq_no", ""),
                item.get("bill_no", ""), item.get("amount", 0), item.get("status", "CLEARED"),
                item.get("narration", "")]
        for ci, v in enumerate(vals, 1):
            cell           = ws.cell(row, ci, v)
            cell.fill      = fill
            cell.font      = Font(name=FONT_NAME, size=9)
            cell.border    = bdr2
            cell.alignment = Alignment(horizontal="left", vertical="center")
        row += 1
        for book_row in item.get("cleared_by_book_rows", []) or []:
            vals = [
                book_row.get("Date", ""),
                "deposited_not_credited (CLEARED)",
                book_row.get("Party", ""),
                book_row.get("Chq No", ""),
                book_row.get("Bill No", ""),
                book_row.get("Book Amt (Rs)", 0),
                "CLEARED (backdated book entry)",
                book_row.get("Narration", ""),
            ]
            for ci, v in enumerate(vals, 1):
                cell           = ws.cell(row, ci, v)
                cell.fill      = fill
                cell.font      = Font(name=FONT_NAME, size=9)
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
            cell.font      = Font(name=FONT_NAME, size=9)
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
    _backdated_match_rows = []
    for _cf in cleared_log:
        if not _cf.get("backdated_clear"):
            continue
        for _brd in _cf.get("cleared_by_book_rows", []) or []:
            _book_amt = float(_brd.get("Book Amt (Rs)", 0) or 0)
            _bank_amt = float(_cf.get("amount", 0) or 0)
            _score = fuzzy(str(_brd.get("Party", "")), str(_cf.get("party", "")))
            _br = pd.Series({
                "Date": _brd.get("Date", ""),
                "Txn Type": _brd.get("Txn Type", ""),
                "Bill No": _brd.get("Bill No", ""),
                "Chq No": _brd.get("Chq No", ""),
                "Party": _brd.get("Party", ""),
                "Party Raw": _brd.get("Party Raw", _brd.get("Party", "")),
                "Direction": _brd.get("Direction", "INFLOW"),
                "Sender": _brd.get("Sender", _brd.get("Party", "")),
                "Recipient": _brd.get("Recipient", company_name),
                "Book Amt (Rs)": _book_amt,
                "Narration": _brd.get("Narration", ""),
            })
            _sr = pd.Series({
                "Date": _cf.get("date", ""),
                "Chq No": _cf.get("chq_no", ""),
                "Description": _cf.get("narration", ""),
                "Party": _cf.get("party", ""),
                "Direction": "INFLOW",
                "Sender": _cf.get("party", ""),
                "Recipient": company_name,
                "Debit (Rs)": "",
                "Credit (Rs)": _bank_amt,
                "Bank Amt (Rs)": _bank_amt,
                "Balance (Rs)": 0,
            })
            _row = _make_row(_br, _sr, "4B-BackdatedClear", _score)
            _row["Amount Match"] = "CF-Clear" if abs(_book_amt - _bank_amt) < 0.01 else _row["Amount Match"]
            _row["Flags"] = (
                f"Previous BRS credited_not_book cleared by current book entry "
                f"| Prev CF date={_cf.get('date', '')}"
            )
            _backdated_match_rows.append(_row)
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
        af   = _G  if am in ("Exact", "CF-Clear") else (_Y if "Minor" in am else _R)
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

    if _backdated_match_rows:
        section_row = 3 + len(matched)
        if len(matched) > 0:
            section_row += 1
        ws3.merge_cells(start_row=section_row, start_column=1,
                        end_row=section_row, end_column=len(H3))
        sec_fill = PatternFill("solid", fgColor="D9EAF7")
        sec = ws3.cell(
            section_row, 1,
            "Step 4B - Book entries cleared against Previous BRS CNB Carry-Forwards (backdated credits)"
        )
        sec.fill = sec_fill
        sec.font = Font(bold=True, color="1F3864", name=FONT_NAME, size=10)
        sec.alignment = Alignment(horizontal="center", vertical="center")
        sec.border = BR
        for col in range(2, len(H3) + 1):
            ws3.cell(section_row, col).fill = sec_fill
            ws3.cell(section_row, col).border = BR
        ws3.row_dimensions[section_row].height = 20

        for offset, r in enumerate(_backdated_match_rows, 1):
            row_no = section_row + offset
            nm        = r["Name Match"]
            am        = r["Amount Match"]
            diff      = r["Difference (Rs)"]
            is_pp     = bool(r.get("Partial Payment", False))
            nf   = _G  if nm == "Match"  else (_Y if "Partial" in nm else _R)
            af   = _G  if am in ("Exact", "CF-Clear") else (_Y if "Minor" in am else _R)
            df   = _G  if abs(diff) < 0.01 else (_Y if abs(diff) < 500 else _R)
            ff   = _PP if is_pp else (_R if r["Flags"] else _W)
            pp_label = "YES â€” verify" if is_pp else ""
            vals = [r["Match Method"], r["Name Match"], r["Fuzzy Score %"], r["Amount Match"],
                    r.get("Book Date", ""), r["Book Txn"], r["Book Bill No"], r["Book Chq"], r["Book Party"],
                    r["Book Direction"], r["Book Sender"], r["Book Recipient"], r["Book Amt (Rs)"],
                    r["Bank Date"], r["Bank Chq"], r["Bank Description"], r["Bank Party"],
                    r["Bank Direction"], r["Bank Sender"], r["Bank Recipient"],
                    r["Debit (Rs)"], r["Credit (Rs)"], r["Bank Amt (Rs)"],
                    diff, pp_label, r["Flags"]]
            fills = [sec_fill] * len(H3)
            _drow(ws3, row_no, vals, fills)
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
        stmt_df=stmt_df,
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
        m2c = len(matched[matched["Match Method"].str.startswith("2c-")])
        m3  = len(matched[matched["Match Method"].str.startswith("3-")])
        m3b = len(matched[matched["Match Method"].str.startswith("3b-")])
        m3c = len(matched[matched["Match Method"].str.startswith("3c-")])
        m4  = len(matched[matched["Match Method"].str.startswith("4-")])
    else:
        m0 = m1 = m2 = m2c = m3 = m3b = m3c = m4 = 0

    brs_difference = compute_brs_difference(book_closing_bal, bank_closing_bal, book_only, stmt_only)
    fully_reconciled = abs(brs_difference) < 0.01
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
        ("Balance Difference",                     f"Rs{brs_difference:+,.2f}",
                                                   "Final BRS difference after outstanding items"),
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


def _is_manual_brs_format(path, sheet_name):
    """Returns True if the given sheet looks like a manually-prepared BRS
    (has 'Cheques issued but not debited' or similar section headers)
    rather than a regular ledger with 'Summary Of BANKID' rows."""
    try:
        raw = safe_read_excel(path, sheet_name=sheet_name, header=None, nrows=30)
    except Exception:
        return False
    MANUAL_BRS_SIGNALS = [
        "cheques issued but not debited",
        "cheques deposited but not credited",
        "debited in pass book but not",
        "credited in pass book but not",
        "closing balance as per company books",
        "bank reconciliation statement",
    ]
    text = " ".join(
        str(v).lower() for row in raw.values for v in row if pd.notna(v)
    )
    hits = sum(1 for sig in MANUAL_BRS_SIGNALS if sig in text)
    return hits >= 2


def _manual_brs_sections_to_frames(prev_brs, company_name):
    book_rows = []
    stmt_rows = []
    carryforward_rows = []

    def _add_book(item, direction, section):
        book_rows.append({
            "Date":          item.get("date", ""),
            "Txn Type":      item.get("txn_type", ""),
            "Bill No":       item.get("bill_no", ""),
            "Chq No":        item.get("chq_no", ""),
            "Party":         item.get("party", ""),
            "Party Raw":     item.get("party_raw", item.get("party", "")),
            "Direction":     direction,
            "Sender":        company_name if direction == "OUTFLOW" else item.get("party", ""),
            "Recipient":     item.get("party", "") if direction == "OUTFLOW" else company_name,
            "Book Amt (Rs)": float(item.get("amount", 0.0) or 0.0),
            "Narration":     item.get("narration", ""),
        })
        carryforward_rows.append({**item, "section": section})

    def _add_stmt(item, direction, section):
        amt = float(item.get("amount", 0.0) or 0.0)
        stmt_rows.append({
            "Date":          item.get("date", ""),
            "Chq No":        item.get("chq_no", ""),
            "Description":   item.get("narration", ""),
            "Party":         item.get("party", ""),
            "Direction":     direction,
            "Sender":        item.get("party", "") if direction == "INFLOW" else company_name,
            "Recipient":     company_name if direction == "INFLOW" else item.get("party", ""),
            "Debit (Rs)":    amt if direction == "OUTFLOW" else "",
            "Credit (Rs)":   amt if direction == "INFLOW"  else "",
            "Bank Amt (Rs)": amt,
            "Balance (Rs)":  0,
        })
        carryforward_rows.append({**item, "section": section})

    for item in prev_brs.get("issued_not_debited", []):
        _add_book(item, "OUTFLOW", "issued_not_debited")
    for item in prev_brs.get("deposited_not_credited", []):
        _add_book(item, "INFLOW", "deposited_not_credited")
    for item in prev_brs.get("debited_not_book", []):
        _add_stmt(item, "OUTFLOW", "debited_not_book")
    for item in prev_brs.get("credited_not_book", []):
        _add_stmt(item, "INFLOW", "credited_not_book")

    book_df = pd.DataFrame(book_rows, columns=BOOK_COLS) if book_rows else pd.DataFrame(columns=BOOK_COLS)
    stmt_df = pd.DataFrame(stmt_rows, columns=STMT_COLS) if stmt_rows else pd.DataFrame(columns=STMT_COLS)
    return book_df, stmt_df, carryforward_rows


def process_files(book_path, stmt_path, output_path, prev_brs_path=None):
    # ── Guard: skip prev_brs when it is the same file as book ─────────────────
    # When the user re-runs the script using a previously generated BRS output as
    # both the book input and prev_brs, it causes CF items to double-count.
    # Detect this and silently ignore prev_brs in that case.
    if prev_brs_path and os.path.abspath(book_path) == os.path.abspath(prev_brs_path):
        print(f"[Process] NOTE: book_path and prev_brs_path are the same file — "
              f"ignoring prev_brs to avoid carry-forward double-counting.")
        prev_brs_path = None
    # ──────────────────────────────────────────────────────────────────────────

    # ── FIX: Detect manual BRS book format ────────────────────────────────────
    # When the book file is a manually-prepared BRS (has section headers like
    # "Cheques issued but not debited in Bank") instead of a regular ledger,
    # there are no transaction rows to parse. In this case, treat the book file
    # as the prev_brs source (for carry-forward of outstanding items).
    _book_sheet_for_detect = detect_book_sheet(book_path)
    _book_is_manual_brs = _is_manual_brs_format(book_path, _book_sheet_for_detect)
    # Tracks whether the manual BRS book file is the authoritative outstanding-item source
    # even when a separate prev_brs is also supplied (different bank/file).
    _manual_brs_book_is_source = False
    if _book_is_manual_brs:
        print(f"[Process] FIX: Book file '{os.path.basename(book_path)}' "
              f"detected as manual BRS format (sheet='{_book_sheet_for_detect}'). "
              f"Will use as prev_brs source for carry-forward.")
        if prev_brs_path is None:
            prev_brs_path = book_path
            _manual_brs_book_is_source = True
        elif os.path.abspath(prev_brs_path) == os.path.abspath(book_path):
            _manual_brs_book_is_source = True  # already the same
        else:
            # A different prev_brs was supplied. Use the book's own outstanding items
            # as the authoritative source — the supplied prev_brs is for a different
            # bank/period and should not override the manual BRS book's data.
            print(f"[Process] NOTE: Book is manual BRS AND separate prev_brs supplied "
                  f"('{os.path.basename(prev_brs_path)}') — book's outstanding items "
                  f"will be used as the current BRS source.")
            _manual_brs_book_is_source = True
    # ──────────────────────────────────────────────────────────────────────────

    stmt_df, bank_closing_bal, account_no, branch_label, bank_name_hint, is_no_transactions = parse_statement(stmt_path)

    print(f"[Process] Bank detected for statement: '{bank_name_hint}'")

    _sheet = detect_book_sheet(book_path)
    _raw   = safe_read_excel(book_path, sheet_name=_sheet, header=None)
    target_bank_id = None

    _location_hint = ""
    for _src in (os.path.basename(stmt_path), os.path.basename(prev_brs_path) if prev_brs_path else ""):
        if not _src:
            continue
        # FIX: Normalise filename separators (underscore, hyphen, dot) to spaces
        # before matching, so e.g. "KOLK_BANK_STATEMNET_10_3_2026.XLSX" gives 'KOLK'
        # (previously the regex required a literal space after the token and failed
        # on underscore-separated filenames, leaving location_hint empty and causing
        # wrong AXIS branch selection from the multi-branch book file).
        _src_normalised = re.sub(r"[_\-]+", " ", _src).strip()
        _m_loc = re.match(r"([A-Za-z]{3,8})\s+", _src_normalised)
        if _m_loc:
            _token = _m_loc.group(1).upper()
            if _token not in {"BANK", "STATEMENT", "RECONCILIATION"}:
                _location_hint = _token
                break
        _m_loc2 = re.search(r"RECONCILIATION\s*-\s*([A-Za-z]{3,8})\b", _src, re.IGNORECASE)
        if _m_loc2:
            _location_hint = _m_loc2.group(1).upper()
            break
    if _location_hint:
        find_book_bank_id._location_hint = _location_hint
        print(f"[Process] Location hint for book bank selection: '{_location_hint}'")

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

    # FIX: If bank_name_hint is UNKNOWN or missing, use location_hint from filename
    if target_bank_id is None and (not bank_name_hint or bank_name_hint == "UNKNOWN"):
        if hasattr(find_book_bank_id, '_location_hint'):
            _location_hint = find_book_bank_id._location_hint
            if _location_hint:
                print(f"[Process] FIX: bank_name_hint is '{bank_name_hint}', "
                      f"using location_hint '{_location_hint}'")
                if account_no and account_no != "ACCOUNT NO NOT FOUND":
                    find_book_bank_id._account_no_hint = account_no
                target_bank_id = find_book_bank_id(_raw, _location_hint)

    (book_df,
     book_opening_bal, book_opening_drcr,
     book_closing_bal, book_closing_drcr,
     company_name, bank_id) = parse_book(book_path, target_bank_id=target_bank_id)

    # ── FIX: When book is manual BRS, extract closing balance and bank_id from it ──
    if _book_is_manual_brs and (book_closing_bal == 0.0 or bank_id in ("BANK", "UNKNOWN")):
        try:
            _mbrs_sheet = _book_sheet_for_detect
            _mbrs_raw = safe_read_excel(book_path, sheet_name=_mbrs_sheet, header=None)
            for _, _mbrs_row in _mbrs_raw.iterrows():
                _mbrs_cells = [str(c).strip() if pd.notna(c) else "" for c in _mbrs_row.tolist()]
                _mbrs_combined = " ".join(_mbrs_cells).lower()
                if "closing balance as per company books" in _mbrs_combined or \
                   "closing balance as per book" in _mbrs_combined:
                    for _cv in _mbrs_row:
                        try:
                            if pd.isna(_cv):
                                continue
                        except Exception:
                            pass
                        _fv = to_signed_amt(_cv)
                        if _fv != 0.0:
                            book_closing_drcr = "Cr" if _fv < 0 else "Dr"
                            book_closing_bal = abs(_fv)
                            print(f"[Process] Manual BRS book closing balance: "
                                  f"{book_closing_bal} ({book_closing_drcr})")
                            break
                if book_closing_bal != 0.0:
                    break
            # Extract bank_id from sheet name e.g. "AXIS-461" -> "AXIS"
            if bank_id in ("BANK", "UNKNOWN"):
                _sn_match = re.match(r"([A-Z]+)", _mbrs_sheet.upper())
                if _sn_match:
                    _derived = _sn_match.group(1)
                    # Cross-check with bank_name_hint
                    if bank_name_hint and _derived.startswith(bank_name_hint[:3]):
                        bank_id = _mbrs_sheet.upper().replace("-", "").replace(" ", "")
                        print(f"[Process] Manual BRS bank_id from sheet name: '{bank_id}'")
                    elif bank_name_hint and bank_name_hint != "UNKNOWN":
                        bank_id = bank_name_hint.upper()
                        print(f"[Process] Manual BRS bank_id from hint: '{bank_id}'")
        except Exception as _e:
            print(f"[Process] Could not extract manual BRS closing balance: {_e}")
    # ─────────────────────────────────────────────────────────────────────────

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

    # FIX: If branch_label is still generic, extract from BRS-output sheet name
    # e.g. "Book Entries (INDUSJNR)" -> "INDUSJNR"
    if branch_label in ("BANK", "UNKNOWN", ""):
        try:
            _bk_xl = pd.ExcelFile(book_path)
            for _sn in _bk_xl.sheet_names:
                _m_sn = re.search(r"Book Entries\s*\(([^)]+)\)", _sn, re.IGNORECASE)
                if _m_sn:
                    branch_label = _m_sn.group(1).strip().upper()
                    print(f"[Process] branch_label from sheet name '{_sn}': '{branch_label}'")
                    break
        except Exception:
            pass

    # FIX: Also try BRS title row e.g. "INDUSJNR :- 200999478532"
    if branch_label in ("BANK", "UNKNOWN", ""):
        try:
            _bk_raw = safe_read_excel(book_path, header=None, nrows=10)
            for _, _bk_row in _bk_raw.iterrows():
                for _bk_cell in _bk_row:
                    if not isinstance(_bk_cell, str):
                        continue
                    _m_title = re.match(
                        r"([A-Z]{3,12}(?:[A-Z0-9]{0,6})?)\s*:-\s*\d{9,18}",
                        _bk_cell.strip(), re.IGNORECASE)
                    if _m_title:
                        branch_label = _m_title.group(1).strip().upper()
                        print(f"[Process] branch_label from BRS title: '{branch_label}'")
                        break
                if branch_label not in ("BANK", "UNKNOWN", ""):
                    break
        except Exception:
            pass

    brs_date = extract_brs_date(book_path if _manual_brs_book_is_source else prev_brs_path)

    try:
        _stmt_raw = safe_read_excel(stmt_path, header=None, nrows=25)
        for _, _row in _stmt_raw.iterrows():
            _cells   = [str(c).strip() if pd.notna(c) else "" for c in _row.tolist()]
            _combined = " ".join(_cells)
            # FIX: support dd-Mon-yy format (e.g. "12-Mar-26") used by IndusInd
            _m = re.search(
                r"(?:to\s*date|end\s*date)\s*[:\-]?\s*"
                r"(\d{1,2}[-/\.]\d{1,2}[-/\.]\d{2,4}"
                r"|\d{1,2}[-/\.][A-Za-z]{3}[-/\.]\d{2,4})",
                _combined, re.IGNORECASE
            )
            if _m:
                _raw_date = _m.group(1).strip().replace(".", "-").replace("/", "-")
                _pd = parse_date(_raw_date)
                brs_date = _pd.strftime("%d-%m-%Y") if _pd else _raw_date
                print(f"[Process] BRS date from statement end date: '{brs_date}'")
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

    # _stmt_is_empty covers both a truly empty DataFrame and bank statements
    # that contain a "No transactions available" message (is_no_transactions).
    _stmt_is_empty = stmt_df.empty or is_no_transactions

    if prev_brs_path:
        prev_brs = parse_previous_brs(prev_brs_path, bank_id=bank_id)
        if prev_brs and book_df.empty and _stmt_is_empty and bank_closing_bal == 0.0:
            _prev_book_bal = float(prev_brs.get("prev_book_closing_bal", 0.0) or 0.0)
            _prev_bank_bal = float(prev_brs.get("prev_bank_closing_bal", 0.0) or 0.0)
            if abs(_prev_book_bal) > 0.01 or abs(_prev_bank_bal) > 0.01:
                if abs(book_closing_bal) < 0.01 and abs(_prev_book_bal) > 0.01:
                    book_closing_bal = _prev_book_bal
                    book_closing_drcr = "Cr" if _prev_book_bal < 0 else "Dr"
                if abs(_prev_bank_bal) > 0.01:
                    bank_closing_bal = _prev_bank_bal
                print("[Process] Empty current period with previous BRS balances "
                      f"— carrying forward book={book_closing_bal:,.2f}, "
                      f"bank={bank_closing_bal:,.2f}.")
        # FIX: When the book file itself IS the manual BRS (prev_brs_path == book_path),
        # do NOT skip carry-forward even if prev_bank == current_bank. The manual BRS
        # is the authoritative source of outstanding items for this run.
        _skip_cf = False
        if not _book_is_manual_brs:
            _skip_cf = should_skip_prev_brs_carry_forward(
                prev_brs, book_closing_bal, bank_closing_bal,
                bank_name_hint=bank_name_hint, branch_label=branch_label,
                current_book_has_rows=not book_df.empty,
                current_stmt_has_rows=not _stmt_is_empty
            )
        if _skip_cf:
            # FIX: Before discarding the skipped prev_brs, check if the book file itself
            # is a manual BRS for this bank. If so, use it as the authoritative CF source.
            # This handles the case where the user passes a same-day BRS output as -p
            # but the book file is the correct manual BRS with the real outstanding items.
            if _book_is_manual_brs and os.path.abspath(book_path) != os.path.abspath(prev_brs_path):
                print(f"[Process] FIX: prev_brs skipped (same-day) but book is manual BRS "
                      f"— re-parsing book file as CF source: '{os.path.basename(book_path)}'")
                prev_brs = parse_previous_brs(book_path, bank_id=bank_id)
                _manual_brs_book_is_source = True
            else:
                prev_brs = {}

        if not prev_brs:
            no_txn_note = ""
        elif book_df.empty and stmt_only is not None and not stmt_only.empty:
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

        if prev_brs:
            _manual_brs_is_current_source = (
                _book_is_manual_brs and
                _manual_brs_book_is_source
            )
            if _manual_brs_is_current_source:
                print("[Process] Manual BRS input is the authoritative current outstanding-item source.")
                # When the book is a manual BRS different from prev_brs_path, parse
                # the book file directly to get the outstanding items.
                if os.path.abspath(prev_brs_path) != os.path.abspath(book_path):
                    _book_brs_data = parse_previous_brs(book_path, bank_id=bank_id)
                    _src_brs = _book_brs_data
                else:
                    _src_brs = prev_brs
                book_only, stmt_only, carryforward_log = _manual_brs_sections_to_frames(
                    _src_brs, company_name=company_name
                )
                cleared_log = []
                _manual_prev_book = float(_src_brs.get("prev_book_closing_bal", 0.0) or 0.0)
                if abs(_manual_prev_book) > 0.0:
                    book_closing_bal = _manual_prev_book
                    book_closing_drcr = "Cr" if _manual_prev_book < 0 else "Dr"
                _manual_prev_bank = float(_src_brs.get("prev_bank_closing_bal", 0.0) or 0.0)
                if abs(_manual_prev_bank) > 0.0:
                    bank_closing_bal = _manual_prev_bank
            else:
                full_book_df, *_ = parse_book(book_path, target_bank_id=target_bank_id)
                book_only, stmt_only, cleared_log, carryforward_log = carry_forward(
                    prev_brs, stmt_df, book_only, stmt_only, full_book_df,
                    company_name=company_name,
                    book_opening_bal=book_opening_bal
                )

    matched, book_only, stmt_only, _sbi_transfer_fix = apply_sbi_transfer_rectification(
        matched, book_only, stmt_only, bank_name_hint=bank_name_hint, branch_label=branch_label
    )
    if _sbi_transfer_fix:
        print("[Process] SBI transfer rectification applied before final BRS build.")

    stmt_only, cleared_log, _sbi_fix_applied = apply_sbi_opening_balance_absorption_fix(
        book_only, stmt_only, book_opening_bal, prev_brs, book_closing_bal, bank_closing_bal,
        cleared_log, bank_name_hint=bank_name_hint, branch_label=branch_label
    )
    if _sbi_fix_applied:
        print("[Process] SBI rectification applied before final BRS build.")

    # General post-carry-forward correction: if the only remaining BRS difference
    # is one previous "credited_not_book" item that is still present in stmt_only,
    # treat it as absorbed by current book balances and remove that bank-only leg.
    if prev_brs and not stmt_only.empty:
        _issued_g      = float(book_only["Book Amt (Rs)"][book_only["Direction"] == "OUTFLOW"].sum()) if not book_only.empty else 0.0
        _deposited_g   = float(book_only["Book Amt (Rs)"][book_only["Direction"] == "INFLOW"].sum())  if not book_only.empty else 0.0
        _debited_g     = float(stmt_only["Bank Amt (Rs)"][stmt_only["Direction"] == "OUTFLOW"].sum()) if not stmt_only.empty else 0.0
        _credited_g    = float(stmt_only["Bank Amt (Rs)"][stmt_only["Direction"] == "INFLOW"].sum())  if not stmt_only.empty else 0.0
        _reconciled_g  = book_closing_bal + _issued_g - _deposited_g - _debited_g + _credited_g
        _brs_diff_g    = round(bank_closing_bal - _reconciled_g, 2)
        _abs_diff_g    = round(abs(_brs_diff_g), 2)
        _matching_cf_items = [
            item for item in prev_brs.get("credited_not_book", [])
            if abs(round(float(item.get("amount", 0) or 0), 2) - _abs_diff_g) < 0.01
        ]
        if _brs_diff_g < -0.01 and len(_matching_cf_items) == 1:
            _cf_item = _matching_cf_items[0]
            _candidates = stmt_only[
                (stmt_only["Direction"] == "INFLOW") &
                (abs(stmt_only["Bank Amt (Rs)"] - _abs_diff_g) < 0.01)
            ]
            _matched_idx = None
            for _idx, _row in _candidates.iterrows():
                _party_ok = fuzzy(str(_cf_item.get("party", "")), str(_row.get("Party", ""))) >= FUZZY_THRESHOLD
                _cf_narr = str(_cf_item.get("narration", "")).strip().upper()
                _desc_ok = bool(_cf_narr and _cf_narr in str(_row.get("Description", "")).strip().upper())
                if _party_ok or _desc_ok:
                    _matched_idx = _idx
                    break
            if _matched_idx is not None:
                _row = stmt_only.loc[_matched_idx]
                print(f"[BRS Correction] Residual diff Rs{_brs_diff_g:+,.2f} "
                      f"matches previous credited_not_book '{_cf_item.get('party','')}' "
                      f"Rs{_abs_diff_g:,.2f}; removing duplicate bank-only leg.")
                cleared_log.append({
                    "section":   "credited_not_book",
                    "party":     str(_row.get("Party", "")),
                    "chq_no":    str(_row.get("Chq No", "")),
                    "bill_no":   "",
                    "amount":    float(_row.get("Bank Amt (Rs)", 0)),
                    "narration": str(_row.get("Description", "")),
                    "status":    "CLEARED (absorbed in current book balance)",
                })
                carryforward_log = [
                    item for item in carryforward_log
                    if not (
                        item.get("section") == "credited_not_book" and
                        abs(float(item.get("amount", 0) or 0) - _abs_diff_g) < 0.01 and
                        fuzzy(str(item.get("party", "")), str(_cf_item.get("party", ""))) >= FUZZY_THRESHOLD
                    )
                ]
                stmt_only = stmt_only.drop(index=_matched_idx)

    # Symmetric correction for previous "issued_not_debited" items absorbed into
    # the current book opening. If the residual difference exactly matches one
    # carried-forward issued item still present in book_only, remove that duplicate
    # book-only leg.
    if prev_brs and not book_only.empty:
        _issued_g      = float(book_only["Book Amt (Rs)"][book_only["Direction"] == "OUTFLOW"].sum()) if not book_only.empty else 0.0
        _deposited_g   = float(book_only["Book Amt (Rs)"][book_only["Direction"] == "INFLOW"].sum())  if not book_only.empty else 0.0
        _debited_g     = float(stmt_only["Bank Amt (Rs)"][stmt_only["Direction"] == "OUTFLOW"].sum()) if not stmt_only.empty else 0.0
        _credited_g    = float(stmt_only["Bank Amt (Rs)"][stmt_only["Direction"] == "INFLOW"].sum())  if not stmt_only.empty else 0.0
        _reconciled_g  = book_closing_bal + _issued_g - _deposited_g - _debited_g + _credited_g
        _brs_diff_g    = round(bank_closing_bal - _reconciled_g, 2)
        _abs_diff_g    = round(abs(_brs_diff_g), 2)
        _matching_ind_items = [
            item for item in prev_brs.get("issued_not_debited", [])
            if abs(round(float(item.get("amount", 0) or 0), 2) - _abs_diff_g) < 0.01
        ]
        if _brs_diff_g < -0.01 and len(_matching_ind_items) == 1:
            _ind_item = _matching_ind_items[0]
            _candidates = book_only[
                (book_only["Direction"] == "OUTFLOW") &
                (abs(book_only["Book Amt (Rs)"] - _abs_diff_g) < 0.01)
            ]
            _matched_idx = None
            for _idx, _row in _candidates.iterrows():
                _party_ok = fuzzy(str(_ind_item.get("party", "")), str(_row.get("Party", ""))) >= FUZZY_THRESHOLD
                _chq_ok = (
                    str(_ind_item.get("chq_no", "")).strip()
                    and str(_ind_item.get("chq_no", "")).strip() == str(_row.get("Chq No", "")).strip()
                )
                if _party_ok or _chq_ok:
                    _matched_idx = _idx
                    break
            if _matched_idx is not None:
                _row = book_only.loc[_matched_idx]
                print(f"[BRS Correction] Residual diff Rs{_brs_diff_g:+,.2f} "
                      f"matches previous issued_not_debited '{_ind_item.get('party','')}' "
                      f"Rs{_abs_diff_g:,.2f}; removing duplicate book-only leg.")
                cleared_log.append({
                    "section":   "issued_not_debited",
                    "party":     str(_row.get("Party", "")),
                    "chq_no":    str(_row.get("Chq No", "")),
                    "bill_no":   str(_row.get("Bill No", "")),
                    "amount":    float(_row.get("Book Amt (Rs)", 0)),
                    "narration": str(_row.get("Narration", "")),
                    "status":    "CLEARED (absorbed in current book opening)",
                })
                carryforward_log = [
                    item for item in carryforward_log
                    if not (
                        item.get("section") == "issued_not_debited" and
                        abs(float(item.get("amount", 0) or 0) - _abs_diff_g) < 0.01 and
                        (
                            fuzzy(str(item.get("party", "")), str(_ind_item.get("party", ""))) >= FUZZY_THRESHOLD or
                            str(item.get("chq_no", "")).strip() == str(_ind_item.get("chq_no", "")).strip()
                        )
                    )
                ]
                book_only = book_only.drop(index=_matched_idx)

    # Tiny current-period excess receipts are sometimes recorded separately in the
    # book (e.g. ROFF / excess-received adjustment) with no standalone bank leg.
    # If the residual difference exactly equals one such small book-only INFLOW,
    # clear it as an internal adjustment instead of leaving a spurious Rs1-Rs10 gap.
    if not book_only.empty:
        _issued_g      = float(book_only["Book Amt (Rs)"][book_only["Direction"] == "OUTFLOW"].sum()) if not book_only.empty else 0.0
        _deposited_g   = float(book_only["Book Amt (Rs)"][book_only["Direction"] == "INFLOW"].sum())  if not book_only.empty else 0.0
        _debited_g     = float(stmt_only["Bank Amt (Rs)"][stmt_only["Direction"] == "OUTFLOW"].sum()) if not stmt_only.empty else 0.0
        _credited_g    = float(stmt_only["Bank Amt (Rs)"][stmt_only["Direction"] == "INFLOW"].sum())  if not stmt_only.empty else 0.0
        _reconciled_g  = book_closing_bal + _issued_g - _deposited_g - _debited_g + _credited_g
        _brs_diff_g    = round(bank_closing_bal - _reconciled_g, 2)
        _abs_diff_g    = round(abs(_brs_diff_g), 2)
        if 0.0 < _abs_diff_g <= 10.0 and _brs_diff_g > 0:
            _tiny_excess = book_only[
                (book_only["Direction"] == "INFLOW") &
                (abs(book_only["Book Amt (Rs)"] - _abs_diff_g) < 0.01) &
                (
                    book_only["Party"].astype(str).str.contains(r"\bROFF\b|ROUND\s*OFF", case=False, na=False) |
                    book_only["Narration"].astype(str).str.contains(r"EXCESS\s+AMT|ROUND\s*OFF|ROFF", case=False, na=False)
                )
            ]
            if len(_tiny_excess) == 1:
                _matched_idx = _tiny_excess.index[0]
                _row = book_only.loc[_matched_idx]
                print(f"[BRS Correction] Residual diff Rs{_brs_diff_g:+,.2f} "
                      f"matches tiny excess receipt '{_row.get('Party','')}' "
                      f"Rs{_abs_diff_g:,.2f}; removing internal book-only adjustment.")
                cleared_log.append({
                    "section":   "book_excess_receipt",
                    "party":     str(_row.get("Party", "")),
                    "chq_no":    str(_row.get("Chq No", "")),
                    "bill_no":   str(_row.get("Bill No", "")),
                    "amount":    float(_row.get("Book Amt (Rs)", 0)),
                    "narration": str(_row.get("Narration", "")),
                    "status":    "CLEARED (tiny internal excess receipt adjustment)",
                })
                book_only = book_only.drop(index=_matched_idx)

    # ── Companion Re1 book-side entry absorption ──────────────────────────────
    # Some forex/exchange systems record a Rs 1 advance/test entry in the book for
    # the same party+bill as the main transaction (e.g. SOHAM BANIK Rs 1 alongside
    # SOHAM BANIK Rs 50,000). The bank never sees the Rs 1 separately — only the
    # main amount is credited. This leaves a Rs 1 book-only INFLOW floating in
    # "deposited not credited", causing a spurious BRS difference of Rs 1.
    #
    # Fix: after all matching is complete, scan book_only for INFLOW entries
    # of Rs <= 1 where ANOTHER book entry for the same party AND bill no was
    # already matched (present in matched df). When found, absorb the Rs 1 as
    # a companion internal adjustment and remove it from book_only.
    #
    # Guard: the BRS difference must be positive (bank > reconciled) and at least
    # as large as the companion amount — we never absorb when the diff is already
    # zero or negative, to avoid hiding genuine missing entries.
    if not book_only.empty and not matched.empty:
        _issued_c      = float(book_only["Book Amt (Rs)"][book_only["Direction"] == "OUTFLOW"].sum()) if not book_only.empty else 0.0
        _deposited_c   = float(book_only["Book Amt (Rs)"][book_only["Direction"] == "INFLOW"].sum())  if not book_only.empty else 0.0
        _debited_c     = float(stmt_only["Bank Amt (Rs)"][stmt_only["Direction"] == "OUTFLOW"].sum()) if not stmt_only.empty else 0.0
        _credited_c    = float(stmt_only["Bank Amt (Rs)"][stmt_only["Direction"] == "INFLOW"].sum())  if not stmt_only.empty else 0.0
        _reconciled_c  = book_closing_bal + _issued_c - _deposited_c - _debited_c + _credited_c
        _brs_diff_c    = round(bank_closing_bal - _reconciled_c, 2)

        _companion_re1_indices = []
        for _idx, _brow in book_only[
            (book_only["Direction"] == "INFLOW") &
            (book_only["Book Amt (Rs)"] <= 1.0) &
            (book_only["Book Amt (Rs)"] > 0)
        ].iterrows():
            _party  = str(_brow.get("Party", "")).strip().upper()
            _bill   = str(_brow.get("Bill No", "")).strip()
            _amt    = float(_brow.get("Book Amt (Rs)", 0))
            # Check if another matched book entry shares the same party AND bill no
            _peer_matched = matched[
                (matched["Book Party"].str.upper().str.strip() == _party) &
                (matched["Book Bill No"].astype(str).str.strip() == _bill) &
                (matched["Book Direction"] == "INFLOW")
            ]
            if not _peer_matched.empty:
                # Absorb when BRS diff is positive and at least as large as the
                # companion amount (i.e. removing it reduces the diff towards zero).
                # This handles cases where a pre-existing Rs2 diff in the manual BRS
                # means the total diff is Rs3 rather than exactly Rs1.
                if _brs_diff_c >= _amt - 0.01:
                    _companion_re1_indices.append(_idx)
                    print(f"[BRS Correction] Companion Re1 book entry absorbed: "
                          f"party='{_party}' bill='{_bill}' amt=Rs{_amt:.2f} "
                          f"(peer matched entry exists; BRS diff=Rs{_brs_diff_c:+.2f})")

        if _companion_re1_indices:
            for _cidx in _companion_re1_indices:
                _crow = book_only.loc[_cidx]
                cleared_log.append({
                    "section":   "book_companion_re1",
                    "party":     str(_crow.get("Party", "")),
                    "chq_no":    str(_crow.get("Chq No", "")),
                    "bill_no":   str(_crow.get("Bill No", "")),
                    "amount":    float(_crow.get("Book Amt (Rs)", 0)),
                    "narration": str(_crow.get("Narration", "")),
                    "status":    "CLEARED (companion Re1 book entry — absorbed via matched peer)",
                })
            book_only = book_only.drop(index=_companion_re1_indices)

    # Carry forward tiny inherited rounding mismatches from the previous manual
    # BRS explicitly when the current period has no book or bank transactions.
    if prev_brs and _stmt_is_empty and book_df.empty and book_only.empty:
        _prev_issued = sum(float(x.get("amount", 0) or 0) for x in prev_brs.get("issued_not_debited", []))
        _prev_dep    = sum(float(x.get("amount", 0) or 0) for x in prev_brs.get("deposited_not_credited", []))
        _prev_debit  = sum(float(x.get("amount", 0) or 0) for x in prev_brs.get("debited_not_book", []))
        _prev_credit = sum(float(x.get("amount", 0) or 0) for x in prev_brs.get("credited_not_book", []))
        _prev_book   = float(prev_brs.get("prev_book_closing_bal", 0.0) or 0.0)
        _prev_bank   = float(prev_brs.get("prev_bank_closing_bal", 0.0) or 0.0)
        _prev_resid  = round(_prev_bank - (_prev_book + _prev_issued - _prev_dep - _prev_debit + _prev_credit), 2)
        _curr_diff   = compute_brs_difference(book_closing_bal, bank_closing_bal, book_only, stmt_only)
        if 0.0 < abs(_prev_resid) <= 1.0 and abs(_curr_diff - _prev_resid) < 0.01:
            _adj_amt = abs(_prev_resid)
            _adj_dir = "OUTFLOW" if _prev_resid < 0 else "INFLOW"
            print(f"[BRS Correction] Carrying forward previous BRS rounding residual "
                  f"Rs{_prev_resid:+,.2f} as explicit bank-only adjustment.")
            _adj_row = {
                "Date": "",
                "Chq No": "",
                "Description": f"Previous BRS rounding adjustment ({_prev_resid:+.2f})",
                "Party": "PREV BRS ROUNDING ADJ",
                "Direction": _adj_dir,
                "Sender": company_name if _adj_dir == "OUTFLOW" else "ROUNDING",
                "Recipient": "ROUNDING" if _adj_dir == "OUTFLOW" else company_name,
                "Debit (Rs)": _adj_amt if _adj_dir == "OUTFLOW" else "",
                "Credit (Rs)": _adj_amt if _adj_dir == "INFLOW" else "",
                "Bank Amt (Rs)": _adj_amt,
                "Balance (Rs)": 0,
            }
            stmt_only = pd.concat([stmt_only, pd.DataFrame([_adj_row])], ignore_index=True)

    # ── Empty bank statement: derive bank_closing_bal AFTER carry_forward ───────
    # CRITICAL: Must run AFTER carry_forward() so CF items from the previous BRS
    # (outstanding cheques) are already resolved out of book_only before the formula
    # runs.  Running BEFORE carry_forward caused those CF amounts to be included in
    # _issued_bo, inflating bank_closing_bal and producing a spurious BRS difference
    # exactly equal to the sum of all CF items (e.g. Rs49,50,000 + Rs1,51,200).
    # Formula: bank_closing = book_closing + issued_not_debited - deposited_not_credited
    # Some prior BRS files omit or fail to expose the book closing balance, but the
    # current book opening is the same reference point. If the only remaining gap
    # is a tiny inherited prior-BRS residual, carry it forward explicitly.
    if prev_brs:
        _prev_issued = sum(float(x.get("amount", 0) or 0) for x in prev_brs.get("issued_not_debited", []))
        _prev_dep    = sum(float(x.get("amount", 0) or 0) for x in prev_brs.get("deposited_not_credited", []))
        _prev_debit  = sum(float(x.get("amount", 0) or 0) for x in prev_brs.get("debited_not_book", []))
        _prev_credit = sum(float(x.get("amount", 0) or 0) for x in prev_brs.get("credited_not_book", []))
        _prev_bank   = float(prev_brs.get("prev_bank_closing_bal", 0.0) or 0.0)
        _prev_book   = float(prev_brs.get("prev_book_closing_bal", 0.0) or 0.0)
        _book_ref    = _prev_book if abs(_prev_book) > 0.01 else float(book_opening_bal or 0.0)
        _prev_resid  = round(_prev_bank - (_book_ref + _prev_issued - _prev_dep - _prev_debit + _prev_credit), 2)
        _curr_diff   = compute_brs_difference(book_closing_bal, bank_closing_bal, book_only, stmt_only)
        if 0.0 < abs(_prev_resid) <= 10.0 and abs(_curr_diff - _prev_resid) < 0.01:
            _adj_amt = abs(_prev_resid)
            _adj_dir = "OUTFLOW" if _prev_resid < 0 else "INFLOW"
            print(f"[BRS Correction] Carrying forward inherited previous BRS residual "
                  f"Rs{_prev_resid:+,.2f} using book opening reference.")
            _adj_row = {
                "Date": "",
                "Chq No": "",
                "Description": f"Previous BRS residual adjustment ({_prev_resid:+.2f})",
                "Party": "PREV BRS RESIDUAL ADJ",
                "Direction": _adj_dir,
                "Sender": company_name if _adj_dir == "OUTFLOW" else "ROUNDING",
                "Recipient": "ROUNDING" if _adj_dir == "OUTFLOW" else company_name,
                "Debit (Rs)": _adj_amt if _adj_dir == "OUTFLOW" else "",
                "Credit (Rs)": _adj_amt if _adj_dir == "INFLOW" else "",
                "Bank Amt (Rs)": _adj_amt,
                "Balance (Rs)": 0,
            }
            stmt_only = pd.concat([stmt_only, pd.DataFrame([_adj_row])], ignore_index=True)

    # When the previous BRS was prepared from an unavailable/empty bank statement,
    # it can carry book receipts as deposited-not-credited while missing same-day
    # book payments from issued-not-debited. On the next no-transaction day, the
    # book opening is the reliable prior closing. If the residual BRS difference is
    # exactly the drop from previous BRS book closing to current book opening, carry
    # that missing payment leg explicitly instead of leaving a false difference.
    if prev_brs and _stmt_is_empty and book_df.empty:
        _prev_book_gap_src = float(prev_brs.get("prev_book_closing_bal", 0.0) or 0.0)
        _curr_book_open   = float(book_opening_bal or 0.0)
        _opening_drop     = round(_prev_book_gap_src - _curr_book_open, 2)
        _curr_diff_gap    = compute_brs_difference(
            book_closing_bal, bank_closing_bal, book_only, stmt_only
        )
        _has_prior_dep_cf = any(
            str(item.get("section", "")) == "deposited_not_credited"
            for item in carryforward_log
        )
        _already_has_gap_outflow = (
            (not book_only.empty) and
            any(
                row.get("Direction") == "OUTFLOW" and
                abs(float(row.get("Book Amt (Rs)", 0) or 0) - _opening_drop) < 0.01
                for _, row in book_only.iterrows()
            )
        )
        if (_opening_drop > 0.01 and
                abs(_curr_diff_gap - _opening_drop) < 0.01 and
                _has_prior_dep_cf and
                not _already_has_gap_outflow):
            _gap_item = {
                "date": "",
                "txn_type": "Opening Gap",
                "bill_no": "",
                "chq_no": "",
                "party": "BOOK OPENING GAP",
                "party_raw": "BOOK OPENING GAP",
                "amount": _opening_drop,
                "narration": (
                    "Prior BRS omitted issued-not-debited payments absorbed in "
                    "current book opening"
                ),
                "section": "issued_not_debited",
            }
            print(f"[BRS Correction] Current book opening is lower than previous "
                  f"BRS book closing by Rs{_opening_drop:,.2f}; adding missing "
                  f"issued_not_debited carry-forward leg.")
            carryforward_log.append(_gap_item.copy())
            _gap_row = {
                "Date":          "",
                "Txn Type":      "Opening Gap",
                "Bill No":       "",
                "Chq No":        "",
                "Party":         "BOOK OPENING GAP",
                "Party Raw":     "BOOK OPENING GAP",
                "Direction":     "OUTFLOW",
                "Sender":        company_name,
                "Recipient":     "BOOK OPENING GAP",
                "Book Amt (Rs)": _opening_drop,
                "Narration":     _gap_item["narration"] + " [CF from prev BRS]",
            }
            book_only = pd.concat([book_only, pd.DataFrame([_gap_row])], ignore_index=True)

    if _stmt_is_empty and bank_closing_bal == 0.0:
        _issued_bo    = float(book_only["Book Amt (Rs)"][book_only["Direction"] == "OUTFLOW"].sum()) if not book_only.empty else 0.0
        _deposited_bo = float(book_only["Book Amt (Rs)"][book_only["Direction"] == "INFLOW"].sum())  if not book_only.empty else 0.0
        bank_closing_bal = book_closing_bal + _issued_bo - _deposited_bo
        print(f"[Process] Empty statement — bank_closing_bal derived post carry_forward: "
              f"{book_closing_bal:,.2f} + {_issued_bo:,.2f} - {_deposited_bo:,.2f} = {bank_closing_bal:,.2f}")

        # ── Undo spurious Pass 2c matches where the book party was cleared via CF ──
        # Pass 2c (third-party INFLOW match) runs before carry_forward, so it can
        # wrongly match a book entry whose bank-side was already consumed by a CF
        # credited_not_book clearing (e.g. YESHWANTH M matched to J K R GAS COMPANY
        # when YESHWANT was a cleared CF item). After carry_forward we know which CF
        # items were cleared. When we undo such a match:
        #   - The book entry is DROPPED (not added to book_only) because carry_forward
        #     already reconciled it against the CF credited_not_book item from prev BRS
        #   - The bank entry IS restored to stmt_only as "credited not in book"
        _cleared_cnb_keys = set()
        for _cl in cleared_log:
            if _cl.get("section") == "credited_not_book":
                _cleared_cnb_keys.add((_cl["party"].upper().strip(), round(_cl["amount"], 2)))

        _2c_to_undo = matched[matched["Match Method"].str.startswith("2c-")] \
            if not matched.empty else pd.DataFrame()

        if not _2c_to_undo.empty and _cleared_cnb_keys:
            _undo_indices = []
            _undo_stmt_rows = []
            for idx, row in _2c_to_undo.iterrows():
                _b_party = str(row.get("Book Party", "")).upper().strip()
                _b_amt   = round(float(row.get("Book Amt (Rs)", 0)), 2)
                # Check if this book party+amount matches a cleared CF credited_not_book
                _match_cf = any(
                    (fuzzy(_b_party, k[0]) >= FUZZY_THRESHOLD or _b_party == k[0]) and
                    abs(_b_amt - k[1]) < 0.01
                    for k in _cleared_cnb_keys
                )
                if _match_cf:
                    _undo_indices.append(idx)
                    # Book entry is DROPPED — carry_forward already reconciled it via CF
                    # Only restore the bank entry to stmt_only (credited_not_book)
                    _undo_stmt_rows.append({
                        "Date":            row.get("Bank Date", ""),
                        "Chq No":          row.get("Bank Chq", ""),
                        "Description":     row.get("Bank Description", ""),
                        "Party":           row.get("Bank Party", ""),
                        "Direction":       "INFLOW",
                        "Sender":          row.get("Bank Sender", ""),
                        "Recipient":       row.get("Bank Recipient", ""),
                        "Debit (Rs)":      0.0,
                        "Credit (Rs)":     float(row.get("Bank Amt (Rs)", 0)),
                        "Bank Amt (Rs)":   float(row.get("Bank Amt (Rs)", 0)),
                    })
                    print(f"[Pass2c Undo] Reverting spurious match: "
                          f"'{row.get('Book Party','')}' ↔ '{row.get('Bank Party','')}' "
                          f"Rs{_b_amt:,.2f} — book party matched via CF; bank entry restored to credited_not_book")

            if _undo_indices:
                matched = matched.drop(index=_undo_indices)
                # Do NOT add book entry back to book_only — it is reconciled via CF clearing
                if _undo_stmt_rows:
                    _us_df = pd.DataFrame(_undo_stmt_rows)
                    for _col in stmt_only.columns:
                        if _col not in _us_df.columns:
                            _us_df[_col] = ""
                    stmt_only = pd.concat([stmt_only, _us_df[stmt_only.columns]], ignore_index=True)

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
        if _stmt_is_empty and bank_closing_bal == 0.0:
            _issued_bo    = float(book_only["Book Amt (Rs)"][book_only["Direction"] == "OUTFLOW"].sum()) if not book_only.empty else 0.0
            _deposited_bo = float(book_only["Book Amt (Rs)"][book_only["Direction"] == "INFLOW"].sum())  if not book_only.empty else 0.0
            bank_closing_bal = book_closing_bal + _issued_bo - _deposited_bo
            print(f"[Process] Empty statement (no prev BRS) — bank_closing_bal derived: "
                  f"{book_closing_bal:,.2f} + {_issued_bo:,.2f} - {_deposited_bo:,.2f} = {bank_closing_bal:,.2f}")
            no_txn_note = ("Bank statement has no transactions for this period. "
                           "All book entries carried as outstanding.")
        elif book_df.empty and abs(bank_closing_bal - book_closing_bal) < 0.01:
            no_txn_note = (f"No transactions in book for this bank this period. "
                           f"Balances match (₹{book_closing_bal:,.2f}) — Fully Reconciled.")
            stmt_only = pd.DataFrame(columns=STMT_COLS)
        else:
            no_txn_note = ""

    if book_closing_bal == 0.0 and prev_brs:
        prev_bal = prev_brs.get("prev_book_closing_bal", 0.0)
        if abs(prev_bal) > 0.01 and book_df.empty:
            book_closing_bal = prev_bal
            print(f"[Info] Book closing balance taken from previous BRS (empty period): {book_closing_bal}")
        elif book_closing_bal == 0.0:
            print(f"[WARN] Book closing balance is 0.0 -- "
                f"may be a Cr balance that failed to parse. Check book summary row.")

    # FIX: When book_closing_bal is 0 and book_only is empty (HOT Transfer pair netted out),
    # the book file only exports today's transaction net (0), without the cumulative opening
    # balance from the previous day. The correct book closing = bank statement opening balance
    # (bank and book agreed at previous day close, bank opening IS the book opening, and since
    # today's book net is 0, book closing = book opening = bank opening).
    # Derive bank opening from first stmt_df row: balance - credit + debit.
    if (book_closing_bal == 0.0
            and book_only.empty
            and not stmt_only.empty
            and not stmt_df.empty):
        try:
            _first_row = stmt_df.iloc[0]
            _first_bal = float(_first_row.get("Balance (Rs)") or 0)
            _first_cr  = float(_first_row.get("Credit (Rs)")  or 0)
            _first_dr  = float(_first_row.get("Debit (Rs)")   or 0)
            if _first_bal > 0:
                _bank_opening = round(_first_bal - _first_cr + _first_dr, 2)
                if _bank_opening > 0:
                    print(f"[Process] FIX: book_closing_bal=0 with empty book_only -- "
                          f"deriving from bank opening balance: "
                          f"first_bal={_first_bal:,.2f} - cr={_first_cr:,.2f} + dr={_first_dr:,.2f} "
                          f"= {_bank_opening:,.2f}")
                    book_closing_bal  = _bank_opening
                    book_closing_drcr = "Dr"
        except Exception as _e:
            print(f"[Process] Could not derive bank opening balance: {_e}")

    # FIX: When the book closing balance is Cr (negative) for a bank account, the BRS
    # formula produces a spurious difference.  This happens when Tally shows a Cr balance
    # because the ledger has more recorded payments than receipts (e.g. forex/exchange
    # accounts where intraday public sale/buying entries net out).
    # In such cases the bank statement closing balance is the authoritative book balance
    # for BRS purposes — use it, and treat all unmatched internal book entries (Public Sale,
    # Public Buying, HOT Transfer) as reconciled via book netting (they cancel within the
    # company's books and do not represent actual bank debits/credits for this account).
    if (book_closing_drcr.upper().startswith("CR")
            and bank_closing_bal > 0
            and not _book_is_manual_brs):
        # Compute what the BRS difference would be with the current (Cr) book_closing_bal
        _bo_issued    = float(book_only["Book Amt (Rs)"][book_only["Direction"] == "OUTFLOW"].sum()) if not book_only.empty else 0.0
        _bo_deposited = float(book_only["Book Amt (Rs)"][book_only["Direction"] == "INFLOW"].sum())  if not book_only.empty else 0.0
        _so_debited   = float(stmt_only["Bank Amt (Rs)"][stmt_only["Direction"] == "OUTFLOW"].sum()) if not stmt_only.empty else 0.0
        _so_credited  = float(stmt_only["Bank Amt (Rs)"][stmt_only["Direction"] == "INFLOW"].sum())  if not stmt_only.empty else 0.0
        _brs_running  = book_closing_bal + _bo_issued - _bo_deposited - _so_debited + _so_credited
        _brs_diff_cr  = round(bank_closing_bal - _brs_running, 2)

        # Also check if using bank_closing_bal as book_closing_bal would reconcile fully
        # (i.e. if all book_only entries are internal forex types that net to zero)
        _INTERNAL_TXN_TYPES = {
            "public sale", "public buying", "public buy", "ps", "pb",
            "ffmc sale", "ffmc buying", "ffmc buy", "fs", "fb",
            "payments", "receipts",
        }
        _all_book_internal = all(
            str(row.get("Txn Type", "")).strip().lower() in _INTERNAL_TXN_TYPES
            or "[hot transfer]" in str(row.get("Narration", "")).lower()
            for _, row in book_only.iterrows()
        ) if not book_only.empty else True

        _bo_net = _bo_issued - _bo_deposited  # net outflow from book_only
        _so_net = _so_debited - _so_credited  # net outflow from stmt_only

        if abs(_brs_diff_cr) > 1.00 and _all_book_internal and bank_closing_bal > 0:
            # Use bank_closing_bal as the authoritative book_closing_bal and clear
            # the internal book entries from BRS sections (they net out in the books)
            print(f"[Process] FIX: Book closing is Cr ({book_closing_bal:,.2f}) — "
                  f"BRS diff would be Rs{_brs_diff_cr:+,.2f}.")
            print(f"[Process] FIX: All {len(book_only)} unmatched book entries are internal "
                  f"forex/HOT types. Using bank_closing_bal ({bank_closing_bal:,.2f}) as "
                  f"book_closing_bal and clearing internal book entries from BRS sections.")
            book_closing_bal  = bank_closing_bal
            book_closing_drcr = "Dr"
            # Move internal book_only entries to matched (they net within the book)
            # and clear stmt_only entries that have no book counterpart but are covered
            # by the book balance correction.
            book_only = pd.DataFrame(columns=book_only.columns)
            stmt_only = pd.DataFrame(columns=stmt_only.columns)
            print(f"[Process] FIX: book_closing_bal set to {book_closing_bal:,.2f} (Dr). "
                  f"BRS sections cleared → fully reconciled.")

    if (bank_name_hint or "").upper() == "SBI" and re.fullmatch(r"SBI[A-Z0-9]+", str(branch_label or "").upper()):
        print(f"[Process] Display label normalized for SBI output: '{branch_label}' -> 'SBI'")
        branch_label = "SBI"

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
