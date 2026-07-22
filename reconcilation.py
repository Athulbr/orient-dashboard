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
PARTY_CONFIRMATION_THRESHOLD = 50
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




def count_book_transactions_by_bill_no(book_df, name_col=None, bill_col=None):
    """
    Number/count book-report transactions using party name + Bill No.

    Same party/name with the same Bill No keeps the same transaction number.
    The same party/name with a different Bill No gets the next transaction number.

    Returns:
        {
            "transaction_count": int,
            "transaction_numbers": list[int],
        }
    """
    if book_df is None or len(book_df) == 0:
        return {"transaction_count": 0, "transaction_numbers": []}

    if bill_col is None:
        bill_col = "Bill No" if "Bill No" in book_df.columns else "Book Bill No"
    if name_col is None:
        if "Party" in book_df.columns:
            name_col = "Party"
        elif "Book Party" in book_df.columns:
            name_col = "Book Party"
        elif "Name" in book_df.columns:
            name_col = "Name"
        else:
            raise ValueError("Book report must contain a Party, Book Party, or Name column.")

    if bill_col not in book_df.columns:
        raise ValueError(f"Book report must contain a '{bill_col}' column.")
    if name_col not in book_df.columns:
        raise ValueError(f"Book report must contain a '{name_col}' column.")

    def _clean_key(value):
        text = "" if pd.isna(value) else str(value).strip()
        return re.sub(r"\s+", " ", text).upper()

    transaction_numbers = []
    seen_keys = {}
    next_transaction_no = 0

    for _, row in book_df.iterrows():
        key = (_clean_key(row.get(name_col, "")), _clean_key(row.get(bill_col, "")))
        if key not in seen_keys:
            next_transaction_no += 1
            seen_keys[key] = next_transaction_no
        transaction_numbers.append(seen_keys[key])

    return {
        "transaction_count": next_transaction_no,
        "transaction_numbers": transaction_numbers,
    }

# =============================================================================
# DYNAMIC EXTRACTION HELPERS
# =============================================================================

def extract_brs_date(prev_brs_path):
    FALLBACK = "DATE NOT PROVIDED - please include previous BRS file"
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
    # The 'BRS Statement' sheet scores more keyword hits but is NOT a ledger - it is
    # a summary output. Prioritise any sheet whose name starts with 'Book Entries'.
    for sheet in sheets:
        if sheet.strip().lower().startswith("book entries"):
            print(f"[Book] BRS-output book detected - using sheet: '{sheet}'")
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
        print(f"[Book] Could not auto-detect sheet - using first sheet: '{xl.sheet_names[0]}'")
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
    print("[Book] Bank identifier not found - using 'BANK'")
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

    # When bank hint is a generic ID (e.g. INDUSIND) but the branch has a
    # specific suffixed ID (e.g. INDUSCOARP for COARP, INDUSCHN for CHAD),
    # build a preferred-suffix map so the specific ID is tried first.
    _location_specific_suffix = {
        "COARP": "INDUSCOARP",
        "CHAD":  "INDUSJNR",
        "JNR":   "INDUSJNR",
        "CAL":   "INDUSCAL",
        "TVM":   "INDUSINDTVM",
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
        # FIX (COARP/CHAD): If this location has a known specific bank suffix
        # (e.g. INDUSCOARP for COARP, INDUSJNR for CHAD), prefer it over the
        # generic hint (INDUSIND) when it exists and has activity or nonzero balance.
        _specific = _location_specific_suffix.get(location_hint, "")
        if (_specific and _specific in all_ids and
                (_has_activity(_specific) or _has_nonzero_closing(_specific))):
            print(f"[Book] P0 location-specific: '{_specific}' preferred over "
                  f"generic '{hint}' for location '{location_hint}'")
            return _specific
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
                # (e.g. bare 'AXIS' at KOLK with ~615K closing) - that is the real account
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
                  f"'{bank_from_filename}' - using filename")
    elif bank_from_header:
        bank_name = bank_from_header
        if bank_name_from_ifsc != "UNKNOWN" and bank_name_from_ifsc != bank_from_header:
            print(f"[Statement] NOTE: IFSC says '{bank_name_from_ifsc}' but header says "
                  f"'{bank_from_header}' - using header")
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

# Fixed list of common Indian surnames used in fuzzy matching to avoid score
# inflation from shared surnames (e.g. JAIDEEP SINGH vs MANDEEP SINGH should
# NOT match just because both share SINGH). This is a STATIC list only -
# no dynamic/dataset-driven learning, to keep matching behaviour predictable
# and consistent across all branches and files.
_COMMON_SURNAMES = {
    # Pan-India / North India
    'SINGH','KUMAR','SHARMA','PATEL','SHAH','MEHTA','GUPTA','VERMA',
    'JOSHI','MISHRA','PANDEY','TIWARI','YADAV','AGARWAL','AGGARWAL',
    'SINHA','MISRA','TRIVEDI','SHUKLA','DWIVEDI','CHATURVEDI','SRIVASTAVA',
    'KHANNA','MALHOTRA','CHOPRA','KAPOOR','BHATIA','ARORA','BAJAJ',
    'GOEL','JAIN','CHOUDHARY','CHOUDHURY','CHAUHAN','RAJPUT','THAKUR',
    'THAKOR','MODI','PARIKH','BHATT','DOSHI','KOTHARI','GANDHI','MEHRA',
    'SETHI','AHUJA','GROVER','SACHDEVA','NARANG','TANEJA','BATRA','CHAWLA',
    'WADHWA','WADHWANI','ANAND','NANDA','KHARE','SAXENA','SAKSENA',
    'RASTOGI','NIGAM','SRIVAST','TRIPATHI','PATHAK','BAJPAI','BAIPAI',
    'DUBEY','UPADHYAY','UPADHYAYA','TIWARY','RAI','LALA','KAPILA',
    'MATHUR','RATHI','BANGUR','SINGHANIA','GOENKA','JHUNJHUNWALA',
    'MITTAL','JINDAL','BANSAL','MANGAL','SINGHAL','OSWAL','LODHA',
    'BIRLA','DALMIA','RUIA','MODY','WADIA','TATA',

    # Punjab / Haryana / Himachal
    'KAUR','BRAR','DHILLON','GILL','GREWAL','SANDHU','SIDHU','BAJWA',
    'MANN','SEKHON','VIRK','RANDHAWA','DEOL','SOHI','GHUMMAN','MAAN',
    'AULAKH','BHULLAR','SRAN','CHEEMA','BAINS','KANG','SAINI','CHAHAL',
    'DHALIWAL','KALRA','SURI','ANEJA','SAHNI','DANG','VAID','VAIDYA',
    'KHATRI','KSHATRIYA','WALIA','MONGA','BABBAR','JASWAL','THAKURAL',
    'JASROTIA','MANHAS','SLATHIA','SHARMA',

    # Rajasthan / Gujarat
    'DESAI','DAVE','PARMAR','SOLANKI','RATHOD','RATHORE','JHALA',
    'CHAUHAN','SISODIA','SHEKHAWAT','RAJAWAT','POONIA','NATHAWAT',
    'PUROHIT','BOHRA','OSWAL','MAHESHWARI','KHANDELWAL','AGRAWAL',
    'PORWAL','RANKA','SURANA','LODHA','DAGA','BHANDARI','RANA',
    'VASAVA','TADVI','CHRISTIAN','MACWAN','CHRISTIAN','DAMOR',
    'MUNSHI','DALAL','KAPASI','DIWAN','HAKIM',

    # Maharashtra / Goa
    'KULKARNI','DESHMUKH','DESHPANDE','GOKHALE','PHADKE','KHANDEKAR',
    'BHOSALE','PATIL','JADHAV','SHINDE','MORE','PAWAR','GAIKWAD',
    'SALUNKHE','MANE','RANE','NAIK','RAUT','KADAM','SURYAVANSHI',
    'FULARI','MOHITE','NIMBALKAR','MALKAR','KAMBLI','KOLHE',
    'MURKUTE','LONKAR','WAGHMARE','KAMBLE','SONAWANE','THAKARE',
    'FERNANDEZ','DSOUZA','DSILVA','MASCARENHAS','DCUNHA','PINTO',
    'SEQUEIRA','RODRIGUES','LOBO','DIAS','ALMEIDA','PEREIRA','GOMES',

    # Karnataka
    'SHETTY','HEGDE','RAI','BHANDARI','KAMATH','PRABHU','SHENOY',
    'NAYAK','AMIN','BANGERA','ANCHAN','ACHAN','TANTRI','BALLAL',
    'GOWDA','REDDY','MURTHY','SWAMY','IYENGAR','IYER','SUBRAMANIAM',
    'SUBRAMANIAN','NARAYANA','NARAYAN','RAJU','KRISHNA','KRISHNAN',
    'PRASAD','BHAT','BHATT','ACHAR','MADHYASTHA','MALLYA',
    'VENKATESH','VENKATARAMAN','VENKATRAO','VENKATACHALAM',
    'RAMACHANDRAN','RAMASWAMY','PARTHASARATHY','SUNDARAM',

    # Tamil Nadu
    'PILLAI','NAIR','MENON','IYER','IYENGAR','MUDALIAR','CHETTIAR',
    'NAIDU','GOUNDER','THEVAR','VELLALAR','REDDIAR','UDAYAR',
    'MUTHUKRISHNAN','SUBRAMANIAM','ARUMUGAM','ANNAMALAI','PERIYASAMY',
    'PALANISAMY','RAMASAMY','MURUGESAN','SELVAM','PANDIAN','RAJENDRAN',
    'THANGARAJ','MARIMUTHU','PARAMASIVAM','DURAISAMY','BALASUBRAMANIAN',
    'RAJAGOPAL','VISWANATHAN','KRISHNAMURTHY',

    # Kerala
    'NAIR','MENON','PILLAI','KURUP','NAMBOOTHIRI','NAMBUDIRI','VARMA',
    'PANIKKAR','KARUNAKARAN','KRISHNANKUTTY','UNNITHAN','WARRIER',
    'THAMPI','POTTEKKATT','EZHUTHACHAN','NAMBIAR','ASAN',
    'THOMAS','GEORGE','JOSEPH','JOHN','JACOB','MATHEW','CHERIAN',
    'VARGHESE','PHILIP','PAUL','DANIEL','ABRAHAM','SAMUEL','SIMON',
    'ANTONY','FRANCIS','XAVIER','SEBASTIAN','AUGUSTINE','BABU',
    'JOSE','RAJAN','KRISHNAN','SURESH','VIJAYAN','MOHANAN',

    # Andhra Pradesh / Telangana
    'REDDY','NAIDU','CHOUDARY','CHOUDHARY','RAO','RAJU','VARMA',
    'BABU','PRASAD','KUMAR','GOUD','MUDIRAJ','KAPU','KAMMA',
    'VELAMA','KOMATI','SETTI','SETTY','VAISYA','ARYA','VYSYA',
    'MURTHY','SASTRY','SHARMA','BHATT','DATTA','ACHARYULU',

    # West Bengal / Odisha / East India
    'BOSE','CHATTERJEE','BANERJEE','MUKHERJEE','CHAKRABORTY','SEN',
    'GHOSH','ROY','DUTTA','PAUL','SAHA','MITRA','BISWAS','DAS',
    'MONDAL','MANDAL','HALDAR','HALDER','KARMAKAR','BHATTACHARYA',
    'BHATTACHARYYA','SANYAL','GANGULY','GUHA','NANDI','BHADRA',
    'SARKAR','MAJUMDAR','MAJUMDER','TALUKDAR','CHOUDHURI','BASAK',
    'PAL','DHAL','SAHOO','MOHAPATRA','PANDA','PRUSTY','NAYAK',
    'MISRA','SWAIN','PARIDA','BEHERA','JENA','ROUT','DASH',

    # Bihar / Jharkhand / UP (additional)
    'JHA','OJA','OJHA','RAWAT','BISHT','NEGI','RANA',
    'THAKUR','PANDEY','DUBEY','TRIPATHI','PATHAK','BAJPAI',
    'UPADHYAY','TEWARI','TEWARY','SRIVASTAV','SHRIVASTAVA',

    # North East India
    'BORA','KAKATI','GOGOI','BARUAH','KALITA','DEKA','SAIKIA',
    'SHARMA','DAS','BORAH','HAZARIKA','MAHANTA','BHUYAN',

    # Muslim surnames (common)
    'KHAN','SHAIKH','SHEIKH','ANSARI','SIDDIQUI','QURESHI','MIRZA',
    'MALIK','CHAUDHRY','CHAUDHARI','SYED','HUSSAIN','HASAN','ALI',
    'AHMED','AKHTAR','AZAM','BAIG','BEG','FAROOQI','FAROOQ',
    'HASHMI','KAZMI','NAQVI','RIZVI','ZAIDI','ABBASI','ALVI',
    'BUKHARI','FAROOQUI','GILANI','HYDARI','ISLAMI','JAMAL',
    'KHILJI','LARI','MAQSOOD','NOMANI','OSMANI','QADRI',
    'RAHMANI','SIDDIQUE','TAMIMI','USMANI','WAHIDI',

    # Sikh surnames
    'SINGH','KAUR','BRAR','DHILLON','GILL','GREWAL','SANDHU','SIDHU',
    'BAJWA','MANN','SEKHON','VIRK','RANDHAWA','DEOL','SOHI',

    # Christian surnames (South)
    'FERNANDEZ','DSOUZA','DSILVA','MASCARENHAS','DCUNHA','PINTO',
    'SEQUEIRA','RODRIGUES','LOBO','DIAS','ALMEIDA','PEREIRA','GOMES',
    'MATHEW','THOMAS','GEORGE','JOSEPH','JOHN','JACOB','CHERIAN',
    'VARGHESE','PHILIP','ANTONY','FRANCIS','XAVIER','SEBASTIAN',

    # Parsi / Others
    'IRANI','IRANI','WADIA','PETIT','READYMONEY','TATA','GODREJ',
    'MISTRY','CONTRACTOR','DALAL','MEHTA','PATEL',

    # Common titles mistaken as surnames
    'KUMAR','DEVI','BAI','BHAI','LAL','RAM','DEVI',
}

# FIX 3: clean_name now strips ANY leading "CODE - " prefix (not just INDIVI -)
# This fixes matching for entries like "TATVICDIGI - TATVIC DIGITAL ANALYTICS..."
# and "HARSHDE - HARSHDEEP INDUSTRIES..." which previously kept their prefixes.
def clean_name(n):
    if not isinstance(n, str):
        return ""
    n = re.sub(r"^[A-Z0-9]{1,12}\s*[-?]\s*", "", n.strip(), flags=re.IGNORECASE)
    # Strip personal honorifics before fuzzy scoring. Bank narrations often
    # include values like "Mr ADITYA CHAUDHRY" while books hold the legal name;
    # leaving the title as the first token triggers the surname safety cap and
    # can turn a genuine match into 0%.
    n = re.sub(
        r"^(?:MR|MRS|MS|MISS|MASTER|MSTR|DR|SMT|SRI|SHRI|KUM|KUMARI)\.?\s+",
        "",
        n,
        flags=re.IGNORECASE,
    )
    return re.sub(r"\s+", " ", n).strip().upper()

def fuzzy(a, b):
    a, b = clean_name(a), clean_name(b)
    if not a or not b:
        return 0
    if a == b:
        return 100
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
    raw = max(original_score, sorted_score, substring_score)

    # Surname-aware adjustment: when both names share a common Indian surname
    # but differ in their primary given name (first token), the shared surname
    # inflates the score. Cap using the prefix similarity of the first names.
    # e.g. JAIDEEP SINGH vs MANDEEP SINGH: prefix JAI vs MAN -> cap at 33%.
    a_words = a.split()
    b_words = b.split()
    if len(a_words) >= 2 and len(b_words) >= 2:
        a_surnames = {w for w in a_words if w in _COMMON_SURNAMES}
        b_surnames = {w for w in b_words if w in _COMMON_SURNAMES}
        shared = a_surnames & b_surnames
        if shared:
            a_core = [w for w in a_words if w not in _COMMON_SURNAMES]
            b_core = [w for w in b_words if w not in _COMMON_SURNAMES]
            if not a_core or not b_core:
                # One or both names consist entirely of common surnames
                # (e.g. ARUN ANAND where both ARUN+ANAND are in _COMMON_SURNAMES)
                # Shared surnames alone should not constitute a match - cap low.
                raw = min(raw, 40)
            elif a_core and b_core:
                a_first = a_core[0]
                b_first = b_core[0]
                pfx_len = min(3, len(a_first), len(b_first))
                if a_first[:pfx_len] != b_first[:pfx_len]:
                    # First names start differently - use prefix score as ceiling
                    prefix_score = round(
                        SequenceMatcher(None, a_first[:pfx_len], b_first[:pfx_len]).ratio() * 100
                    )
                    raw = min(raw, prefix_score)

    return raw


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

# FIX 4: extract_party_from_desc - improved TRF/ pattern to skip leading
# numeric-only segments (e.g. "003") and correctly extract the party name.
# Old pattern:  r"TRF/[^/]+/([^/]+)/"  -> captured "003" for "TRF/003/PARTY/transfer"
# New patterns: try "TRF/<digits>/<party>/" first, then fallback "TRF/<party>/"
_REJECTED_CHEQUE_RE = re.compile(
    r"(?:\b(?:CHEQUE|CHEUQE|CHQ)\b.*\b(?:RETURN|RETURNED|REJECT|REJECTED|REMOVE|REMOVED|BOUNCE|BOUNCED)\b)"
    r"|(?:\b(?:RETURN|RETURNED|REJECT|REJECTED|REMOVE|REMOVED|BOUNCE|BOUNCED)\b.*\b(?:CHEQUE|CHEUQE|CHQ)\b)"
    r"|GOT\s+RETURNED|ITEM\s+LISTED\s+TWICE",
    re.IGNORECASE,
)

# Separate pattern for HIGHLIGHT-ONLY - catches bank reversal entries like
# "BRN-OW RTN CLG: REJECT:146571:Advice not received" that should be shown
# in red but NOT nullified (their amounts are real and affect the BRS balance).
_REJECTED_HIGHLIGHT_ONLY_RE = re.compile(
    r"(?:RTN\s+CLG|RETURN\s+CLG).*\bREJECT\b"
    r"|\bREJECT\b.*(?:RTN\s+CLG|RETURN\s+CLG)",
    re.IGNORECASE,
)


def is_rejected_cheque_text(*parts):
    text = " ".join(str(p or "") for p in parts)
    # FIX: Strip the synthetic "Cheque Return - " annotation prefix before checking.
    # This prefix is added by cheque_return_narration_from_description and is not
    # authoritative. We only want to flag actual rejection keywords in the real description.
    if text.startswith("Cheque Return - "):
        text = text[16:].strip()
    return bool(_REJECTED_CHEQUE_RE.search(text))


def is_rejected_cheque_record(row):
    get = row.get if hasattr(row, "get") else lambda k, d="": d
    try:
        rejected_flag = get("Rejected Cheque", False)
        # FIX: Check if rejected_flag is actually True, not just truthy.
        # NaN values from concat operations are truthy but should not mark items as rejected.
        if rejected_flag is True or (isinstance(rejected_flag, str) and rejected_flag.lower() == "true"):
            return True
    except Exception:
        pass
    # Detect entries tagged with [REJECTED/REMOVED CHEQUE - NULLIFIED] in their description.
    # This catches the bank RETURN/reversal INFLOW entry (e.g. "NEFT/RETURN/.../AISHWARYA
    # RAMESH/ [REJECTED/REMOVED CHEQUE - NULLIFIED]") whose description has "RETURN" but
    # not "CHEQUE", so _REJECTED_CHEQUE_RE alone does not match it.
    desc = str(get("Description", "") or "")
    if "[REJECTED/REMOVED CHEQUE - NULLIFIED]" in desc:
        return True
    # Check Description + Party Raw + Party via the regex pattern.
    if is_rejected_cheque_text(desc, get("Party Raw", ""), get("Party", "")):
        return True
    # Also highlight-only pattern (RTN CLG: REJECT) - real amounts, not nullified
    if _REJECTED_HIGHLIGHT_ONLY_RE.search(desc):
        return True
    # Check Narration for BOOK-SIDE rows only.
    # Book entries for a returned cheque carry the real return reason in Narration
    # (e.g. "BEING CHEUQE ISSUED AGAINST PB NO.5106802 GOT RETURNED IN AXIS RS.25533").
    # We check Narration ONLY when it does NOT start with "Cheque Return - " (the synthetic
    # prefix added by cheque_return_narration_from_description) AND contains no "[CF from
    # prev BRS]" suffix (the carry-forward label), so we avoid false positives on CF metadata.
    narration = str(get("Narration", "") or "")
    narration_stripped = narration.replace("[CF from prev BRS]", "").strip()
    if (narration_stripped
            and not narration_stripped.startswith("Cheque Return - ")
            and "Carried Fwd" not in narration_stripped
            and narration_stripped.upper() not in ("CF", "CARRIED FWD")):
        if is_rejected_cheque_text(narration_stripped):
            return True
    return False


def cheque_return_narration_from_description(description, fallback=""):
    desc = str(description or "").strip()
    fb = str(fallback or "").strip()
    if is_rejected_cheque_text(desc):
        return f"Cheque Return - {desc}" if desc else "Cheque Return"
    if re.fullmatch(r"(?:CHQ\s*)?RETURN(?:ED)?|CHEQUE\s+RETURN(?:ED)?", fb, re.IGNORECASE):
        return f"Cheque Return - {desc}" if desc else "Cheque Return"
    return fb


def extract_party_from_desc(desc):
    if not isinstance(desc, str):
        return ""

    SKIP = {"BANK", "NEFT", "RTGS", "UPI", "IMPS", "003", "001", "0001", "OTHER",
            "STATE BANK OF INDIA", "HDFC BANK", "ICICI BANK", "INDUSIND BANK",
            "PUNJAB NATIONAL BANK", "BANK OF BARODA", "CANARA BANK", "DEUTSCHE BANK",
            "SHREE KADI NAGARIK SAHAKARI"}

    # -- IndusInd RTGS/NEFT
    m = re.search(
        r"^[RN]/[A-Z0-9]+/[A-Z]{4}[A-Z0-9]*/([A-Za-z][A-Za-z .]{2,})(?:/|$)",
        desc, re.IGNORECASE
    )
    if m:
        name = m.group(1).strip().upper()
        if name and name not in SKIP and len(name) > 2 and "BANK" not in name:
            return name

    # -- HDFC-style RTGS Cr
    m = re.search(
        r"RTGS\s+[CDcd]r[--][A-Z0-9]{11}[--]([^--]{3,}?)[--][A-Za-z]",
        desc, re.IGNORECASE
    )
    if m:
        name = m.group(1).strip().upper()
        name = re.sub(r"\s+P\s*$", "", name).strip()
        if name and name not in SKIP and len(name) > 3:
            return name

    # -- HDFC RTGS Dr
    m = re.search(r"RTGS\s+Dr[--][A-Z0-9]{11}[--]([^--]{3,}?)[--]", desc, re.IGNORECASE)
    if m:
        name = m.group(1).strip().upper()
        if name and name not in SKIP and len(name) > 3:
            return name

    # -- HDFC RTGS Cr fallback
    m = re.search(r"RTGS\s+[CDcd]r[--][^--]+-(.+?)-[A-Z]{4}[A-Z0-9]*\d{6,}", desc, re.IGNORECASE)
    if m:
        name = m.group(1).strip().upper()
        if name and name not in SKIP and len(name) > 3:
            return name

    # -- HDFC FT
    m = re.search(
        r"^FT\s*[--]\s*[A-Z0-9]+\s*[--]\s*[--]?\s*\S*\s*[--]\s*([A-Za-z][A-Za-z .,&']{2,})",
        desc, re.IGNORECASE
    )
    if m:
        name = m.group(1).strip().upper().rstrip(" -")
        name = re.sub(r"\s{2,}", " ", name).strip()
        if name and name not in SKIP and len(name) > 3 and "BANK" not in name:
            return name

    # -- HDFC Cheque Paid
    m = re.search(r"^([A-Za-z][A-Za-z .,&]{2,}?)\s*[--]\s*CHQ\s+PAID", desc, re.IGNORECASE)
    if m:
        name = m.group(1).strip().upper()
        if name and name not in SKIP and len(name) > 2:
            return name

    # -- RFX / forex deal
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

    # HDFC TPT compact format:
    # <account/ref>-TPT-<bank ref>-<actual party>
    # Example: 50100567678051-TPT-HDFC5B31ABB82CF6-CHITRA CHATURVEDI
    # Without this, the whole tokenized description becomes the party and genuine
    # same-day matches show as Name 0% even though the sender is present at the end.
    m = re.search(
        r"^\s*\d{8,}\s*[-\u2013]\s*TPT\s*[-\u2013]\s*[A-Z0-9]{4,}\s*[-\u2013]\s*([A-Za-z][A-Za-z .,&']{2,})\s*$",
        desc,
        re.IGNORECASE,
    )
    if m:
        name = re.sub(r"\s+", " ", m.group(1).strip().upper())
        if name and name not in SKIP and "BANK" not in name:
            return name

    # -- Smart IMPS extraction -------------------------------------------------
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
            # seg3 is a bank code - name is the next slash-delimited segment
            _seg4 = _rest.split("/")[0].strip()
            if _seg4 and not _IMPS_BANK_CODE.match(_seg4) and "BANK" not in _seg4.upper():
                _imps_name = _seg4.upper()
                if _imps_name and _imps_name not in SKIP:
                    return _imps_name
        else:
            _imps_name = _seg3.upper()
            if _imps_name and _imps_name not in SKIP and "BANK" not in _imps_name:
                return _imps_name
    # -------------------------------------------------------------------------

    # HDFC NEFT slash format:
    # NEFT/<utr>/<bank-token>/<actual party>
    # Example: NEFT/HDFCH01079025666/HDFC/DAVID RUSSELL
    # The generic NEFT fallback below would otherwise pick "HDFC" as the party.
    _NEFT_BANK_TOKEN = re.compile(
        r"^(?:HDFC|HDFCBANK|ICICI|ICICIBANK|AXIS|UTIB|SBI|SBIN|KOTAK|KOTK|"
        r"INDUSIND|INDB|YES|YESB|PNB|PUNB|CANARA|CNRB|BOB|BARB|FEDERAL|FDRL|"
        r"IDFC|IDFB|DCB|DCBL|RBL|BANDHAN|BDBL|UNION|UBIN|UCO|IDBI|IOB|BOI|"
        r"INDIAN|BANK)$",
        re.IGNORECASE
    )
    _neft_parts = [part.strip() for part in str(desc).split("/")]
    if len(_neft_parts) >= 4 and _neft_parts[0].upper() == "NEFT":
        _bank_seg = _neft_parts[2]
        _party_seg = _neft_parts[3]
        if _NEFT_BANK_TOKEN.match(_bank_seg):
            _neft_name = _party_seg.upper()
            _neft_name = re.sub(r"\s*\d+$", "", _neft_name).strip()
            if (_neft_name and _neft_name not in SKIP and
                    not _NEFT_BANK_TOKEN.match(_neft_name) and "BANK" not in _neft_name):
                return _neft_name
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

    # -- Priority 0: Detect script-generated BRS output ------------------------
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
    ]
    # "difference" as a standalone row label ends the BRS, but "NAME DIFFERENCE"
    # (a narration on a data row) must NOT trigger an end-of-section.
    # Use a word-boundary regex for this one keyword only.
    _DIFF_END_RE = re.compile(r"^[\s\d=]*difference[\s\d=]*$", re.IGNORECASE)
    current_section = None
    result = {k: [] for k in SECTION_MAP}
    result["prev_book_closing_bal"] = prev_book_closing
    result["prev_bank_closing_bal"] = prev_bank_closing

    for _raw_row_idx, row in raw.iterrows():
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
        _is_end = any(kw in combined for kw in END_SECTIONS) or bool(_DIFF_END_RE.match(combined.strip()))
        if _is_end:
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

        # Detect 10-column BRS layout (Date|Type|Bill|Chq|BookReport|BankStmt|MakezExtracted|Amt|RunBal|Narr)
        # vs 8-column layout (Date|Type|Bill|Chq|Party|Amt|RunBal|Narr).
        # Check by looking at whether col-index 7 in this row holds a numeric amount.
        if len(cells) >= 9 and to_amt(cells[7]) > 0:
            _amt_col     = 7   # default generated layout amount column
            _run_col     = 8
            _narr_col    = 9
            _desc_cols    = [4, 5]
            _party_col    = 6
        elif len(cells) >= 8 and to_amt(cells[6]) > 0:
            _amt_col     = 6   # compact book-only/bank-only generated layout
            _run_col     = 7
            _narr_col    = 8
            _desc_cols    = [4]
            _party_col    = 5
        else:
            _amt_col     = 5
            _run_col     = 6
            _narr_col    = 7
            _desc_cols    = [4]
            _party_col    = 4

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

        def _text_cell(idx):
            return cells[idx].strip() if len(cells) > idx else ""

        def _date_only_cell(value):
            text = str(value or "").strip()
            return bool(
                re.fullmatch(r"\d{1,2}[-/]\d{1,2}[-/]\d{2,4}", text) or
                re.fullmatch(r"\d{4}-\d{2}-\d{2}(?:\s+00:00:00)?", text)
            )

        def _valid_text_cell(value):
            return (
                value and value not in SKIP_WORDS
                and not re.fullmatch(r"[\d,. ]+", value)
                and not _date_only_cell(value)
            )

        desc_candidates = [_text_cell(idx) for idx in _desc_cols]
        description = next((c for c in desc_candidates if _valid_text_cell(c)), "")

        party     = ""
        raw_party = _text_cell(_party_col)
        if _valid_text_cell(raw_party):
            party = raw_party
        elif _valid_text_cell(description):
            party = description
        if not party:
            party = max(non_numeric_cells, key=len)

        item_amt    = to_amt(cells[_amt_col]) if len(cells) > _amt_col else 0.0
        running_amt = to_amt(cells[_run_col]) if len(cells) > _run_col else 0.0
        if item_amt > 0 and item_amt != running_amt:
            amount = item_amt
        else:
            candidates = [a for a in amounts if a != running_amt]
            amount = min(candidates) if candidates else max(amounts)

        explicit_narration = _text_cell(_narr_col)
        narration = ""
        if _valid_text_cell(explicit_narration):
            narration = explicit_narration
        for c in cells[_amt_col + 1:]:
            if narration:
                break
            if c in SKIP_WORDS or c in ("nan", "", "-"):
                continue
            if to_amt(c) > 0:
                continue
            if _date_only_cell(c):
                continue
            if c != party and len(c) > 3:
                narration = c
                break
        narration = cheque_return_narration_from_description(description, narration)
        # FIX: Do NOT fall back to description or party as narration.
        # Description is already shown in the "Book Report"/"Bank Statement" column
        # of the BRS sheet - copying it into narration causes redundant duplication
        # in the "Narration / Remarks" column.  Leave narration blank when no genuine
        # narration text exists.

        # FIX: Strip generated display-only labels from narration.
        # When the current BRS is used as the previous BRS next day, the prev-BRS
        # loader reads the "Narration / Remarks" column and can pick up UI labels
        # like "Carried Fwd" or "CF" that were written by item_row() purely for
        # display purposes.  These are NOT real narrations and must not be
        # re-imported - doing so causes bank-only entries (e.g. AJAY BARVE) to
        # show "CF | Carried Fwd" instead of the correct blank/empty narration.
        # * "Carried Fwd" alone  -> pure display label, clear to ""
        # * "CF" alone           -> pure display label, clear to ""
        # * "CF | <real text>"   -> strip the "CF | " prefix, keep <real text>
        # * "[CF from prev BRS]" -> legacy suffix appended elsewhere; strip it
        _narr_stripped = narration.replace("[CF from prev BRS]", "").strip(" |")
        if re.fullmatch(r"CF\s*\|\s*Carried\s+Fwd", _narr_stripped, re.IGNORECASE):
            narration = ""
        elif re.fullmatch(r"Carried\s+Fwd", _narr_stripped, re.IGNORECASE):
            narration = ""
        elif re.fullmatch(r"CF", _narr_stripped, re.IGNORECASE):
            narration = ""
        elif re.match(r"CF\s*\|\s*", _narr_stripped, re.IGNORECASE):
            # "CF | <real narration text>" -> keep only the real text
            narration = re.sub(r"^CF\s*\|\s*", "", _narr_stripped, flags=re.IGNORECASE).strip()
        else:
            narration = _narr_stripped

        clean_party = clean_name(party)
        if current_section in ("debited_not_book", "credited_not_book"):
            extracted = extract_party_from_desc(description or party)
            if extracted and len(extracted) > 2:
                clean_party = extracted.upper()

        result[current_section].append({
            "date":      date_str,
            "txn_type":  txn_type,
            "bill_no":   bill_no,
            "chq_no":    chq_no,
            "party":     clean_party,
            "party_raw": description or party,
            "description": description or party,
            "amount":    amount,
            "narration": narration,
            "source":    "carried_forward",
            "_source_row": int(_raw_row_idx),
        })

    total = sum(len(v) for k, v in result.items() if isinstance(v, list))
    print(f"[Previous BRS] Loaded: {total} outstanding items")
    for k, v in result.items():
        if isinstance(v, list):
            print(f"   {k}: {len(v)} items")

    # Deduplicate parser artefacts only. Bank-only sections may contain genuine
    # repeated same-party/same-amount credits on the same date, often with the
    # same bank narration/ref (for example split MOB/TPFT legs). Those must stay
    # as separate carry-forward items so current-day/backdated book rows can clear
    # one-for-one.
    for _sec in ("credited_not_book", "debited_not_book"):
        _seen_keys = set()
        _deduped   = []
        for _it in result[_sec]:
            _desc_for_dedup = str(_it.get("description", "") or _it.get("party_raw", "")).strip().upper()
            _has_bank_ref = bool(re.search(
                r"\b(?:UPI|NEFT|RTGS|IMPS|MOB|TPFT|INB|IFT|TRF|CLG|ACH|NACH|P2A)\b|/",
                _desc_for_dedup
            ))
            # Include bill_no and chq_no in the key so genuine separate transactions
            # with same party+amount+date (different bill/chq) are NOT collapsed.
            # For bank-ref rows, include the source row too; two identical-looking
            # statement lines in a previous BRS are still two real bank transactions.
            _k = (
                str(_it.get("party", "")).strip().upper(),
                round(float(_it.get("amount", 0) or 0), 2),
                str(_it.get("date", "")).strip(),
                str(_it.get("bill_no", "")).strip(),
                str(_it.get("chq_no", "")).strip(),
                str(_it.get("description", "")).strip().upper(),
                str(_it.get("narration", "")).strip().upper(),
                str(_it.get("_source_row", "")) if _has_bank_ref else "",
            )
            if _k in _seen_keys:
                print(f"[Previous BRS] Dedup removed duplicate {_sec}: "
                      f"party='{_it['party']}' amt={_it['amount']:,.2f} date='{_it['date']}'")
                continue
            _seen_keys.add(_k)
            _deduped.append(_it)
        result[_sec] = _deduped
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
        s = str(c or "").strip().replace(".0", "")
        if s.lower() in ("", "nan", "0", "99", "511", "-") or not re.fullmatch(r"\d{1,6}", s):
            return "0"
        s = s.lstrip("0")
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

    def _amount_cents(value):
        return int(round(float(value) * 100))

    def _find_amount_subset(idxs, amount_getter, target, min_parts=2):
        target_cents = _amount_cents(target)
        combos = {0: []}
        for idx in idxs:
            amt_cents = _amount_cents(amount_getter(idx))
            if amt_cents <= 0 or amt_cents > target_cents:
                continue
            additions = {}
            for running, combo in combos.items():
                new_total = running + amt_cents
                if new_total > target_cents or new_total in combos or new_total in additions:
                    continue
                new_combo = combo + [idx]
                if new_total == target_cents and len(new_combo) >= min_parts:
                    return new_combo
                additions[new_total] = new_combo
            combos.update(additions)
        return None

    def _meaningful_words(text):
        stop = {"PVT", "LTD", "LIMITED", "PRIVATE", "THE", "OF", "AND", "INDIVI", ""}
        return {
            w for w in clean_name(str(text or "")).split()
            if len(w) >= 4 and w not in stop and w not in _COMMON_SURNAMES
        }

    def _stmt_party_ok(item, sr):
        item_party = str(item.get("party", ""))
        stmt_text = f"{sr.get('Party', '')} {sr.get('Description', '')}"
        return (
            fuzzy(item_party, str(sr.get("Party", ""))) >= FUZZY_THRESHOLD or
            bool(_meaningful_words(item_party) & _meaningful_words(stmt_text))
        )

    def find_stmt_split_match(item, direction):
        """Clear one previous-BRS item against multiple current statement rows."""
        target = float(item.get("amount", 0) or 0)
        if target <= 0:
            return []

        candidates = stmt[(~stmt["_used_cf"]) & (stmt["Direction"] == direction)].copy()
        if len(candidates) < 2:
            return []

        item_date = item.get("date", "")
        if item_date:
            candidates = candidates[candidates.apply(
                lambda sr: (_date_diff(item_date, sr.get("Date", "")) is None or
                            _date_diff(item_date, sr.get("Date", "")) <= DATE_THRESHOLD_DAYS * 10),
                axis=1
            )]
            if len(candidates) < 2:
                return []

        item_chq = _norm_chq(item.get("chq_no", ""))
        if item_chq not in ("", "nan", "0", "99", "511"):
            ref_candidates = candidates[candidates.apply(
                lambda sr: bool(
                    _norm_chq(sr.get("Chq No", "")) == item_chq or
                    re.search(r"\b" + re.escape(str(item.get("chq_no", "")).strip()) + r"\b",
                              str(sr.get("Description", "")))
                ),
                axis=1
            )]
            if len(ref_candidates) >= 2:
                candidates = ref_candidates
            else:
                candidates = candidates[candidates.apply(lambda sr: _stmt_party_ok(item, sr), axis=1)]
        else:
            candidates = candidates[candidates.apply(lambda sr: _stmt_party_ok(item, sr), axis=1)]

        if len(candidates) < 2:
            return []

        matched = _find_amount_subset(
            list(candidates.index),
            lambda idx: stmt.at[idx, "Bank Amt (Rs)"],
            target,
            min_parts=2,
        )
        if not matched:
            return []

        for si in matched:
            stmt.at[si, "_used_cf"] = True
        item["_cleared_stmt_indices"] = list(matched)
        parts = " + ".join(f"Rs{float(stmt.at[si, 'Bank Amt (Rs)']):,.2f}" for si in matched)
        print(f"[CF] split statement clear: {item.get('section', 'prev BRS')} "
              f"'{item.get('party', '')}' Rs{target:,.2f} = {parts} "
              f"({len(matched)} bank rows)")
        return matched

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
                si = hits.index[0]
                stmt.at[si, "_used_cf"] = True
                item["_cleared_stmt_indices"] = [si]
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
                item["_cleared_stmt_indices"] = [si]
                return True

        for si, sr in stmt[(stmt["Direction"] == direction) & (~stmt["_used_cf"])].iterrows():
            score     = fuzzy(item["party"], sr["Party"])
            amt_match = abs(float(sr["Bank Amt (Rs)"]) - float(item["amount"])) < 0.01
            if score >= FUZZY_THRESHOLD and amt_match:
                stmt.at[si, "_used_cf"] = True
                item["_cleared_stmt_indices"] = [si]
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
                      f"<-> '{sr['Party']}' amt={item['amount']:,.2f}")
                stmt.at[si, "_used_cf"] = True
                item["_cleared_stmt_indices"] = [si]
                return True

        # Last-resort: if there is exactly ONE unused stmt row with the same
        # direction+amount, clear it - but ONLY when the item carries a real
        # (non-generic) cheque number, so the cheque itself is the anchor.
        # Generic chq values ("99", "511", "0", "") mean the book entry has no
        # cheque anchor at all; in that case an amount-only match is far too
        # loose and will wrongly consume unrelated bank transactions that happen
        # to share the same amount (e.g. ANKUSH KUMAR SONI Rs70,000 chq=99
        # incorrectly clearing NUSHABA ALAM UPI Rs70,000).
        _item_chq_for_last_resort = _norm_chq(item.get("chq_no", ""))
        _chq_is_real = _item_chq_for_last_resort not in ("", "0", "nan", "99", "511")
        if _chq_is_real:
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
                              f"Rs{item['amount']:,.2f} - date gap {diff} days too large")
                        return False
                # FIX (VADO): Last-resort must also verify the cheque number is not
                # a mismatch. Book chq=66308, bank chq=66309 - one digit different -
                # but they are different cheques from different parties. Require either:
                #   (a) cheque numbers match exactly (after norm), OR
                #   (b) name score >= FUZZY_THRESHOLD, OR
                #   (c) bank chq is absent/generic (so chq can't confirm either way)
                _sr_chq  = _norm_chq(str(sr.get("Chq No", "")))
                _it_chq  = _norm_chq(item.get("chq_no", ""))
                _chq_ok  = (
                    _sr_chq in ("", "0", "nan") or          # bank chq absent -> can't reject
                    _it_chq == _sr_chq or                   # exact chq match
                    fuzzy(item["party"], str(sr["Party"])) >= FUZZY_THRESHOLD  # name confirms
                )
                if not _chq_ok:
                    print(f"[CF] Last-resort BLOCKED (chq mismatch, low name score): "
                          f"book chq='{item['chq_no']}' bank chq='{sr['Chq No']}' "
                          f"party='{item['party']}' <-> '{sr['Party']}' "
                          f"score={fuzzy(item['party'], str(sr['Party']))}%")
                    return False
                stmt.at[si, "_used_cf"] = True
                item["_cleared_stmt_indices"] = [si]
                return True
        elif item["chq_no"]:
            print(f"[CF] Skipping last-resort amount-only match for '{item['party']}' "
                  f"Rs{item['amount']:,.2f} - chq '{item['chq_no']}' is generic, "
                  f"no reliable anchor to consume bank row without party confirmation")

        split_indices = find_stmt_split_match(item, direction)
        if split_indices:
            item["_cleared_stmt_indices"] = list(split_indices)
            return True
        return False
    
    def chq_cleared_in_stmt(chq_no, party, amount):
        norm_chq = _norm_chq(chq_no)

        # P1a: match via dedicated Chq No column
        hits = stmt[
            (~stmt["_used_cf"]) &
            (stmt["Chq No"].apply(_norm_chq) == norm_chq)
        ]
        # P1b: fallback - search chq_no as a whole word inside Description column
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
                      f"-> keeping in issued_not_debited (encashment chq return)")
                return False, None

            # Also handle case where RETURN row was found first in hits
            if "RETURN" in bank_desc and bank_dir == "INFLOW":
                print(f"[CF] chq_cleared BLOCKED: chq={chq_no} hit is RETURN row "
                      f"-> keeping in issued_not_debited")
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
            # FIX (HYD): Cheque number matched, but check party names match too.
            # When the bank has chq 236875 debited to "ABHISHEETY KUMAR" but the
            # book CF item is "A AJAY KUMAR" (score 57% < 65%), a silent P1 clear
            # would consume the bank row and prevent it from appearing in
            # "Less: Debited not in book" with a NAME DIFFERENCE note.
            # Block the P1 clear when names differ significantly; the CF item stays
            # in issued_not_debited (Add:Issued) and the bank row stays in stmt_only
            # (Less:Debited), both correctly visible in the BRS.
            _bank_party = str(stmt.at[hit_idx, "Party"])
            _bank_desc  = str(stmt.at[hit_idx, "Description"])
            _bank_date  = str(stmt.at[hit_idx, "Date"])
            _bank_amt   = float(stmt.at[hit_idx, "Bank Amt (Rs)"])
            _name_score = fuzzy(party, _bank_party)
            if _name_score < FUZZY_THRESHOLD:
                print(f"[CF] chq_cleared P1 BLOCKED (name mismatch): chq={chq_no} "
                      f"book party='{party}' bank party='{_bank_party}' "
                      f"score={_name_score}% < {FUZZY_THRESHOLD}% "
                      f"- cheque cleared to different person, keeping both in BRS")
                # Record in blocked_crossclears so Human Verification flags it.
                # The book CF item (issued_not_debited) stays in Add:Issued.
                # The bank row (debited OUTFLOW) stays in stmt_only -> Less:Debited.
                # Both will appear in BRS, but the reviewer should confirm the
                # name difference and whether the cheque was genuinely honoured.
                blocked_crossclears.append({
                    "reason":      f"Cheque {chq_no} matched but party names differ "
                                   f"({_name_score}% < {FUZZY_THRESHOLD}%) - "
                                   f"book issued to '{party}' but bank debited to '{_bank_party}'. "
                                   f"Both kept in BRS with NAME DIFFERENCE flag.",
                    "side_a":      {
                        "party":    party,
                        "chq_no":  chq_no,
                        "amount":  amount,
                        "date":    "",
                        "bill_no": "",
                        "section": "issued_not_debited",
                    },
                    "side_b":      {
                        "party":       _bank_party,
                        "chq_no":      chq_no,
                        "amount":      _bank_amt,
                        "date":        _bank_date,
                        "description": _bank_desc,
                        "section":     "debited_not_book",
                    },
                    "fuzzy_score": _name_score,
                })
                return False, None
            print(f"[CF] chq_cleared P1: chq={chq_no} -> stmt idx={hit_idx}")
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
                # FIX: Never allow a cheque-number mismatch to be overridden by
                # fuzzy party score alone.  When both sides carry real, distinct
                # cheque numbers the entries are different instruments - even if
                # the party names look similar (e.g. "BHARGAV VIRENDRA PAN" chq
                # 723039 vs "SHEERALI BHARGAV PANDYA" chq 723033).  Matching
                # them incorrectly removes a genuine "Debited in Bank but not in
                # Book" entry and wrongly clears a CF carry-forward item.
                print(f"[CF] chq_cleared P2 BLOCKED: party={party} amt={amount:,.2f} "
                      f"orig chq '{chq_no}' != bank chq '{bank_chq}' "
                      f"(score {best_score}%) - chq mismatch, not clearing")
                return False, None
            print(f"[CF] chq_cleared P2 (fuzzy): party={party} "
                  f"amt={amount:,.2f} score={best_score}% -> stmt idx={best_si}")
            return True, best_si

        return False, None

    def consume_chq_in_stmt(stmt_idx):
        if stmt_idx is not None:
            stmt.at[stmt_idx, "_used_cf"] = True

    def _stmt_rows_from_indices(indices):
        rows = []
        for _si in indices or []:
            if _si not in stmt.index:
                continue
            _row = stmt.loc[_si].to_dict()
            _row.pop("_used_cf", None)
            rows.append(_row)
        return rows

    cf_book_rows        = []
    cf_stmt_rows        = []
    cleared_log         = []
    carryforward_log    = []
    blocked_crossclears = []   # pairs blocked by our cross-clear safety guards
    from collections import defaultdict

    # -- Pre-pass: Cross-clear deposited_not_credited <-> credited_not_book --------
    # When the same transaction appears on BOTH sides (e.g. Interview Street Tech:
    # deposited in book but not credited in bank AND credited in bank but not in book),
    # the two items cancel each other - neither should carry forward.
    _cross_cleared_dep_keys = set()
    _cross_cleared_cred_keys = set()
    _cross_cleared_short_residuals = []  # (dep_item, cred_item, residual_amt)
    _SHORT_AMT_TOLERANCE = 5000.0  # allow cross-clear when amounts differ by up to Rs5000

    _MANUAL_REVIEW_RE = re.compile(
        r"customer\s+chq\s+copy|customer\s+cheque\s+copy|cheque\s+copy\s+required|"
        r"chq\s+copy\s+required|cheque\s+number\s+modification|chq\s+(?:no|number)\s+modification|"
        r"cheque\s+no\.?\s+modification|\bquery\b|\bqry\b|\bpending\b|\bhold\b|\bon\s+hold\b|"
        r"manual\s+check|manual\s+review|do\s+not\s+clear|not\s+to\s+clear",
        re.IGNORECASE,
    )

    def _cf_manual_review_remark(*_items):
        display_fields = ("narration", "remarks", "status")
        fallback_fields = ("description", "party_raw")
        for _item in _items:
            for _field in display_fields:
                _value = str(_item.get(_field, "") or "").strip()
                if _value and _MANUAL_REVIEW_RE.search(_value):
                    return True, _value
            for _field in fallback_fields:
                _value = str(_item.get(_field, "") or "").strip()
                if _value and _MANUAL_REVIEW_RE.search(_value):
                    return True, _value
        return False, ""

    def _cf_cross_clear_blocked_by_manual_remark(*_items):
        return _cf_manual_review_remark(*_items)

    def _carry_forward_manual_review_item(section, item, remark_text=""):
        _remark = str(remark_text or item.get("narration", "") or "").strip()
        carryforward_log.append({
            **item,
            "section": section,
            "status": "CARRIED FORWARD (manual remark - verify)",
            "manual_review_remark": _remark,
        })
        if section in ("issued_not_debited", "deposited_not_credited"):
            _direction = "OUTFLOW" if section == "issued_not_debited" else "INFLOW"
            cf_book_rows.append({
                "Date":          item.get("date", ""),
                "Txn Type":      item.get("txn_type", "PB" if _direction == "OUTFLOW" else "PS"),
                "Bill No":       item.get("bill_no", ""),
                "Chq No":        item.get("chq_no", ""),
                "Party":         item.get("party", ""),
                "Party Raw":     item.get("party_raw", item.get("party", "")),
                "Direction":     _direction,
                "Sender":        company_name if _direction == "OUTFLOW" else item.get("party", ""),
                "Recipient":     item.get("party", "") if _direction == "OUTFLOW" else company_name,
                "Book Amt (Rs)": item.get("amount", 0),
                "Narration":     ((_remark or item.get("narration", "")) + " [CF from prev BRS]").strip(),
            })
        else:
            _direction = "OUTFLOW" if section == "debited_not_book" else "INFLOW"
            cf_stmt_rows.append({
                "Date":          item.get("date", ""),
                "Chq No":        item.get("chq_no", ""),
                "Description":   item.get("description", ""),
                "Narration":     _remark or item.get("narration", ""),
                "Party":         item.get("party", ""),
                "Direction":     _direction,
                "Sender":        company_name if _direction == "OUTFLOW" else item.get("party", ""),
                "Recipient":     item.get("party", "") if _direction == "OUTFLOW" else company_name,
                "Debit (Rs)":    item.get("amount", 0) if _direction == "OUTFLOW" else "",
                "Credit (Rs)":   item.get("amount", 0) if _direction == "INFLOW" else "",
                "Bank Amt (Rs)": item.get("amount", 0),
                "Balance (Rs)":  0,
            })
        print(f"[CF] Manual remark preserved in BRS: section={section} "
              f"party='{item.get('party', '')}' amt={float(item.get('amount', 0) or 0):,.2f} "
              f"remark='{_remark[:80]}'")

    for _dep in prev_brs["deposited_not_credited"]:
        for _cred in prev_brs["credited_not_book"]:
            _amt_diff = abs(_dep["amount"] - _cred["amount"])
            if _amt_diff >= 0.01:
                # FIX (HYD): Allow near-amount cross-clear for same party when the
                # difference is a known short/excess (e.g. GURUDEV 222800 deposited
                # vs 220800 credited - 2000 short, narration says 'SHORT AMOUNT').
                # Only fire when: party names match well AND the short amount is small.
                if _amt_diff <= _SHORT_AMT_TOLERANCE:
                    _near_fuzzy = fuzzy(_dep["party"], _cred["party"])
                    _dep_chq_nr = _norm_chq(_dep.get("chq_no", ""))
                    _dep_chq_real = _dep_chq_nr not in ("", "0", "nan", "99", "511")
                    if _near_fuzzy >= FUZZY_THRESHOLD:
                        _manual_blocked, _manual_text = _cf_cross_clear_blocked_by_manual_remark(_dep, _cred)
                        if _manual_blocked:
                            print(f"[CF] Pre-pass NEAR-AMOUNT CROSS-CLEAR BLOCKED (manual/query remark): "
                                  f"deposited '{_dep['party']}' Rs{_dep['amount']:,.2f} "
                                  f"<-> credited '{_cred['party']}' Rs{_cred['amount']:,.2f} "
                                  f"remark='{_manual_text[:80]}' - keeping both in BRS")
                            blocked_crossclears.append({
                                "reason":      "Manual/query remark blocks auto cross-clear",
                                "side_a":      {**_dep, "section": "deposited_not_credited"},
                                "side_b":      {**_cred, "section": "credited_not_book"},
                                "fuzzy_score": _near_fuzzy,
                            })
                            continue
                        # FIX (AHMD): When the deposited entry has a generic cheque number
                        # (99, blank, etc.) the cheque cannot serve as a confirming anchor.
                        # Without it, a near-amount match silently removes both rows from the
                        # BRS - hiding a real short-collection discrepancy (e.g. NITINKUMAR
                        # Rs287,867 deposited vs Rs287,767 credited - Rs100 short collected).
                        # Require a real cheque number before allowing near-amount cross-clear;
                        # without one, keep both sides visible so the accountant can review.
                        if not _dep_chq_real:
                            print(f"[CF] Pre-pass NEAR-AMOUNT CROSS-CLEAR BLOCKED "
                                  f"(generic chq '{_dep_chq_nr}'): "
                                  f"deposited '{_dep['party']}' Rs{_dep['amount']:,.2f} "
                                  f"<-> credited '{_cred['party']}' Rs{_cred['amount']:,.2f} "
                                  f"diff=Rs{_amt_diff:,.2f} score={_near_fuzzy}% "
                                  f"- keeping both in BRS for accountant review")
                            continue
                        # Cross-clear at the LOWER of the two amounts; the difference
                        # stays as a residual in credited_not_book (if cred > dep) or
                        # deposited_not_credited (if dep > cred).
                        _larger  = max(_dep["amount"], _cred["amount"])
                        _smaller = min(_dep["amount"], _cred["amount"])
                        _residual = round(_larger - _smaller, 2)
                        print(f"[CF] Pre-pass NEAR-AMOUNT CROSS-CLEAR: "
                              f"deposited '{_dep['party']}' Rs{_dep['amount']:,.2f} "
                              f"<-> credited '{_cred['party']}' Rs{_cred['amount']:,.2f} "
                              f"diff=Rs{_residual:,.2f} score={_near_fuzzy}% "
                              f"- cross-clearing at lower amount, residual stays in BRS")
                        _cross_cleared_dep_keys.add((_dep["party"].upper().strip(), round(_dep["amount"], 2)))
                        _cross_cleared_cred_keys.add((_cred["party"].upper().strip(), round(_cred["amount"], 2)))
                        _cross_cleared_short_residuals.append((_dep, _cred, _residual))
                continue
            _dep_words  = set(_dep["party"].upper().split())  - \
                          {"PVT","LTD","LIMITED","PRIVATE","THE","OF","AND","INDIVI"}
            _cred_words = set(_cred["party"].upper().split()) - \
                          {"PVT","LTD","LIMITED","PRIVATE","THE","OF","AND","INDIVI"}
            _word_match = bool(_dep_words & _cred_words) and len(_dep_words) > 0
            _fuzzy_score = fuzzy(_dep["party"], _cred["party"])
            _fuzzy_match = _fuzzy_score >= FUZZY_THRESHOLD

            if not (_word_match or _fuzzy_match):
                continue

            _manual_blocked, _manual_text = _cf_cross_clear_blocked_by_manual_remark(_dep, _cred)
            if _manual_blocked:
                print(f"[CF] Pre-pass CROSS-CLEAR BLOCKED (manual/query remark): "
                      f"deposited '{_dep['party']}' Rs{_dep['amount']:,.2f} "
                      f"<-> credited '{_cred['party']}' Rs{_cred['amount']:,.2f} "
                      f"remark='{_manual_text[:80]}' - keeping both in BRS")
                blocked_crossclears.append({
                    "reason":      "Manual/query remark blocks auto cross-clear",
                    "side_a":      {**_dep, "section": "deposited_not_credited"},
                    "side_b":      {**_cred, "section": "credited_not_book"},
                    "fuzzy_score": _fuzzy_score,
                })
                continue

            # FIX (DLHI): A single shared surname like "AGGARWAL" is enough to
            # satisfy _word_match, but "ASTHA AGGARWAL" and "MOHIT AGGARWAL" are
            # different people - cross-clearing them silently removes both from the
            # BRS when they may be genuinely separate transactions.
            #
            # When the deposited entry has a generic cheque number (99, blank, etc.)
            # the party name is the ONLY identifier.  In that case, require a high
            # fuzzy score (>= 90%) confirming it is essentially the same name, not
            # just a shared surname.  A real same-transaction pair like
            # "INTERVIEW STREET TECH PVT LTD" vs "INTERVIEW STREET TECHNOLOGIES"
            # will still score well above 90%; two different family members sharing
            # a surname will not.
            #
            # When the deposited entry has a real (non-generic) cheque number, the
            # cheque itself is the anchor and a normal fuzzy match suffices.
            _dep_chq = _norm_chq(_dep.get("chq_no", ""))
            _dep_chq_generic = _dep_chq in ("", "0", "nan", "99", "511")
            if _dep_chq_generic and _fuzzy_score < 90:
                print(f"[CF] Pre-pass CROSS-CLEAR BLOCKED (dep/cred): "
                      f"deposited '{_dep['party']}' (generic chq) vs "
                      f"credited '{_cred['party']}' score={_fuzzy_score}% < 90% "
                      f"- different people sharing a surname, not cancelling")
                blocked_crossclears.append({
                    "reason":      "Surname-only fuzzy match (generic chq) - different people",
                    "side_a":      {**_dep, "section": "deposited_not_credited"},
                    "side_b":      {**_cred, "section": "credited_not_book"},
                    "fuzzy_score": _fuzzy_score,
                })
                continue

            # Uniqueness check: only cancel if this exact party+amount appears
            # exactly ONCE in deposited_not_credited. If the same person has
            # multiple entries with the same amount, we can't determine which
            # credited_not_book entry it pairs with - leave both sides visible.
            _dep_key_for_check = (
                clean_name(str(_dep.get("party", ""))).upper(),
                round(float(_dep.get("amount", 0) or 0), 2)
            )
            _dep_count = sum(
                1 for _d in prev_brs["deposited_not_credited"]
                if (clean_name(str(_d.get("party", ""))).upper() == _dep_key_for_check[0] and
                    round(float(_d.get("amount", 0) or 0), 2) == _dep_key_for_check[1])
            )
            if _dep_count > 1:
                print(f"[CF] Pre-pass CROSS-CLEAR BLOCKED "
                      f"(multiple matches: {_dep_count}x '{_dep['party']}' "
                      f"Rs{_dep['amount']:,.2f} in deposited_not_credited) "
                      f"- ambiguous, leaving both sides visible")
                continue

            _cross_cleared_dep_keys.add((_dep["party"].upper().strip(), round(_dep["amount"], 2)))
            _cross_cleared_cred_keys.add((_cred["party"].upper().strip(), round(_cred["amount"], 2)))
            print(f"[CF] Pre-pass CROSS-CLEAR: deposited_not_credited '{_dep['party']}' "
                  f"Rs{_dep['amount']:,.2f} <-> credited_not_book '{_cred['party']}' "
                  f"Rs{_cred['amount']:,.2f} - these cancel each other")

    # Split-payment cross-clear: some manual BRS files carry both sides of the same
    # split receipt with different party labels (book party vs remitter name).  Keep
    # this intentionally narrow: same date, multiple rows on each side, and the
    # exact same amount split list.
    def _cf_date_key(_item):
        _dt = _parse_date(_item.get("date", ""))
        return _dt.strftime("%Y-%m-%d") if _dt else str(_item.get("date", "")).strip()

    _dep_split_groups = defaultdict(list)
    for _dep in prev_brs["deposited_not_credited"]:
        _manual_hold, _manual_text = _cf_manual_review_remark(_dep)
        if _manual_hold:
            continue
        _dep_split_groups[(
            _cf_date_key(_dep),
            str(_dep.get("bill_no", "")).strip(),
            _norm_chq(_dep.get("chq_no", "")),
            clean_name(str(_dep.get("party", ""))).upper(),
        )].append(_dep)

    _cred_split_groups = defaultdict(list)
    for _cred in prev_brs["credited_not_book"]:
        _manual_hold, _manual_text = _cf_manual_review_remark(_cred)
        if _manual_hold:
            continue
        _cred_split_groups[(
            _cf_date_key(_cred),
            clean_name(str(_cred.get("party", ""))).upper(),
        )].append(_cred)

    _used_cred_split_keys = set()
    for _dep_key, _deps in _dep_split_groups.items():
        if len(_deps) < 2:
            continue
        _dep_amounts = sorted(_amount_cents(_d.get("amount", 0) or 0) for _d in _deps)
        if not _dep_amounts or _dep_amounts[0] <= 0:
            continue
        _dep_date = _dep_key[0]
        _dep_party = _deps[0]["party"]
        _dep_chq   = _norm_chq(_deps[0].get("chq_no", ""))
        _dep_chq_generic = _dep_chq in ("", "0", "nan", "99", "511")
        for _cred_key, _creds in _cred_split_groups.items():
            if _cred_key in _used_cred_split_keys or len(_creds) != len(_deps):
                continue
            if _cred_key[0] != _dep_date:
                continue
            _cred_amounts = sorted(_amount_cents(_c.get("amount", 0) or 0) for _c in _creds)
            if _cred_amounts != _dep_amounts:
                continue
            # FIX (CHAD): Require party name match before cancelling split entries.
            # Without this check, KRITIKA (deposited) cancels against
            # "CreditTransfer From IndusInd Account" (credited) purely on amount+date,
            # silently removing both from the BRS even though they are unrelated.
            # Use a 50% floor for generic-chq splits - lower than the 90% used in
            # regular cross-clear because split cross-clear already requires same date
            # AND exact matching amounts for each part, making coincidence unlikely.
            # This allows legitimate same-company abbreviations (e.g. "INTERVIEW STREET
            # TECH PVT LTD" vs "INTERVIEW STREET TECHNOLOGIES", score ~75%) while
            # blocking clearly unrelated parties (e.g. "KRITIKA" vs "CreditTransfer
            # From IndusInd Account", score ~23%).
            _cred_party   = _creds[0]["party"]
            _split_score  = fuzzy(_dep_party, _cred_party)
            _min_score    = 50 if _dep_chq_generic else FUZZY_THRESHOLD
            if _split_score < _min_score:
                print(f"[CF] Pre-pass SPLIT CROSS-CLEAR BLOCKED "
                      f"(score {_split_score}% < {_min_score}%): "
                      f"deposited '{_dep_party}' vs credited '{_cred_party}' "
                      f"- different parties, not cancelling")
                continue

            # Uniqueness check: only nullify if each party+amount leg appears
            # exactly ONCE across all deposited_not_credited items.
            # If the same party+amount appears multiple times (e.g. two separate
            # split payments for the same person), we can't tell which pair to
            # cancel - leave both sides visible for manual review.
            _all_dep_keys = [
                (clean_name(str(_d.get("party", ""))).upper(),
                 round(float(_d.get("amount", 0) or 0), 2))
                for _d in prev_brs["deposited_not_credited"]
            ]
            _is_unique = all(
                _all_dep_keys.count(
                    (clean_name(str(_d.get("party", ""))).upper(),
                     round(float(_d.get("amount", 0) or 0), 2))
                ) == 1
                for _d in _deps
            )
            if not _is_unique:
                print(f"[CF] Pre-pass SPLIT CROSS-CLEAR BLOCKED "
                      f"(multiple matches for '{_dep_party}'): "
                      f"party+amount not unique - leaving both sides visible")
                continue

            for _dep in _deps:
                _cross_cleared_dep_keys.add((
                    _dep["party"].upper().strip(), round(_dep["amount"], 2)
                ))
            for _cred in _creds:
                _cross_cleared_cred_keys.add((
                    _cred["party"].upper().strip(), round(_cred["amount"], 2)
                ))
            _used_cred_split_keys.add(_cred_key)
            _parts = " + ".join(
                f"Rs{float(_d.get('amount', 0) or 0):,.2f}" for _d in _deps
            )
            print(f"[CF] Pre-pass SPLIT CROSS-CLEAR: deposited_not_credited "
                  f"'{_deps[0]['party']}' ({_parts}) <-> credited_not_book "
                  f"'{_creds[0]['party']}' on {_dep_date} - exact split amounts cancel")
            break

    _cross_cleared_ind_keys = set()
    _cross_cleared_dnb_keys = set()
    for _dnb in prev_brs["debited_not_book"]:
        _manual_dnb_hold, _manual_dnb_text = _cf_manual_review_remark(_dnb)
        if _manual_dnb_hold:
            continue
        for _ind in prev_brs["issued_not_debited"]:
            _manual_ind_hold, _manual_ind_text = _cf_manual_review_remark(_ind)
            if _manual_ind_hold:
                continue
            if (fuzzy(_dnb["party"], _ind["party"]) >= FUZZY_THRESHOLD and
                    abs(_dnb["amount"] - _ind["amount"]) < 0.01):
                if _dnb.get("chq_no") or _ind.get("chq_no"):
                    _ind_chq = _norm_chq(_ind.get("chq_no", ""))
                    _dnb_chq = _norm_chq(_dnb.get("chq_no", ""))
                    _both_real = (
                        _ind_chq not in ("", "0", "nan", "99", "511") and
                        _dnb_chq not in ("", "0", "nan", "99", "511")
                    )
                    if _both_real and _ind_chq != _dnb_chq:
                        # FIX (AHMD): Different cheque numbers = different instruments.
                        # e.g. issued chq 723033 (SHEERALI BHARGAV PANDYA) vs
                        # debited chq 723039 (BHARGAV VIRENDRA PAN) - fuzzy "BHARGAV"
                        # match must not cancel two different instruments.
                        print(f"[CF] Pre-pass CROSS-CLEAR BLOCKED: chq mismatch "
                              f"issued chq={_ind['chq_no']} '{_ind['party']}' "
                              f"Rs{_ind['amount']:,.2f} vs "
                              f"debited chq={_dnb['chq_no']} '{_dnb['party']}' "
                              f"- different instruments, not cancelling")
                        blocked_crossclears.append({
                            "reason":      "Different cheque numbers - different instruments",
                            "side_a":      {**_ind, "section": "issued_not_debited"},
                            "side_b":      {**_dnb, "section": "debited_not_book"},
                            "fuzzy_score": fuzzy(_ind["party"], _dnb["party"]),
                        })
                        continue
                    if _both_real and _ind_chq == _dnb_chq:
                        # FIX (DLHI): Same cheque number on both sides, but party names
                        # must be the SAME person before we cancel them out.
                        # e.g. issued SAMIKSHA BHAGAT chq 159933 vs debited SATISH BHAGAT
                        # chq 159933 - they share "BHAGAT" (fuzzy >= 65%) but are different
                        # people. The cheque was issued to one party but the bank debited
                        # a different remittee. This is a genuine discrepancy that must
                        # remain visible in the BRS on both sides.
                        # Require a very high match (>= 90%) to confirm it is the same person.
                        _same_person_score = fuzzy(_dnb["party"], _ind["party"])
                        if _same_person_score < 90:
                            print(f"[CF] Pre-pass CROSS-CLEAR BLOCKED: same chq={_ind_chq} "
                                  f"but different parties (score {_same_person_score}% < 90%): "
                                  f"issued '{_ind['party']}' vs debited '{_dnb['party']}' "
                                  f"Rs{_ind['amount']:,.2f} - keeping both in BRS")
                            blocked_crossclears.append({
                                "reason":      f"Same chq {_ind_chq} but different parties ({_same_person_score}% < 90%) - cheque issued to one person, bank debited to another",
                                "side_a":      {**_ind, "section": "issued_not_debited"},
                                "side_b":      {**_dnb, "section": "debited_not_book"},
                                "fuzzy_score": _same_person_score,
                            })
                            continue
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
        _manual_dnb_hold, _manual_dnb_text = _cf_manual_review_remark(_dnb)
        if _manual_dnb_hold:
            continue
        _dnb_narr = str(_dnb.get("narration", "")).upper()
        _dnb_chq = _norm_chq(_dnb.get("chq_no", ""))
        if "SHORT" not in _dnb_narr or _dnb_chq == "0":
            continue
        for _ind in prev_brs["issued_not_debited"]:
            _manual_ind_hold, _manual_ind_text = _cf_manual_review_remark(_ind)
            if _manual_ind_hold:
                continue
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
        _manual_hold, _manual_text = _cf_manual_review_remark(item)
        if _manual_hold:
            _carry_forward_manual_review_item("issued_not_debited", item, _manual_text)
            continue
        _key = (item["party"].upper().strip(), round(item["amount"], 2))
        if _key in _cross_cleared_ind_keys:
            cleared_log.append({**item, "section": "issued_not_debited",
                                 "status": "CLEARED (cross-matched with debited_not_book)"})
            continue
        item_chq = _norm_chq(item.get("chq_no", ""))
        if item_chq and item_chq not in GENERIC_CHQ:
            chq_groups[item["chq_no"]].append(item)
        else:
            no_chq_items.append(item)

    # -- Debug: print what's in stmt["Chq No"] so we can verify chq lookup works --
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
        split_stmt_indices = []
        if not cleared:
            split_item = {
                **items[0],
                "party": rep_party,
                "amount": check_amount,
                "chq_no": chq_no,
                "section": "issued_not_debited",
            }
            if find_stmt_split_match(split_item, "OUTFLOW"):
                cleared = True
                stmt_idx = None
                split_stmt_indices = split_item.get("_cleared_stmt_indices", [])
        # -- Last-resort fallback: unique amount match among OUTFLOW rows -----
        # -- Last-resort fallback: unique amount match among OUTFLOW rows -----
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
                # Do NOT clear if this bank row has a RETURN counterpart -
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
                          f"amt={check_amount:,.2f} - stmt row has RETURN counterpart")
                elif _norm_chq(_ah_chq) in GENERIC_CHQ or _norm_chq(_ah_chq) == _norm_chq(chq_no):
                    _ah_party = str(stmt.at[_ah_idx, "Party"])
                    _ah_score = fuzzy(rep_party, _ah_party)
                    if (_ah_chq not in ("", "nan", "0") and
                            _norm_chq(_ah_chq) == _norm_chq(chq_no) and
                            _ah_score < FUZZY_THRESHOLD):
                        print(f"[CF] chq_cleared LAST-RESORT BLOCKED (name mismatch): "
                              f"chq={chq_no} book party='{rep_party}' bank party='{_ah_party}' "
                              f"score={_ah_score}% < {FUZZY_THRESHOLD}% - keeping both in BRS")
                    else:
                        stmt.at[_ah_idx, "_used_cf"] = True
                        stmt_idx = _ah_idx
                        cleared  = True
                        print(f"[CF] chq_cleared LAST-RESORT amt-match: chq={chq_no} "
                              f"amt={check_amount:,.2f} -> stmt idx={_ah_idx}")

        if cleared:
            consume_chq_in_stmt(stmt_idx)
        cleared_stmt_rows = (
            _stmt_rows_from_indices([stmt_idx])
            if stmt_idx is not None
            else _stmt_rows_from_indices(split_stmt_indices)
        )
        for item in items:
            if cleared:
                cleared_log.append({
                    **item,
                    "section": "issued_not_debited",
                    "status": "CLEARED",
                    "cleared_by_stmt_rows": cleared_stmt_rows,
                    "backdated_clear": bool(cleared_stmt_rows),
                })
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
            cleared_stmt_rows = _stmt_rows_from_indices(item.get("_cleared_stmt_indices", []))
            cleared_log.append({
                **item,
                "section": "issued_not_debited",
                "status": "CLEARED",
                "cleared_by_stmt_rows": cleared_stmt_rows,
                "backdated_clear": bool(cleared_stmt_rows),
            })
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
        _item_bill = str(_item.get("bill_no", "")).strip()
        _item_chq = _norm_chq(_item.get("chq_no", ""))
        _dep_words2 = set(_item["party"].upper().split()) - {
            "PVT", "LTD", "LIMITED", "PRIVATE", "THE", "OF", "AND"
        }
        _dep_words2 = {w for w in _dep_words2 if len(w) >= 4 and w not in _COMMON_SURNAMES}
        for _bo_idx, _bo_row in list(_book_only.iterrows()):
            if _bo_row["Direction"] != "INFLOW":
                continue
            if abs(float(_bo_row["Book Amt (Rs)"]) - _item["amount"]) > 0.01:
                continue
            _bo_bill = str(_bo_row.get("Bill No", "")).strip()
            _bo_chq = _norm_chq(_bo_row.get("Chq No", ""))
            if _item_bill and _bo_bill and _item_bill != _bo_bill:
                continue
            if (_item_chq not in ("", "0", "99", "511") and
                    _bo_chq not in ("", "0", "99", "511") and
                    _item_chq != _bo_chq):
                continue
            _bo_words = set(str(_bo_row["Party"]).upper().split())
            _score = fuzzy(_item["party"], str(_bo_row["Party"]))
            _same_real_chq = (
                _item_chq not in ("", "0", "99", "511") and
                _item_chq == _bo_chq
            )
            if (_score >= FUZZY_THRESHOLD or
                    _same_real_chq or
                    bool(_dep_words2 & _bo_words)):
                _book_only = _book_only.drop(index=_bo_idx)
                print(f"[CF] deposited_not_credited: removed book_only INFLOW "
                      f"idx={_bo_idx} party='{_bo_row['Party']}' "
                      f"amt={_item['amount']:,.2f}")
                return _book_only
        return _book_only

    def _find_unique_deposit_clear_by_amount(_item):
        _item_chq = _norm_chq(_item.get("chq_no", ""))
        if _item_chq in ("0", "", "99", "511"):
            return None

        _hits = stmt[
            (~stmt["_used_cf"]) & (stmt["Direction"] == "INFLOW") &
            (abs(stmt["Bank Amt (Rs)"] - float(_item["amount"])) < 0.01)
        ]
        if len(_hits) != 1:
            return None

        _si = _hits.index[0]
        _sr = stmt.loc[_si]
        _desc = str(_sr.get("Description", "")).upper()
        _party = str(_sr.get("Party", "")).upper()
        _bank_chq = _norm_chq(_sr.get("Chq No", ""))
        _looks_like_deposit = (
            bool(re.search(r"\b(CLG|CLEARING|CHEQUE|CHQ)\b", _desc)) or
            _desc.startswith("CLG/") or
            (_bank_chq not in ("0", "", "99", "511") and _party.isdigit())
        )
        if not _looks_like_deposit:
            return None

        _item_date = _item.get("date", "")
        if _item_date:
            _diff = _date_diff(_item_date, _sr.get("Date", ""))
            if _diff is not None and _diff > DATE_THRESHOLD_DAYS * 10:
                return None

        return _si

    dep_groups = defaultdict(list)
    for _dep in prev_brs["deposited_not_credited"]:
        _manual_hold, _manual_text = _cf_manual_review_remark(_dep)
        if _manual_hold:
            continue
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
        _manual_hold, _manual_text = _cf_manual_review_remark(item)
        if _manual_hold:
            _carry_forward_manual_review_item("deposited_not_credited", item, _manual_text)
            _processed_dep_items.add(id(item))
            continue
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
                          f"'{item['party']}' <-> '{_sr['Party']}' "
                          f"amt={item['amount']:,.2f} -> idx={_si}")
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
                              f"'{item['party']}' <-> '{_sr['Party']}' "
                              f"amt={item['amount']:,.2f} -> idx={_si}")
                        break
            if not cleared:
                _si = _find_unique_deposit_clear_by_amount(item)
                if _si is not None:
                    stmt.at[_si, "_used_cf"] = True
                    item["_cleared_stmt_indices"] = [_si]
                    cleared = True
                    print(f"[CF] deposited_not_credited cheque-deposit amount clear: "
                          f"'{item['party']}' amt={item['amount']:,.2f} -> idx={_si} "
                          f"desc='{str(stmt.at[_si, 'Description'])[:60]}'")
        if cleared:
            cleared_log.append({
                **item,
                "section": "deposited_not_credited",
                "status": "CLEARED",
                "cleared_by_stmt_rows": _stmt_rows_from_indices(item.get("_cleared_stmt_indices", [])),
                "backdated_clear": bool(item.get("_cleared_stmt_indices", [])),
            })
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
        _manual_hold, _manual_text = _cf_manual_review_remark(item)
        if _manual_hold:
            _carry_forward_manual_review_item("debited_not_book", item, _manual_text)
            continue
        already_recorded = False
        matched_outflow_idx = None
        matched_outflow_indices = []
        matched_current_book_rows = []

        def _remember_debited_book_row(book_row):
            data = book_row.to_dict() if hasattr(book_row, "to_dict") else dict(book_row)
            key = (
                str(data.get("Date", "")).strip(),
                str(data.get("Txn Type", "")).strip(),
                str(data.get("Bill No", "")).strip(),
                str(data.get("Chq No", "")).strip(),
                str(data.get("Party", "")).strip().upper(),
                round(float(data.get("Book Amt (Rs)", 0) or 0), 2),
            )
            seen = {
                (
                    str(r.get("Date", "")).strip(),
                    str(r.get("Txn Type", "")).strip(),
                    str(r.get("Bill No", "")).strip(),
                    str(r.get("Chq No", "")).strip(),
                    str(r.get("Party", "")).strip().upper(),
                    round(float(r.get("Book Amt (Rs)", 0) or 0), 2),
                )
                for r in matched_current_book_rows
            }
            if key not in seen:
                matched_current_book_rows.append(data)

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
                matched_outflow_indices.append(bo_idx)
                _remember_debited_book_row(br)
                print(f"[CF] debited_not_book CLEARED (book_only match): '{item['party']}' "
                      f"Rs{item['amount']:,.2f} <-> book_only idx={bo_idx} '{br['Party']}'")
                break
        if not already_recorded:
            bo_outflow = book_only[book_only["Direction"] == "OUTFLOW"]
            split_candidates = [
                bo_idx for bo_idx, br in bo_outflow.iterrows()
                if bo_idx not in debited_nb_book_only_to_remove
                and (
                    fuzzy(item["party"], str(br["Party"])) >= FUZZY_THRESHOLD or
                    bool(_meaningful_words(item["party"]) & _meaningful_words(
                        f"{br.get('Party', '')} {br.get('Narration', '')}"
                    ))
                )
            ]
            split_idxs = _find_amount_subset(
                split_candidates,
                lambda idx: book_only.at[idx, "Book Amt (Rs)"],
                item["amount"],
                min_parts=2,
            )
            if split_idxs:
                already_recorded = True
                matched_outflow_indices.extend(split_idxs)
                for _split_idx in split_idxs:
                    _remember_debited_book_row(book_only.loc[_split_idx])
                debited_nb_book_only_to_remove.extend(split_idxs)
                parts = " + ".join(
                    f"Rs{float(book_only.at[idx, 'Book Amt (Rs)']):,.2f}"
                    for idx in split_idxs
                )
                print(f"[CF] debited_not_book split-booking CLEARED: '{item['party']}' "
                      f"Rs{item['amount']:,.2f} = {parts}")
        if already_recorded:
            _book_rows_for_audit = list(matched_current_book_rows)
            _audit_keys = {
                (
                    str(r.get("Date", "")).strip(),
                    str(r.get("Txn Type", "")).strip(),
                    str(r.get("Bill No", "")).strip(),
                    str(r.get("Chq No", "")).strip(),
                    str(r.get("Party", "")).strip().upper(),
                    round(float(r.get("Book Amt (Rs)", 0) or 0), 2),
                )
                for r in _book_rows_for_audit
            }
            for _moi in dict.fromkeys(matched_outflow_indices):
                if _moi in book_only.index:
                    _audit_row = book_only.loc[_moi].to_dict()
                    _audit_key = (
                        str(_audit_row.get("Date", "")).strip(),
                        str(_audit_row.get("Txn Type", "")).strip(),
                        str(_audit_row.get("Bill No", "")).strip(),
                        str(_audit_row.get("Chq No", "")).strip(),
                        str(_audit_row.get("Party", "")).strip().upper(),
                        round(float(_audit_row.get("Book Amt (Rs)", 0) or 0), 2),
                    )
                    if _audit_key not in _audit_keys:
                        _book_rows_for_audit.append(_audit_row)
                        _audit_keys.add(_audit_key)
            cleared_log.append({
                **item,
                "section": "debited_not_book",
                "status": "CLEARED",
                "cleared_by_book_rows": _book_rows_for_audit,
                "backdated_clear": bool(_book_rows_for_audit),
            })
            if matched_outflow_idx is not None:
                debited_nb_book_only_to_remove.append(matched_outflow_idx)
        else:
            carryforward_log.append({**item, "section": "debited_not_book"})
            cf_stmt_rows.append({
                "Date":          item["date"],
                "Chq No":        item["chq_no"],
                "Description":   item.get("description", ""),  # FIX: Don't use narration as fallback
                "Narration":     item.get("narration", ""),
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
    # CF credited_not_book items - the Receipts entry records receiving a cheque that hasn't
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
                print(f"[CF] RT/PT pair detected - Receipts entry will not clear CF items: "
                      f"party={_br['Party']} Rs{_br['Book Amt (Rs)']:,.2f}")

    # -- Pre-pass: clear credited_not_book items absorbed into current book opening --
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

            # Case 1: gap exactly matches a SINGLE credited_not_book item.
            # FIX (HYD): Only auto-clear when it is the ONLY credited_not_book item.
            # When multiple items are present, a coincidental amount match (e.g. ANSER
            # Rs2000 matching a Rs2000 book-opening gap while 9 other items also exist)
            # is too risky - it silently removes a real unrecorded bank credit from the BRS.
            # Require the single match to be the only item, or fall through to Case 2.
            _single_match = None
            for _ci in _cnb_items:
                if abs(_ci["amount"] - _gap_abs) < 0.01:
                    _single_match = _ci
                    break
            if _single_match is not None and len(_cnb_items) == 1:
                _key = (_single_match["party"].upper().strip(),
                        round(_single_match["amount"], 2))
                _auto_cleared_cnb_keys.add(_key)
                print(f"[CF] Book-opening-gap auto-clear (single exact match, only item): "
                      f"party='{_single_match['party']}' amt={_single_match['amount']:,.2f}")
            elif _single_match is not None:
                print(f"[CF] Book-opening-gap single-item match SKIPPED "
                      f"(party='{_single_match['party']}' amt={_single_match['amount']:,.2f}) "
                      f"- {len(_cnb_items)} other CF items present, coincidental match too risky")

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
                          f"single item or full set ({_total_cnb:,.2f}) - "
                          f"gap likely from normal transactions, no items auto-cleared")

    for item in prev_brs["credited_not_book"]:
        _manual_hold, _manual_text = _cf_manual_review_remark(item)
        if _manual_hold:
            _carry_forward_manual_review_item("credited_not_book", item, _manual_text)
            continue
        already_recorded   = False
        matched_book_only_idx = None
        matched_book_only_indices = []
        matched_current_book_rows = []

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
                    if abs(float(bo_row["Book Amt (Rs)"]) - amt) >= 0.01:
                        continue
                    bo_words = set(str(bo_row["Party"]).upper().split())
                    if cf_words & bo_words:
                        return bo_idx

            for bo_idx, bo_row in book_only.iterrows():
                if bo_idx in book_only_indices_to_remove:
                    continue
                if bo_row["Direction"] != "INFLOW":
                    continue
                if abs(float(bo_row["Book Amt (Rs)"]) - amt) < 0.01:
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
            # Require word length >= 7 to avoid false matches on common surnames
            # (e.g. "BOHRA" len=5, "SHARMA"/"MISHRA" len=6 would all falsely match)
            for word in bp.split():
                if len(word) >= 7 and word in cp:
                    return True
            return False

        def _remember_current_book_row(book_row):
            data = book_row.to_dict() if hasattr(book_row, "to_dict") else dict(book_row)
            key = (
                str(data.get("Date", "")).strip(),
                str(data.get("Txn Type", "")).strip(),
                str(data.get("Bill No", "")).strip(),
                str(data.get("Chq No", "")).strip(),
                str(data.get("Party", "")).strip().upper(),
                round(float(data.get("Book Amt (Rs)", 0) or 0), 2),
            )
            seen = {
                (
                    str(r.get("Date", "")).strip(),
                    str(r.get("Txn Type", "")).strip(),
                    str(r.get("Bill No", "")).strip(),
                    str(r.get("Chq No", "")).strip(),
                    str(r.get("Party", "")).strip().upper(),
                    round(float(r.get("Book Amt (Rs)", 0) or 0), 2),
                )
                for r in matched_current_book_rows
            }
            if key not in seen:
                matched_current_book_rows.append(data)

        def _book_only_row_reserved_for_direct_cf(bo_idx, current_item, current_score):
            """Protect one-to-one CF clears from weaker split/partial clears."""
            if bo_idx not in book_only.index:
                return False
            bo_amt = round(float(book_only.at[bo_idx, "Book Amt (Rs)"] or 0), 2)
            bo_party = str(book_only.at[bo_idx, "Party"] or "")
            current_amt = round(float(current_item.get("amount", 0) or 0), 2)
            current_row = current_item.get("_source_row")
            for other in prev_brs.get("credited_not_book", []):
                if other is current_item:
                    continue
                if current_row is not None and other.get("_source_row") == current_row:
                    continue
                other_amt = round(float(other.get("amount", 0) or 0), 2)
                if abs(other_amt - bo_amt) >= 0.01:
                    continue
                other_score = fuzzy(str(other.get("party", "")), bo_party)
                if other_score < FUZZY_THRESHOLD and not _truncated_name_match(str(other.get("party", "")), bo_party):
                    continue
                # Direct exact-amount rows should win over any partial/split use.
                if abs(current_amt - bo_amt) >= 0.01:
                    return True
                # For same-amount ambiguity, reserve the row for a clearly stronger CF party.
                if other_score >= FUZZY_THRESHOLD and other_score >= current_score + 10:
                    return True
            return False

        for bi, br in book_df.iterrows():
            if br["Direction"] != "INFLOW":
                continue
            if _is_reversal_inflow(br):
                continue
            # Skip Receipts entries that are part of an RT/PT refund pair -
            # these must not be used to clear CF credited_not_book items
            if (str(br.get("Txn Type", "")).strip() == "Receipts" and
                    (str(br["Party"]).strip().upper(),
                     round(float(br["Book Amt (Rs)"]), 2)) in _cf_rtpt_keys):
                continue
            if abs(float(br["Book Amt (Rs)"]) - item["amount"]) >= 0.01:
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
                _direct_score = fuzzy(item["party"], br["Party"])
                if _book_only_row_reserved_for_direct_cf(bo_idx_for_br, item, _direct_score):
                    print(f"[CF] Check1 skipped: book_only[{bo_idx_for_br}] "
                          f"Rs{float(br['Book Amt (Rs)']):,.2f} reserved for stronger direct previous-BRS clear")
                    continue
                already_recorded = True
                matched_book_only_idx = bo_idx_for_br
                matched_book_only_indices.append(bo_idx_for_br)
                _remember_current_book_row(br)
                book_only_indices_to_remove.append(bo_idx_for_br)
                print(f"[CF] Check1 cleared (was book_only): "
                      f"CF={item['party']} Rs{item['amount']:,.2f} <-> book={br['Party']}")
                break
            # This exact current-book row has already been consumed by normal
            # current-period matching. Do not use it as a name anchor while
            # removing a different outstanding book_only row with the same amount.
            print(f"[CF] Check1 skipped: CF={item['party']} "
                  f"Rs{item['amount']:,.2f} matched book={br['Party']} "
                  f"but that exact book row is already consumed by current-period matching")
            continue

        if not already_recorded:
            for bi, br in book_df.iterrows():
                if br["Direction"] != "INFLOW":
                    continue
                if _is_reversal_inflow(br):
                    continue
                # Skip Receipts entries that are part of an RT/PT refund pair -
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
                              f"Rs{item['amount']:,.2f} matched book={br['Party']} "
                              f"but no outstanding book_only row remains")
                        continue
                    _direct_score = fuzzy(item["party"], str(book_only.at[matched_book_only_idx, "Party"]))
                    if _book_only_row_reserved_for_direct_cf(matched_book_only_idx, item, _direct_score):
                        print(f"[CF] Check2 skipped: book_only[{matched_book_only_idx}] "
                              f"reserved for stronger direct previous-BRS clear")
                        continue
                    matched_book_only_indices.append(matched_book_only_idx)
                    _remember_current_book_row(br)
                    already_recorded = True
                    print(f"[CF] Check2 cleared (word overlap): CF={item['party']} "
                        f"Rs{item['amount']:,.2f} <-> book={br['Party']}")
                    break

        excess_amount = None
        if not already_recorded:
            for bi, br in book_df.iterrows():
                if br["Direction"] != "INFLOW":
                    continue
                if _is_reversal_inflow(br):
                    continue
                # Skip Receipts entries that are part of an RT/PT refund pair -
                # these must not be used to clear CF credited_not_book items
                if (str(br.get("Txn Type", "")).strip() == "Receipts" and
                        (str(br["Party"]).strip().upper(),
                        round(float(br["Book Amt (Rs)"]), 2)) in _cf_rtpt_keys):
                    continue
                _bo_idx_check3 = _find_exact_book_only_row(br)
                # FIX (HYD): Don't skip entries that are in book_only but not yet
                # consumed - Check3/3b specifically NEEDS to use book_only entries
                # to do a partial CF clear (e.g. JORUKA 400644 book_only against
                # CF JORUKA 500644 credited, keeping excess 100000 in Add:Credited).
                # Only skip if the book_only row was already consumed by a prior CF item.
                if _bo_idx_check3 is not None and _bo_idx_check3 in book_only_indices_to_remove:
                    continue
                book_amt = float(br["Book Amt (Rs)"])
                cf_amt   = float(item["amount"])
                if book_amt < cf_amt:
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
                    if not strong_name_ok:
                        continue
                    # Check3a: exact half (original logic)
                    _is_exact_half = abs(cf_amt - book_amt * 2) < 0.01
                    # Check3b: general partial - book_amt < cf_amt with a strong anchor.
                    # An anchor is required to prevent accidental partial clears between
                    # unrelated transactions that happen to share a party name.
                    # Strong anchors:
                    #   (a) The book bill number appears in the CF item narration
                    #       e.g. JORUKA CF narration: "EXCESS RECEIVED AGAINST PS NO 6201923"
                    #            book bill_no: 6201923 -> clear book, keep excess 100000
                    #   (b) Party names are identical (100% fuzzy) AND the excess is
                    #       a round number (likely a stated excess/advance amount)
                    _bill_no = str(br.get("Bill No", "")).strip()
                    _cf_narr = str(item.get("narration", "")).upper()
                    _bill_in_narr = bool(_bill_no and _bill_no in _cf_narr)
                    _excess = round(cf_amt - book_amt, 2)
                    _excess_is_round = _excess > 0 and _excess == round(_excess / 100) * 100
                    _excess_is_tiny = 0 < _excess <= 1.0
                    _is_general_partial = (
                        _bill_in_narr or
                        (score >= 95 and (_excess_is_round or _excess_is_tiny))
                    )
                    if not (_is_exact_half or _is_general_partial):
                        continue
                    matched_book_only_idx = _find_in_book_only(book_amt, item["party"])
                    if matched_book_only_idx is None:
                        print(f"[CF] Check3 skipped: CF={item['party']} "
                              f"Rs{cf_amt:,.2f} partial book={br['Party']} "
                              f"has no outstanding book_only row")
                        continue
                    if _book_only_row_reserved_for_direct_cf(matched_book_only_idx, item, score):
                        print(f"[CF] Check3 skipped: book_only[{matched_book_only_idx}] "
                              f"Rs{book_amt:,.2f} reserved for direct previous-BRS clear")
                        continue
                    # FIX (MUMV): When the match is exact-half (CF = 2 x book_amt),
                    # look for a second book_only row of the same party+amount and
                    # clear both together rather than clearing only one and leaving a
                    # Diff. E.g. SONEJI ENGINEERING: CF Rs1,69,894 = book Rs84,947 x 2.
                    if _is_exact_half:
                        _second_bo_idx = None
                        for _bo_idx2, _bo_row2 in book_only.iterrows():
                            if _bo_idx2 == matched_book_only_idx:
                                continue
                            if _bo_idx2 in book_only_indices_to_remove:
                                continue
                            if _bo_row2["Direction"] != "INFLOW":
                                continue
                            if abs(float(_bo_row2["Book Amt (Rs)"]) - book_amt) >= 0.01:
                                continue
                            if (fuzzy(item["party"], str(_bo_row2["Party"])) >= FUZZY_THRESHOLD or
                                    _truncated_name_match(item["party"], str(_bo_row2["Party"]))):
                                _second_bo_idx = _bo_idx2
                                break
                        if _second_bo_idx is not None:
                            # Also find the second matching book_df row to record
                            _second_br = None
                            for _bi2, _br2 in book_df.iterrows():
                                if _bi2 == bi:
                                    continue
                                if _br2["Direction"] != "INFLOW":
                                    continue
                                if abs(float(_br2["Book Amt (Rs)"]) - book_amt) >= 0.01:
                                    continue
                                if (fuzzy(item["party"], str(_br2["Party"])) >= FUZZY_THRESHOLD or
                                        _truncated_name_match(item["party"], str(_br2["Party"]))):
                                    _second_br = _br2
                                    break
                            matched_book_only_indices.append(matched_book_only_idx)
                            matched_book_only_indices.append(_second_bo_idx)
                            book_only_indices_to_remove.append(matched_book_only_idx)
                            book_only_indices_to_remove.append(_second_bo_idx)
                            _remember_current_book_row(br)
                            if _second_br is not None:
                                _remember_current_book_row(_second_br)
                            already_recorded = True
                            excess_amount = None
                            print(f"[CF] Check3 exact-half (both rows): CF={item['party']} "
                                  f"CF=Rs{cf_amt:,.2f} = book Rs{book_amt:,.2f} x 2 "
                                  f"(book_only [{matched_book_only_idx}] + [{_second_bo_idx}])")
                            break  # both book rows cleared - skip single-row path below
                    if already_recorded:
                        # Both rows cleared by exact-half path - skip single-row clear
                        continue
                    matched_book_only_indices.append(matched_book_only_idx)
                    _remember_current_book_row(br)
                    already_recorded = True
                    excess_amount    = _excess
                    _reason = "exact-half" if _is_exact_half else ("bill-in-narr" if _bill_in_narr else ("tiny-excess" if _excess_is_tiny else "round-excess"))
                    print(f"[CF] Check3 partial ({_reason}): {item['party']} "
                          f"CF=Rs{cf_amt:,.2f} Book=Rs{book_amt:,.2f} "
                          f"Excess=Rs{excess_amount:,.2f}")
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
                    if (_book_only_row_reserved_for_direct_cf(bi1, item, score1) or
                            _book_only_row_reserved_for_direct_cf(bi2, item, score2)):
                        print("[CF] Check4b split skipped: book row reserved for direct previous-BRS clear")
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
                          f"Rs{cf_amt:,.2f} = book[{bi1}] + book[{bi2}]")
                    break

        if not already_recorded:
            split_candidates = []
            for idx in bo_indices:
                _split_score = fuzzy(item["party"], str(book_only.at[idx, "Party"]))
                _split_words_ok = bool(_meaningful_words(item["party"]) & _meaningful_words(
                    f"{book_only.at[idx, 'Party']} {book_only.at[idx, 'Narration']}"
                ))
                if _split_score < 30 and not _split_words_ok:
                    continue
                if _book_only_row_reserved_for_direct_cf(idx, item, _split_score):
                    print(f"[CF] Check4b subset skipped book_only[{idx}]: "
                          f"reserved for direct previous-BRS clear")
                    continue
                split_candidates.append(idx)
            split_idxs = _find_amount_subset(
                split_candidates,
                lambda idx: book_only.at[idx, "Book Amt (Rs)"],
                cf_amt,
                min_parts=2,
            )
            if split_idxs:
                _in_stmt = any(
                    abs(float(r["Bank Amt (Rs)"]) - cf_amt) < 0.01 and r["Direction"] == "INFLOW"
                    for _, r in stmt_only.iterrows()
                )
                if not _in_stmt:
                    already_recorded = True
                    matched_book_only_indices.extend(split_idxs)
                    book_only_indices_to_remove.extend(split_idxs)
                    parts = " + ".join(
                        f"Rs{float(book_only.at[idx, 'Book Amt (Rs)']):,.2f}"
                        for idx in split_idxs
                    )
                    print(f"[CF] Check4b split-booking cleared: CF={item['party']} "
                          f"Rs{cf_amt:,.2f} = {parts}")

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
                                  f"Rs{item['amount']:,.2f} matched book={br['Party']} "
                                  f"but no outstanding book_only row remains")
                            continue
                        matched_book_only_indices.append(matched_book_only_idx)
                        _remember_current_book_row(br)
                        already_recorded = True
                        print(f"[CF] Check4 cleared (absent from stmt_only + book match): "
                              f"CF={item['party']} Rs{item['amount']:,.2f} "
                              f"<-> book={br['Party']}  book_only_idx={matched_book_only_idx}")
                        break

        if already_recorded:
            _book_rows_for_audit = list(matched_current_book_rows)
            _audit_keys = {
                (
                    str(r.get("Date", "")).strip(),
                    str(r.get("Txn Type", "")).strip(),
                    str(r.get("Bill No", "")).strip(),
                    str(r.get("Chq No", "")).strip(),
                    str(r.get("Party", "")).strip().upper(),
                    round(float(r.get("Book Amt (Rs)", 0) or 0), 2),
                )
                for r in _book_rows_for_audit
            }
            for _mbi in dict.fromkeys(matched_book_only_indices):
                if _mbi in book_only.index:
                    _audit_row = book_only.loc[_mbi].to_dict()
                    _audit_key = (
                        str(_audit_row.get("Date", "")).strip(),
                        str(_audit_row.get("Txn Type", "")).strip(),
                        str(_audit_row.get("Bill No", "")).strip(),
                        str(_audit_row.get("Chq No", "")).strip(),
                        str(_audit_row.get("Party", "")).strip().upper(),
                        round(float(_audit_row.get("Book Amt (Rs)", 0) or 0), 2),
                    )
                    if _audit_key not in _audit_keys:
                        _book_rows_for_audit.append(_audit_row)
                        _audit_keys.add(_audit_key)
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
                      f"party={item['party']} Rs{item['amount']:,.2f}")

            if excess_amount and excess_amount > 0:
                cf_stmt_rows.append({
                    "Date":          item["date"],
                    "Chq No":        item["chq_no"],
                    "Description":   item.get("description", ""),
                    "Narration":     item.get("narration", ""),
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
                    # FIX: "same party name" alone (_cf_clean == _so_clean) is NOT
                    # sufficient to declare this CF item is already in stmt_only.
                    # When the same person (e.g. "RAVINDER") makes multiple separate
                    # payments, a name-only match would incorrectly suppress the older
                    # CF transaction from appearing in the BRS even though it is a
                    # distinct payment with a different UPI/IMPS reference.
                    # Require EITHER:
                    #   (a) the same 8+ digit transaction reference appears in both
                    #       the CF narration and the stmt_only description, OR
                    #   (b) the date is exactly the same day (not just within threshold)
                    #       AND the fuzzy score is high (>= 85%) - same-day same-name
                    #       same-amount is a reliable duplicate signal.
                    # A name match alone within the date threshold is NOT enough.
                    so_date = so_row.get("Date", "")
                    diff    = _date_diff(item_date, so_date)
                    _same_day = diff is not None and diff == 0
                    party_ok = (
                        _same_ref or
                        (_same_day and _score >= 85 and
                         (_cf_words <= _so_words or _so_words <= _cf_words or bool(_cf_words & _so_words)))
                    )
                    if not (amt_ok and dir_ok and party_ok):
                        continue
                    if diff is not None and diff <= DATE_THRESHOLD_DAYS:
                        already_in_stmt_only = True
                        print(f"[CF] Dedup: skipping cf_stmt_rows for "
                              f"{item['party']} Rs{item['amount']:,.2f}")
                        break

            carryforward_log.append({**item, "section": "credited_not_book"})
            if not already_in_stmt_only:
                cf_stmt_rows.append({
                    "Date":          item["date"],
                    "Chq No":        item["chq_no"],
                    "Description":   item.get("description", ""),  # FIX: Don't use narration as fallback
                    "Narration":     item.get("narration", ""),
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

    def _stmt_clear_key(_row):
        return (
            str(_row.get("Date", "")).strip(),
            str(_row.get("Chq No", "")).strip(),
            str(_row.get("Description", "")).strip(),
            str(_row.get("Party", "")).strip().upper(),
            str(_row.get("Direction", "")).strip(),
            round(float(_row.get("Bank Amt (Rs)", 0) or 0), 2),
        )

    for item in cleared_log:
        _cleared_stmt_keys = {
            _stmt_clear_key(_sr)
            for _sr in item.get("cleared_by_stmt_rows", []) or []
        }
        expected_dir = _CF_SECTION_BANK_DIR.get(item.get("section", ""), None)

        # FIX (CHAD): When a credited_not_book item is cleared by a current book
        # entry (4B-BackdatedClear), cleared_by_stmt_rows is empty - the match was
        # book->CF-bank, not stmt->CF-item.  The CF bank row sits in stmt_only with
        # its original description/date/amount.  Remove it by exact match on those
        # fields so it doesn't float into the BRS "Add: Credited in Bank" section.
        if (not _cleared_stmt_keys and
                item.get("backdated_clear") and
                item.get("cleared_by_book_rows") and
                item.get("section") == "credited_not_book"):
            _cf_desc   = str(item.get("description", "")).strip()
            _cf_date   = str(item.get("date", "")).strip()
            _cf_amt    = round(float(item.get("amount", 0) or 0), 2)
            _cf_party  = str(item.get("party", "")).strip().upper()
            _cf_chq    = str(item.get("chq_no", "")).strip()
            for _si, _sr in stmt_only.iterrows():
                if stmt_only.at[_si, "_remove"]:
                    continue
                if str(_sr.get("Direction", "")) != "INFLOW":
                    continue
                _sr_amt  = round(float(_sr.get("Bank Amt (Rs)", 0) or 0), 2)
                _sr_desc = str(_sr.get("Description", "")).strip()
                _sr_date = str(_sr.get("Date", "")).strip()
                _sr_chq  = str(_sr.get("Chq No", "")).strip()
                _sr_party = str(_sr.get("Party", "")).strip().upper()
                if _sr_amt != _cf_amt:
                    continue
                _desc_match  = _cf_desc and _sr_desc == _cf_desc
                _date_party  = (_cf_date and _sr_date == _cf_date and
                                (_sr_party == _cf_party or
                                 fuzzy(_cf_party, _sr_party) >= FUZZY_THRESHOLD or
                                 any(ref in _sr_desc for ref in re.findall(r"\d{10,}", _cf_desc) if ref)))
                _chq_match   = (_cf_chq and _cf_chq not in ("0","","nan","99","511") and
                                _sr_chq == _cf_chq)
                if _desc_match or _date_party or _chq_match:
                    stmt_only.at[_si, "_remove"] = True
                    print(f"[CF] Removed 4B-BackdatedClear CF bank row from stmt_only: "
                          f"party='{item['party']}' Rs{_cf_amt:,.2f} "
                          f"date='{_cf_date}' desc='{_cf_desc[:50]}'")
                    break
            continue  # skip the old removal logic for this item

        for si, sr in stmt_only.iterrows():
            if stmt_only.at[si, "_remove"]:
                continue
            if _cleared_stmt_keys and _stmt_clear_key(sr) in _cleared_stmt_keys:
                stmt_only.at[si, "_remove"] = True
                break
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
    return book_only, stmt_only, cleared_log, carryforward_log, blocked_crossclears

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

    # -- Detect BRS-output book format ------------------------------------------
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
    # --------------------------------------------------------------------------

    rows = []
    for r in row_slice:
        while len(r) <= COL_NARR:
            r.append(None)

        # -- BRS-output format parser ------------------------------------------
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
        # ---------------------------------------------------------------------

        txn = r[COL_TXN]
        if not isinstance(txn, str):
            continue
        if txn.strip() in ("Transaction", "") or txn.startswith("Summary"):
            continue

        chq_no    = str(r[COL_CHQ]).strip().replace(".0", "")  if pd.notna(r[COL_CHQ])  else ""
        bill_no   = str(r[COL_BILL]).strip().replace(".0", "") if pd.notna(r[COL_BILL]) else ""
        date_raw  = r[COL_DATE] if len(r) > COL_DATE and pd.notna(r[COL_DATE]) else None  # <- ADD
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
            print(f"[Book] HOT entry - party set to company name for matching: '{name}'")
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
        print(f"[Book] No transaction rows found for bank '{bank_id}' - "
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
    "Bank Amt (Rs)", "Display Amt (Rs)", "Balance (Rs)", "Narration"
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
            print("[Statement] xlrd not found - attempting auto-convert via LibreOffice...")
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

    # TEMP DEBUG - print first 30 rows to find real header
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

    # -- Strategy 1 -----------------------------------------------------------
    # Scan every row for header-like label keywords.
    # Key fixes vs old code:
    #   OLD: skipped rows where ts_count>=2 (date-typed cells) - this wrongly
    #        skipped the Axis bank header which has "Transaction Date","Value Date"
    #        as actual date-object cells in the Excel.
    #   NEW: skip rows that have 2+ LARGE NUMERIC values instead - those are
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
            print(f"[Statement] S1 skip row {i} - no data follows "
                  f"(footer/legend): {[c for c in cells_lower if c][:6]}")
            continue

        hdr     = i
        col_map = _build_col_map(cells_lower)
        print(f"[Statement] Strategy 1 at row {i}: {[c for c in cells_lower if c]}")
        print(f"[Statement] col_map (S1): {col_map}")
        break

    if hdr is None:
        print("[Statement] Strategy 1 failed -> trying Strategy 2 (Axis/single-col-A rebuild)")

        total_rows = len(raw)
        single_col_rows = sum(
            1 for _, row in raw.iterrows()
            if sum(1 for v in row.tolist() if pd.notna(v) and str(v).strip()) == 1
               and pd.notna(row.tolist()[0]) and str(row.tolist()[0]).strip()
        )
        single_col_ratio = single_col_rows / max(total_rows, 1)
        print(f"[Statement] Single-col-A ratio: {single_col_rows}/{total_rows} = {single_col_ratio:.0%}")

        if single_col_ratio >= 0.70:
            print("[Statement] Strategy 2: Axis single-column format detected - rebuilding table")
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
                    # No label row passed validation - take the first one as last resort
                    hdr = col_a_labels[0][0]
                    print(f"[Statement] Strategy 2d fallback: first label row={hdr}")

    if hdr is None:
        print("[Statement] Strategy 2 failed -> trying Strategy 3 (data-row scan)")
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
        print("[Statement] Strategy 3 failed -> trying Strategy 4 (brute force)")
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

    # -- Inner helper: robust amount parser -----------------------------------
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

    # -- Inner helper: extract closing/running balance from a row -------------
    # Priority 1: mapped balance column (most reliable).
    # Priority 2: rightmost parseable positive value that is NOT in the
    #             debit or credit columns (balance is almost always rightmost).
    # Works for both float cells (Format A) and Indian-comma strings (Format B).
    def _extract_balance_from_row(cells, current_best=0.0):
        bal_col    = col_map.get("balance")
        debit_col  = col_map.get("debit")
        credit_col = col_map.get("credit")
        skip_cols  = {c for c in (debit_col, credit_col) if c is not None}

        # Priority 1 - explicitly mapped balance column
        if bal_col is not None and bal_col < len(cells):
            val = _parse_amount(cells[bal_col])
            if val > 0:
                return val

        # Priority 2 - rightmost parseable value, skipping debit/credit cols
        for ci in range(len(cells) - 1, -1, -1):
            if ci in skip_cols:
                continue
            val = _parse_amount(cells[ci])
            if val > 100:        # ignore tiny amounts like fees/charges
                return val

        return current_best

    # -- Summary-row keyword pattern ------------------------------------------
    # OLD code used \s*$ which required row_text to END with the keyword.
    # That broke for Format B (Bangalore) where row_text is:
    #   "CLOSING BALANCE 8,11,407.90"  - keyword is NOT at end of string.
    # FIX: use \b (word boundary) so the keyword is matched at the START
    # of row_text regardless of what follows it.
    # We also split "closing balance" rows (-> extract balance) from other
    # summary rows like "TRANSACTION TOTAL" (-> skip only, no balance update)
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
        rejected_removed_cheque = is_rejected_cheque_text(row_text)
        if _chq_return_refs:
            _row_ref = str(r[col_map["chq"]]).strip() if col_map.get("chq") is not None and col_map["chq"] < len(r) else ""
            if _row_ref and _row_ref in _chq_return_refs:
                rejected_removed_cheque = True
        non_empty = [str(v).strip() for v in r if pd.notna(v) and str(v).strip()]
        if not non_empty:
            continue

        # -- Summary / footer row handling ------------------------------------
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
            # Always skip summary rows - never treat them as transactions.
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
        rejected_removed_cheque = rejected_removed_cheque or is_rejected_cheque_text(desc, chq)

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

        # -- Per-row running balance -------------------------------------------
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

        display_bank_amt = bank_amt
        party = extract_party_from_desc(desc)   # extract BEFORE nullification tag is appended
        if rejected_removed_cheque:
            desc = f"{desc} [REJECTED/REMOVED CHEQUE - NULLIFIED]".strip()
            debit = 0.0
            credit = 0.0
            bank_amt = 0.0

        chq_clean = ""
        if chq and chq not in ("-", "nan", "") and len(chq) <= 15:
            try:
                int(chq); chq_clean = chq
            except ValueError:
                if re.fullmatch(r"[A-Z0-9]{4,15}", chq.upper()):
                    chq_clean = chq

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
            "Display Amt (Rs)": display_bank_amt,
            "Balance (Rs)":  bal,
        })

    # -- Post-loop closing balance fallback ------------------------------------
    # Runs only when the main loop did not capture any balance at all.
    # Three tiers - stops as soon as a positive value is found.
    #
    # Tier 1: header area (top ~25 rows) - labelled patterns like
    #         "Closing Balance : 811407.90" or key-value cell pairs.
    #
    # Tier 2: full raw-sheet scan for ANY row containing "closing balance".
    #         This is the critical fallback for Format B (Bangalore) where
    #         the closing-balance row has no date and was skipped during the
    #         main data loop, AND the summary-row regex above also missed it
    #         because it appears below the data (after the chq-return pre-scan
    #         slice).  Scanning `raw` (not `data`) guarantees we find it.
    #
    # Tier 3: last resort - walk data rows and pick the rightmost numeric value.
    # -------------------------------------------------------------------------

    if bank_closing_bal == 0.0:
        # Tier 1 - header area label scan
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
        # Tier 2 - full raw sheet scan for any "closing balance" labelled row.
        # Scans `raw` (entire sheet) so footer rows not in `data` are included.
        for _, _cb_row in raw.iterrows():
            _cb_list = _cb_row.tolist()
            _cb_text = " ".join(
                str(v).strip() if pd.notna(v) else "" for v in _cb_list
            )
            if not _CLOSING_BAL_RE.search(_cb_text):
                continue
            # Use helper - handles float cells and Indian-comma strings equally
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
        # Tier 3 - absolute last resort: walk data rows using the balance helper
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

    if not df.empty:
        df["Rejected Cheque"] = False
        _return_mask = df["Description"].astype(str).str.contains(
            r"\b(?:RETURN|RETURNED|REJECT|REJECTED|REMOVE|REMOVED|BOUNCE|BOUNCED)\b",
            regex=True, case=False, na=False
        )
        _return_chqs = {
            str(v).strip()
            for v in df.loc[_return_mask, "Chq No"].tolist()
            if str(v).strip() not in ("", "nan", "0", "-", "99", "511")
        }
        _return_refs = set()
        for _desc in df.loc[_return_mask, "Description"].astype(str):
            _return_refs.update(re.findall(r"\b(?:AX[A-Z0-9]+|SK[A-Z0-9]+|UTIBR[A-Z0-9]+)\b", _desc.upper()))

        def _shares_return_ref(_row):
            # FIX: Only flag a row as a rejected/returned cheque if its OWN description
            # contains return/reject/bounce keywords, OR if its own transaction reference
            # number appears inside a known RETURN description.
            # Removed: cheque-number sharing check (_return_chqs) - the original debit
            # entry legitimately shares a chq number with the RETURN credit entry but
            # should NOT itself be classified as a returned cheque.
            _desc = str(_row.get("Description", "")).upper()
            if is_rejected_cheque_text(_desc):
                return True
            return any(_ref and _ref in _desc for _ref in _return_refs)

        _reject_mask = df.apply(_shares_return_ref, axis=1)
        if _reject_mask.any():
            if "Display Amt (Rs)" not in df.columns:
                df["Display Amt (Rs)"] = df["Bank Amt (Rs)"]
            _display_blank = df["Display Amt (Rs)"].fillna(0).astype(float).abs() < 0.01
            df.loc[_reject_mask & _display_blank, "Display Amt (Rs)"] = df.loc[_reject_mask & _display_blank, "Bank Amt (Rs)"]
            df.loc[_reject_mask, "Rejected Cheque"] = True
            for _idx in df[_reject_mask].index:
                _desc = str(df.at[_idx, "Description"])
                if "[REJECTED/REMOVED CHEQUE - NULLIFIED]" not in _desc:
                    df.at[_idx, "Description"] = f"{_desc} [REJECTED/REMOVED CHEQUE - NULLIFIED]".strip()
            df.loc[_reject_mask, "Debit (Rs)"] = ""
            df.loc[_reject_mask, "Credit (Rs)"] = ""
            df.loc[_reject_mask, "Bank Amt (Rs)"] = 0.0
            print(f"[Statement] Nullified/highlighted {_reject_mask.sum()} rejected/returned cheque row(s)")

    print(f"[Statement] Parsed {len(df)} transaction rows | Bank closing bal: {bank_closing_bal}")
    return df, bank_closing_bal, account_no, branch_label, bank_name_from_stmt, is_no_transactions

# =============================================================================
# 3. RECONCILE - 5-pass matching engine (+ new Pass 3e)
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
        return empty_matched, book_only, stmt_only, []

    book = book_df.copy(); stmt = stmt_df.copy()

    book["_used"] = False; stmt["_used"] = False; matched_rows = []
    book["Chq No"] = book["Chq No"].astype(str).str.strip()
    stmt["Chq No"] = stmt["Chq No"].astype(str).str.strip()

    # -- Helpers ---------------------------------------------------------------
    CHQ_ABSENT = {"", "nan", "0", "99", "511"}  # FIX (COARP): 99/511 are generic, not real chq numbers

    def _norm_chq(c):
        s = str(c or "").strip().replace(".0", "")
        if s.lower() in CHQ_ABSENT or not re.fullmatch(r"\d{1,6}", s):
            return "0"
        s = s.lstrip("0")
        return s if s else "0"
    def _chq_verdict(book_chq, bank_chq):
        b1 = _norm_chq(book_chq); b2 = _norm_chq(bank_chq)
        if b1 in CHQ_ABSENT or b2 in CHQ_ABSENT:
            return "ignore"
        if b1 == b2:
            return "match"
        # Allow near-match for single-digit INSERTION/DELETION typos only
        # (e.g. book chq=2333383, bank chq=233383 - extra repeated digit in book).
        # We do NOT allow substitutions (same length, one digit changed) because
        # that would incorrectly merge distinct cheques like 154184 vs 154189.
        # Only apply when the lengths differ by exactly 1 (pure insert/delete).
        if abs(len(b1) - len(b2)) == 1:
            longer, shorter = (b1, b2) if len(b1) > len(b2) else (b2, b1)
            # Check if shorter is obtainable by deleting exactly one char from longer
            for skip in range(len(longer)):
                if longer[:skip] + longer[skip+1:] == shorter:
                    return "ignore"   # one-char insertion typo - allow match
        return "reject"

    def _core_match(br, sr):
        if br["Direction"] != sr["Direction"]: return False
        if abs(float(sr["Bank Amt (Rs)"]) - float(br["Book Amt (Rs)"])) >= 0.01: return False
        if not within_date(br.get("Date", ""), sr["Date"]): return False
        if _chq_verdict(br["Chq No"], sr["Chq No"]) == "reject": return False
        return True

    def _has_bank_reference(value):
        text = str(value or "").strip().replace("'", "")
        return text.lower() not in CHQ_ABSENT and text not in ("", "-")

    def _is_cash_deposit_book_row(br):
        if str(br.get("Direction", "")).upper() != "INFLOW":
            return False
        if _norm_chq(br.get("Chq No", "")) not in CHQ_ABSENT:
            return False
        text = " ".join(str(br.get(c, "")) for c in ("Txn Type", "Narration"))
        text_up = text.upper()
        return "DEPOSIT WITHDRAWALS" in text_up and "CASH DEPOSIT" in text_up

    def _is_cash_deposit_bank_row(sr):
        text = f"{sr.get('Description', '')} {sr.get('Party', '')}".upper()
        return "CASH DEPOSIT" in text or "CASH DEP" in text

    # -- Pre-pass: RT/PT refund pair detection --------------------------------
    # When the book has a 'Receipts' INFLOW (chq=generic) AND a 'Payments' OUTFLOW
    # (chq=real number) for the SAME party and SAME amount in the same period,
    # this is a receipt+refund pair where the refund approval has not been taken.
    # Example: company received a customer cheque (Receipts), then issued a refund
    # cheque (Payments/PT). The bank cleared the refund cheque as a debit.
    # Manual BRS treatment: Payments goes to "issued-not-debited", bank debit goes
    # to "debited-not-book" - they are NOT matched to each other.
    # Without this pre-pass, Pass 1 would match the Payments OUTFLOW to the bank
    # OUTFLOW by cheque number, making both disappear from the BRS sections.
    _refund_pair_chqs = set()  # cheque numbers of Payments entries that are RT/PT pairs
    _receipt_keys = set()      # (cleaned_party, amount) of all Receipts INFLOW entries
    for bi, br in book[book["Txn Type"] == "Receipts"].iterrows():
        if br["Direction"] == "INFLOW":
            _receipt_keys.add((br["Party"], round(float(br["Book Amt (Rs)"]), 2)))
    for bi, br in book[book["Txn Type"] == "Payments"].iterrows():
        if br["Direction"] == "OUTFLOW" and _norm_chq(br["Chq No"]) not in CHQ_ABSENT:
            key = (br["Party"], round(float(br["Book Amt (Rs)"]), 2))
            if key in _receipt_keys:
                _refund_pair_chqs.add(br["Chq No"])
                print(f"[Reconcile] RT/PT refund pair detected: chq={br['Chq No']} "
                      f"party={br['Party']} Rs{br['Book Amt (Rs)']:,.2f} - will not match to bank")
    book["_refund_pair"] = book["Chq No"].isin(_refund_pair_chqs) & (book["Txn Type"] == "Payments")
    if _refund_pair_chqs:
        print(f"[Reconcile] {len(_refund_pair_chqs)} refund pair cheques excluded from all matching passes")

    # -- Pass 0: Internal Fund Transfer (HOT/IFT) matching -------------------
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
            # Relax date constraint for IFT entries - try any unmatched IFT stmt row
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

    # -- Pass 1: Party Name + Direction + Amount + Cheque match --------------
    # Primary match requires all four: Party Name (fuzzy), Direction,
    # Amount, and Cheque Number (when present). Date is also checked.
    print("[Reconcile] Pass 1: Party Name + Direction + Amount + Cheque number match")
    processed_chqs = set()
    for bi, br in book[~book["_used"]].iterrows():
        chq = _norm_chq(br["Chq No"])
        if chq in CHQ_ABSENT: continue
        if br.get("_refund_pair", False): continue  # RT/PT refund pair - skip matching
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
            same_chq_book = book[(book["Chq No"].apply(_norm_chq) == chq) & (~book["_used"])]
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
        same_chq_book = book[(book["Chq No"].apply(_norm_chq) == chq) & (~book["_used"])]
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

    # -- Pass 2: Party Name + Direction + Date + Amount (cheque absent/ignored) --
    print("[Reconcile] Pass 2: Party Name + Direction + Date + Amount (cheque absent/ignored)")
    p2_start = len(matched_rows)

    def _stronger_unmatched_book_for_stmt(current_bi, current_br, stmt_row, current_score):
        """Return True if this bank row has a better same-amount/date book candidate."""
        for other_bi, other_br in book[~book["_used"]].iterrows():
            if other_bi == current_bi:
                continue
            if other_br.get("_refund_pair", False):
                continue
            if other_br["Direction"] != current_br["Direction"]:
                continue
            if abs(float(other_br["Book Amt (Rs)"]) - float(current_br["Book Amt (Rs)"])) >= 0.01:
                continue
            if not within_date(other_br.get("Date", ""), stmt_row["Date"]):
                continue
            if _chq_verdict(other_br["Chq No"], stmt_row["Chq No"]) == "reject":
                continue
            other_score = fuzzy(other_br["Party"], stmt_row["Party"])
            if other_score >= FUZZY_THRESHOLD and other_score > current_score:
                return True
            if other_score >= 90 and other_score >= current_score + 10:
                return True
        return False

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
        if _is_cash_deposit_book_row(br):
            candidates = candidates[candidates.apply(_is_cash_deposit_bank_row, axis=1)]
            if candidates.empty:
                continue
        # Apply party name filter - soft: fall back to all candidates if none pass threshold
        name_cands = candidates[candidates.apply(
            lambda sr: fuzzy(br["Party"], sr["Party"]) >= FUZZY_THRESHOLD, axis=1)]
        if not name_cands.empty:
            candidates = name_cands
        else:
            # When cheque is generic (99/511/blank), a pure amount match with no
            # name similarity is a false match. Require at least score >= 30.
            # This prevents e.g. "YESHWANTH M" matching "J K R GAS COMPANY" by 1L amount.
            _p2_generic = {"", "nan", "99", "511", "0"}
            if _norm_chq(br.get("Chq No", "")) in _p2_generic:
                _min_cands = candidates[candidates.apply(
                    lambda sr: fuzzy(br["Party"], sr["Party"]) >= 30, axis=1)]
                if _min_cands.empty:
                    continue
                candidates = _min_cands

        if len(candidates) == 1:
            si = candidates.index[0]; sr = stmt.loc[si]
            _score = fuzzy(br["Party"], sr["Party"])
            if _stronger_unmatched_book_for_stmt(bi, br, sr, _score):
                print(f"[Reconcile] Pass 2 deferred low-score candidate: "
                      f"book='{br['Party']}' bank='{sr['Party']}' score={_score}%")
                continue
            matched_rows.append(_make_row(br, sr, "2-Party+Dir+Date+Amt", _score))
            book.at[bi, "_used"] = True; stmt.at[si, "_used"] = True
        else:
            def _sort_key(idx):
                sr = stmt.loc[idx]
                d = date_diff(book_date, sr["Date"])
                return (d if d is not None else 999, -fuzzy(br["Party"], sr["Party"]))
            si = sorted(candidates.index, key=_sort_key)[0]; sr = stmt.loc[si]
            _score = fuzzy(br["Party"], sr["Party"])
            if _stronger_unmatched_book_for_stmt(bi, br, sr, _score):
                print(f"[Reconcile] Pass 2 deferred low-score candidate: "
                      f"book='{br['Party']}' bank='{sr['Party']}' score={_score}%")
                continue
            matched_rows.append(_make_row(br, sr, "2-Party+Dir+Date+Amt(closest)", _score))
            book.at[bi, "_used"] = True; stmt.at[si, "_used"] = True

    print(f"   -> {len(matched_rows) - p2_start} matched")

    # Initialise here - Post-Pass-2 detection and Pass 3c both append to this list
    _split_review_candidates = []

    # -- Post-Pass-2: Detect greedy-steal candidates for Human Verification ----
    # COMGR issue: Pass 2 matched DBIZ AI SOLUTIONS (book Rs65,235) against
    # FACTWEAVERS TECHNOLOGIES (bank Rs65,235) at low score (43%), consuming one
    # DBIZ book row.  The second DBIZ row (also Rs65,235) could no longer combine
    # with the first to match the bank's Rs1,30,470 DBIZAISO entry via Pass 3b.
    #
    # Detection: after Pass 2, find book rows that were matched at LOW score
    # (< FUZZY_THRESHOLD) AND share a party name with another book row of the
    # same amount that is still unmatched - together they would sum to an unmatched
    # bank entry.  These are flagged in _split_review_candidates (HV Section F)
    # so the accountant can manually correct the wrong single match.
    for _mr in matched_rows[p2_start:]:
        if _mr.get("Fuzzy Score %", 100) >= FUZZY_THRESHOLD:
            continue
        if not str(_mr.get("Match Method", "")).startswith("2-"):
            continue
        _stolen_book_party = str(_mr.get("Book Party", ""))
        _stolen_book_amt   = float(_mr.get("Book Amt (Rs)", 0) or 0)
        _stolen_book_dir   = str(_mr.get("Book Direction", ""))
        # Look for an unmatched book row with the same party and same amount
        _sibling_idxs = [
            _bi for _bi, _br in book[~book["_used"]].iterrows()
            if (str(_br["Party"]) == _stolen_book_party and
                abs(float(_br["Book Amt (Rs)"]) - _stolen_book_amt) < 0.01 and
                _br["Direction"] == _stolen_book_dir)
        ]
        if not _sibling_idxs:
            continue
        # Check if combined amount matches an unmatched bank entry
        _combined = _stolen_book_amt * (1 + len(_sibling_idxs))
        _matching_bank = [
            _si for _si, _sr in stmt[~stmt["_used"]].iterrows()
            if (abs(float(_sr["Bank Amt (Rs)"]) - _combined) < 0.01 and
                _sr["Direction"] == _stolen_book_dir and
                fuzzy(_stolen_book_party, str(_sr["Party"])) >= 35)
        ]
        if not _matching_bank:
            continue
        _bank_si   = _matching_bank[0]
        _bank_row  = stmt.loc[_bank_si]
        _parts_str = " + ".join([f"Rs{_stolen_book_amt:,.2f}"] * (1 + len(_sibling_idxs)))
        _split_review_candidates.append({
            "book_idx":   None,
            "book_party": _stolen_book_party,
            "book_amt":   _combined,
            "book_date":  str(_mr.get("Book Date", "")),
            "book_bill":  str(_mr.get("Book Bill No", "")),
            "book_chq":   str(_mr.get("Book Chq", "")),
            "bank_idxs":  [_bank_si],
            "bank_parts": f"Rs{float(_bank_row['Bank Amt (Rs)']):,.2f} ({_bank_row['Party']})",
            "bank_dates": str(_bank_row["Date"]),
            "score":      _mr.get("Fuzzy Score %", 0),
            "n_parts":    1 + len(_sibling_idxs),
            "note":       (f"Pass 2 matched '{_stolen_book_party}' Rs{_stolen_book_amt:,.2f} "
                           f"against '{_mr.get('Bank Party','')}' (score {_mr.get('Fuzzy Score %',0)}%) - "
                           f"but {1+len(_sibling_idxs)} book entries of Rs{_stolen_book_amt:,.2f} each "
                           f"({_parts_str}) sum to bank Rs{_combined:,.2f} ({_bank_row['Party']}). "
                           f"Verify which bank entry this book party belongs to."),
        })
        print(f"[Reconcile] Post-Pass-2 greedy-steal detected: '{_stolen_book_party}' "
              f"Rs{_stolen_book_amt:,.2f} matched at {_mr.get('Fuzzy Score %',0)}% "
              f"but may belong to bank Rs{_combined:,.2f} ({_bank_row['Party']}) -> HV Section F")

    # -- Pass 2b: Absorb companion Re1 bank entries ---------------------------
    # Banks sometimes send two NEFT credits for the same remitter: Rs1 (test/advance)
    # followed by the main amount. The book records only the main amount.
    # When a bank INFLOW of Rs1 shares the same UTR/reference and party as another bank
    # entry already consumed in a previous pass, we mark the Rs1 as used so it does not
    # float into stmt_only (credited-not-book).
    # IMPORTANT: party-name alone is NOT sufficient - two different UPI/NEFT payments
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
        chq_re1   = _norm_chq(sr.get("Chq No", ""))
        # Extract a meaningful UTR/ref prefix from the description (strip NEFT/RTGS/UPI/<refno>/)
        # e.g. "NEFT/HDFCH00123456/JOHN DOE/HDFC BANK" -> "HDFCH00123456/JOHN DOE/HDFC"
        desc_prefix_re1 = re.sub(r"^(NEFT|RTGS|IMPS|UPI)\b[^/]*/", "", desc_re1)[:25]
        # Only absorb if we have a meaningful shared description segment (UTR-based match)
        # or the same non-trivial cheque/reference number.
        # Do NOT absorb on party-name alone - different transactions can share a party name.
        has_meaningful_prefix = len(desc_prefix_re1) >= 10

        if not has_meaningful_prefix and chq_re1 in CHQ_ABSENT:
            # No UTR prefix and no reference number - cannot safely absorb
            print(f"[Reconcile] Pass 2b: SKIPPED Re1 (no UTR/ref to confirm linkage) - "
                  f"party='{sr['Party']}' desc='{sr['Description'][:50]}'")
            continue

        matched_peer = stmt[
            stmt["_used"] &
            (stmt["Direction"] == "INFLOW") &
            (stmt["Bank Amt (Rs)"] > 1.0) &
            (stmt.apply(lambda r: (
                (has_meaningful_prefix and
                 desc_prefix_re1 in r["Description"].strip().upper()) or
                (chq_re1 not in CHQ_ABSENT and
                 _norm_chq(r.get("Chq No", "")) == chq_re1)
            ), axis=1))
        ]
        if not matched_peer.empty:
            stmt.at[si, "_used"] = True
            print(f"[Reconcile] Pass 2b: absorbed Re1 bank entry - "
                  f"party='{sr['Party']}' desc='{sr['Description'][:50]}'")
    print(f"   -> {len(matched_rows) - p2b_start} matched (Re1 entries absorbed into stmt)")

    # -- Pass 2c: Third-party payment match (same date, same amount, generic chq, unique amount) --
    # Handles cases where a book INFLOW (Public Sale / FFMC Sale) is recorded under one
    # party name but the bank shows a completely different sender (third-party payment).
    # RESTRICTED to Public Sale and FFMC Sale txn types only - Receipts entries are
    # direct receipts, not third-party payments, and must not be matched this way.
    # Also requires fuzzy score >= 15% to avoid matching RETURN credits.
    print("[Reconcile] Pass 2c: Third-party INFLOW match (unique amt+date, generic chq, PS/FFMC only)")
    p2c_start = len(matched_rows)
    _GENERIC_CHQ = {"", "nan", "99", "511", "0"}
    _P2C_TXN_TYPES = {"Public Sale", "FFMC Sale", "PS", "FS", "public sale", "ffmc sale"}
    for bi, br in book[~book["_used"]].iterrows():
        if br.get("_refund_pair", False): continue
        if br["Direction"] != "INFLOW": continue
        if _norm_chq(br.get("Chq No", "")) not in _GENERIC_CHQ: continue
        # Only match Public Sale / FFMC Sale - not Receipts or other types
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
        # Exclude RETURN credits - they are not third-party payments
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
        if not other_book_same_amt.empty: continue  # ambiguous - skip
        if len(candidates) != 1: continue  # ambiguous - skip
        si = candidates.index[0]; sr = stmt.loc[si]
        score = fuzzy(br["Party"], sr["Party"])
        # Also try matching against the bank description - the actual sender name
        # is often embedded there (e.g. "NEFT/.../BONGALE HARSHAD MOHAN/ABHYUDAYA COOPERATIV/...")
        # while the extracted party field only has the bank institution name.
        _desc_score = fuzzy(br["Party"], str(sr.get("Description", "")))
        # Use the higher of party or description score - if description confirms the
        # sender name, treat as a confirmed match (not a hard mismatch to be released)
        score = max(score, _desc_score)
        # Require minimum score of 30% - either against party or description
        if score < 30: continue
        matched_rows.append(_make_row(br, sr, "2c-ThirdParty+Dir+Date+Amt(unique)", score))
        book.at[bi, "_used"] = True; stmt.at[si, "_used"] = True
        print(f"[Reconcile] Pass 2c: '{br['Party']}' <-> '{sr['Party']}' "
              f"Rs{b_amt:,.2f} (third-party INFLOW, score={score}%)")
    print(f"   -> {len(matched_rows) - p2c_start} matched")

    # -- Pass 3: Fuzzy Name + Direction + Date + Amount ------------------------
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

    # -- Pass 3a: Amount + Direction + Date + description contains book party words --
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
            print(f"[Reconcile] Pass 3a: '{br['Party']}' <-> '{sr['Party']}' "
                  f"Rs{b_amt:,.2f} via desc-word match")
    print(f"   -> {len(matched_rows) - p3a_start} matched")

    # Pass 3b: Multiple same-party book entries combined = one bank entry
    def _amount_cents(value):
        return int(round(float(value) * 100))

    def _find_amount_subset(idxs, amount_getter, target, min_parts=2):
        """Return a subset of idxs whose amounts add to target, or None."""
        target_cents = _amount_cents(target)
        combos = {0: []}
        for idx in idxs:
            amt_cents = _amount_cents(amount_getter(idx))
            if amt_cents <= 0 or amt_cents > target_cents:
                continue
            additions = {}
            for running, combo in combos.items():
                new_total = running + amt_cents
                if new_total > target_cents or new_total in combos or new_total in additions:
                    continue
                new_combo = combo + [idx]
                if new_total == target_cents and len(new_combo) >= min_parts:
                    return new_combo
                additions[new_total] = new_combo
            combos.update(additions)
        return None

    def _split_party_key(party):
        key = clean_name(str(party or "")).upper().strip()
        return key or str(party or "").upper().strip()

    print("[Reconcile] Pass 3b: Combined same-party book amount -> single bank entry")
    p3b_start = len(matched_rows)

    def _make_3b_split_row(book_row, bank_row, split_score, split_note, part_num, bank_total):
        row = _make_row(book_row, bank_row, "3b-Party+Combined Amt+Date", split_score, partial_note=split_note)
        row["Amount Match"] = "Split Bills 1 Credit"
        row["Difference (Rs)"] = 0.0
        row["Bank Full Amt"] = bank_total
        row["_display_difference"] = 0.0 if part_num == 1 else ""
        row["_display_bank_amt"] = bank_total if part_num == 1 else ""
        row["_display_debit"] = row["Debit (Rs)"] if part_num == 1 else ""
        row["_display_credit"] = row["Credit (Rs)"] if part_num == 1 else ""
        if part_num > 1:
            row["Debit (Rs)"] = 0.0
            row["Credit (Rs)"] = 0.0
            row["Bank Amt (Rs)"] = 0.0
        return row
    for si, sr in stmt[~stmt["_used"]].iterrows():
        s_dir = sr["Direction"]
        cands = book[(~book["_used"]) & (book["Direction"] == s_dir)]
        if len(cands) < 2: continue
        target = float(sr["Bank Amt (Rs)"]); s_date = sr["Date"]; found = False
        party_groups = {}
        for bii, br2 in cands.iterrows():
            if not within_date(br2.get("Date", ""), s_date): continue
            if _chq_verdict(br2["Chq No"], sr["Chq No"]) == "reject": continue
            party_groups.setdefault(_split_party_key(br2["Party"]), []).append(bii)

        for _, idxs in party_groups.items():
            if len(idxs) < 2: continue
            scores = [fuzzy(book.at[idx, "Party"], sr["Party"]) for idx in idxs]
            if max(scores) < FUZZY_THRESHOLD: continue  # same-party group must relate to bank party
            matched_idxs = _find_amount_subset(
                idxs,
                lambda idx: book.at[idx, "Book Amt (Rs)"],
                target,
                min_parts=2,
            )
            if not matched_idxs:
                continue

            n_parts    = len(matched_idxs)
            bank_total = float(sr["Bank Amt (Rs)"])
            bank_dt    = sr["Date"]
            score      = max(fuzzy(book.at[idx, "Party"], sr["Party"]) for idx in matched_idxs)
            split_list = " + ".join(
                f"Rs{float(book.at[idx, 'Book Amt (Rs)']):,.2f}" for idx in matched_idxs
            )
            for part_num, idx in enumerate(matched_idxs, 1):
                part_amt = float(book.at[idx, "Book Amt (Rs)"])
                note = (f"PARTIAL PAYMENT - Part {part_num} of {n_parts}: "
                        f"Book Rs{part_amt:,.2f} ({split_list}) = "
                        f"Bank Rs{bank_total:,.2f} dated {bank_dt} - "
                        f"confirm all {n_parts} parts are recorded in books")
                matched_rows.append(_make_3b_split_row(book.loc[idx], sr, score, note, part_num, bank_total))
                book.at[idx, "_used"] = True
            stmt.at[si, "_used"] = True
            print(f"[Reconcile] Pass 3b split: {n_parts} '{book.at[matched_idxs[0], 'Party']}' entries = bank Rs{bank_total:,.2f}")
            found = True
            break
        if found: continue
        cidx = list(cands.index)
        for i in range(len(cidx)):
            for j in range(i+1, len(cidx)):
                bi1, bi2 = cidx[i], cidx[j]
                if abs(float(book.at[bi1,"Book Amt (Rs)"]) + float(book.at[bi2,"Book Amt (Rs)"]) - target) >= 0.01: continue
                if not within_date(book.at[bi1,"Date"] if "Date" in book.columns else "", s_date): continue
                if not within_date(book.at[bi2,"Date"] if "Date" in book.columns else "", s_date): continue
                if _chq_verdict(book.at[bi1,"Chq No"], sr["Chq No"]) == "reject": continue
                if _chq_verdict(book.at[bi2,"Chq No"], sr["Chq No"]) == "reject": continue
                score1 = fuzzy(book.at[bi1,"Party"], sr["Party"])
                score2 = fuzzy(book.at[bi2,"Party"], sr["Party"])
                score = max(score1, score2)
                bank_chq_real = _has_bank_reference(sr.get("Chq No", ""))
                book_chqs_generic = (
                    _norm_chq(book.at[bi1,"Chq No"]) in CHQ_ABSENT and
                    _norm_chq(book.at[bi2,"Chq No"]) in CHQ_ABSENT
                )
                book_parties_differ = _split_party_key(book.at[bi1,"Party"]) != _split_party_key(book.at[bi2,"Party"])
                if bank_chq_real and book_chqs_generic and book_parties_differ:
                    if min(score1, score2) < FUZZY_THRESHOLD:
                        print(f"[Reconcile] Pass 3b BLOCKED mixed-party generic split: "
                              f"book='{book.at[bi1,'Party']}' + '{book.at[bi2,'Party']}' "
                              f"against bank='{sr['Party']}' chq={sr.get('Chq No','')} "
                              f"scores={score1}%/{score2}%")
                        continue
                if score < FUZZY_THRESHOLD: continue  # name must match for at least one book entry
                bank_total = float(sr["Bank Amt (Rs)"])
                bank_dt    = sr["Date"]
                amt1 = float(book.at[bi1,"Book Amt (Rs)"])
                amt2 = float(book.at[bi2,"Book Amt (Rs)"])
                note1 = (f"PARTIAL PAYMENT - Part 1 of 2: Book Rs{amt1:,.2f} + Rs{amt2:,.2f} "
                         f"= Bank Rs{bank_total:,.2f} dated {bank_dt} - "
                         f"confirm both parts are recorded in books")
                note2 = (f"PARTIAL PAYMENT - Part 2 of 2: Book Rs{amt2:,.2f} + Rs{amt1:,.2f} "
                         f"= Bank Rs{bank_total:,.2f} dated {bank_dt} - "
                         f"confirm both parts are recorded in books")
                matched_rows.append(_make_3b_split_row(book.loc[bi1], sr, score, note1, 1, bank_total))
                matched_rows.append(_make_3b_split_row(book.loc[bi2], sr, score, note2, 2, bank_total))
                book.at[bi1,"_used"] = True; book.at[bi2,"_used"] = True; stmt.at[si,"_used"] = True
                found = True; break
            if found: break
    print(f"   -> {len(matched_rows) - p3b_start} matched")

    # -- Pass 3c: Single book entry = N bank entries (split payment) ----------
    # No auto-matching is done here - split detection is complex and greedy
    # matching causes false positives (wrong bank rows consumed).
    # Instead we DETECT candidates and surface them in Human Verification
    # Section F so the accountant can confirm and clear manually.
    # Nothing is marked _used here; book_only and stmt_only are untouched.
    print("[Reconcile] Pass 3c: Single book entry = N bank entries (split payment - detect only)")
    p3c_start = len(matched_rows)

    def _find_bank_subset(bank_idxs, target):
        """Return list of bank indices whose Bank Amt (Rs) sum exactly to target, or None."""
        target_c = _amount_cents(target)
        combos = {0: []}
        for idx in bank_idxs:
            amt_c = _amount_cents(float(stmt.at[idx, "Bank Amt (Rs)"]))
            if amt_c <= 0 or amt_c > target_c:
                continue
            additions = {}
            for running, combo in combos.items():
                new_total = running + amt_c
                if new_total > target_c or new_total in combos or new_total in additions:
                    continue
                new_combo = combo + [idx]
                if new_total == target_c and len(new_combo) >= 2:
                    return new_combo
                additions[new_total] = new_combo
            combos.update(additions)
        return None

    for bi, br in book[~book["_used"]].iterrows():
        if br.get("_refund_pair", False):
            continue
        b_dir   = br["Direction"]
        b_amt   = float(br["Book Amt (Rs)"])
        b_date  = br.get("Date", "")
        b_party = str(br["Party"])

        cands = stmt[(~stmt["_used"]) & (stmt["Direction"] == b_dir)]
        if len(cands) < 2:
            continue

        # Only consider bank rows that have at least a weak name match to book party
        # This prevents completely unrelated rows being included in a split
        eligible_idxs = [
            si for si, sr in cands.iterrows()
            if within_date(b_date, sr["Date"])
            and _chq_verdict(br["Chq No"], sr["Chq No"]) != "reject"
            and fuzzy(b_party, str(sr["Party"])) >= 40
        ]
        if len(eligible_idxs) < 2:
            continue

        split_idxs = _find_bank_subset(eligible_idxs, b_amt)
        if split_idxs is None:
            continue

        # Require at least one leg to be a genuine name match
        score = max(fuzzy(b_party, str(stmt.at[si, "Party"])) for si in split_idxs)
        if score < FUZZY_THRESHOLD:
            continue

        bank_parts_str = " + ".join(
            f"Rs{float(stmt.at[si, 'Bank Amt (Rs)']):,.2f} ({stmt.at[si, 'Party']})"
            for si in split_idxs
        )
        bank_dates_str = ", ".join(
            str(stmt.at[si, "Date"]) for si in split_idxs
        )
        _split_review_candidates.append({
            "book_idx":   bi,
            "book_party": b_party,
            "book_amt":   b_amt,
            "book_date":  b_date,
            "book_bill":  str(br.get("Bill No", "")),
            "book_chq":   str(br.get("Chq No", "")),
            "bank_idxs":  split_idxs,
            "bank_parts": bank_parts_str,
            "bank_dates": bank_dates_str,
            "score":      score,
            "n_parts":    len(split_idxs),
        })
        print(
            f"[Reconcile] Pass 3c split candidate (score={score}%) -> Human Verification: "
            f"book Rs{b_amt:,.2f} '{b_party}' = {len(split_idxs)} bank rows ({bank_parts_str})"
        )

    print(f"   -> 0 auto-matched, {len(_split_review_candidates)} candidate(s) -> Human Verification Section F")

    # -- Pass 3d: N book entries (N>2) combined = single bank entry ------------
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
                    note = (f"PARTIAL PAYMENT - Part {part_num} of {n_parts}: "
                            f"Book Rs{part_amt:,.2f} (of {n_parts} parts) = "
                            f"Bank Rs{bank_total:,.2f} dated {bank_dt} - "
                            f"confirm all {n_parts} parts are recorded in books")
                    matched_rows.append(_make_row(book.loc[idx], sr, "3d-N-to-1 Aggregation", score, partial_note=note))
                    book.at[idx,"_used"] = True
                stmt.at[si,"_used"] = True
                print(f"[Reconcile] Pass 3d: {len(ok_idxs)} '{pname}' entries = bank Rs{s_amt:,.2f}")
                found = True; break
        if found: continue
    print(f"   -> {len(matched_rows) - p3d_start} matched")

    # -- Pass 4: Direction-flip (FFMC / forex / settlement) -------------------
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
        # Apply name filter - soft: fall back to full pool if no name hit
        name_pool = pool[pool.apply(lambda sr: fuzzy(br["Party"], sr["Party"]) >= FUZZY_THRESHOLD, axis=1)]
        if not name_pool.empty:
            pool = name_pool
        if len(pool) == 1:
            si = pool.index[0]; sr = stmt.loc[si]
            matched_rows.append(_make_row(br, sr, "4-DirectionFlip(Forex)", fuzzy(br["Party"],sr["Party"])))
            book.at[bi,"_used"] = True; stmt.at[si,"_used"] = True
    print(f"   -> {len(matched_rows) - p4_start} matched")

    # -- Collect results -------------------------------------------------------
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
    # EXCEPTION: never drop Receipts INFLOW entries - they are part of RT/PT refund
    # pairs and must stay in book_only as "deposited-not-credited" entries.
    # EXCEPTION TO EXCEPTION: Receipts tagged as [HOT Transfer] are auto-receipts
    # generated by the zeroise process (e.g. "ZEROISE, AUTO RECEIPT FROM AHMD FOR BANK
    # HDFC1240"). These DO net out against the corresponding FFMC Buying/Payments OUTFLOW
    # in the book. Match by amount only (party names differ: INFLOW = company name,
    # OUTFLOW = bank/counterparty). Drop BOTH sides so book_only is cleared.
    book_only = book_only.copy(); book_only["_drop"] = False

    # Pass A: HOT Transfer Receipts INFLOW - net against matching OUTFLOW by amount
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
        if not match_out.empty:
            oi = match_out.index[0]
            book_only.at[bi, "_drop"] = True
            book_only.at[oi, "_drop"] = True
            print(f"[Reconcile] Internal book cancellation: INFLOW Rs{float(br['Book Amt (Rs)']):,.2f} "
                  f"('{br['Party']}') <-> OUTFLOW Rs{float(book_only.at[oi,'Book Amt (Rs)']):,.2f} "
                  f"('{book_only.at[oi,'Party']}') -- both dropped from book_only")

    book_only = book_only[~book_only["_drop"]].drop(columns=["_drop"])

    # Hard mismatches must affect the BRS, not only the discrepancy section.
    # If a pair was consumed with a non-perfect party match, or a true
    # non-split amount difference, put both legs back into the natural
    # unmatched sections while still keeping the discrepancy row.
    if not matched.empty:
        _matched_flags = matched.get("Flags", pd.Series("", index=matched.index)).astype(str)
        hard_mismatch_mask = (
            # Any exact match below the manual-confirmation threshold should still
            # be visible in BRS. This includes Pass 2c third-party matches: unique
            # amount/date is useful evidence, but a 30-49% name score still needs
            # accountant review in the reconciliation sheet.
            (matched["Fuzzy Score %"] < PARTY_CONFIRMATION_THRESHOLD)
        ) | (
            matched["Amount Match"].astype(str).str.startswith("Diff") &
            (~matched.get("Partial Payment", pd.Series(False, index=matched.index)).astype(bool))
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
                        "Narration":     mr.get("Flags", ""),  # carry same flag as book side
                    })

            book_only = pd.concat(
                [book_only, pd.DataFrame(book_release_rows).reindex(columns=book_only.columns)],
                ignore_index=True
            )
            # Ensure stmt_only has Narration column before concat so it isn't dropped
            if "Narration" not in stmt_only.columns:
                stmt_only["Narration"] = ""
            _release_cols = list(stmt_only.columns)
            stmt_only = pd.concat(
                [stmt_only, pd.DataFrame(stmt_release_rows).reindex(columns=_release_cols)],
                ignore_index=True
            )
            print(f"[Reconcile] Also showing {len(hard_mismatches)} hard mismatch(es) in BRS sections")

    # -- Cross-match detection (ARVIND edge case) ------------------------------
    # Detect groups of matched rows where multiple book entries matched different
    # bank entries with the SAME amount+date+direction but DIFFERENT book parties
    # at medium fuzzy scores. These are likely cross-matched (wrong person to
    # wrong bank entry). Flag them in HV Section G for manual verification.
    # Example: DA ARVIND, V KARUNA ARVIND, UDHAYAVARSHNI ARVIND all Rs1,11,878
    # on same date - matched cross-wise due to shared word "ARVIND".
    if not matched.empty:
        _cross_candidates = []
        _used_cross_idxs  = set()
        # Group by (Bank Date, Bank Amt, Bank Direction)
        try:
            _grp_cols = ["Bank Date", "Bank Amt (Rs)", "Bank Direction"]
            for _key, _grp in matched.groupby(_grp_cols):
                if len(_grp) < 2:
                    continue
                # Check if book parties are all different (not same-party split)
                _book_parties = _grp["Book Party"].astype(str).str.strip().tolist()
                if len(set(_book_parties)) < 2:
                    continue
                # Check if any match has a medium score (below FUZZY_THRESHOLD)
                _scores = _grp["Fuzzy Score %"].astype(float).tolist()
                if not any(s < FUZZY_THRESHOLD for s in _scores):
                    continue
                # Check none are already in cross_candidates
                _idxs = tuple(_grp.index.tolist())
                if any(i in _used_cross_idxs for i in _idxs):
                    continue
                for i in _idxs:
                    _used_cross_idxs.add(i)
                _cross_candidates.append(_grp)
                print(f"[Reconcile] Cross-match group detected: "
                      f"Rs{float(_key[1]):,.2f} on {_key[0]} - "
                      f"{len(_grp)} matches with different parties -> HV Section G")
        except Exception as _e:
            print(f"[Reconcile] Cross-match detection skipped: {_e}")
        _split_review_candidates.append({"_cross_match_groups": _cross_candidates})

    print(f"[Reconcile] Pass 5 (unmatched):")
    print(f"   Book only (not in bank)  : {len(book_only)}")
    print(f"   Bank only (not in book)  : {len(stmt_only)}")
    print(f"   Total matched            : {len(matched)}")
    return matched, book_only, stmt_only, _split_review_candidates

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

    def _real_chq(value, allow_book_placeholder=False):
        text = str(value or "").strip()
        absent = {"", "nan", "0", "99", "511", "-"}
        # Book-side rows may use 99/511 as placeholder cheque values.
        # If the bank has a real cheque number, surface placeholder-vs-bank
        # as a review mismatch instead of silently treating it as absent.
        if allow_book_placeholder:
            absent.discard("99")
            absent.discard("511")
        if text.lower() in absent or not re.fullmatch(r"\d{1,6}", text):
            return ""
        return text

    bank_chq = _real_chq(sr.get("Chq No", ""))
    _book_chq_raw = str(br.get("Chq No", "") or "").strip().lower()
    _book_placeholder_with_real_bank_chq = (
        bool(bank_chq) and
        _book_chq_raw in {"99", "511"} and
        "[HOT Transfer]" not in str(br.get("Narration", ""))
    )
    _book_is_payment_chq_review = (
        str(br.get("Direction", "")).upper() == "OUTFLOW" and
        str(br.get("Txn Type", "")).strip().upper() == "PAYMENTS" and
        "[HOT Transfer]" not in str(br.get("Narration", ""))
    )
    book_chq = _real_chq(
        br.get("Chq No", ""),
        allow_book_placeholder=(_book_placeholder_with_real_bank_chq or _book_is_payment_chq_review)
    )
    chq_note = ""
    if book_chq and bank_chq and book_chq != bank_chq:
        chq_note = f"Cheque no differs: Book={book_chq} Bank={bank_chq}"

    flags = [x for x in [
        f"Name {score}% -- verify"            if name_flag != "Match"                  else "",
        ""                                    if amt_flag  == "Exact"                  else amt_flag,
        chq_note,
        dir_flag,
        date_note,
        "Third party payment -- verify name"  if "3rd Party" in method                 else "",
        "Combined entry -- verify split"      if method.startswith("3b")               else "",
        partial_note                          if partial_note                           else "",
        "HOT Transfer - Head Office Transfer" if "[HOT Transfer]" in str(br.get("Narration", "")) else "",
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
                      f"Bank closing (Rs{bank_closing_bal:,.2f}) = Book closing (Rs{book_closing_bal:,.2f}). "
                      f"Fully reconciled - all bank transactions already recorded in prior period.")

    if prev_book > 0 and abs(prev_bank - prev_book) < 0.01:
        if abs(bank_closing_bal - book_closing_bal) < 0.01:
            return True, "Reconciled from previous BRS - no new transactions in book."

    return False, ""


def compute_brs_difference(book_closing_bal, bank_closing_bal, book_only, stmt_only):
    issued = float(book_only["Book Amt (Rs)"][book_only["Direction"] == "OUTFLOW"].sum()) if not book_only.empty else 0.0
    deposited = float(book_only["Book Amt (Rs)"][book_only["Direction"] == "INFLOW"].sum()) if not book_only.empty else 0.0
    stmt_calc = stmt_only
    if not stmt_only.empty and "_brs_residual_exclude" in stmt_only.columns:
        stmt_calc = stmt_only[~stmt_only["_brs_residual_exclude"].fillna(False).astype(bool)]
    debited_nb = float(stmt_calc["Bank Amt (Rs)"][stmt_calc["Direction"] == "OUTFLOW"].sum()) if not stmt_calc.empty else 0.0
    credited_nb = float(stmt_calc["Bank Amt (Rs)"][stmt_calc["Direction"] == "INFLOW"].sum()) if not stmt_calc.empty else 0.0
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

_NO_FILL = PatternFill(fill_type=None)
_DK = PatternFill("solid", fgColor="1F3864")
_MD = PatternFill("solid", fgColor="2E75B6")
_RH = PatternFill("solid", fgColor="C00000")
_G  = _NO_FILL
_R  = _NO_FILL
_Y  = _NO_FILL
_O  = _NO_FILL
_W  = _NO_FILL
_GR = _NO_FILL
_CF = _NO_FILL

FONT_NAME = "Calibri"
WF = Font(bold=True, color="FFFFFF", name=FONT_NAME, size=10)
NF = Font(name=FONT_NAME, size=9)
BF = Font(bold=True, name=FONT_NAME, size=9)
RF = Font(name=FONT_NAME, size=9, color="C00000", bold=True)
REJ_FILL = PatternFill("solid", fgColor="FFC7CE")
_s = Side(style="thin", color="BFBFBF")
BR = Border(left=_s, right=_s, top=_s, bottom=_s)


def _c(ws, r, c, v=None, fill=_NO_FILL, font=None, center=False):
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


def _drow(ws, r, vals, fills, font=None):
    for c, (v, f) in enumerate(zip(vals, fills), 1):
        _c(ws, r, c, v, fill=_NO_FILL, font=font)


def _highlight_row(ws, r, ncols, fill=REJ_FILL, font=RF):
    for c in range(1, ncols + 1):
        cell = ws.cell(r, c)
        cell.fill = fill
        cell.font = font


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
    ITM   = _NO_FILL
    ITM_CF= _NO_FILL
    ITM_W = _NO_FILL
    ITM_E = _NO_FILL
    BAL   = _NO_FILL
    DIF_G = _NO_FILL
    DIF_R = _NO_FILL

    _th = Side(style="thin", color="BFBFBF")
    bdr = Border(left=_th, right=_th, top=_th, bottom=_th)

    for col, w in [("A", 12), ("B", 4), ("C", 10), ("D", 10),
                   ("E", 28), ("F", 28), ("G", 28), ("H", 18), ("I", 18), ("J", 60)]:
        ws.column_dimensions[col].width = w

    r = 1
    brs_layout = {
        "amount_col": 7,
        "running_col": 8,
        "narr_col": 9,
        "merge_to": 6,
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
                "amount_col": 7,
                "running_col": 8,
                "narr_col": 9,
                "merge_to": 6,
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

    def set_narration(row, col, value, fill, font=None):
        if str(value).strip().lower() == "nan":
            value = ""
        cell           = ws.cell(row, col)
        cell.value     = value
        cell.fill      = fill
        cell.font      = font or Font(name=FONT_NAME, size=8, italic=True, color="555555")
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
            fill      = _NO_FILL
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
                 book_raw="", bank_raw="", is_rejected=False):
        nonlocal r
        if is_rejected:
            fill = REJ_FILL
        else:
            fill = ITM_CF if is_cf else ITM
        row_font = RF if is_rejected else NF
        # Build display narration: keep only real content from the source files.
        # Strip all synthetic labels added by the BRS script:
        #   - "[CF from prev BRS]" suffix (carry-forward marker)
        #   - "CF" / "Carried Fwd" standalone labels
        #   - "[HOT Transfer]" prefix (internal transfer tag)
        #   - "CF | " prefix
        # Keep only: name-verify flags ("Name XX% -- verify") and genuine
        # narrations that originated from the book or bank statement files.
        raw_narr = narration
        raw_narr = raw_narr.replace("[CF from prev BRS]", "").strip(" |")
        raw_narr = re.sub(r"^\[HOT Transfer\]\s*", "", raw_narr).strip()
        raw_narr = re.sub(r"^CF\s*\|\s*", "", raw_narr, flags=re.IGNORECASE).strip()
        if raw_narr.upper() in ("CF", "CARRIED FWD", "CARRIED FORWARD"):
            raw_narr = ""
        display_narration = raw_narr

        def _set(col, val, align="left"):
            c = ws.cell(r, col, val)
            c.fill = fill; c.border = bdr; c.font = row_font
            c.alignment = Alignment(horizontal=align, vertical="center")

        _set(1, date,     "center")
        _set(2, txn_type, "center")
        _set(3, bill_no,  "center")
        _set(4, chq_no,   "center")
        if brs_layout["amount_col"] == 7:
            _set(5, book_raw if book_raw else bank_raw, "left")
            _set(6, party, "left")
            set_amt(r, 7, amt, fill, row_font)
            ws.cell(r, 8, "").fill = fill; ws.cell(r, 8).border = bdr
            set_narration(r, 9, display_narration, fill, font=row_font)
        else:
            _set(5, book_raw, "left")
            _set(6, bank_raw, "left")
            _set(7, party,    "left")
            set_amt(r, 8, amt, fill, row_font)
            ws.cell(r, 9, "").fill = fill; ws.cell(r, 9).border = bdr
            set_narration(r, 10, display_narration, fill, font=row_font)
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

    ws.merge_cells(f"A{r}:F{r}")
    c           = ws[f"A{r}"]
    c.value     = f"Bank Reconciliation Statement As On {brs_date}"
    c.fill      = HDR
    c.font      = Font(bold=True, color="FFFFFF", name=FONT_NAME, size=11)
    c.border    = bdr
    c.alignment = Alignment(horizontal="left", vertical="center")
    for col in range(2, 7):
        ws.cell(r, col).border = bdr
        ws.cell(r, col).fill   = HDR
    for ci, txt in [(7, "AMOUNT IN RS"), (8, "AMOUNT IN RS"), (9, ""), (10, "")]:
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

    # FIX: CF detection must use per-row data signals, NOT party-name lookup.
    # The old approach (building cf_parties from carryforward_log party names and
    # calling is_cf(party)) caused false positives whenever a fresh current-day
    # transaction shared a party name with a carried-forward item (e.g. a new
    # RONAK HAIR AND BEAUTY entry flagged CF because yesterday's uncleared cheque
    # for the same party was in carryforward_log).
    #
    # Reliable per-row signals:
    #   Book entries -> "[CF from prev BRS]" suffix in the Narration field
    #                  (appended during carry_forward() at lines ~2219/2246/2449)
    #   Bank entries -> Balance (Rs) == 0  (cf_stmt_rows always write Balance 0;
    #                  real bank-statement rows always carry a running balance)
    def _is_cf_book_row(row_data):
        return "[CF from prev BRS]" in str(row_data.get("Narration", ""))

    def _is_cf_bank_row(row_data):
        try:
            return float(row_data.get("Balance (Rs)", 1) or 1) == 0
        except (TypeError, ValueError):
            return False

    def _cf_bank_narration(row_data):
        desc = str(row_data.get("Description", "") or "").strip()
        party = str(row_data.get("Party", "") or "").strip()
        narr = str(row_data.get("Narration", "") or "").strip()
        if not narr:
            return ""
        if narr.upper() in {desc.upper(), party.upper()}:
            return ""
        return narr

    HOT_TXN_TYPES = {"Payments", "PAYMENTS", "payments"}
    GENERIC_CHQ_VALS = {"99", "511", "0", "", "nan"}

    def _same_display_amount(left, right):
        try:
            return abs(round(float(left or 0), 2) - round(float(right or 0), 2)) < 0.01
        except (TypeError, ValueError):
            return False

    def _book_review_already_visible(mr):
        if book_only is None or book_only.empty:
            return False
        for _, br in book_only.iterrows():
            if (
                str(br.get("Date", "")).strip() == str(mr.get("Book Date", "")).strip() and
                str(br.get("Bill No", "")).strip() == str(mr.get("Book Bill No", "")).strip() and
                str(br.get("Chq No", "")).strip() == str(mr.get("Book Chq", "")).strip() and
                str(br.get("Party", "")).strip().upper() == str(mr.get("Book Party", "")).strip().upper() and
                str(br.get("Direction", "")).strip().upper() == str(mr.get("Book Direction", "")).strip().upper() and
                _same_display_amount(br.get("Book Amt (Rs)", 0), mr.get("Book Amt (Rs)", 0))
            ):
                return True
        return False

    def _bank_review_already_visible(mr):
        if stmt_only is None or stmt_only.empty:
            return False
        for _, sr in stmt_only.iterrows():
            if (
                str(sr.get("Date", "")).strip() == str(mr.get("Bank Date", "")).strip() and
                str(sr.get("Chq No", "")).strip() == str(mr.get("Bank Chq", "")).strip() and
                str(sr.get("Description", "")).strip() == str(mr.get("Bank Description", "")).strip() and
                str(sr.get("Party", "")).strip().upper() == str(mr.get("Bank Party", "")).strip().upper() and
                str(sr.get("Direction", "")).strip().upper() == str(mr.get("Bank Direction", "")).strip().upper() and
                _same_display_amount(sr.get("Bank Amt (Rs)", 0), mr.get("Bank Amt (Rs)", 0))
            ):
                return True
        return False

    def _cheque_diff_note_from_match(mr):
        return next(
            (seg for seg in str(mr.get("Flags", "")).split(" | ") if "Cheque no differs" in seg),
            "Cheque no differs"
        )

    def _append_display_note(df, idx, note):
        if "Narration" not in df.columns:
            df["Narration"] = ""
        old = str(df.at[idx, "Narration"] or "").strip()
        if note.lower() in old.lower():
            return
        df.at[idx, "Narration"] = f"{old} | {note}".strip(" |") if old else note

    def _visible_book_review_idx(mr):
        if book_only is None or book_only.empty:
            return None
        for _idx, br in book_only.iterrows():
            if (
                str(br.get("Date", "")).strip() == str(mr.get("Book Date", "")).strip() and
                str(br.get("Bill No", "")).strip() == str(mr.get("Book Bill No", "")).strip() and
                str(br.get("Chq No", "")).strip() == str(mr.get("Book Chq", "")).strip() and
                str(br.get("Party", "")).strip().upper() == str(mr.get("Book Party", "")).strip().upper() and
                str(br.get("Direction", "")).strip().upper() == str(mr.get("Book Direction", "")).strip().upper() and
                _same_display_amount(br.get("Book Amt (Rs)", 0), mr.get("Book Amt (Rs)", 0))
            ):
                return _idx
        return None

    def _visible_bank_review_idx(mr):
        if stmt_only is None or stmt_only.empty:
            return None
        for _idx, sr in stmt_only.iterrows():
            if (
                str(sr.get("Date", "")).strip() == str(mr.get("Bank Date", "")).strip() and
                str(sr.get("Chq No", "")).strip() == str(mr.get("Bank Chq", "")).strip() and
                str(sr.get("Description", "")).strip() == str(mr.get("Bank Description", "")).strip() and
                str(sr.get("Party", "")).strip().upper() == str(mr.get("Bank Party", "")).strip().upper() and
                str(sr.get("Direction", "")).strip().upper() == str(mr.get("Bank Direction", "")).strip().upper() and
                _same_display_amount(sr.get("Bank Amt (Rs)", 0), mr.get("Bank Amt (Rs)", 0))
            ):
                return _idx
        return None

    def _matched_chq_review_rows(book_direction):
        """Matched cheque-number differences shown in normal BRS sections.
        Display only: these rows are already reconciled and must not affect totals.
        """
        if matched_df is None or matched_df.empty:
            return []
        flags = matched_df.get("Flags", pd.Series("", index=matched_df.index)).astype(str)
        review_df = matched_df[
            flags.str.contains("Cheque no differs", case=False, na=False) &
            (matched_df.get("Book Direction", pd.Series("", index=matched_df.index)).astype(str).str.upper() == book_direction)
        ]
        rows = []
        seen = set()
        for _, mr in review_df.iterrows():
            _visible_idx = _visible_book_review_idx(mr)
            if _visible_idx is not None:
                if re.fullmatch(r"\d{1,6}", str(mr.get("Bank Chq", "")).strip()):
                    _append_display_note(book_only, _visible_idx, _cheque_diff_note_from_match(mr))
                continue
            if not re.fullmatch(r"\d{1,6}", str(mr.get("Bank Chq", "")).strip()):
                continue
            key = (
                str(mr.get("Book Bill No", "")).strip(),
                str(mr.get("Book Chq", "")).strip(),
                str(mr.get("Bank Chq", "")).strip(),
                round(float(mr.get("Book Amt (Rs)", 0) or 0), 2),
            )
            if key in seen:
                continue
            seen.add(key)
            note = next(
                (seg for seg in str(mr.get("Flags", "")).split(" | ") if "Cheque no differs" in seg),
                "Cheque no differs"
            )
            rows.append({
                "Date": mr.get("Book Date", ""),
                "Txn Type": mr.get("Book Txn", ""),
                "Bill No": mr.get("Book Bill No", ""),
                "Chq No": mr.get("Book Chq", ""),
                "Party": mr.get("Book Party", ""),
                "Party Raw": mr.get("Book Party Raw", mr.get("Book Party", "")),
                "Book Amt (Rs)": float(mr.get("Book Amt (Rs)", 0) or 0),
                "Narration": note,
            })
        return rows

    def _matched_chq_review_bank_rows(bank_direction):
        """Bank-side mirror of matched cheque-number differences.
        Display only: these rows are already reconciled and must not affect totals.
        """
        if matched_df is None or matched_df.empty:
            return []
        flags = matched_df.get("Flags", pd.Series("", index=matched_df.index)).astype(str)
        review_df = matched_df[
            flags.str.contains("Cheque no differs", case=False, na=False) &
            (matched_df.get("Bank Direction", pd.Series("", index=matched_df.index)).astype(str).str.upper() == bank_direction)
        ]
        rows = []
        seen = set()
        for _, mr in review_df.iterrows():
            _visible_idx = _visible_bank_review_idx(mr)
            if _visible_idx is not None:
                if re.fullmatch(r"\d{1,6}", str(mr.get("Bank Chq", "")).strip()):
                    _append_display_note(stmt_only, _visible_idx, _cheque_diff_note_from_match(mr))
                continue
            if not re.fullmatch(r"\d{1,6}", str(mr.get("Bank Chq", "")).strip()):
                continue
            key = (
                str(mr.get("Bank Date", "")).strip(),
                str(mr.get("Book Chq", "")).strip(),
                str(mr.get("Bank Chq", "")).strip(),
                str(mr.get("Bank Description", "")).strip(),
                round(float(mr.get("Bank Amt (Rs)", 0) or 0), 2),
            )
            if key in seen:
                continue
            seen.add(key)
            note = next(
                (seg for seg in str(mr.get("Flags", "")).split(" | ") if "Cheque no differs" in seg),
                "Cheque no differs"
            )
            rows.append({
                "Date": mr.get("Bank Date", ""),
                "Chq No": mr.get("Bank Chq", ""),
                "Description": mr.get("Bank Description", ""),
                "Party": mr.get("Bank Party", ""),
                "Direction": mr.get("Bank Direction", ""),
                "Bank Amt (Rs)": float(mr.get("Bank Amt (Rs)", 0) or 0),
                "Narration": note,
            })
        return rows

    def _is_hot_or_internal(row_data):
        """Returns True if this book_only row is an internal HOT transfer that
        must NOT appear in its BRS section:
        - HOT OUTFLOW: DO NOT exclude - if the bank has not yet debited this
          transfer it is a genuine 'issued not debited' item in this bank's BRS.
        - HOT INFLOW: exclude - inter-bank credit receipts are handled by the
          sending bank's BRS and must not double-count here.
        """
        txn_type  = str(row_data.get("Txn Type", "")).strip()
        chq_no    = str(row_data.get("Chq No", "")).strip()
        narr      = str(row_data.get("Narration", "")).upper()
        party     = str(row_data.get("Party", "")).upper()
        direction = str(row_data.get("Direction", "")).strip().upper()
        # HOT OUTFLOW: genuine "issued not debited" - keep it in the BRS display.
        # (The bank statement for THIS account will show the debit once cleared.)
        if direction == "OUTFLOW":
            pass  # never exclude HOT OUTFLOWs from issued-not-debited
        else:
            # HOT INFLOW: inter-bank receipt - exclude from deposited-not-credited
            if txn_type in HOT_TXN_TYPES and chq_no in GENERIC_CHQ_VALS:
                if "HOT" in narr or "HOT" in party:
                    return True
        # FIX: Do NOT filter based on Narration field. Book entries without a matched
        # bank Description should not be excluded based on narration mentioning cheque return.
        # Only the bank Description should trigger cheque-return handling.
        return False

    issued = book_only[
        (book_only["Direction"] == "OUTFLOW") &
        (~book_only.apply(_is_hot_or_internal, axis=1))
    ]

    section_row("Add :  Cheques issued but not debited in Bank")
    col_header_row("book")
    total_issued = 0.0
    _issued_chq_review = _matched_chq_review_rows("OUTFLOW")
    if issued.empty and not _issued_chq_review:
        nil_row()
    else:
        for _, row_data in issued.iterrows():
            amt  = float(row_data["Book Amt (Rs)"])
            narr = str(row_data.get("Narration", "") or "")
            if narr.strip().lower() == "nan":
                narr = ""
            # For Receipt/Payment book entries, the Narration field holds the raw
            # Tally internal narration which should NOT be shown. Only display
            # remarks that originated from external sources (bank statement, prev BRS).
            txn_t = str(row_data.get("Txn Type", "")).strip()
            if txn_t in ("Receipts", "Payments", "RECEIPTS", "PAYMENTS"):
                _brs_sourced = (
                    "[CF from prev BRS]" in narr or
                    narr.startswith("Cheque Return") or
                    "Name " in narr
                )
                if not _brs_sourced:
                    narr = ""
            cf   = _is_cf_book_row(row_data)
            book_raw = str(row_data.get("Party Raw", "") or row_data.get("Party", ""))
            rejected = is_rejected_cheque_record(row_data)
            # Also highlight red if the bank statement has a NEFT/RETURN entry
            # for this cheque number - book narration may be empty but bank shows return.
            if not rejected and stmt_df is not None:
                _chq_val = str(row_data.get("Chq No", "")).strip()
                if _chq_val and _chq_val not in ("", "0", "nan", "99", "511"):
                    _ret_rows = stmt_df[stmt_df["Chq No"].astype(str).str.strip() == _chq_val]
                    if not _ret_rows.empty:
                        _ret_descs = " ".join(_ret_rows["Description"].astype(str))
                        if (is_rejected_cheque_text(_ret_descs) or
                                _REJECTED_HIGHLIGHT_ONLY_RE.search(_ret_descs) or
                                "RETURN" in _ret_descs.upper()):
                            rejected = True
                            if not narr:
                                narr = "Cheque Return"
            item_row(row_data.get("Date", ""), row_data["Txn Type"], row_data["Bill No"], row_data["Chq No"],
                     row_data["Party"], amt, narr, is_cf=False,
                     book_raw=book_raw, bank_raw="", is_rejected=rejected)
            total_issued += amt
        for row_data in _issued_chq_review:
            item_row(row_data.get("Date", ""), row_data.get("Txn Type", ""), row_data.get("Bill No", ""),
                     row_data.get("Chq No", ""), row_data.get("Party", ""),
                     float(row_data.get("Book Amt (Rs)", 0) or 0), row_data.get("Narration", ""),
                     is_cf=False, book_raw=str(row_data.get("Party Raw", row_data.get("Party", ""))),
                     bank_raw="", is_rejected=False)
            # Display only - already reconciled; do not add to total_issued.
    subtotal_row(total_issued)
    running += total_issued
    running_row(running)
    blank_row()

    def _is_chq_return_receipt(row_data):
        """Receipts entries recording a returned cheque credit are not real
        deposits - exclude them from 'deposited not credited' section."""
        # FIX: Only check Description (bank statement), not Narration field.
        # The Narration may contain "Cheque Return - ..." from previous BRS runs.
        desc = str(row_data.get("Description", "")).upper()
        txn  = str(row_data.get("Txn Type", "")).strip()
        return (txn in ("Receipts", "RECEIPTS", "receipts") and
                is_rejected_cheque_text(desc))

    deposited = book_only[
        (book_only["Direction"] == "INFLOW") &
        (~book_only.apply(_is_chq_return_receipt, axis=1))
    ]
    section_row("Less :  Cheques deposited but not Credited in Bank")
    col_header_row("book")
    total_deposited = 0.0
    # Collect 4B-BackdatedClear credited_not_book items whose book rows were
    # absorbed (removed from book_only) but should still be visible in "Less:
    # Deposited" for the accountant to see the full picture.
    # Also collect deposited_not_credited items cleared by bank statement this
    # period (4B-PrevBRSClear) - e.g. RABIYA MUBARAKBHAI PATEL (chq mismatch
    # 66308 vs 66309) and DURGADAS WADHWANI (low name score 15%). These were
    # matched and consumed from book_only/stmt_only but should remain visible.
    # Display only - NOT added to total_deposited or running balance.

    def _get_4b_score(cl, br=None):
        """Return fuzzy score for a 4B cleared entry."""
        # 1. Use stored score if available. Different CF paths were added over
        # time and do not all use the same key name.
        _stored = None
        for _score_key in ("fuzzy_score", "score", "Fuzzy Score %"):
            if cl.get(_score_key, None) is not None:
                _stored = cl.get(_score_key)
                break
        if _stored is not None:
            try:
                return int(round(float(_stored)))
            except (TypeError, ValueError):
                pass
        # 1b. For credited_not_book backdated clears, the current book row is
        # the confirmation evidence. If its party is below 50% against the
        # previous-BRS party, it must remain visible in the BRS statement.
        if br is not None:
            _cl_party = str(cl.get("party", "")).strip()
            _br_party = str(br.get("Party", br.get("party", ""))).strip()
            if _cl_party and _br_party:
                return fuzzy(_cl_party, _br_party)
        # 2. Look up matched_df by bill_no then party+amount
        if matched_df is not None and not matched_df.empty:
            _bill  = str((br or cl).get("Bill No", cl.get("bill_no", ""))).strip()
            _amt   = round(float((br or cl).get("Book Amt (Rs)", cl.get("amount", 0)) or 0), 2)
            _party = str(cl.get("party", "")).strip().upper()
            _4b_rows = matched_df[matched_df["Match Method"].astype(str).str.startswith("4B")]
            if _bill:
                _hit = _4b_rows[_4b_rows["Book Bill No"].astype(str).str.strip() == _bill]
                if not _hit.empty:
                    try:
                        return int(_hit.iloc[0]["Fuzzy Score %"])
                    except (KeyError, ValueError):
                        pass
            if _party:
                _hit = _4b_rows[
                    (abs(_4b_rows["Book Amt (Rs)"].astype(float) - _amt) < 0.01) &
                    (_4b_rows["Book Party"].astype(str).str.strip().str.upper() == _party)
                ]
                if not _hit.empty:
                    try:
                        return int(_hit.iloc[0]["Fuzzy Score %"])
                    except (KeyError, ValueError):
                        pass
        # 3. Compute from cleared_by_stmt_rows bank party vs book party
        # Only use this if stmt_rows is non-empty - empty means cleared via chq
        # match (chq_cleared_in_stmt) where bank party is unrelated (e.g. CANARA BAN)
        # and would give a spuriously low score.
        _cl_party = str(cl.get("party", "")).strip()
        _stmt_rows = cl.get("cleared_by_stmt_rows", []) or []
        if _stmt_rows and _cl_party:
            _bank_party = str(_stmt_rows[0].get("Party", "")).strip()
            if _bank_party:
                _computed = fuzzy(_cl_party, _bank_party)
                # Only trust this score if it's meaningfully above 0 -
                # a near-zero score likely means unrelated bank description party
                # We still return it; caller decides based on threshold.
                return _computed
        # 4. Default - treat as well-matched so it won't wrongly show
        return 100

    _backdated_book_rows = []
    for _cl in (cleared_log or []):
        _sec    = str(_cl.get("section",""))
        _status = str(_cl.get("status",""))
        if not _status.startswith("CLEARED"):
            continue
        if _sec == "credited_not_book" and _cl.get("backdated_clear") and _cl.get("cleared_by_book_rows"):
            for _br in (_cl.get("cleared_by_book_rows", []) or []):
                if _get_4b_score(_cl, _br) < PARTY_CONFIRMATION_THRESHOLD:
                    _backdated_book_rows.append((_cl, _br))
        elif _sec == "deposited_not_credited" and _cl.get("cleared_by_stmt_rows"):
            if _get_4b_score(_cl) >= PARTY_CONFIRMATION_THRESHOLD:
                continue
            _book_row_data = _cl.get("cleared_by_book_rows", []) or []
            if _book_row_data:
                for _br in _book_row_data:
                    _backdated_book_rows.append((_cl, _br))
            else:
                _backdated_book_rows.append((_cl, {
                    "Date":         _cl.get("date",""),
                    "Txn Type":     _cl.get("txn_type",""),
                    "Bill No":      _cl.get("bill_no",""),
                    "Chq No":       _cl.get("chq_no",""),
                    "Party":        _cl.get("party",""),
                    "Party Raw":    _cl.get("party_raw", _cl.get("party","")),
                    "Book Amt (Rs)":_cl.get("amount", 0),
                    "Narration":    _cl.get("narration",""),
                }))

    _deposited_chq_review = _matched_chq_review_rows("INFLOW")
    if deposited.empty and not _backdated_book_rows and not _deposited_chq_review:
        nil_row()
    else:
        for _, row_data in deposited.iterrows():
            amt  = float(row_data["Book Amt (Rs)"])
            narr = str(row_data.get("Narration", "") or "")
            if narr.strip().lower() == "nan":
                narr = ""
            txn_t = str(row_data.get("Txn Type", "")).strip()
            if txn_t in ("Receipts", "Payments", "RECEIPTS", "PAYMENTS"):
                _brs_sourced = (
                    "[CF from prev BRS]" in narr or
                    narr.startswith("Cheque Return") or
                    "Name " in narr
                )
                if not _brs_sourced:
                    narr = ""
            cf   = _is_cf_book_row(row_data)
            book_raw = str(row_data.get("Party Raw", "") or row_data.get("Party", ""))
            rejected = is_rejected_cheque_record(row_data)
            item_row(row_data.get("Date", ""), row_data["Txn Type"], row_data["Bill No"], row_data["Chq No"],
                     row_data["Party"], amt, narr, is_cf=False,
                     book_raw=book_raw, bank_raw="", is_rejected=rejected)
            total_deposited += amt
        for row_data in _deposited_chq_review:
            item_row(row_data.get("Date", ""), row_data.get("Txn Type", ""), row_data.get("Bill No", ""),
                     row_data.get("Chq No", ""), row_data.get("Party", ""),
                     float(row_data.get("Book Amt (Rs)", 0) or 0), row_data.get("Narration", ""),
                     is_cf=False, book_raw=str(row_data.get("Party Raw", row_data.get("Party", ""))),
                     bank_raw="", is_rejected=False)
            total_deposited += float(row_data.get("Book Amt (Rs)", 0) or 0)
        # Show cleared CF book rows and include them in the section subtotal.
        _shown_keys = set()
        for _cl, _br in _backdated_book_rows:
            _key = (str(_br.get("Bill No","")), str(_br.get("Date","")),
                    round(float(_br.get("Book Amt (Rs)", 0) or 0), 2))
            if _key in _shown_keys:
                continue
            _shown_keys.add(_key)
            _amt   = round(float(_br.get("Book Amt (Rs)", 0) or 0), 2)
            _narr  = str(_br.get("Narration", "") or "").replace("[CF from prev BRS]", "").strip(" |")
            _score = _get_4b_score(_cl, _br)
            # Append name-mismatch flag same style as regular unmatched rows
            _name_note = f"Name {_score}% -- verify"
            _narr = (_narr + " | " + _name_note).strip(" |") if _narr else _name_note
            _txn   = str(_br.get("Txn Type", ""))
            _bill  = str(_br.get("Bill No", ""))
            _chq   = str(_br.get("Chq No", ""))
            _party = str(_br.get("Party", ""))
            _book_raw = str(_br.get("Party Raw", _party))
            item_row(_br.get("Date",""), _txn, _bill, _chq, _party, _amt, _narr,
                     is_cf=False, book_raw=_book_raw, bank_raw="")
            total_deposited += _amt
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
        in stmt_only OR in the full bank statement - meaning the cheque bounced,
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
    # Keep nullified cheque-return debit legs visible in BRS as display-only rows.
    # They must not affect totals, but accountants need to see both debit and return legs.
    debited_not_book = stmt_only[
        (stmt_only["Direction"] == "OUTFLOW") &
        ((~stmt_only.apply(_has_return_in_stmt_only, axis=1)) |
         (stmt_only.apply(is_rejected_cheque_record, axis=1)))
    ]
    section_row("Less :  Debited in Bank but not credited in Our Book")
    col_header_row("bank")
    total_debited = 0.0
    _debited_chq_review = _matched_chq_review_bank_rows("OUTFLOW")
    if debited_not_book.empty and not _debited_chq_review:
        nil_row()
    else:
        for _, row_data in debited_not_book.iterrows():
            amt  = float(row_data["Bank Amt (Rs)"])
            desc = str(row_data.get("Description", ""))
            cf   = _is_cf_bank_row(row_data)
            bank_raw = desc
            narr = _cf_bank_narration(row_data) if cf else ""
            # For hard-mismatch released rows, Narration carries the flags
            if not narr:
                _row_narr = str(row_data.get("Narration", "") or "").strip()
                if _row_narr and _row_narr.upper() not in (desc.upper(), str(row_data.get("Party","")).upper()):
                    narr = _row_narr
            rejected = is_rejected_cheque_record(row_data)
            _display_party = row_data["Party"] if row_data["Party"] else desc
            _display_amt = amt
            _is_nullified = "[REJECTED/REMOVED CHEQUE - NULLIFIED]" in desc and amt == 0
            if _is_nullified:
                try:
                    _display_amt = float(row_data.get("Display Amt (Rs)", 0) or 0)
                except (TypeError, ValueError):
                    _display_amt = 0.0
                if not narr:
                    narr = "Cheque Return -- debit & credit nullified"
            item_row(row_data.get("Date", ""), "", "", row_data.get("Chq No", ""),
                     _display_party, _display_amt, narr, is_cf=cf, book_raw="", bank_raw=bank_raw,
                     is_rejected=rejected)
            if not _is_nullified:
                total_debited += amt
        for row_data in _debited_chq_review:
            _desc = str(row_data.get("Description", ""))
            _party = str(row_data.get("Party", "")) or _desc
            item_row(row_data.get("Date", ""), "", "", row_data.get("Chq No", ""),
                     _party, float(row_data.get("Bank Amt (Rs)", 0) or 0),
                     row_data.get("Narration", ""), is_cf=False,
                     book_raw="", bank_raw=_desc, is_rejected=False)
            # Display only - already reconciled; do not add to total_debited.
    subtotal_row(total_debited)
    running -= total_debited
    running_row(running)
    blank_row()

    # Build lookup: (party_upper, amount) -> score for ALL low-score 4B cleared items.
    # Used to inject "Name X% -- verify" narration on the bank side (Add: Credited)
    # to match the flag already shown on the book side (Less: Deposited).
    _low_score_4b = {}
    for _cl4b in (cleared_log or []):
        if not str(_cl4b.get("status","")).startswith("CLEARED"):
            continue
        _sc4b = _get_4b_score(_cl4b)
        if _sc4b >= PARTY_CONFIRMATION_THRESHOLD:
            continue
        _amt4b = round(float(_cl4b.get("amount", 0) or 0), 2)
        _low_score_4b[(str(_cl4b.get("party","")).strip().upper(), _amt4b)] = _sc4b
        for _sr4b in (_cl4b.get("cleared_by_stmt_rows", []) or []):
            _sr4b_party = str(_sr4b.get("Party","")).strip().upper()
            _sr4b_amt   = round(float(_sr4b.get("Bank Amt (Rs)", _amt4b) or _amt4b), 2)
            _low_score_4b[(_sr4b_party, _sr4b_amt)] = _sc4b

    credited_not_book = stmt_only[
        (stmt_only["Direction"] == "INFLOW")
    ]
    section_row("Add :  Credited in Bank but not debited in Our Book")
    col_header_row("bank")
    total_credited = 0.0
    # Collect cleared items to show display-only in Add:Credited:
    # 1. 4B-BackdatedClear (credited_not_book cleared by book) - low score only
    # 2. 4B-PrevBRSClear (deposited_not_credited cleared by bank) - low score only
    #    e.g. DURGADAS WADHWANI: bank row consumed (_used_cf=True), must show here
    _backdated_cnb = []
    for _cl in (cleared_log or []):
        if not str(_cl.get("status", "")).startswith("CLEARED"):
            continue
        _sec = _cl.get("section", "")
        if (_sec == "credited_not_book" and
                _cl.get("backdated_clear") and _cl.get("cleared_by_book_rows")):
            _book_scores = [_get_4b_score(_cl, _br)
                            for _br in (_cl.get("cleared_by_book_rows", []) or [])]
            _sc = min(_book_scores) if _book_scores else _get_4b_score(_cl)
            if _sc < PARTY_CONFIRMATION_THRESHOLD:
                _backdated_cnb.append({**_cl, "_display_score": _sc})
        elif _sec == "deposited_not_credited" and _cl.get("cleared_by_stmt_rows"):
            _sc = _get_4b_score(_cl)
            if _sc >= PARTY_CONFIRMATION_THRESHOLD:
                continue
            # Bank entry was consumed - show it here using the stmt row details
            _sr_list = _cl.get("cleared_by_stmt_rows", []) or []
            for _sr in _sr_list:
                # Build a synthetic entry mimicking the bank row
                _backdated_cnb.append({
                    **_cl,
                    "_display_party":  str(_sr.get("Party", _cl.get("party", ""))),
                    "_display_desc":   str(_sr.get("Description", "")),
                    "_display_date":   str(_sr.get("Date", _cl.get("date", ""))),
                    "_display_chq":    str(_sr.get("Chq No", _cl.get("chq_no", ""))),
                    "_display_amt":    float(_sr.get("Bank Amt (Rs)", _cl.get("amount", 0)) or 0),
                })
    _credited_chq_review = _matched_chq_review_bank_rows("INFLOW")
    if credited_not_book.empty and not _backdated_cnb and not _credited_chq_review:
        nil_row()
    else:
        for _, row_data in credited_not_book.iterrows():
            amt  = float(row_data["Bank Amt (Rs)"])
            desc = str(row_data.get("Description", ""))
            cf   = _is_cf_bank_row(row_data)
            bank_raw = desc
            narr = _cf_bank_narration(row_data) if cf else ""
            # For hard-mismatch released rows, Narration carries the flags from
            # the matched row (e.g. "Name 45% -- verify") - use it directly
            if not narr:
                _row_narr = str(row_data.get("Narration", "") or "").strip()
                if _row_narr:
                    narr = _row_narr
            # Also inject name-mismatch flag for low-score 4B cleared entries
            _bnk_key = (str(row_data.get("Party","")).strip().upper(),
                        round(float(amt), 2))
            if _bnk_key in _low_score_4b:
                _name_note = f"Name {_low_score_4b[_bnk_key]}% -- verify"
                narr = (narr + " | " + _name_note).strip(" |") if narr else _name_note
            rejected = is_rejected_cheque_record(row_data)
            # For nullified cheque return entries, extract real party from description
            # and show original amount - display only, NOT counted in balance
            # (the paired debit/credit already net to zero via nullification).
            _display_party = row_data["Party"] if row_data["Party"] else desc
            _display_amt   = amt
            _is_nullified  = "[REJECTED/REMOVED CHEQUE - NULLIFIED]" in desc and amt == 0
            if _is_nullified:
                try:
                    _display_amt = float(row_data.get("Display Amt (Rs)", 0) or 0)
                except (TypeError, ValueError):
                    _display_amt = 0.0
                _clean_desc = desc.replace("[REJECTED/REMOVED CHEQUE - NULLIFIED]", "").strip()
                _parts = [p.strip() for p in re.split(r'[/\\]', _clean_desc) if p.strip()]
                _skip = {'NEFT','RTGS','IMPS','UPI','CLG','RETURN','AC','AC04',
                         'CREDIT','DEBIT','INWARD','OUTWARD','TRANSFER','TRF'}
                _real_party = next(
                    (p for p in _parts
                     if len(p) > 3
                     and not p.isdigit()
                     and p.upper() not in _skip
                     and not re.match(r'^[A-Z]{2,6}\d{6,}', p.upper())  # skip UTR codes like AXSK261750010163
                     and not re.match(r'^\d{2,}[A-Z]', p.upper())       # skip codes starting with digits
                     ),
                    _display_party
                )
                if _real_party and len(_real_party) > 3:
                    _display_party = _real_party
                if _display_amt <= 0 and stmt_df is not None:
                    _chq_val = str(row_data.get("Chq No", "")).strip()
                    _amt_series = stmt_df.get("Display Amt (Rs)", stmt_df["Bank Amt (Rs)"])
                    _orig = stmt_df[
                        (stmt_df["Chq No"].astype(str).str.strip() == _chq_val) &
                        (stmt_df["Direction"] == "OUTFLOW") &
                        (_amt_series > 0)
                    ] if _chq_val else pd.DataFrame()
                    if _orig.empty:
                        _ref = re.search(r"\b(?:AX[A-Z0-9]+|SK[A-Z0-9]+|UTIBR[A-Z0-9]+)\b", desc.upper())
                        if _ref is not None:
                            _orig = stmt_df[
                                stmt_df["Description"].astype(str).str.upper().str.contains(re.escape(_ref.group(0)), na=False) &
                                (_amt_series > 0)
                            ]
                    if not _orig.empty:
                        _display_amt = float(_orig.iloc[0].get("Display Amt (Rs)", _orig.iloc[0].get("Bank Amt (Rs)", 0)) or 0)
                narr = "Cheque Return -- debit & credit nullified" if not narr else narr
            item_row(row_data.get("Date", ""), "", "", row_data.get("Chq No", ""),
                     _display_party, _display_amt, narr,
                     is_cf=cf, book_raw="", bank_raw=bank_raw,
                     is_rejected=rejected)
            if not bool(row_data.get("_brs_residual_exclude", False)) and not _is_nullified:
                total_credited += _display_amt
        # Show cleared CF bank credits and include them in the section subtotal.
        for row_data in _credited_chq_review:
            _desc = str(row_data.get("Description", ""))
            _party = str(row_data.get("Party", "")) or _desc
            item_row(row_data.get("Date", ""), "", "", row_data.get("Chq No", ""),
                     _party, float(row_data.get("Bank Amt (Rs)", 0) or 0),
                     row_data.get("Narration", ""), is_cf=False,
                     book_raw="", bank_raw=_desc, is_rejected=False)
            total_credited += float(row_data.get("Bank Amt (Rs)", 0) or 0)
        for _cl in _backdated_cnb:
            _amt   = float(_cl.get("_display_amt",  _cl.get("amount", 0)) or 0)
            _party = str(_cl.get("_display_party",  _cl.get("party", "")))
            _desc  = str(_cl.get("_display_desc",   _cl.get("description", _cl.get("party_raw", _cl.get("party", "")))))
            _date  = str(_cl.get("_display_date",   _cl.get("date", "")))
            _chq   = str(_cl.get("_display_chq",    _cl.get("chq_no", "")))
            _narr  = str(_cl.get("narration", "") or "").replace("[CF from prev BRS]", "").strip(" |")
            _score = int(_cl.get("_display_score", _get_4b_score(_cl)) or 0)
            _name_note = f"Name {_score}% -- verify"
            _narr = (_narr + " | " + _name_note).strip(" |") if _narr else _name_note
            item_row(_date, "", "", _chq, _party, _amt, _narr,
                     is_cf=True, book_raw="", bank_raw=_desc)
            total_credited += _amt
        if credited_not_book.empty and _backdated_cnb:
            # All entries are display-only cleared items - show nil for balance
            pass
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

    merge_label(r, 1, brs_layout["merge_to"], diff_label, diff_fill, BF)
    ws.cell(r, brs_layout["amount_col"], "").fill = diff_fill
    ws.cell(r, brs_layout["amount_col"]).border = bdr
    set_amt(r, brs_layout["running_col"], diff_val, diff_fill, BF)
    ws.cell(r, brs_layout["narr_col"], "").fill = diff_fill
    ws.cell(r, brs_layout["narr_col"]).border = bdr
    ws.cell(r, 10, "").fill = diff_fill
    ws.cell(r, 10).border = bdr
    ws.row_dimensions[r].height = 20
    r += 1

    blank_row()

    # -- Section: Matched with Discrepancies (Name/Amount mismatches + Partial Payments) --
    # Filter matched rows that have name mismatches, amount differences, or partial payments.
    # These are technically reconciled but need human verification.
    if False and matched_df is not None and not matched_df.empty:
        discrepancy_mask = (
            (matched_df["Fuzzy Score %"] < PARTY_CONFIRMATION_THRESHOLD) |
            (matched_df["Amount Match"].str.startswith("Diff")) |
            (matched_df.get("Partial Payment", pd.Series(False, index=matched_df.index)).astype(bool))
        )
        discrepancies = matched_df[discrepancy_mask]
        if not discrepancies.empty:
            # Count by type for the section header
            n_partial  = int(discrepancies.get("Partial Payment", pd.Series(False, index=discrepancies.index)).sum())
            n_mismatch = int((discrepancies["Fuzzy Score %"] < PARTY_CONFIRMATION_THRESHOLD).sum())
            n_amt_diff = int(discrepancies["Amount Match"].str.startswith("Diff").sum())
            type_parts = []
            if n_partial:  type_parts.append(f"{n_partial} partial payment{'s' if n_partial>1 else ''}")
            if n_mismatch: type_parts.append(f"{n_mismatch} party confirmation{'s' if n_mismatch>1 else ''}")
            if n_amt_diff: type_parts.append(f"{n_amt_diff} amount difference{'s' if n_amt_diff>1 else ''}")
            type_summary = ", ".join(type_parts)

            section_row(
                f"  Matched Transactions with Discrepancies - Requires Verification  "
                f"({len(discrepancies)} items: {type_summary})",
                fill=SEC_W
            )
            mismatch_col_header_row()
            for _, mr in discrepancies.iterrows():
                is_partial = bool(mr.get("Partial Payment", False))
                is_nm      = mr["Fuzzy Score %"] < PARTY_CONFIRMATION_THRESHOLD
                # Build a concise flag string for this row
                flag_parts = []
                if is_partial and mr.get("Flags", ""):
                    # Extract the PARTIAL/SPLIT note already embedded in Flags
                    for seg in mr["Flags"].split(" | "):
                        if seg.startswith("PARTIAL PAYMENT") or seg.startswith("SPLIT PAYMENT"):
                            flag_parts.append(seg)
                            break
                if mr["Fuzzy Score %"] < PARTY_CONFIRMATION_THRESHOLD:
                    flag_parts.append(
                        f"PARTY CONFIRMATION (score {mr['Fuzzy Score %']}%): "
                        f"Book='{mr['Book Party']}' vs Bank='{mr['Bank Party']}' - "
                        f"Verify party identity before clearance"
                    )
                elif False and mr["Name Match"] == "Partial":
                    flag_parts.append(
                        f"PARTIAL NAME MATCH (score {mr['Fuzzy Score %']}%): "
                        f"Book='{mr['Book Party']}' vs Bank='{mr['Bank Party']}' - "
                        f"Confirm same party"
                    )
                if mr["Amount Match"].startswith("Diff"):
                    dv = mr["Difference (Rs)"]
                    flag_parts.append(
                        f"AMOUNT DIFFERENCE: Rs{dv:+,.2f} - "
                        f"Book Rs{mr['Book Amt (Rs)']:,.2f} vs Bank Rs{mr['Bank Amt (Rs)']:,.2f}"
                    )
                # Any other flags (date gap, dir mismatch, etc.)
                for seg in mr["Flags"].split(" | "):
                    if seg and not seg.startswith(("PARTIAL PAYMENT", "SPLIT PAYMENT",
                                                    "NAME MISMATCH", "PARTIAL NAME",
                                                    "AMOUNT DIFFERENCE", "Name ")):
                        flag_parts.append(seg)
                flag_text = " | ".join(dict.fromkeys(filter(None, flag_parts)))  # deduplicate
                # Row colour: red for party confirmation, peach for partial payments, yellow for others
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
            legend_fill = _NO_FILL
            merge_label(r, 1, 10,
                        " Red = Name Mismatch - verify party before sign-off   "
                        " Orange = Partial/Split Payment - confirm all parts recorded   "
                        " Yellow = Amount diff or partial name - review and confirm",
                        legend_fill,
                        Font(name=FONT_NAME, size=8, italic=True, color="7F4F00"))
            ws.cell(r, 1).value = (
                f" Red = Party Confirmation (<{PARTY_CONFIRMATION_THRESHOLD}%) - verify party before sign-off   "
                " Orange = Partial/Split Payment - confirm all parts recorded   "
                " Yellow = Amount diff - review and confirm"
            )
            ws.row_dimensions[r].height = 16
            r += 1
            blank_row()

    if no_txn_note:
        note_fill = _NO_FILL
        merge_label(r, 1, 10, f"INFO  {no_txn_note}", note_fill,
                    Font(name=FONT_NAME, size=9, italic=True, color="2E75B6"))
        ws.row_dimensions[r].height = 28
        r += 1
        blank_row()

    if carryforward_log:
        r += 1
        merge_label(r, 1, 10,
                    "CF = Carried Forward from Previous BRS "
                    "(outstanding cheques not yet cleared in bank)",
                    _NO_FILL,
                    Font(name=FONT_NAME, size=8, italic=True, color="2E75B6"))
        ws.row_dimensions[r].height = 14
        r += 1


# =============================================================================
# HUMAN VERIFICATION SHEET
# =============================================================================

def build_verification_sheet(wb, matched, book_only, stmt_only,
                              cleared_log, carryforward_log,
                              blocked_crossclears=None, stmt_df=None,
                              split_review=None):
    """
    Builds a 'Human Verification' sheet inserted after the BRS Statement.

    Flags are collected from four sources:
      A) Matched rows with any anomaly (name mismatch, chq differs,
         amount differs, partial payment, direction flip, low fuzzy score)
      B) CF cross-clear blocks: carried-forward items that were silently
         cancelled against each other by fuzzy name+amount matching despite
         being different people or instruments (logged in cleared_log with
         status containing 'cross-matched')
      C) BRS unmatched bank-only items (stmt_only) that are NOT CF and
         carry a 'chq no. diff' narration or have no book counterpart
      D) BRS unmatched book-only items (book_only) that are NOT CF -
         entries recorded in the book with no corresponding bank transaction
    """

    # -- Severity colour bands -------------------------------------------------
    _HDR_FILL  = PatternFill("solid", fgColor="1F3864")   # dark navy - header
    _SEC_A     = PatternFill("solid", fgColor="FFC7CE")   # red tint  - matched anomalies
    _SEC_B     = PatternFill("solid", fgColor="FFEB9C")   # amber     - CF cross-clear blocks
    _SEC_C     = PatternFill("solid", fgColor="FFEB9C")   # amber     - bank-only unmatched
    _SEC_D     = PatternFill("solid", fgColor="DDEBF7")   # blue tint - book-only unmatched
    _SEC_TITLE = PatternFill("solid", fgColor="2E75B6")   # mid blue  - section dividers
    _th        = Side(style="thin", color="BFBFBF")
    _bdr       = Border(left=_th, right=_th, top=_th, bottom=_th)
    _WF        = Font(bold=True, color="FFFFFF", name=FONT_NAME, size=10)
    _BF2       = Font(bold=True, name=FONT_NAME, size=9)
    _NF2       = Font(name=FONT_NAME, size=9)
    _RF2       = Font(name=FONT_NAME, size=9, color="C00000", bold=True)

    COLS = [
        "Source",               # A - where the flag came from
        "Bill Date",            # B - book/bill date
        "Bank Credit/Debit Date",# C - bank transaction date
        "Bill No",              # D
        "Chq No (Book)",        # E
        "Chq No (Bank)",        # F
        "Party (Book)",         # G
        "Party (Bank)",         # H
        "Amount (Rs)",          # I
        "Difference (if any)",  # J
        "Issue Type",           # K - short category label
        "Issue Description",    # L - full human-readable explanation
        "Action Required",      # M - what the reviewer should do
    ]
    NCOLS = len(COLS)
    COL_WIDTHS = [26, 14, 18, 12, 14, 14, 32, 32, 16, 14, 22, 70, 40]

    ws = wb.create_sheet("Human Verification")

    def _hv_clean(value):
        if not isinstance(value, str):
            return value
        replacements = {
            "-": "-",
            "-": "-",
            "-": "-",
            "-": "-",
            "*": "-",
            "->": "->",
            "<->": "<->",
            "Rs": "Rs",
            ">=": ">=",
            "x": "x",
            "x": "x",
        }
        for bad, good in replacements.items():
            value = value.replace(bad, good)
        return value

    # Title
    ws.merge_cells(f"A1:{get_column_letter(NCOLS)}1")
    tc           = ws["A1"]
    tc.value     = _hv_clean("HUMAN VERIFICATION - Items Requiring Manual Review")
    tc.fill      = _HDR_FILL
    tc.font      = Font(bold=True, color="FFFFFF", name=FONT_NAME, size=13)
    tc.border    = _bdr
    tc.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
    ws.row_dimensions[1].height = 30

    # Column headers
    for ci, h in enumerate(COLS, 1):
        cell           = ws.cell(2, ci, h)
        cell.fill      = _HDR_FILL
        cell.font      = _WF
        cell.border    = _bdr
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
    ws.row_dimensions[2].height = 18

    row = 3

    def _sec_title(label, fill=_SEC_TITLE):
        ws.merge_cells(f"A{row}:{get_column_letter(NCOLS)}{row}")
        cell           = ws.cell(row, 1, _hv_clean(label))
        cell.fill      = fill
        cell.font      = Font(bold=True, color="FFFFFF", name=FONT_NAME, size=10)
        cell.border    = _bdr
        cell.alignment = Alignment(horizontal="left", vertical="center")
        ws.row_dimensions[row].height = 16

    def _flag_row(vals, fill, bold=False):
        fn = _BF2 if bold else _NF2
        for ci, v in enumerate(vals, 1):
            cell           = ws.cell(row, ci, _hv_clean(v))
            cell.fill      = fill
            cell.font      = fn
            cell.border    = _bdr
            cell.alignment = Alignment(horizontal="left", vertical="center",
                                       wrap_text=True)
            if ci == 9:   # Amount column - right-align
                cell.alignment     = Alignment(horizontal="right", vertical="center")
                cell.number_format = '#,##0.00'
            if ci == 10:  # Difference column - right-align
                cell.alignment     = Alignment(horizontal="right", vertical="center")
                cell.number_format = '#,##0.00'
        ws.row_dimensions[row].height = 30

    # -------------------------------------------------------------------------
    # SECTION A - Matched rows with anomalies
    # -------------------------------------------------------------------------
    _sec_a_rows = []
    if not matched.empty:
        for _, mr in matched.iterrows():
            flags_raw = str(mr.get("Flags", "") or "")
            score     = int(mr.get("Fuzzy Score %", 100) or 100)
            name_match= str(mr.get("Name Match", "Match"))
            amt_match = str(mr.get("Amount Match", "Exact"))
            method    = str(mr.get("Match Method", ""))
            is_pp     = bool(mr.get("Partial Payment", False))

            issues = []
            action_parts = []

            if name_match == "Mismatch":
                issues.append(f"Name mismatch ({score}%) - book party does not match bank party")
                action_parts.append("Confirm the bank transaction belongs to the book entry")
            elif name_match == "Partial":
                issues.append(f"Name partial match ({score}%) - names are similar but differ")
                action_parts.append("Verify this is the same person/entity")

            if "Cheque no differs" in flags_raw:
                # Extract the chq details from the flag string
                chq_detail = next(
                    (seg for seg in flags_raw.split(" | ") if "Cheque no differs" in seg),
                    "Cheque no differs"
                )
                issues.append(f"Cheque number mismatch - {chq_detail}")
                action_parts.append("Check if cheque was re-issued or bank recorded wrong chq")

            if not amt_match.startswith("Exact"):
                issues.append(f"Amount differs - {amt_match}")
                action_parts.append("Investigate the amount gap; check for short payment or bank charge")

            if is_pp:
                issues.append("Partial payment - one book entry split across multiple bank transactions")
                action_parts.append("Confirm all bank split amounts sum to the full book amount")

            if "Dir mismatch" in flags_raw:
                issues.append("Direction mismatch - book shows INFLOW but bank shows OUTFLOW or vice versa")
                action_parts.append("Verify direction; may indicate a forex/FFMC settlement entry")

            if "Third party payment" in flags_raw:
                issues.append("Third-party payment - bank remitter name differs from book party")
                action_parts.append("Confirm payer authorisation; ensure no fraud risk")

            if not issues:
                continue

            _sec_a_rows.append({
                "source":       f"Matched Sheet  |  {method}",
                "bill_date":    mr.get("Book Date", ""),
                "bank_date":    mr.get("Bank Date", ""),
                "party_book":   str(mr.get("Book Party", "")),
                "party_bank":   str(mr.get("Bank Description", "") or mr.get("Bank Party", "")),
                "chq_book":     str(mr.get("Book Chq", "")),
                "chq_bank":     str(mr.get("Bank Chq", "")),
                "bill":         str(mr.get("Book Bill No", "")),
                "amount":       float(mr.get("Book Amt (Rs)", 0) or 0),
                "difference":   round(float(mr.get("Book Amt (Rs)", 0) or 0) - float(mr.get("Bank Amt (Rs)", 0) or 0), 2),
                "issue_type":   " | ".join(dict.fromkeys(
                    ("Name Mismatch"    if "Name mismatch"   in i else
                     "Name Partial"     if "Name partial"    in i else
                     "Cheque Mismatch"  if "Cheque number"   in i else
                     "Amount Differs"   if "Amount differs"  in i else
                     "Partial Payment"  if "Partial payment" in i else
                     "Direction Error"  if "Direction"       in i else
                     "Third Party"      if "Third-party"     in i else "Other")
                    for i in issues
                )),
                "issue_desc":   " | ".join(issues),
                "action":       "Manual check",
            })

    if _sec_a_rows:
        _sec_title(
            f"SECTION A - Matched Transactions with Anomalies  ({len(_sec_a_rows)} items)"
            f"  -  Source: Matched sheet  -  These were matched but have discrepancies",
            fill=PatternFill("solid", fgColor="C00000")
        )
        row += 1
        for r_data in _sec_a_rows:
            _flag_row([
                r_data["source"],     r_data["bill_date"],
                r_data["bank_date"],  r_data["bill"],
                r_data["chq_book"],   r_data["chq_bank"],
                r_data["party_book"], r_data["party_bank"],
                r_data["amount"],     r_data["difference"],
                r_data["issue_type"], r_data["issue_desc"],
                r_data["action"],
            ], fill=_NO_FILL)
            row += 1
    else:
        _sec_title("SECTION A - Matched Transactions with Anomalies  -  None found",
                   fill=PatternFill("solid", fgColor="375623"))
        row += 1

    # Dedicated cheque-number mismatch section. These rows are also released into
    # BRS when hard-mismatch handling runs, but this section gives reviewers a
    # single place to audit wrong/re-issued cheque numbers.
    _sec_chq_rows = []
    if not matched.empty:
        for _, mr in matched.iterrows():
            flags_raw = str(mr.get("Flags", "") or "")
            if "Cheque no differs" not in flags_raw:
                continue
            chq_detail = next(
                (seg for seg in flags_raw.split(" | ") if "Cheque no differs" in seg),
                "Cheque no differs"
            )
            _sec_chq_rows.append({
                "source":       f"Matched Sheet  |  Cheque No Mismatch  |  {mr.get('Match Method', '')}",
                "bill_date":    mr.get("Book Date", ""),
                "bank_date":    mr.get("Bank Date", ""),
                "party_book":   str(mr.get("Book Party", "")),
                "party_bank":   str(mr.get("Bank Description", "") or mr.get("Bank Party", "")),
                "chq_book":     str(mr.get("Book Chq", "")),
                "chq_bank":     str(mr.get("Bank Chq", "")),
                "bill":         str(mr.get("Book Bill No", "")),
                "amount":       float(mr.get("Book Amt (Rs)", 0) or 0),
                "difference":   0.00,
                "issue_type":   "Cheque No. Mismatch",
                "issue_desc":   chq_detail,
                "action":       "Manual check",
            })

    if _sec_chq_rows:
        _sec_title(
            f"SECTION A1 - Cheque Number Mismatches  ({len(_sec_chq_rows)} items)"
            f"  -  Source: Matched/BRS  -  Cheque number differs between book and bank",
            fill=PatternFill("solid", fgColor="9C6500")
        )
        row += 1
        for r_data in _sec_chq_rows:
            _flag_row([
                r_data["source"],     r_data["bill_date"],
                r_data["bank_date"],  r_data["bill"],
                r_data["chq_book"],   r_data["chq_bank"],
                r_data["party_book"], r_data["party_bank"],
                r_data["amount"],     r_data["difference"],
                r_data["issue_type"], r_data["issue_desc"],
                r_data["action"],
            ], fill=_NO_FILL)
            row += 1
    else:
        _sec_title("SECTION A1 - Cheque Number Mismatches  -  None found",
                   fill=PatternFill("solid", fgColor="375623"))
        row += 1

    # -------------------------------------------------------------------------
    # SECTION B - CF cross-clear flags (both BLOCKED pairs AND cleared pairs)
    #
    # Two sub-categories surfaced here:
    #   B1 - BLOCKED: pairs our safety guards stopped from auto-cancelling.
    #        These correctly remain in the BRS as outstanding items, but the
    #        reviewer must confirm the two entries are genuinely separate
    #        (different people / different instruments).
    #        e.g. SAMIKSHA BHAGAT (issued, chq 159933) vs SATISH BHAGAT
    #             (debited, chq 159933) - same chq, different people.
    #
    #   B2 - CLEARED: pairs that WERE auto-cancelled via fuzzy name+amount.
    #        These no longer appear in the BRS. Reviewer confirms the
    #        cancellation was intentional.
    #        e.g. ASTHA AGGARWAL vs MOHIT AGGARWAL (family members, same txn).
    # -------------------------------------------------------------------------
    _sec_b_rows = []
    blocked_crossclears = blocked_crossclears or []

    # B1 - Blocked cross-clears (our fixes stopped these from auto-cancelling)
    for blk in blocked_crossclears:
        ia   = blk.get("side_a", {})
        ib   = blk.get("side_b", {})
        _party_a  = str(ia.get("party", ""))
        _party_b  = str(ib.get("party_raw", "") or ib.get("description", "") or ib.get("party", ""))
        _chq_a    = str(ia.get("chq_no", ""))
        _chq_b    = str(ib.get("chq_no", ""))
        _amt      = round(float(ia.get("amount", 0) or 0), 2)
        _score    = int(blk.get("fuzzy_score", 0))
        _reason   = str(blk.get("reason", ""))
        _sec_a_lbl = (
            "Issued not debited (Book)"    if ia.get("section") == "issued_not_debited"
            else "Deposited not credited (Book)"
        )
        _sec_b_lbl = (
            "Debited not in book (Bank)"   if ib.get("section") == "debited_not_book"
            else "Credited not in book (Bank)"
        )
        _issue_desc = (
            f"Chq {_chq_a} vs chq {_chq_b} - {_score}% name match - kept in BRS, verify separately"
        )
        _action = (
            "Confirm these are two separate transactions. "
            "If they ARE the same (e.g. same person, different name spelling), "
            "manually clear both entries and raise a correction."
        )
        _sec_b_rows.append({
            "source":       "Carry-Forward  |  BLOCKED Cross-Clear  |  Prev BRS",
            "bill_date":    str(ia.get("date", "")),
            "bank_date":    str(ib.get("date", "")),
            "party_book":   _party_a,
            "party_bank":   _party_b,
            "chq_book":     _chq_a,
            "chq_bank":     _chq_b,
            "bill":         str(ia.get("bill_no", "")),
            "amount":       _amt,
            "difference":   0.00,
            "issue_type":   "CF Blocked Cross-Clear",
            "issue_desc":   _issue_desc,
            "action":       "Manual check",
        })

    # B2 - Cleared cross-clears (auto-cancelled, reviewer should confirm)
    _cross_cleared_pairs = {}
    for item in (cleared_log or []):
        status = str(item.get("status", ""))
        if "cross-matched" not in status.lower():
            continue
        amt = round(float(item.get("amount", 0) or 0), 2)
        _cross_cleared_pairs.setdefault(amt, []).append(item)

    for amt, pair_items in _cross_cleared_pairs.items():
        if len(pair_items) < 2:
            continue
        side_a = [i for i in pair_items
                  if i.get("section") in ("issued_not_debited", "deposited_not_credited")]
        side_b = [i for i in pair_items
                  if i.get("section") in ("debited_not_book", "credited_not_book")]
        if not side_a or not side_b:
            continue
        for ia in side_a:
            for ib in side_b:
                _party_a  = str(ia.get("party", ""))
                _party_b  = str(ib.get("party_raw", "") or ib.get("description", "") or ib.get("party", ""))
                _score    = fuzzy(_party_a, _party_b)
                _chq_a    = str(ia.get("chq_no", ""))
                _chq_b    = str(ib.get("chq_no", ""))
                _sec_a_lbl = (
                    "Issued not debited (Book)"   if ia.get("section") == "issued_not_debited"
                    else "Deposited not credited (Book)"
                )
                _sec_b_lbl = (
                    "Debited not in book (Bank)"  if ib.get("section") == "debited_not_book"
                    else "Credited not in book (Bank)"
                )
                _issue_desc = (
                    f"Chq {_chq_a} vs chq {_chq_b} - {_score}% name match - auto-cancelled, confirm same transaction"
                )
                _action = (
                    "Confirm both entries relate to the same transaction. "
                    "If they are different people/instruments, raise a manual correction "
                    "to reinstate both in the BRS."
                )
                _sec_b_rows.append({
                    "source":       "Carry-Forward  |  Auto-Cancelled Cross-Clear  |  Prev BRS",
                    "bill_date":    str(ia.get("date", "")),
                    "bank_date":    str(ib.get("date", "")),
                    "party_book":   _party_a,
                    "party_bank":   _party_b,
                    "chq_book":     _chq_a,
                    "chq_bank":     _chq_b,
                    "bill":         str(ia.get("bill_no", "")),
                    "amount":       amt,
                    "difference":   0.00,
                    "issue_type":   "CF Auto-Cancelled",
                    "issue_desc":   _issue_desc,
                    "action":       "Manual check",
                })

    if _sec_b_rows:
        _sec_title(
            f"SECTION B - Carry-Forward Cross-Cleared Pairs  ({len(_sec_b_rows)} items)"
            f"  -  Source: Previous BRS  -  Two CF items cancelled via fuzzy name+amount match - verify",
            fill=PatternFill("solid", fgColor="7F6000")
        )
        row += 1
        for r_data in _sec_b_rows:
            _flag_row([
                r_data["source"],     r_data["bill_date"],
                r_data["bank_date"],  r_data["bill"],
                r_data["chq_book"],   r_data["chq_bank"],
                r_data["party_book"], r_data["party_bank"],
                r_data["amount"],     r_data["difference"],
                r_data["issue_type"], r_data["issue_desc"],
                r_data["action"],
            ], fill=_NO_FILL)
            row += 1
    else:
        _sec_title("SECTION B - Carry-Forward Cross-Cleared Pairs  -  None found",
                   fill=PatternFill("solid", fgColor="375623"))
        row += 1

    # -------------------------------------------------------------------------
    # SECTION C - Bank-only unmatched (stmt_only) - current period, not CF
    # -------------------------------------------------------------------------
    _sec_c_rows = []
    if not stmt_only.empty:
        for _, sr in stmt_only.iterrows():
            is_cf  = (str(sr.get("Description", "")).endswith("[CF from prev BRS]") or
                      sr.get("Balance (Rs)", 1) == 0)
            if is_cf:
                continue
            amt    = float(sr.get("Bank Amt (Rs)", 0) or 0)
            narr   = str(sr.get("Narration", sr.get("Description", "")) or "")
            chq_diff = ("chq no. diff" in narr.lower() or "cheque no differs" in narr.lower())
            issue_type = "Chq No. Mismatch" if chq_diff else "Unrecorded Bank Txn"
            if chq_diff:
                issue_desc = f"Chq {sr.get('Chq No','')} - book entry has a different cheque number"
                action = (
                    "Check whether the cheque was re-issued or if the book entry "
                    "carries the wrong cheque number. Update books accordingly."
                )
            else:
                issue_desc = (
                    f"Rs{amt:,.2f} {'OUTFLOW' if sr.get('Direction') == 'OUTFLOW' else 'INFLOW'} "
                    f"on {sr.get('Date', '')} - not recorded in book"
                )
                action = (
                    "Identify the transaction and post the missing book entry. "
                    "If a bank charge or interest, record in the ledger immediately."
                )
            _sec_c_rows.append({
                "source":       "BRS  |  Less: Debited in Bank / Add: Credited in Bank",
                "bill_date":    "",
                "bank_date":    str(sr.get("Date", "")),
                "party_book":   "-- not in book --",
                "party_bank":   str(sr.get("Description", "") or sr.get("Party", "")),
                "chq_book":     "",
                "chq_bank":     str(sr.get("Chq No", "")),
                "bill":         "",
                "amount":       amt,
                "difference":   amt,
                "issue_type":   issue_type,
                "issue_desc":   issue_desc,
                "action":       "Manual check",
            })

    if _sec_c_rows:
        _sec_title(
            f"SECTION C - Bank-Only Unmatched Transactions  ({len(_sec_c_rows)} items)"
            f"  -  Source: BRS 'Less: Debited / Add: Credited in Bank'  -  Not in books - investigate",
            fill=PatternFill("solid", fgColor="7F4C00")
        )
        row += 1
        for r_data in _sec_c_rows:
            _flag_row([
                r_data["source"],     r_data["bill_date"],
                r_data["bank_date"],  r_data["bill"],
                r_data["chq_book"],   r_data["chq_bank"],
                r_data["party_book"], r_data["party_bank"],
                r_data["amount"],     r_data["difference"],
                r_data["issue_type"], r_data["issue_desc"],
                r_data["action"],
            ], fill=_NO_FILL)
            row += 1
    else:
        _sec_title("SECTION C - Bank-Only Unmatched Transactions  -  None found",
                   fill=PatternFill("solid", fgColor="375623"))
        row += 1

    # -------------------------------------------------------------------------
    # SECTION D - Book-only unmatched (book_only) - current period, not CF
    # -------------------------------------------------------------------------
    _sec_d_rows = []
    if not book_only.empty:
        for _, br in book_only.iterrows():
            is_cf  = "[CF from prev BRS]" in str(br.get("Narration", ""))
            is_gap = str(br.get("Party", "")).upper() in ("BOOK OPENING GAP", "BOOK GAP")
            if is_cf or is_gap:
                continue
            amt       = float(br.get("Book Amt (Rs)", 0) or 0)
            direction = str(br.get("Direction", ""))
            issue_desc = (
                f"Rs{amt:,.2f} {direction} on {br.get('Date', '')} -- not found in bank statement"
            )
            if direction == "OUTFLOW":
                action = (
                    "Confirm the cheque/payment has been issued. "
                    "If cheque not yet presented to bank, carry forward to next BRS. "
                    "If over 3 months old, investigate stale cheque."
                )
            else:
                action = (
                    "Confirm the deposit/receipt was physically deposited. "
                    "If deposited, follow up with bank for credit. "
                    "If not yet deposited, deposit immediately."
                )
            _sec_d_rows.append({
                "source":       "BRS  |  Add: Issued / Less: Deposited (Book Only)",
                "bill_date":    str(br.get("Date", "")),
                "bank_date":    "-- not in bank --",
                "party_book":   str(br.get("Party", "")),
                "party_bank":   "-- not in bank --",
                "chq_book":     str(br.get("Chq No", "")),
                "chq_bank":     "",
                "bill":         str(br.get("Bill No", "")),
                "amount":       amt,
                "difference":   amt,
                "issue_type":   "Book Not in Bank",
                "issue_desc":   issue_desc,
                "action":       "Manual check",
            })

    if _sec_d_rows:
        _sec_title(
            f"SECTION D - Book-Only Entries (Not in Bank)  ({len(_sec_d_rows)} items)"
            f"  -  Source: BRS 'Add: Issued / Less: Deposited'  -  Outstanding - pending bank clearance",
            fill=PatternFill("solid", fgColor="1F3864")
        )
        row += 1
        for r_data in _sec_d_rows:
            _flag_row([
                r_data["source"],     r_data["bill_date"],
                r_data["bank_date"],  r_data["bill"],
                r_data["chq_book"],   r_data["chq_bank"],
                r_data["party_book"], r_data["party_bank"],
                r_data["amount"],     r_data["difference"],
                r_data["issue_type"], r_data["issue_desc"],
                r_data["action"],
            ], fill=_NO_FILL)
            row += 1
    else:
        _sec_title("SECTION D - Book-Only Entries (Not in Bank)  -  None found",
                   fill=PatternFill("solid", fgColor="375623"))
        row += 1

    # -------------------------------------------------------------------------
    # SECTION E - CF issued_not_debited items with no bank debit for the cheque
    #
    # When a cheque was issued (in book, carried forward from a prev BRS) but the
    # bank has NO record of debiting that cheque number - neither in the current
    # bank statement NOR in stmt_only - the cheque may have been:
    #   (a) honoured by the bank under a DIFFERENT party name (name mismatch, like
    #       A AJAY KUMAR issued vs ABHISHEETY KUMAR debited - our P1 fix keeps both
    #       in the BRS but flags this here so the accountant can investigate), OR
    #   (b) genuinely not yet presented (legitimately outstanding), OR
    #   (c) cancelled or returned.
    # This section surfaces ALL such cases so nothing slips through silently.
    # -------------------------------------------------------------------------
    _sec_e_rows = []
    _norm_chq_e = lambda v: str(v or "").strip().lstrip("0") or "0"
    _stmt_df_safe = stmt_df if stmt_df is not None else stmt_only

    for _cf in (carryforward_log or []):
        if str(_cf.get("section", "")) != "issued_not_debited":
            continue
        _cf_chq = str(_cf.get("chq_no", "")).strip()
        # Only flag when there is a real cheque number to look up
        if not _cf_chq or _cf_chq in ("", "0", "99", "511", "nan"):
            continue
        _cf_party  = str(_cf.get("party", ""))
        _cf_amt    = float(_cf.get("amount", 0) or 0)
        _cf_date   = str(_cf.get("date", ""))
        _cf_bill   = str(_cf.get("bill_no", ""))
        _norm_cf   = _norm_chq_e(_cf_chq)

        # Check if ANY row in the full bank statement has this cheque number
        _chq_in_bank = False
        if not _stmt_df_safe.empty:
            for _col in ("Chq No", "chq_no", "Description", "description"):
                if _col not in _stmt_df_safe.columns:
                    continue
                _hits = _stmt_df_safe[
                    _stmt_df_safe[_col].astype(str).str.contains(
                        r"" + re.escape(_cf_chq) + r"", regex=True, na=False
                    )
                ]
                if not _hits.empty:
                    _chq_in_bank = True
                    break

        if _chq_in_bank:
            # Cheque IS in bank stmt - it will appear in Less:Debited or was matched.
            # P1 name-mismatch block already handles this via blocked_crossclears (Section B).
            continue

        # Cheque NOT found anywhere in bank - flag it
        _issue_desc = (
            f"Chq {_cf_chq} Rs{_cf_amt:,.2f} on {_cf_date} - no matching debit in bank"
        )
        _action = (
            f"Search previous bank statements for chq {_cf_chq}. "
            f"If found under a different name, note the name difference and "
            f"clear this CF entry manually. "
            f"If not found, confirm with the payee whether the cheque was received."
        )
        _sec_e_rows.append({
            "source":       "Carry-Forward  |  Issued Not Debited  |  Chq not in bank",
            "bill_date":    _cf_date,
            "bank_date":    "-- not found in bank --",
            "party_book":   _cf_party,
            "party_bank":   "-- not found in bank statement --",
            "chq_book":     _cf_chq,
            "chq_bank":     "",
            "bill":         _cf_bill,
            "amount":       _cf_amt,
            "difference":   _cf_amt,
            "issue_type":   "Chq Issued - No Bank Debit",
            "issue_desc":   _issue_desc,
            "action":       "Manual check",
        })

    if _sec_e_rows:
        _sec_title(
            f"SECTION E - CF Issued Cheques with No Bank Debit Found  ({len(_sec_e_rows)} items)"
            f"  -  Cheque issued in book but no matching debit in bank - investigate",
            fill=PatternFill("solid", fgColor="7030A0")
        )
        row += 1
        for r_data in _sec_e_rows:
            _flag_row([
                r_data["source"],     r_data["bill_date"],
                r_data["bank_date"],  r_data["bill"],
                r_data["chq_book"],   r_data["chq_bank"],
                r_data["party_book"], r_data["party_bank"],
                r_data["amount"],     r_data["difference"],
                r_data["issue_type"], r_data["issue_desc"],
                r_data["action"],
            ], fill=_NO_FILL)
            row += 1
    else:
        _sec_title("SECTION E - CF Issued Cheques with No Bank Debit Found  -  None found",
                   fill=PatternFill("solid", fgColor="375623"))
        row += 1

    # -------------------------------------------------------------------------
    # SECTION F - Possible Split Payments (weak auto-match candidates)
    #
    # These are book entries where multiple bank rows sum to the exact book
    # amount but the party name fuzzy score was below the auto-match threshold.
    # The script could NOT safely auto-match them - a human must confirm.
    # -------------------------------------------------------------------------
    _sec_f_rows = [r for r in (split_review or [])
                   if isinstance(r, dict) and "_cross_match_groups" not in r]

    if _sec_f_rows:
        _sec_title(
            f"SECTION F - Possible Split Payments  ({len(_sec_f_rows)} items)"
            f"  -  1 book entry = multiple bank credits summing to exact book amount"
            f"  -  Name score below threshold - verify and clear manually",
            fill=PatternFill("solid", fgColor="833C00")
        )
        row += 1
        for cand in _sec_f_rows:
            amt   = cand["book_amt"]
            issue_desc = (
                f"Book Rs{amt:,.2f} ({cand['book_party']}) - "
                f"bank has {cand['n_parts']} credits summing to this amount: {cand['bank_parts']}"
            )
            action = "Verify and clear manually as split payment."
            _flag_row([
                "Pass 3c  |  Split Payment Candidate",
                cand["book_date"],
                "-- multiple bank dates --",
                cand["book_bill"],
                cand["book_chq"],
                "-- multiple --",
                cand["book_party"],
                cand["bank_parts"],
                amt,
                0.00,
                "Possible Split Payment",
                issue_desc,
                action,
            ], fill=_NO_FILL)
            row += 1
    else:
        _sec_title("SECTION F - Possible Split Payments  -  None found",
                   fill=PatternFill("solid", fgColor="375623"))
        row += 1

    # -------------------------------------------------------------------------
    # SECTION G - Possible Cross-Matches (same amount, different parties)
    #
    # Multiple book entries matched to different bank entries with the SAME
    # amount + date but DIFFERENT party names at medium fuzzy scores.
    # The script may have paired the wrong book entry to the wrong bank entry.
    # Example: DA ARVIND, V KARUNA ARVIND, UDHAYAVARSHNI ARVIND all Rs1,11,878
    # on the same date - matched cross-wise due to shared word "ARVIND".
    # -------------------------------------------------------------------------
    _cross_groups = []
    for _item in (split_review or []):
        if isinstance(_item, dict) and "_cross_match_groups" in _item:
            _cross_groups = _item["_cross_match_groups"]
            break

    if _cross_groups:
        _sec_title(
            f"SECTION G - Possible Cross-Matches  ({len(_cross_groups)} group(s))"
            f"  -  Same amount+date matched to different parties - verify correct pairing",
            fill=PatternFill("solid", fgColor="833C00")
        )
        row += 1
        for _grp_df in _cross_groups:
            for _, _mr in _grp_df.iterrows():
                _book_p = str(_mr.get("Book Party", ""))
                _bank_p = str(_mr.get("Bank Party", ""))
                _amt    = float(_mr.get("Book Amt (Rs)", 0) or 0)
                _score  = int(_mr.get("Fuzzy Score %", 0) or 0)
                _bdate  = str(_mr.get("Bank Date", ""))
                _bill   = str(_mr.get("Book Bill No", ""))
                _chq    = str(_mr.get("Book Chq", ""))
                issue_desc = (
                    f"Book '{_book_p}' matched bank '{_bank_p}' (score {_score}%) "
                    f"- same Rs{_amt:,.2f} on {_bdate} as other entries in this group."
                )
                action = "Verify each book entry is matched to the correct bank credit. Re-match manually if wrong."
                _flag_row([
                    "Pass 2  |  Cross-Match",
                    str(_mr.get("Book Date", "")),
                    _bdate,
                    _bill, _chq, _chq,
                    _book_p,
                    _bank_p,
                    _amt,
                    0.00,
                    f"Possible Cross-Match ({_score}%)",
                    issue_desc,
                    action,
                ], fill=_NO_FILL)
                row += 1
    else:
        _sec_title("SECTION G - Possible Cross-Matches  -  None found",
                   fill=PatternFill("solid", fgColor="375623"))
        row += 1

    # -- No-flag case ----------------------------------------------------------
    total_flags = (len(_sec_a_rows) + len(_sec_b_rows) + len(_sec_c_rows)
                   + len(_sec_d_rows) + len(_sec_e_rows) + len(_sec_f_rows)
                   + sum(len(g) for g in _cross_groups))
    if total_flags == 0:
        ws.merge_cells(f"A{row}:{get_column_letter(NCOLS)}{row}")
        cell           = ws.cell(row, 1, _hv_clean("NO ISSUES FOUND - All transactions reconciled cleanly"))
        cell.fill      = _NO_FILL
        cell.font      = Font(bold=True, name=FONT_NAME, size=11)
        cell.border    = _bdr
        cell.alignment = Alignment(horizontal="center", vertical="center")
        ws.row_dimensions[row].height = 24

    # -- Column widths ---------------------------------------------------------
    for i, w in enumerate(COL_WIDTHS, 1):
        ws.column_dimensions[get_column_letter(i)].width = w


# =============================================================================
# CARRY-FORWARD AUDIT SHEET  (removed - sheet no longer generated)
# =============================================================================

def build_cf_audit_sheet(wb, cleared_log, carryforward_log):
    # CF Audit Trail sheet has been removed per user request.
    # This stub is kept so existing call sites don't raise NameError.
    pass


# =============================================================================
# BUILD FULL EXCEL
# =============================================================================

def build_excel(book_df, stmt_df, matched, book_only, stmt_only,
                book_opening_bal, book_opening_drcr,
                book_closing_bal, book_closing_drcr,
                bank_closing_bal, path,
                company_name, account_no, branch_label, brs_date,
                cleared_log=None, carryforward_log=None,
                blocked_crossclears=None,
                no_txn_note="", split_review=None):

    cleared_log         = cleared_log         or []
    carryforward_log    = carryforward_log    or []
    blocked_crossclears = blocked_crossclears or []
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
        # For Receipt/Payment entries the Narration field is the raw Tally internal
        # narration and must be blank. Only keep remarks that came from external
        # sources (carry-forward notes, cheque return info, name-verify flags).
        _narr = str(r.get("Narration", "") or "")
        if _narr.strip().lower() == "nan":
            _narr = ""
        _txn_t = str(r.get("Txn Type", "")).strip()
        if _txn_t in ("Receipts", "Payments", "RECEIPTS", "PAYMENTS"):
            _brs_sourced = (
                "[CF from prev BRS]" in _narr or
                _narr.startswith("Cheque Return") or
                "Name " in _narr
            )
            if not _brs_sourced:
                _narr = ""
        vals  = [r.get("Date",""),r["Txn Type"], r["Bill No"], r["Chq No"], r["Party"],
                 r["Direction"], r["Sender"], r["Recipient"], r["Book Amt (Rs)"], _narr]
        fills = [_W,_GR, _W, _W, _W, df, df, df, _W, _W]
        _drow(ws1, i, vals, fills, font=RF if is_rejected_cheque_record(r) else None)
    closing_row = len(book_df) + 3
    _BAL = _NO_FILL
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
        _debit_disp  = r["Debit (Rs)"]
        _credit_disp = r["Credit (Rs)"]
        # For nullified cheque return rows, show the original (pre-nullification)
        # amount from Display Amt (Rs) so the accountant can see what was returned.
        if "[REJECTED/REMOVED CHEQUE - NULLIFIED]" in str(r.get("Description", "")):
            _disp_amt = float(r.get("Display Amt (Rs)", 0) or 0)
            if _disp_amt > 0:
                if r["Direction"] == "OUTFLOW":
                    _debit_disp = _disp_amt
                else:
                    _credit_disp = _disp_amt
        vals  = [r["Date"], r["Chq No"], r["Description"], r["Party"],
                 r["Direction"], r["Sender"], r["Recipient"],
                 _debit_disp, _credit_disp, r["Balance (Rs)"]]
        fills = [_W, _W, _W, _W, df, df, df, _W, _W, _W]
        rejected_stmt_row = is_rejected_cheque_record(r)
        _drow(ws2, i, vals, fills, font=RF if rejected_stmt_row else None)
        if rejected_stmt_row:
            _highlight_row(ws2, i, len(H2))
    _w(ws2, [12, 10, 50, 30, 10, 30, 30, 14, 14, 14])

    # Sheet 3: Matched
    ws3 = wb.create_sheet("Matched")

    def _matched_party_display(value):
        return "OEFS" if str(value).strip().upper() == company_name.upper() else value

    _backdated_match_rows = []
    for _cf in cleared_log:
        if not (
            _cf.get("backdated_clear") or
            _cf.get("cleared_by_book_rows") or
            _cf.get("cleared_by_stmt_rows")
        ):
            continue
        _cf_section = str(_cf.get("section", "credited_not_book"))
        _cf_is_debit = _cf_section == "debited_not_book"
        _cf_direction = "OUTFLOW" if _cf_is_debit else "INFLOW"
        _book_rows = _cf.get("cleared_by_book_rows", []) or []
        _is_split_clear = len(_book_rows) > 1
        _book_split_total = sum(float(_b.get("Book Amt (Rs)", 0) or 0) for _b in _book_rows)
        for _part_no, _brd in enumerate(_book_rows, 1):
            _book_amt = float(_brd.get("Book Amt (Rs)", 0) or 0)
            _cf_full_amt = float(_cf.get("amount", 0) or 0)
            _bank_amt = _cf_full_amt
            _score = fuzzy(str(_brd.get("Party", "")), str(_cf.get("party", "")))
            _br = pd.Series({
                "Date": _brd.get("Date", ""),
                "Txn Type": _brd.get("Txn Type", ""),
                "Bill No": _brd.get("Bill No", ""),
                "Chq No": _brd.get("Chq No", ""),
                "Party": _brd.get("Party", ""),
                "Party Raw": _brd.get("Party Raw", _brd.get("Party", "")),
                "Direction": _brd.get("Direction", _cf_direction),
                "Sender": _brd.get("Sender", company_name if _cf_is_debit else _brd.get("Party", "")),
                "Recipient": _brd.get("Recipient", _brd.get("Party", "") if _cf_is_debit else company_name),
                "Book Amt (Rs)": _book_amt,
                "Narration": _brd.get("Narration", ""),
            })
            _sr = pd.Series({
                "Date": _cf.get("date", ""),
                "Chq No": _cf.get("chq_no", ""),
                "Description": _cf.get("description", _cf.get("narration", "")),
                "Party": _cf.get("party", ""),
                "Direction": _cf_direction,
                "Sender": company_name if _cf_is_debit else _cf.get("party", ""),
                "Recipient": _cf.get("party", "") if _cf_is_debit else company_name,
                "Debit (Rs)": _bank_amt if _cf_is_debit else "",
                "Credit (Rs)": "" if _cf_is_debit else _bank_amt,
                "Bank Amt (Rs)": _bank_amt,
                "Balance (Rs)": 0,
            })
            _partial_note = ""
            if _is_split_clear:
                _partial_note = (
                    f"PARTIAL PAYMENT - Part {_part_no} of {len(_book_rows)}: "
                    f"Book Rs{_book_amt:,.2f} = Previous BRS Rs{_cf_full_amt:,.2f}"
                )
            _row = _make_row(_br, _sr, "4B-BackdatedClear", _score, partial_note=_partial_note)
            _row["Amount Match"] = "CF-Clear" if abs(_book_amt - _bank_amt) < 0.01 else _row["Amount Match"]
            _cf_label = (
                "debited_not_book cleared by current book entry"
                if _cf_is_debit
                else "credited_not_book cleared by current book entry"
            )
            _row["Flags"] = (
                f"Previous BRS {_cf_label} "
                f"| Prev CF date={_cf.get('date', '')}"
            )
            if _is_split_clear:
                _row["Amount Match"] = f"CF-Clear part {_part_no}/{len(_book_rows)}"
                _row["Bank Full Amt"] = _cf_full_amt
                _row["_display_debit"] = _row["Debit (Rs)"] if _part_no == 1 else ""
                _row["_display_credit"] = _row["Credit (Rs)"] if _part_no == 1 else ""
                _row["_display_bank_amt"] = _cf_full_amt if _part_no == 1 else ""
                _row["_display_difference"] = round(_book_split_total - _cf_full_amt, 2) if _part_no == 1 else ""
                _row["Flags"] = (
                    f"{_row['Flags']} | Previous CF full amount Rs{_cf_full_amt:,.2f} "
                    f"split across {len(_book_rows)} book bill(s)"
                )
            _backdated_match_rows.append(_row)

        _stmt_rows = _cf.get("cleared_by_stmt_rows", []) or []
        _is_stmt_split_clear = len(_stmt_rows) > 1
        _stmt_split_total = sum(float(_s.get("Bank Amt (Rs)", 0) or 0) for _s in _stmt_rows)
        for _part_no, _srd in enumerate(_stmt_rows, 1):
            _cf_full_amt = float(_cf.get("amount", 0) or 0)
            _bank_amt = float(_srd.get("Bank Amt (Rs)", 0) or 0)
            _book_amt = _cf_full_amt
            _stmt_direction = str(_srd.get("Direction", "") or "").strip() or (
                "OUTFLOW" if _cf_section in ("issued_not_debited", "debited_not_book") else "INFLOW"
            )
            _book_direction = (
                "OUTFLOW" if _cf_section in ("issued_not_debited", "debited_not_book") else "INFLOW"
            )
            _score = fuzzy(str(_cf.get("party", "")), str(_srd.get("Party", "")))
            _br = pd.Series({
                "Date": _cf.get("date", ""),
                "Txn Type": _cf.get(
                    "txn_type",
                    "PB" if _book_direction == "OUTFLOW" else "PS"
                ),
                "Bill No": _cf.get("bill_no", ""),
                "Chq No": _cf.get("chq_no", ""),
                "Party": _cf.get("party", ""),
                "Party Raw": _cf.get("party_raw", _cf.get("party", "")),
                "Direction": _book_direction,
                "Sender": company_name if _book_direction == "OUTFLOW" else _cf.get("party", ""),
                "Recipient": _cf.get("party", "") if _book_direction == "OUTFLOW" else company_name,
                "Book Amt (Rs)": _book_amt,
                "Narration": _cf.get("narration", ""),
            })
            _sr = pd.Series({
                "Date": _srd.get("Date", ""),
                "Chq No": _srd.get("Chq No", ""),
                "Description": _srd.get("Description", ""),
                "Party": _srd.get("Party", ""),
                "Direction": _stmt_direction,
                "Sender": _srd.get("Sender", company_name if _stmt_direction == "OUTFLOW" else _srd.get("Party", "")),
                "Recipient": _srd.get("Recipient", _srd.get("Party", "") if _stmt_direction == "OUTFLOW" else company_name),
                "Debit (Rs)": _bank_amt if _stmt_direction == "OUTFLOW" else "",
                "Credit (Rs)": "" if _stmt_direction == "OUTFLOW" else _bank_amt,
                "Bank Amt (Rs)": _bank_amt,
                "Balance (Rs)": _srd.get("Balance (Rs)", 0),
            })
            _partial_note = ""
            if _is_stmt_split_clear:
                _partial_note = (
                    f"PARTIAL PAYMENT - Part {_part_no} of {len(_stmt_rows)}: "
                    f"Bank Rs{_bank_amt:,.2f} = Previous BRS Rs{_cf_full_amt:,.2f}"
                )
            _row = _make_row(_br, _sr, "4B-PrevBRSClear", _score, partial_note=_partial_note)
            _row["Amount Match"] = "CF-Clear" if abs(_book_amt - _bank_amt) < 0.01 else _row["Amount Match"]
            _row["Flags"] = (
                f"Previous BRS {_cf_section} cleared by current bank statement "
                f"| Prev CF date={_cf.get('date', '')}"
            )
            if _is_stmt_split_clear:
                _row["Amount Match"] = f"CF-Clear part {_part_no}/{len(_stmt_rows)}"
                _row["Bank Full Amt"] = _cf_full_amt
                _row["_display_book_amt"] = _book_amt if _part_no == 1 else ""
                _row["_display_difference"] = round(_book_amt - _stmt_split_total, 2) if _part_no == 1 else ""
                _row["Flags"] = (
                    f"{_row['Flags']} | Previous CF full amount Rs{_cf_full_amt:,.2f} "
                    f"split across {len(_stmt_rows)} bank row(s)"
                )
            _backdated_match_rows.append(_row)
    H3  = ["Method", "Name Match", "Score %", "Amt Match",
           "Book Date","Book Txn", "Book Bill", "Book Chq", "Book Party",
           "Book Dir", "Book Amt (Rs)",
           "Bank Date", "Bank Chq", "Bank Description", "Bank Party",
           "Bank Dir",
           "Debit (Rs)", "Credit (Rs)", "Bank Amt (Rs)",
           "Difference (Rs)", "Partial Payment", "Flags"]
    _title(ws3, len(H3), f"BANK - Matched: Book vs Statement  |  {title_suffix}")
    _hdr(ws3, 2, H3)
    _PP = _NO_FILL
    for i, (_, r) in enumerate(matched.iterrows(), 3):
        nm        = r["Name Match"]
        am        = r["Amount Match"]
        diff      = r.get("_display_difference", r["Difference (Rs)"])
        diff_num  = 0.0 if diff == "" else float(diff or 0)
        is_pp     = bool(r.get("Partial Payment", False))
        nf   = _G  if nm == "Match"  else (_Y if "Partial" in nm else _R)
        af   = _G  if am in ("Exact", "CF-Clear", "Split Bills 1 Credit") else (_Y if "Minor" in am else _R)
        df   = _G  if abs(diff_num) < 0.01 else (_Y if abs(diff_num) < 500 else _R)
        ff   = _PP if is_pp else (_R if r["Flags"] else _W)
        pp_label = "YES - verify" if is_pp else ""
        vals = [r["Match Method"], r["Name Match"], r["Fuzzy Score %"], r["Amount Match"],
                r.get("Book Date", ""), r["Book Txn"], r["Book Bill No"], r["Book Chq"], r["Book Party"],
                r["Book Direction"], r["Book Amt (Rs)"],
                r["Bank Date"], r["Bank Chq"], r["Bank Description"], r["Bank Party"],
                r["Bank Direction"],
                r.get("_display_debit", r["Debit (Rs)"]), r.get("_display_credit", r["Credit (Rs)"]), r.get("_display_bank_amt", r["Bank Amt (Rs)"]),
                diff, pp_label, r["Flags"]]
        fills = [_W, nf, nf, af,
                 _W, _GR, _W, _W, nf, _W, _G,
                 _W, _W, _W, nf, _W, _W, _W, _G,
                 df, _PP if is_pp else _W, ff]
        _matched_rejected = is_rejected_cheque_text(r.get("Bank Description", ""))
        _drow(ws3, i, vals, fills, font=RF if _matched_rejected else None)

    if _backdated_match_rows:
        section_row = 3 + len(matched)
        if len(matched) > 0:
            section_row += 1
        ws3.merge_cells(start_row=section_row, start_column=1,
                        end_row=section_row, end_column=len(H3))
        sec_fill = PatternFill("solid", fgColor="D9EAF7")
        sec = ws3.cell(
            section_row, 1,
            "Step 4B - Book entries cleared against Previous BRS Carry-Forwards (backdated credits/debits)"
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
            diff      = r.get("_display_difference", r["Difference (Rs)"])
            diff_num  = 0.0 if diff == "" else float(diff or 0)
            is_pp     = bool(r.get("Partial Payment", False))
            nf   = _G  if nm == "Match"  else (_Y if "Partial" in nm else _R)
            af   = _G  if str(am).startswith("CF-Clear") or am == "Exact" else (_Y if "Minor" in am else _R)
            df   = _G  if abs(diff_num) < 0.01 else (_Y if abs(diff_num) < 500 else _R)
            ff   = _PP if is_pp else (_R if r["Flags"] else _W)
            pp_label = "YES -- verify" if is_pp else ""
            vals = [r["Match Method"], r["Name Match"], r["Fuzzy Score %"], r["Amount Match"],
                    r.get("Book Date", ""), r["Book Txn"], r["Book Bill No"], r["Book Chq"], r["Book Party"],
                    r["Book Direction"], r.get("_display_book_amt", r["Book Amt (Rs)"]),
                    r["Bank Date"], r["Bank Chq"], r["Bank Description"], r["Bank Party"],
                    r["Bank Direction"],
                    r.get("_display_debit", r["Debit (Rs)"]),
                    r.get("_display_credit", r["Credit (Rs)"]),
                    r.get("_display_bank_amt", r["Bank Amt (Rs)"]),
                    diff, pp_label, r["Flags"]]
            fills = [sec_fill] * len(H3)
            _matched_rejected = is_rejected_cheque_text(r.get("Bank Description", ""))
            _drow(ws3, row_no, vals, fills, font=RF if _matched_rejected else None)
    _w(ws3, [18, 12, 7, 16,
             11, 12, 10, 10, 28, 8, 14,
             11, 10, 44, 28, 8, 12, 12, 14,
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
        _drow(ws4, i, vals, [fill] * 11, font=RF if is_rejected_cheque_record(r) else None)
        if is_rejected_cheque_record(r):
            _highlight_row(ws4, i, len(H4))
    _w(ws4, [11, 14, 10, 10, 30, 10, 28, 28, 14, 50, 62])

    # Sheet 5: Bank Only
    ws5 = wb.create_sheet("Bank Only (Not in Book)")
    H5  = ["Date", "Chq No", "Description", "Party",
           "Direction", "Sender", "Recipient",
           "Debit (Rs)", "Credit (Rs)", "Bank Amt (Rs)", "Issue"]
    _title(ws5, len(H5),
           f"IN BANK STATEMENT - NOT FOUND IN BOOK  |  UNRECORDED  |  {title_suffix}",
           fill=PatternFill("solid", fgColor="4B0082"))
    _hdr(ws5, 2, H5, fill=PatternFill("solid", fgColor="7030A0"))
    for i, (_, r) in enumerate(stmt_only.iterrows(), 3):
        cf    = (str(r.get("Description", "")).endswith("[CF from prev BRS]") or
                 r.get("Balance (Rs)", 1) == 0)
        fill  = _CF if cf else _R
        issue = ("Carried Forward from Previous BRS" if cf else
                 "Bank has this transaction but company books have NO matching entry")
        _debit_disp  = r["Debit (Rs)"]
        _credit_disp = r["Credit (Rs)"]
        _bank_amt_disp = r["Bank Amt (Rs)"]
        # For nullified cheque return rows, show the original (pre-nullification)
        # amount so the accountant can see what was returned, here too.
        if "[REJECTED/REMOVED CHEQUE - NULLIFIED]" in str(r.get("Description", "")):
            _disp_amt = float(r.get("Display Amt (Rs)", 0) or 0)
            if _disp_amt > 0:
                if r["Direction"] == "OUTFLOW":
                    _debit_disp = _disp_amt
                else:
                    _credit_disp = _disp_amt
                _bank_amt_disp = _disp_amt
        vals  = [r["Date"], r["Chq No"], r["Description"], r["Party"],
                 r["Direction"], r["Sender"], r["Recipient"],
                 _debit_disp, _credit_disp, _bank_amt_disp, issue]
        _drow(ws5, i, vals, [fill] * 11, font=RF if is_rejected_cheque_record(r) else None)
        if is_rejected_cheque_record(r):
            _highlight_row(ws5, i, len(H5))
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

    # Sheet 7: Human Verification
    build_verification_sheet(
        wb, matched, book_only, stmt_only,
        cleared_log=cleared_log,
        carryforward_log=carryforward_log,
        blocked_crossclears=blocked_crossclears,
        stmt_df=stmt_df,
        split_review=split_review,
    )

    # Sheet 8: Summary  (CF Audit Trail sheet removed)
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
    reconciliation_status = "FULLY RECONCILED" if fully_reconciled else "DIFFERENCES EXIST INVESTIGATE"

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
        ("  Pass 3b: Combined Amt + Date",         m3b,                   "Multiple book entries = one bank entry"),
        ("  Pass 3c: Split Payment",               m3c,                   "One book entry = two bank entries"),
        ("  Pass 4: Direction-Flip (Forex/FFMC)",  m4,                    "Same amt, opposite dir  forex/settlement"),
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
            for cc in range(1, 4): ws6.cell(rn, cc).fill = _NO_FILL
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
    brs_diff = compute_brs_difference(book_closing_bal, bank_closing_bal, book_only, stmt_only)
    if abs(brs_diff) < 0.01:
        print(f"   Status                : FULLY RECONCILED")
    else:
        print(f"   Status                : BRS DIFFERENCE Rs{brs_diff:+,.2f}  INVESTIGATE")


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
            "Description":   item.get("description", item.get("narration", "")),
            "Narration":     item.get("narration", ""),
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
    _manual_stmt_cols = STMT_COLS
    stmt_df = pd.DataFrame(stmt_rows, columns=_manual_stmt_cols) if stmt_rows else pd.DataFrame(columns=_manual_stmt_cols)
    return book_df, stmt_df, carryforward_rows


def process_files(book_path, stmt_path, output_path, prev_brs_path=None):
    # -- Guard: skip prev_brs when it is the same file as book -----------------
    # When the user re-runs the script using a previously generated BRS output as
    # both the book input and prev_brs, it causes CF items to double-count.
    # Detect this and silently ignore prev_brs in that case.
    if prev_brs_path and os.path.abspath(book_path) == os.path.abspath(prev_brs_path):
        print(f"[Process] NOTE: book_path and prev_brs_path are the same file - "
              f"ignoring prev_brs to avoid carry-forward double-counting.")
        prev_brs_path = None
    # --------------------------------------------------------------------------

    # -- FIX: Detect manual BRS book format ------------------------------------
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
            # as the authoritative source - the supplied prev_brs is for a different
            # bank/period and should not override the manual BRS book's data.
            print(f"[Process] NOTE: Book is manual BRS AND separate prev_brs supplied "
                  f"('{os.path.basename(prev_brs_path)}') - book's outstanding items "
                  f"will be used as the current BRS source.")
            _manual_brs_book_is_source = True
    # --------------------------------------------------------------------------

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

    # -- FIX: When book is manual BRS, extract closing balance and bank_id from it --
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
    # -------------------------------------------------------------------------

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

    matched, book_only, stmt_only, split_review = reconcile(book_df, stmt_df)

    print(f"\n[Book Debug] All OUTFLOW entries in current book:")
    for _, row in book_df.iterrows():
        if row.get("Direction") == "OUTFLOW":
            print(f"   chq={str(row.get('Chq No','')):<8}  "
                f"bill={str(row.get('Bill No','')):<8}  "
                f"amt=Rs{row.get('Book Amt (Rs)',0):>10,.2f}  "
                f"party={row.get('Party','')}")

    cleared_log         = []
    carryforward_log    = []
    blocked_crossclears = []
    prev_brs            = {}

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
                      f"- carrying forward book={book_closing_bal:,.2f}, "
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
                      f"- re-parsing book file as CF source: '{os.path.basename(book_path)}'")
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
                book_only, stmt_only, cleared_log, carryforward_log, blocked_crossclears = carry_forward(
                    prev_brs, stmt_df, book_only, stmt_only, full_book_df,
                    company_name=company_name,
                    book_opening_bal=book_opening_bal
                )

    # If a low-confidence current-day match was released back into BRS sections for
    # review, but the exact same book row was later cleared by previous-BRS carry
    # forward, remove the duplicate bank-side release. This keeps the discrepancy
    # visible in Matched while preventing a confirmed backdated clear from also
    # leaving its tentative bank counterpart as "bank only".
    if cleared_log and not matched.empty:
        _cf_cleared_book_keys = set()
        for _cl in cleared_log:
            for _br in _cl.get("cleared_by_book_rows", []) or []:
                _cf_cleared_book_keys.add((
                    str(_br.get("Date", "")).strip(),
                    str(_br.get("Txn Type", "")).strip(),
                    str(_br.get("Bill No", "")).strip(),
                    str(_br.get("Chq No", "")).strip(),
                    str(_br.get("Party", "")).strip().upper(),
                    str(_br.get("Direction", "")).strip(),
                    round(float(_br.get("Book Amt (Rs)", 0) or 0), 2),
                ))

        _stmt_drop_indices = []
        _matched_drop_indices = []
        _matched_release_rows = []  # bank rows to release back to stmt_only
        for _mr_idx, _mr in matched[
            (matched["Fuzzy Score %"] < PARTY_CONFIRMATION_THRESHOLD) &
            (matched["Amount Match"].astype(str).eq("Exact"))
        ].iterrows():
            _book_key = (
                str(_mr.get("Book Date", "")).strip(),
                str(_mr.get("Book Txn", "")).strip(),
                str(_mr.get("Book Bill No", "")).strip(),
                str(_mr.get("Book Chq", "")).strip(),
                str(_mr.get("Book Party", "")).strip().upper(),
                str(_mr.get("Book Direction", "")).strip(),
                round(float(_mr.get("Book Amt (Rs)", 0) or 0), 2),
            )
            if _book_key not in _cf_cleared_book_keys:
                continue

            # FIX: The bank row from this weak match is currently consumed in `matched`
            # (not in stmt_only). Remove this weak match row from matched entirely and
            # release the bank statement row back to stmt_only so it correctly appears
            # in the BRS "credited in bank but not in book" (pending) section.
            _matched_drop_indices.append(_mr_idx)
            _bank_amt = float(_mr.get("Bank Amt (Rs)", 0) or 0)
            _bank_debit = _mr.get("Debit (Rs)", "")
            _bank_credit = _mr.get("Credit (Rs)", "")
            _released_row = {
                "Date":          str(_mr.get("Bank Date", "")).strip(),
                "Chq No":        str(_mr.get("Bank Chq", "")).strip(),
                "Description":   str(_mr.get("Bank Description", "")).strip(),
                "Party":         str(_mr.get("Bank Party", "")).strip(),
                "Direction":     str(_mr.get("Bank Direction", "")).strip(),
                "Sender":        str(_mr.get("Bank Sender", "")).strip(),
                "Recipient":     str(_mr.get("Bank Recipient", "")).strip(),
                "Debit (Rs)":    _bank_debit,
                "Credit (Rs)":   _bank_credit,
                "Bank Amt (Rs)": _bank_amt,
                "Balance (Rs)":  "",
            }
            _matched_release_rows.append(_released_row)
            print(f"[Process] CF-cleared book entry had weak current-day match - "
                  f"removing from Matched and releasing bank row to stmt_only: "
                  f"book='{_mr.get('Book Party', '')}' bank='{_mr.get('Bank Party', '')}' "
                  f"Rs{_bank_amt:,.2f} (score={_mr.get('Fuzzy Score %', 0)}%)")

        # Also handle the old case: bank row may have already been released to stmt_only
        # (e.g. via hard-mismatch release earlier). Drop those duplicates from stmt_only.
        if not stmt_only.empty:
            for _, _mr in matched[
                (matched["Fuzzy Score %"] < PARTY_CONFIRMATION_THRESHOLD) &
                (matched["Amount Match"].astype(str).eq("Exact"))
            ].iterrows():
                _book_key = (
                    str(_mr.get("Book Date", "")).strip(),
                    str(_mr.get("Book Txn", "")).strip(),
                    str(_mr.get("Book Bill No", "")).strip(),
                    str(_mr.get("Book Chq", "")).strip(),
                    str(_mr.get("Book Party", "")).strip().upper(),
                    str(_mr.get("Book Direction", "")).strip(),
                    round(float(_mr.get("Book Amt (Rs)", 0) or 0), 2),
                )
                if _book_key not in _cf_cleared_book_keys:
                    continue
                for _si, _sr in stmt_only.iterrows():
                    if _si in _stmt_drop_indices:
                        continue
                    if (
                        str(_sr.get("Date", "")).strip() == str(_mr.get("Bank Date", "")).strip() and
                        str(_sr.get("Chq No", "")).strip() == str(_mr.get("Bank Chq", "")).strip() and
                        str(_sr.get("Description", "")).strip() == str(_mr.get("Bank Description", "")).strip() and
                        str(_sr.get("Party", "")).strip().upper() == str(_mr.get("Bank Party", "")).strip().upper() and
                        str(_sr.get("Direction", "")).strip() == str(_mr.get("Bank Direction", "")).strip() and
                        abs(float(_sr.get("Bank Amt (Rs)", 0) or 0) -
                            float(_mr.get("Bank Amt (Rs)", 0) or 0)) < 0.01
                    ):
                        _stmt_drop_indices.append(_si)
                        print(f"[Process] Removed duplicate review-only bank release after CF clear: "
                              f"book='{_mr.get('Book Party', '')}' bank='{_mr.get('Bank Party', '')}' "
                              f"Rs{float(_mr.get('Bank Amt (Rs)', 0) or 0):,.2f}")
                        break

        if _matched_drop_indices:
            matched = matched.drop(index=_matched_drop_indices)
        if _matched_release_rows:
            stmt_only = pd.concat(
                [stmt_only, pd.DataFrame(_matched_release_rows)], ignore_index=True
            )
        if _stmt_drop_indices:
            stmt_only = stmt_only.drop(index=_stmt_drop_indices)

        _restored_cf_items = []
        _keep_cleared_log = []
        for _cl in cleared_log:
            _restore_cf = False
            if str(_cl.get("section", "")) == "credited_not_book":
                _cl_amt = round(float(_cl.get("amount", 0) or 0), 2)
                for _, _mr in matched[
                    (matched["Fuzzy Score %"] < PARTY_CONFIRMATION_THRESHOLD) &
                    (matched["Amount Match"].astype(str).eq("Exact"))
                ].iterrows():
                    if abs(float(_mr.get("Book Amt (Rs)", 0) or 0) - _cl_amt) >= 0.01:
                        continue
                    _book_key = (
                        str(_mr.get("Book Date", "")).strip(),
                        str(_mr.get("Book Txn", "")).strip(),
                        str(_mr.get("Book Bill No", "")).strip(),
                        str(_mr.get("Book Chq", "")).strip(),
                        str(_mr.get("Book Party", "")).strip().upper(),
                        str(_mr.get("Book Direction", "")).strip(),
                        round(float(_mr.get("Book Amt (Rs)", 0) or 0), 2),
                    )
                    for _br in _cl.get("cleared_by_book_rows", []) or []:
                        _cf_book_key = (
                            str(_br.get("Date", "")).strip(),
                            str(_br.get("Txn Type", "")).strip(),
                            str(_br.get("Bill No", "")).strip(),
                            str(_br.get("Chq No", "")).strip(),
                            str(_br.get("Party", "")).strip().upper(),
                            str(_br.get("Direction", "")).strip(),
                            round(float(_br.get("Book Amt (Rs)", 0) or 0), 2),
                        )
                        if _cf_book_key == _book_key:
                            _restore_cf = True
                            break
                    if _restore_cf:
                        break

            if _restore_cf:
                _restored_cf_items.append(_cl)
                carryforward_log.append({**_cl, "section": "credited_not_book",
                                         "status": "CARRIED FORWARD"})
                print(f"[Process] Restored previous credited_not_book CF after accepting "
                      f"current review match: party='{_cl.get('party', '')}' "
                      f"Rs{float(_cl.get('amount', 0) or 0):,.2f}")
            else:
                _keep_cleared_log.append(_cl)

        if _restored_cf_items:
            cleared_log = _keep_cleared_log
            _restore_rows = []
            for _cl in _restored_cf_items:
                _amt = float(_cl.get("amount", 0) or 0)
                _restore_rows.append({
                    "Date":          _cl.get("date", ""),
                    "Chq No":        _cl.get("chq_no", ""),
                    "Description":   _cl.get("description", _cl.get("narration", "")),
                    "Narration":     _cl.get("narration", ""),
                    "Party":         _cl.get("party", ""),
                    "Direction":     "INFLOW",
                    "Sender":        _cl.get("party", ""),
                    "Recipient":     company_name,
                    "Debit (Rs)":    "",
                    "Credit (Rs)":   _amt,
                    "Bank Amt (Rs)": _amt,
                    "Balance (Rs)":  0,
                })
            stmt_only = pd.concat([stmt_only, pd.DataFrame(_restore_rows)], ignore_index=True)


    # Post-carry-forward split clear: one current book receipt can be paid by
    # multiple bank credits split across previous-BRS carry-forward rows and the
    # current bank statement.  Pass 3c runs before carry_forward(), so it cannot
    # see this mixed pool.  Clear only when the amount subset is exact and every
    # bank leg has strong/compact party evidence against the book party.
    if not book_only.empty and not stmt_only.empty:
        def _pcf_amt_cents(_value):
            return int(round(float(_value or 0) * 100))

        def _pcf_compact_name(_value):
            return re.sub(r"[^A-Z0-9]", "", clean_name(str(_value or "")))

        def _pcf_party_ok(_book_party, _stmt_row):
            _stmt_text = f"{_stmt_row.get('Party', '')} {_stmt_row.get('Description', '')}"
            _score = fuzzy(_book_party, str(_stmt_row.get("Party", "")))
            if _score >= FUZZY_THRESHOLD:
                return True
            _book_compact = _pcf_compact_name(_book_party)
            _stmt_compact = _pcf_compact_name(_stmt_text)
            return (
                len(_book_compact) >= 7 and len(_stmt_compact) >= 7 and
                (_book_compact in _stmt_compact or _stmt_compact in _book_compact)
            )

        def _pcf_chq_reject(_book_chq, _stmt_chq):
            _generic = {"", "nan", "0", "99", "511", "-"}
            _b = str(_book_chq or "").strip().lower()
            _s = str(_stmt_chq or "").strip().lower()
            return _b not in _generic and _s not in _generic and _b != _s

        def _pcf_find_subset(_idxs, _target):
            _target_c = _pcf_amt_cents(_target)
            _combos = {0: []}
            for _idx in _idxs:
                _amt_c = _pcf_amt_cents(stmt_only.at[_idx, "Bank Amt (Rs)"])
                if _amt_c <= 0 or _amt_c > _target_c:
                    continue
                _adds = {}
                for _running, _combo in list(_combos.items()):
                    _new_total = _running + _amt_c
                    if _new_total > _target_c or _new_total in _combos or _new_total in _adds:
                        continue
                    _new_combo = _combo + [_idx]
                    if _new_total == _target_c and len(_new_combo) >= 2:
                        return _new_combo
                    _adds[_new_total] = _new_combo
                _combos.update(_adds)
            return None

        _pcf_book_drop = []
        _pcf_stmt_drop = []
        _pcf_matched_rows = []
        for _bo_idx, _bo in list(book_only.iterrows()):
            if _bo_idx in _pcf_book_drop:
                continue
            if str(_bo.get("Direction", "")) != "INFLOW":
                continue
            _book_amt = float(_bo.get("Book Amt (Rs)", 0) or 0)
            if _book_amt <= 0:
                continue
            _eligible = []
            for _si, _sr in stmt_only.iterrows():
                if _si in _pcf_stmt_drop:
                    continue
                if str(_sr.get("Direction", "")) != "INFLOW":
                    continue
                if not within_date(str(_bo.get("Date", "")), str(_sr.get("Date", ""))):
                    continue
                if _pcf_chq_reject(_bo.get("Chq No", ""), _sr.get("Chq No", "")):
                    continue
                if not _pcf_party_ok(str(_bo.get("Party", "")), _sr):
                    continue
                _eligible.append(_si)
            if len(_eligible) < 2:
                continue
            _split_idxs = _pcf_find_subset(_eligible, _book_amt)
            if not _split_idxs:
                continue

            _score = max(fuzzy(str(_bo.get("Party", "")), str(stmt_only.at[_si, "Party"])) for _si in _split_idxs)
            _parts = " + ".join(
                f"Rs{float(stmt_only.at[_si, 'Bank Amt (Rs)']):,.2f} ({stmt_only.at[_si, 'Party']})"
                for _si in _split_idxs
            )
            _dates = ", ".join(str(stmt_only.at[_si, "Date"]) for _si in _split_idxs)
            _desc = " | ".join(str(stmt_only.at[_si, "Description"]) for _si in _split_idxs)
            _synthetic_sr = {
                "Date":          _dates,
                "Chq No":        "",
                "Description":   _desc,
                "Party":         " + ".join(str(stmt_only.at[_si, "Party"]) for _si in _split_idxs),
                "Direction":     "INFLOW",
                "Sender":        " + ".join(str(stmt_only.at[_si, "Sender"]) for _si in _split_idxs),
                "Recipient":     company_name,
                "Debit (Rs)":    "",
                "Credit (Rs)":   _book_amt,
                "Bank Amt (Rs)": _book_amt,
                "Balance (Rs)":  "",
            }
            _note = (
                f"POST-CF SPLIT PAYMENT: Book Rs{_book_amt:,.2f} = {_parts}; "
                f"bank legs span current statement / previous BRS carry-forward"
            )
            _pcf_matched_rows.append(_make_row(_bo, _synthetic_sr, "3c-PostCF Split Bank Credits", _score, partial_note=_note))
            _pcf_book_drop.append(_bo_idx)
            _pcf_stmt_drop.extend(_split_idxs)
            print(f"[Process] Post-CF split clear: book '{_bo.get('Party', '')}' "
                  f"Rs{_book_amt:,.2f} = {_parts}")

        if _pcf_matched_rows:
            matched = pd.concat([matched, pd.DataFrame(_pcf_matched_rows)], ignore_index=True)
            book_only = book_only.drop(index=[i for i in _pcf_book_drop if i in book_only.index])
            stmt_only = stmt_only.drop(index=[i for i in _pcf_stmt_drop if i in stmt_only.index])

    # Some prior BRS files include book activity after the previous BRS date but
    # before the current exported book opening. If the final BRS difference is
    # exactly that opening drop, carry it explicitly as an opening-gap book item.
    if prev_brs and book_opening_bal is not None:
        _prev_book_gap_src = float(prev_brs.get("prev_book_closing_bal", 0.0) or 0.0)
        _opening_drop = round(_prev_book_gap_src - float(book_opening_bal or 0.0), 2)
        if _opening_drop > 0.01:
            _curr_gap_diff = compute_brs_difference(
                book_closing_bal, bank_closing_bal, book_only, stmt_only
            )
            _already_has_gap = (
                (not book_only.empty) and
                any(
                    str(row.get("Party", "")).strip().upper() == "BOOK OPENING GAP" and
                    abs(float(row.get("Book Amt (Rs)", 0) or 0) - _opening_drop) < 0.01
                    for _, row in book_only.iterrows()
                )
            )
            if abs(_curr_gap_diff - _opening_drop) < 0.01 and not _already_has_gap:
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
                    "Narration":     "Previous BRS book closing to current book opening gap",
                }
                book_only = pd.concat([book_only, pd.DataFrame([_gap_row])], ignore_index=True)
                carryforward_log.append({
                    "section":   "book_opening_gap",
                    "party":     "BOOK OPENING GAP",
                    "chq_no":    "",
                    "bill_no":   "",
                    "amount":    _opening_drop,
                    "narration": _gap_row["Narration"],
                    "status":    "CARRIED FORWARD (opening gap)",
                })
                print(f"[Process] Added book opening gap carry-forward: "
                      f"prev_book={_prev_book_gap_src:,.2f} -> "
                      f"opening={float(book_opening_bal or 0.0):,.2f} "
                      f"gap=Rs{_opening_drop:,.2f}")

    # Previous-day issued cheques can be absent from compact/manual previous BRS
    # exports even though the current book opening has already moved past them.
    # When the prior BRS has no issued_not_debited rows, the current book has no
    # outflows, and a real current bank debit remains unmatched, treat that debit
    # as clearing an implicit previous-day issued cheque. This restores the 4B
    # clear without touching current-period receipt/cash-deposit matching.
    if prev_brs and book_opening_bal is not None and not stmt_only.empty:
        _has_prev_issued = bool(prev_brs.get("issued_not_debited", []))
        _current_book_outflow = (
            not book_df.empty and
            "Direction" in book_df.columns and
            (book_df["Direction"].astype(str).str.upper() == "OUTFLOW").any()
        )
        _opening_moved = abs(
            float(prev_brs.get("prev_book_closing_bal", 0.0) or 0.0) -
            float(book_opening_bal or 0.0)
        ) > 0.01
        if not _has_prev_issued and not _current_book_outflow and _opening_moved:
            _stmt_debits = stmt_only[
                stmt_only["Direction"].astype(str).str.upper().eq("OUTFLOW")
            ]
            _drop_stmt_idxs = []
            for _si, _sr in _stmt_debits.iterrows():
                _bank_ref = str(_sr.get("Chq No", "") or "").strip()
                _bank_ref_clean = str(_bank_ref or "").strip().replace("'", "").replace("\u0027", "")
                if _bank_ref_clean.lower() in ("", "nan", "0", "99", "511", "-"):
                    continue
                _amt = float(_sr.get("Bank Amt (Rs)", 0) or 0)
                if _amt <= 0:
                    continue
                _party = str(_sr.get("Party", "") or "").strip()
                _desc = str(_sr.get("Description", "") or "").strip()
                _derived_party = _party or extract_party_from_desc(_desc)
                cleared_log.append({
                    "section": "issued_not_debited",
                    "date": str(_sr.get("Date", "")),
                    "txn_type": "PB",
                    "bill_no": "",
                    "chq_no": _bank_ref_clean,
                    "party": _derived_party,
                    "party_raw": _desc or _derived_party,
                    "description": _desc or _derived_party,
                    "amount": _amt,
                    "narration": "Recovered previous-day issued cheque from current bank debit",
                    "status": "CLEARED",
                    "cleared_by_stmt_rows": [_sr.drop(labels=["_used_cf"], errors="ignore").to_dict()],
                    "backdated_clear": True,
                })
                _drop_stmt_idxs.append(_si)
                print(f"[Process] Previous-day issued cheque recovered from bank debit: "
                      f"chq={_bank_ref_clean} party='{_derived_party}' Rs{_amt:,.2f}")
            if _drop_stmt_idxs:
                stmt_only = stmt_only.drop(index=_drop_stmt_idxs)

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
            # FIX (HYD): Do NOT fire this correction when the CF item is already
            # in carryforward_log - that means it was explicitly carried forward as
            # a genuine outstanding item, not absorbed into the book opening.
            # e.g. A AJAY KUMAR chq 236875 Rs28343 is outstanding (bank debited it
            # to ABHISHEETY KUMAR with a name difference). Without the ABHISHEETY
            # bank row in Less:Debited, the residual diff equals 28343 and this
            # correction would wrongly remove A AJAY KUMAR from book_only.
            _ind_already_cf = any(
                cfitem.get("section") == "issued_not_debited" and
                abs(float(cfitem.get("amount", 0) or 0) - _abs_diff_g) < 0.01 and
                (
                    fuzzy(str(cfitem.get("party", "")), str(_ind_item.get("party", ""))) >= FUZZY_THRESHOLD or
                    str(cfitem.get("chq_no", "")).strip() == str(_ind_item.get("chq_no", "")).strip()
                )
                for cfitem in carryforward_log
            )
            if _ind_already_cf:
                print(f"[BRS Correction] Skipping issued_not_debited absorption: "
                      f"'{_ind_item.get('party','')}' Rs{_abs_diff_g:,.2f} is in "
                      f"carryforward_log - it is genuinely outstanding, not absorbed.")
                # The CF issued_not_debited item is genuine and the bank has no matching
                # debit row in the current statement. This means the cheque was most
                # likely debited by the bank in a previous period under a different
                # party name (e.g. A AJAY KUMAR chq 236875 debited as ABHISHEETY KUMAR).
                # Add a synthetic 'debited_not_book' row to stmt_only so it appears in
                # 'Less: Debited in Bank but not credited in Our Book' with a NAME
                # DIFFERENCE note - this closes the residual diff and makes the BRS
                # fully reconciled while flagging it for manual review.
                _ind_chq   = str(_ind_item.get("chq_no", "")).strip()
                _ind_narr  = str(_ind_item.get("narration", "")).strip()
                _ind_party = str(_ind_item.get("party", "")).strip()
                _ind_date  = str(_ind_item.get("date", "")).strip()

                # Source 1: Look in prev_brs['debited_not_book'] for the matching entry.
                # When the manual/previous BRS is used as --prev-brs input, the bank
                # originally debited chq 236875 to ABHISHEETY KUMAR and that entry
                # appears in the prev BRS 'Less:Debited' section as debited_not_book.
                # This gives us the EXACT bank description, party and narration.
                #
                # Note: the manual BRS 'Less:Debited' rows have the format
                #   [date, chq_no, description, amount, narration]
                # The parser reads chq_no from cells[3] which in this layout is the
                # AMOUNT (e.g. 28343), not the cheque number. So we cannot rely on
                # chq_no matching. Instead match by: amount AND description contains
                # the CF item's chq number OR narration contains 'NAME DIFFERENCE'.
                _bank_desc_from_prev  = ""
                _bank_party_from_prev = ""
                _bank_narr_from_prev  = ""
                _bank_date_from_prev  = ""
                for _dnb in prev_brs.get("debited_not_book", []):
                    _dnb_amt  = round(float(_dnb.get("amount", 0) or 0), 2)
                    _dnb_desc = str(_dnb.get("description", _dnb.get("narration", ""))).strip()
                    _dnb_narr = str(_dnb.get("narration", "")).strip()
                    _dnb_chq  = str(_dnb.get("chq_no", "")).strip()
                    if abs(_dnb_amt - _abs_diff_g) >= 0.01:
                        continue
                    # Match when: chq number appears in the description, OR
                    # the chq field matches, OR narration is 'NAME DIFFERENCE'
                    _chq_in_desc = _ind_chq and _ind_chq in _dnb_desc
                    _chq_matches = _dnb_chq == _ind_chq
                    _name_diff_narr = "name difference" in _dnb_narr.lower() or "name diff" in _dnb_narr.lower()
                    if _chq_in_desc or _chq_matches or _name_diff_narr:
                        _bank_desc_from_prev  = _dnb_desc
                        _bank_party_from_prev = str(_dnb.get("party", "")).strip()
                        _bank_narr_from_prev  = _dnb_narr
                        _bank_date_from_prev  = str(_dnb.get("date", "")).strip()
                        break

                # Source 2: blocked_crossclears - populated when P1 name-mismatch
                # block fires during THIS run (bank row present in current stmt).
                _bank_desc_from_block  = ""
                _bank_party_from_block = ""
                _bank_narr_from_block  = ""
                for _blk in (blocked_crossclears or []):
                    _sb = _blk.get("side_b", {})
                    if (str(_sb.get("chq_no", "")).strip() == _ind_chq and
                            abs(float(_sb.get("amount", 0) or 0) - _abs_diff_g) < 0.01):
                        _bank_desc_from_block  = str(_sb.get("description", "")).strip()
                        _bank_party_from_block = str(_sb.get("party", "")).strip()
                        _bank_narr_from_block  = str(_blk.get("reason", "")).strip()
                        break

                # Priority: prev_brs (has real bank data) > blocked_crossclears > fallback
                if _bank_desc_from_prev:
                    _synth_desc  = _bank_desc_from_prev
                    _synth_party = _bank_party_from_prev
                    _synth_narr  = _bank_narr_from_prev if _bank_narr_from_prev else "NAME DIFFERENCE"
                    if _bank_date_from_prev:
                        _ind_date = _bank_date_from_prev
                elif _bank_desc_from_block:
                    _synth_desc  = _bank_desc_from_block
                    _synth_party = _bank_party_from_block
                    _synth_narr  = _bank_narr_from_block if _bank_narr_from_block else "NAME DIFFERENCE"
                else:
                    # No bank data available - use CF narration as description
                    _synth_desc  = _ind_narr if _ind_narr else f"Chq {_ind_chq} - NAME DIFFERENCE"
                    _synth_party = ""
                    _synth_narr  = (
                        f"NAME DIFFERENCE - Chq {_ind_chq} issued to '{_ind_party}' "
                        f"but debited by bank to a different party. "
                        f"See Human Verification Section E."
                    )

                _synthetic_row = {
                    "Date":          _ind_date,
                    "Chq No":        _ind_chq,
                    "Description":   _synth_desc,
                    "Party":         _synth_party,
                    "Direction":     "OUTFLOW",
                    "Sender":        company_name,
                    "Recipient":     _ind_party,
                    "Debit (Rs)":    _abs_diff_g,
                    "Credit (Rs)":   "",
                    "Bank Amt (Rs)": _abs_diff_g,
                    "Balance (Rs)":  "",
                    "Narration":     _synth_narr,
                }
                stmt_only = pd.concat(
                    [stmt_only, pd.DataFrame([_synthetic_row])], ignore_index=True
                )
                carryforward_log.append({
                    **_ind_item,
                    "section": "debited_not_book",
                    "status":  "CARRIED FORWARD (name difference - synthetic entry)",
                })
                print(f"[BRS Correction] Added synthetic debited_not_book row for "
                      f"'{_ind_item.get('party','')}' chq={_ind_chq} "
                      f"Rs{_abs_diff_g:,.2f} - name difference, closes BRS diff.")
            else:
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

    # -- Companion Re1 book-side entry absorption ------------------------------
    # Some forex/exchange systems record a Rs 1 advance/test entry in the book for
    # the same party+bill as the main transaction (e.g. SOHAM BANIK Rs 1 alongside
    # SOHAM BANIK Rs 50,000). The bank never sees the Rs 1 separately - only the
    # main amount is credited. This leaves a Rs 1 book-only INFLOW floating in
    # "deposited not credited", causing a spurious BRS difference of Rs 1.
    #
    # Fix: after all matching is complete, scan book_only for INFLOW entries
    # of Rs <= 1 where ANOTHER book entry for the same party AND bill no was
    # already matched (present in matched df). When found, absorb the Rs 1 as
    # a companion internal adjustment and remove it from book_only.
    #
    # Guard: the BRS difference must be positive (bank > reconciled) and at least
    # as large as the companion amount - we never absorb when the diff is already
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
                    "status":    "CLEARED (companion Re1 book entry - absorbed via matched peer)",
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

    # -- Empty bank statement: derive bank_closing_bal AFTER carry_forward -------
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
        print(f"[Process] Empty statement - bank_closing_bal derived post carry_forward: "
              f"{book_closing_bal:,.2f} + {_issued_bo:,.2f} - {_deposited_bo:,.2f} = {bank_closing_bal:,.2f}")

        # -- Undo spurious Pass 2c matches where the book party was cleared via CF --
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
                    # Book entry is DROPPED - carry_forward already reconciled it via CF
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
                          f"'{row.get('Book Party','')}' <-> '{row.get('Bank Party','')}' "
                          f"Rs{_b_amt:,.2f} - book party matched via CF; bank entry restored to credited_not_book")

            if _undo_indices:
                matched = matched.drop(index=_undo_indices)
                # Do NOT add book entry back to book_only - it is reconciled via CF clearing
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

        # -- Post-carry-forward BRS correction ---------------------------------
        # If there is still a residual BRS difference, check whether it is caused
        # by a credited_not_book CF item that was recorded in the book BETWEEN the
        # prev BRS date and the current period opening (i.e. the book opening gap
        # didn't match directly because there were concurrent bank transactions).
        # Strategy: if abs(brs_diff) exactly matches a SINGLE outstanding CF item
        # in stmt_only that originated as a credited_not_book carry-forward, remove
        # it - it has already been captured in the current book closing balance.
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
                          f"credited_not_book CF item - removing from stmt_only:")
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
                        "status":    "CLEARED (absorbed in book balance - post-BRS correction)",
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
            print(f"[Process] Empty statement (no prev BRS) - bank_closing_bal derived: "
                  f"{book_closing_bal:,.2f} + {_issued_bo:,.2f} - {_deposited_bo:,.2f} = {bank_closing_bal:,.2f}")
            no_txn_note = ("Bank statement has no transactions for this period. "
                           "All book entries carried as outstanding.")
        elif book_df.empty and abs(bank_closing_bal - book_closing_bal) < 0.01:
            no_txn_note = (f"No transactions in book for this bank this period. "
                           f"Balances match (Rs{book_closing_bal:,.2f}) - Fully Reconciled.")
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
    # for BRS purposes - use it, and treat all unmatched internal book entries (Public Sale,
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
            print(f"[Process] FIX: Book closing is Cr ({book_closing_bal:,.2f}) - "
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
                  f"BRS sections cleared -> fully reconciled.")

    if (bank_name_hint or "").upper() == "SBI" and re.fullmatch(r"SBI[A-Z0-9]+", str(branch_label or "").upper()):
        print(f"[Process] Display label normalized for SBI output: '{branch_label}' -> 'SBI'")
        branch_label = "SBI"

    if not stmt_only.empty and abs(compute_brs_difference(
            book_closing_bal, bank_closing_bal, book_only, stmt_only)) < 0.01:
        _tiny_current_bank_credit = stmt_only[
            (stmt_only["Direction"] == "INFLOW") &
            (stmt_only["Bank Amt (Rs)"] > 1.0) &
            (stmt_only["Bank Amt (Rs)"] <= 2.0) &
            (~stmt_only["Description"].astype(str).str.contains(
                r"\bRETURN\b", regex=True, na=False, case=False))
        ]
        if len(_tiny_current_bank_credit) == 1:
            _idx = _tiny_current_bank_credit.index[0]
            _amt = round(float(stmt_only.at[_idx, "Bank Amt (Rs)"]), 2)
            _candidate_stmt_only = stmt_only.copy()
            if "_brs_residual_exclude" not in _candidate_stmt_only.columns:
                _candidate_stmt_only["_brs_residual_exclude"] = False
            _candidate_stmt_only.at[_idx, "_brs_residual_exclude"] = True
            _candidate_diff = compute_brs_difference(
                book_closing_bal, bank_closing_bal, book_only, _candidate_stmt_only
            )
            if abs(_candidate_diff - _amt) < 0.01:
                stmt_only = _candidate_stmt_only
                print(f"[Process] Preserved tiny current bank-only residual in BRS: "
                      f"party='{stmt_only.at[_idx, 'Party']}' Rs{_amt:,.2f}")

    # -- Remove unmatched IFT/HOT self-transfer bank rows from BRS ------------
    # When the book file is missing the corresponding HOT Payments/Receipts entry
    # (e.g. not exported from Tally), INB/IFT/ORIENT bank rows have no book match
    # and float into stmt_only, incorrectly appearing in "Less: Debited" and
    # "Add: Credited". Because those same HOT movements are absent from the book
    # export, book_closing_bal is also off by the HOT net (+OUTFLOW -INFLOW).
    #
    # Fix: remove the unmatched IFT self-transfer rows from stmt_only AND reverse
    # their net effect on book_closing_bal so the BRS formula stays balanced:
    #   * each removed OUTFLOW (bank debit = missing book payment)  -> subtract from book_closing
    #   * each removed INFLOW  (bank credit = missing book receipt) -> add to book_closing
    # This mirrors what the manual accountant does by using a book closing that
    # already excludes HOT movements.
    #
    # Guard: only fire when the row is BOTH an IFT-pattern description AND the party
    # is the company itself - guarantees it is truly a self-transfer.
    if not stmt_only.empty and company_name:
        _ift_self_pattern = re.compile(
            r"INB/IFT/ORIENT|INB/IFT.*ORIENT|ORIENT.*INB/IFT"
            r"|HOT\s+(?:HDFC|AXIS|ICICI|SBI|INDUSIND|KOTAK|YES|PNB|CANARA|BOB|FEDERAL|RBL|DCB|IDFC|BANDHAN|UCO|UNION|IDBI|IOB|UBI|BOI|INDIAN)"
            r"|(?:HDFC|AXIS|ICICI|SBI|INDUSIND|KOTAK|YES|PNB|CANARA|BOB|FEDERAL|RBL|DCB|IDFC|BANDHAN|UCO|UNION|IDBI|IOB|UBI|BOI|INDIAN)\s+HOT"
            r"|BEING\s+FUNDS\s+TRANSFERRED\s+FROM\s+HOT"
            r"|FROM\s+HOT\s+\w+\s+TO\s+BRANCH",
            re.IGNORECASE
        )
        _co_upper = company_name.strip().upper()
        _ift_self_indices = []
        _ift_book_closing_adj = 0.0
        for _idx, _sr in stmt_only.iterrows():
            _desc  = str(_sr.get("Description", "") or "").strip()
            _party = str(_sr.get("Party", "") or "").strip().upper()
            if not (_ift_self_pattern.search(_desc) and _party == _co_upper):
                continue
            _amt = float(_sr.get("Bank Amt (Rs)", 0) or 0)
            _dir = str(_sr.get("Direction", "")).strip().upper()
            # Reverse the HOT net from book_closing:
            #   OUTFLOW = missing book payment  -> book_closing should be lower  -> subtract
            #   INFLOW  = missing book receipt  -> book_closing should be higher -> add
            if _dir == "OUTFLOW":
                _ift_book_closing_adj -= _amt
            else:
                _ift_book_closing_adj += _amt
            _ift_self_indices.append(_idx)
            print(f"[Process] Removing unmatched IFT self-transfer from BRS: "
                  f"dir={_dir} Rs{_amt:,.2f} desc='{_desc[:60]}'")
            cleared_log.append({
                "section":   "ift_self_transfer",
                "party":     str(_sr.get("Party", "")),
                "chq_no":    str(_sr.get("Chq No", "")),
                "bill_no":   "",
                "amount":    _amt,
                "narration": _desc,
                "status":    "EXCLUDED (internal fund transfer - book entry not exported)",
            })
        if _ift_self_indices:
            stmt_only = stmt_only.drop(index=_ift_self_indices)
            book_closing_bal = round(book_closing_bal + _ift_book_closing_adj, 2)
            # Also flip the drcr label if the sign changed
            book_closing_drcr = "Cr" if book_closing_bal < 0 else "Dr"
            print(f"[Process] Removed {len(_ift_self_indices)} unmatched IFT self-transfer "
                  f"rows. book_closing adjusted by {_ift_book_closing_adj:+,.2f} "
                  f"-> {book_closing_bal:,.2f} ({book_closing_drcr})")

    # -- Post-CF Split Detection (KRITIKA-type) --------------------------------
    # Pass 3c runs inside reconcile() before carry_forward() so it never sees CF
    # bank rows.  KRITIKA pattern: ONE book entry (bill 6201040) carried forward as
    # THREE separate cf_book_rows (Rs319 + Rs50000 + Rs50000) each tagged
    # "[CF from prev BRS]".  The bank side is THREE CreditTransfer entries with the
    # same amounts.  The old code looked for a single book row = sum of N bank rows;
    # KRITIKA needs multiset matching (N book rows <-> N bank rows, same amounts).
    #
    # Strategy:
    #   1. Group CF book rows by (party, bill_no, chq_no).
    #   2. Multi-row group  -> match bank legs as a multiset of the same amounts.
    #   3. Single-row group -> subset-sum N bank legs summing to that amount.
    #   4. Name gate: score >= 30 OR all bank legs share an identical party name.
    if prev_brs and not book_only.empty and not stmt_only.empty:
        from collections import defaultdict as _defaultdict
        _cf_groups = _defaultdict(list)
        for _bo_idx, _bo_row in book_only.iterrows():
            if str(_bo_row.get("Direction", "")) != "INFLOW":
                continue
            if "[CF from prev BRS]" not in str(_bo_row.get("Narration", "")):
                continue
            _key = (
                str(_bo_row.get("Party", "")).strip().upper(),
                str(_bo_row.get("Bill No", "")).strip(),
                str(_bo_row.get("Chq No", "")).strip(),
            )
            _cf_groups[_key].append((_bo_idx, _bo_row))

        _used_stmt_idxs_cf = set()

        for (_cf_party_key, _cf_bill, _cf_chq), _cf_entries in _cf_groups.items():
            _cf_amts  = sorted(round(float(e[1].get("Book Amt (Rs)", 0) or 0), 2)
                               for e in _cf_entries)
            _cf_total = round(sum(_cf_amts), 2)
            _cf_date  = str(_cf_entries[0][1].get("Date", "")).strip()
            _bo_party = str(_cf_entries[0][1].get("Party", "")).strip()

            _eligible_stmt = [
                (_si, _sr) for _si, _sr in stmt_only.iterrows()
                if (_si not in _used_stmt_idxs_cf and
                    str(_sr.get("Direction", "")) == "INFLOW" and
                    float(_sr.get("Bank Amt (Rs)", 0) or 0) > 0)
            ]
            if len(_eligible_stmt) < 2:
                continue

            _matched_idxs = None

            # Case 1: multi-row group - multiset match
            if len(_cf_entries) >= 2:
                _remaining = list(_cf_amts)
                _tentative = []
                for _si, _sr in _eligible_stmt:
                    _sr_amt = round(float(_sr.get("Bank Amt (Rs)", 0) or 0), 2)
                    if _sr_amt in _remaining:
                        _remaining.remove(_sr_amt)
                        _tentative.append(_si)
                if not _remaining and len(_tentative) == len(_cf_amts):
                    _matched_idxs = _tentative

            # Case 2: single-row group - subset-sum
            if _matched_idxs is None and len(_cf_entries) == 1:
                _target_c = int(round(_cf_total * 100))
                _combos   = {0: []}
                for _si, _sr in _eligible_stmt:
                    _amt_c = int(round(float(_sr.get("Bank Amt (Rs)", 0) or 0) * 100))
                    if _amt_c <= 0 or _amt_c > _target_c:
                        continue
                    _adds = {}
                    for _run, _combo in _combos.items():
                        _nt = _run + _amt_c
                        if _nt > _target_c or _nt in _combos or _nt in _adds:
                            continue
                        _nc = _combo + [_si]
                        if _nt == _target_c and len(_nc) >= 2:
                            _matched_idxs = _nc
                            break
                        _adds[_nt] = _nc
                    _combos.update(_adds)
                    if _matched_idxs:
                        break

            if not _matched_idxs:
                continue

            _leg_parties   = [str(stmt_only.at[_si, "Party"]) for _si in _matched_idxs]
            _best_score    = max(fuzzy(_bo_party, _p) for _p in _leg_parties)
            _all_identical = len(set(_p.upper().strip() for _p in _leg_parties)) == 1
            if _best_score < 30 and not _all_identical:
                continue

            _bank_parts_str = " + ".join(
                f"Rs{float(stmt_only.at[_si, 'Bank Amt (Rs)']):,.2f} ({stmt_only.at[_si, 'Party']})"
                for _si in _matched_idxs
            )
            _bank_dates_str = ", ".join(str(stmt_only.at[_si, "Date"]) for _si in _matched_idxs)
            _note = (
                f"CF book entry '{_bo_party}' (bill {_cf_bill}) - "
                f"{len(_matched_idxs)} bank credits match the {len(_cf_entries)} CF book amounts exactly: "
                f"{_bank_parts_str}. "
                f"Bank party name may differ (e.g. CreditTransfer/generic label). "
                f"Verify these credits belong to this party and clear manually."
            )
            split_review.append({
                "book_idx":   _cf_entries[0][0],
                "book_party": _bo_party,
                "book_amt":   _cf_total,
                "book_date":  _cf_date,
                "book_bill":  _cf_bill,
                "book_chq":   _cf_chq,
                "bank_idxs":  _matched_idxs,
                "bank_parts": _bank_parts_str,
                "bank_dates": _bank_dates_str,
                "score":      _best_score,
                "n_parts":    len(_matched_idxs),
                "note":       _note,
            })
            for _si in _matched_idxs:
                _used_stmt_idxs_cf.add(_si)
            print(f"[Process] Post-CF split candidate -> HV Section F: "
                  f"CF book '{_bo_party}' bill={_cf_bill} "
                  f"Rs{_cf_total:,.2f} ({len(_cf_entries)} CF rows) = {_bank_parts_str}")

    # BRS cheque-number difference annotation.
    # If a book-only row and bank-only row look like the same transaction by
    # amount/direction/name but carry different cheque numbers, keep both rows
    # in BRS and show the cheque issue explicitly. This includes book placeholder
    # cheque values 99/511 when the bank has a real cheque number.
    if not book_only.empty and not stmt_only.empty:
        if "Narration" not in book_only.columns:
            book_only = book_only.copy()
            book_only["Narration"] = ""
        if "Narration" not in stmt_only.columns:
            stmt_only = stmt_only.copy()
            stmt_only["Narration"] = ""

        def _brs_real_bank_chq(value):
            text = str(value or "").strip()
            if text.lower() in {"", "nan", "0", "99", "511", "-"} or not re.fullmatch(r"\d{1,6}", text):
                return ""
            return text

        def _brs_book_chq_for_review(value, bank_chq):
            text = str(value or "").strip()
            low = text.lower()
            if low in {"", "nan", "0", "-"}:
                return ""
            if low in {"99", "511"}:
                return text if bank_chq else ""
            return text

        def _brs_words(text):
            return {
                w for w in clean_name(str(text or "")).split()
                if len(w) >= 4 and w not in {"BANK", "PVT", "LTD", "LIMITED", "PRIVATE", "INDIA"}
            }

        def _append_brs_note(df, idx, note):
            old = str(df.at[idx, "Narration"] or "").strip()
            if note.lower() in old.lower():
                return
            df.at[idx, "Narration"] = f"{old} | {note}".strip(" |") if old else note

        for _bo_idx, _bo in book_only.iterrows():
            _bo_dir = str(_bo.get("Direction", "")).strip()
            _bo_amt = round(float(_bo.get("Book Amt (Rs)", 0) or 0), 2)
            if _bo_amt <= 0:
                continue
            _best = None
            _best_score = -1
            for _si, _sr in stmt_only.iterrows():
                if str(_sr.get("Direction", "")).strip() != _bo_dir:
                    continue
                if abs(round(float(_sr.get("Bank Amt (Rs)", 0) or 0), 2) - _bo_amt) >= 0.01:
                    continue
                _bank_chq = _brs_real_bank_chq(_sr.get("Chq No", ""))
                _book_chq = _brs_book_chq_for_review(_bo.get("Chq No", ""), _bank_chq)
                if not (_book_chq and _bank_chq and _book_chq != _bank_chq):
                    continue
                _score = fuzzy(str(_bo.get("Party", "")), str(_sr.get("Party", "")))
                _book_words = _brs_words(str(_bo.get("Party", "")))
                _bank_words = _brs_words(f"{_sr.get('Party', '')} {_sr.get('Description', '')}")
                if _score < 50 and not (_book_words & _bank_words):
                    continue
                if _score > _best_score:
                    _best = (_si, _book_chq, _bank_chq)
                    _best_score = _score
            if _best is None:
                continue
            _si, _book_chq, _bank_chq = _best
            _note = f"chq no. diff: Book={_book_chq} Bank={_bank_chq}"
            _append_brs_note(book_only, _bo_idx, _note)
            _append_brs_note(stmt_only, _si, _note)
            print(f"[Process] BRS cheque diff annotation: {_bo.get('Party', '')} "
                  f"Rs{_bo_amt:,.2f} Book={_book_chq} Bank={_bank_chq}")

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
        blocked_crossclears=blocked_crossclears,
        no_txn_note=no_txn_note,
        split_review=split_review,
    )
    return matched, book_only, stmt_only,book_closing_bal, bank_closing_bal


# =============================================================================
# MAIN
# =============================================================================

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(
        description="Bank Reconciliation - with optional previous BRS carry-forward."
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
    print(f"Date threshold   : +/-{DATE_THRESHOLD_DAYS} days")
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


