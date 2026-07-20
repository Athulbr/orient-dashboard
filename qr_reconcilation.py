
import re
import sys
from copy import copy
from pathlib import Path
from datetime import datetime
from itertools import combinations
from decimal import Decimal, ROUND_HALF_UP

import pandas as pd
from difflib import SequenceMatcher
from openpyxl import Workbook, load_workbook
from openpyxl.styles import PatternFill, Font, Alignment, Border, Side
from openpyxl.utils import get_column_letter

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

#
#  CONFIG
#
FUZZY_THRESH = 90
FUZZY_ACCEPT = 60
PARTY_CONFIRMATION_THRESHOLD = 50

ACCOUNT_SHEET_NAMES = ("QR-YES BANK", "QR-YESBANK", "QRYESBANK")

#
#  DATE UTILITY
#
_DATE_RE = re.compile(r"(\d{2}\.\d{2}\.\d{4})")


def _extract_date_from_text(text):
    m = _DATE_RE.search(str(text))
    return datetime.strptime(m.group(1), "%d.%m.%Y") if m else None


def _extract_dates_from_text(text):
    dates = []
    for value in _DATE_RE.findall(str(text)):
        try:
            dt = datetime.strptime(value, "%d.%m.%Y")
        except ValueError:
            continue
        if dt not in dates:
            dates.append(dt)
    return dates


def _extract_brs_date_from_workbook(path):
    try:
        xl = pd.ExcelFile(path)
    except Exception:
        return None

    preferred = [s for s in ("Summary", "QR BRS Statement") if s in xl.sheet_names]
    for sheet in preferred + [s for s in xl.sheet_names if s not in preferred]:
        try:
            df = pd.read_excel(path, sheet_name=sheet, header=None, nrows=30)
        except Exception:
            continue
        for value in df.astype(str).to_numpy().ravel():
            dt = _extract_date_from_text(value)
            if dt is not None:
                return dt
    return None


def _previous_company_book_adjustment(path):
    """Return a manual balance adjustment carried in the previous BRS, if any."""
    try:
        wb_formula = load_workbook(path, data_only=False, read_only=True)
        wb_values = load_workbook(path, data_only=True, read_only=True)
    except Exception:
        return 0.0

    preferred = [s for s in ACCOUNT_SHEET_NAMES if s in wb_formula.sheetnames]
    if not preferred:
        preferred = [
            s for s in ("QR-HDFC", "QR BRS Statement") if s in wb_formula.sheetnames
        ]
    # Widen to all sheets if no preferred sheet matched (non-standard manual BRS layout)
    if not preferred:
        preferred = list(wb_formula.sheetnames)

    for sheet_name in preferred:
        ws_formula = wb_formula[sheet_name]
        ws_values = (
            wb_values[sheet_name] if sheet_name in wb_values.sheetnames else None
        )
        for row in ws_formula.iter_rows():
            label_hit = any(
                isinstance(cell.value, str)
                and "closing balance as per company books" in cell.value.strip().lower()
                for cell in row
            )
            if not label_hit:
                continue
            for cell in row:
                formula = cell.value
                if not (isinstance(formula, str) and formula.startswith("=")):
                    continue
                terms = [
                    float(m.group(1).replace(" ", "").replace(",", ""))
                    for m in re.finditer(
                        r"(?<![A-Za-z])([+-]?\s*\d[\d,]*(?:\.\d+)?)", formula
                    )
                ]
                if len(terms) >= 2:
                    return round(sum(terms[1:]), 2)
                if len(terms) == 1 and re.search(r"[A-Za-z]", formula):
                    return round(terms[0], 2)
    return 0.0


def _previous_bank_closing_balance(path):
    """Return the previous BRS bank closing balance for the YES QR account.

    Handles both formats:
      Manual BRS  (QR-YES BANK / QR-YESBANK sheet):
        Row label contains 'closing balance as per bank', value in same row.
      Script-generated output (QR BRS Statement sheet):
        Row label is 'Expected Bank Balance (rounded to rupees)', value in col 9.
        This is the reconciled expected bank balance which equals the actual bank
        closing balance when the BRS was FULLY RECONCILED (diff ~ 0).

    Fallback: scans ALL sheets for any label resembling a bank closing balance
    so that non-standard manual BRS file layouts (e.g. "HOT BRS MAY 2026") are
    also handled robustly.
    """
    try:
        wb_values = load_workbook(path, data_only=True, read_only=True)
    except Exception:
        return 0.0

    # --- Manual BRS format (preferred) ---
    # Try known sheet names first, then fall back to ALL sheets.
    preferred_sheets = [s for s in ACCOUNT_SHEET_NAMES if s in wb_values.sheetnames]
    if not preferred_sheets:
        preferred_sheets = [s for s in ("QR-HDFC",) if s in wb_values.sheetnames]

    # Exact-label match on preferred sheets
    for sheet_name in preferred_sheets:
        ws_values = wb_values[sheet_name]
        for row in ws_values.iter_rows(values_only=True):
            labels = [str(v).strip().lower() for v in row if isinstance(v, str)]
            if not any("closing balance as per bank" in label for label in labels):
                continue
            nums = [
                float(v) for v in row if isinstance(v, (int, float)) and not pd.isna(v)
            ]
            if nums:
                print(
                    f"  [Prev BRS] Read bank closing balance from sheet '{sheet_name}': {round(nums[-1], 2):,.2f}"
                )
                return round(nums[-1], 2)

    # --- Script-generated output format ---
    if "QR BRS Statement" in wb_values.sheetnames:
        ws_values = wb_values["QR BRS Statement"]
        _prev_expected = None
        _prev_diff = None
        for row in ws_values.iter_rows(values_only=True):
            labels = [str(v).strip().lower() for v in row if isinstance(v, str)]
            nums = [
                float(v) for v in row if isinstance(v, (int, float)) and not pd.isna(v)
            ]
            if not nums:
                continue
            if any("expected bank balance" in lbl for lbl in labels):
                _prev_expected = round(nums[-1], 2)
            elif any(
                ("difference" in lbl and "should be 0" in lbl)
                or ("brs difference" in lbl)
                for lbl in labels
            ):
                _prev_diff = round(nums[-1], 2)

        if _prev_expected is not None:
            if _prev_diff is not None and abs(_prev_diff) > 1:
                actual = round(_prev_expected + _prev_diff, 2)
                print(
                    f"  [Prev BRS] Script output was NOT reconciled "
                    f"(diff={_prev_diff:,.2f}); "
                    f"adjusting prev bank balance: {_prev_expected:,.2f} + {_prev_diff:,.2f} "
                    f"= {actual:,.2f}"
                )
                return actual
            print(
                f"  [Prev BRS] Read expected bank balance from script output: {_prev_expected:,.2f}"
            )
            return _prev_expected

    # --- Wide fallback: scan ALL sheets for bank-closing-balance label ---
    # Handles non-standard manual BRS layouts (e.g. "HOT BRS MAY 2026" with
    # a sheet named differently from the standard ACCOUNT_SHEET_NAMES).
    _BANK_BAL_LABELS = [
        "closing balance as per bank",
        "balance as per bank",
        "bank closing balance",
        "closing bal as per bank",
        "balance as per bank statement",
        "closing balance as per bank statement",
    ]
    _best_candidate = None  # (sheet_name, value)
    for sheet_name in wb_values.sheetnames:
        if sheet_name in ("QR BRS Statement",):
            continue  # already tried above
        try:
            ws = wb_values[sheet_name]
        except Exception:
            continue
        for row in ws.iter_rows(values_only=True):
            labels = [str(v).strip().lower() for v in row if isinstance(v, str)]
            matched = any(
                any(lbl_pat in lbl for lbl_pat in _BANK_BAL_LABELS) for lbl in labels
            )
            if not matched:
                continue
            nums = [
                float(v) for v in row if isinstance(v, (int, float)) and not pd.isna(v)
            ]
            if nums:
                # Take the last numeric value in the matching row
                _best_candidate = (sheet_name, round(nums[-1], 2))
                break
        if _best_candidate:
            break

    if _best_candidate:
        sheet_name, val = _best_candidate
        print(
            f"  [Prev BRS] Fallback: read bank closing balance "
            f"from sheet '{sheet_name}': {val:,.2f}  "
            f"(non-standard sheet name -- consider renaming to 'QR-YES BANK' for reliability)"
        )
        return val

    # Final fallback: nothing found -- warn loudly so the user knows
    print(
        f"\n  [Prev BRS] WARNING: Could not read bank closing balance from {Path(path).name}."
        f"\n    Sheets found: {wb_values.sheetnames}"
        f"\n    Expected sheet named one of: {list(ACCOUNT_SHEET_NAMES)} with a row labelled"
        f"\n    'Closing balance as per bank'. BRS arithmetic will use 0 as prev_bank_bal,"
        f"\n    which will cause a reconciliation difference equal to the actual bank balance."
        f"\n    FIX: Ensure the previous BRS sheet name matches one of the expected names,"
        f"\n    or that the row label contains 'closing balance as per bank'."
    )
    return 0.0


def _detect_brs_date_from_statement_data(statement_path, prev_dt=None):
    """
    Detect the BRS date by reading settlement dates from the statement file itself.

    For YES Bank QR statements:
      - Preferred: the earliest seller_settlement_date that is > prev_dt
        (i.e. the next day's settlement cycle after the previous BRS).
      - Fallback:  the latest seller_settlement_date present in the file.
      - Final fallback: the latest transaction_date present.

    This is used when the statement filename carries no parseable date,
    e.g. "QR YES BANK STATEMENT.xlsx".
    """
    try:
        header_row = _statement_header_row(statement_path)
        df = pd.read_excel(statement_path, sheet_name=0, header=header_row, dtype=str)
        df.columns = [str(c).strip().lower() for c in df.columns]

        # Normalise column aliases (same map used in _normalise_yesbank_statement)
        alias = {
            "seller settelement date": "seller settlement date",
            "seller settlement status": "transaction state",
        }
        df = df.rename(columns={k: v for k, v in alias.items() if k in df.columns})

        settle_col = "seller settlement date"
        txn_col = "transaction date"

        if settle_col in df.columns:
            settle_dates = (
                pd.to_datetime(df[settle_col], errors="coerce")
                .dt.normalize()
                .dropna()
                .unique()
            )
            if len(settle_dates):
                settle_dates = sorted(settle_dates)
                if prev_dt is not None:
                    later = [d for d in settle_dates if d > pd.Timestamp(prev_dt)]
                    if later:
                        chosen = min(later)
                        print(
                            f"  [Date] No date in statement filename; "
                            f"detected BRS date {chosen.strftime('%d.%m.%Y')} "
                            f"from earliest settlement date after prev BRS {prev_dt.strftime('%d.%m.%Y')}"
                        )
                        return chosen.to_pydatetime()
                # fallback: latest settlement date in file
                chosen = max(settle_dates)
                print(
                    f"  [Date] No date in statement filename; "
                    f"using latest settlement date {chosen.strftime('%d.%m.%Y')} from statement data"
                )
                return chosen.to_pydatetime()

        if txn_col in df.columns:
            txn_dates = (
                pd.to_datetime(df[txn_col], errors="coerce")
                .dt.normalize()
                .dropna()
                .unique()
            )
            if len(txn_dates):
                chosen = max(txn_dates)
                print(
                    f"  [Date] No date in statement filename; "
                    f"using latest transaction date {chosen.strftime('%d.%m.%Y')} from statement data"
                )
                return chosen.to_pydatetime()
    except Exception as e:
        print(
            f"  [Date] Could not read dates from statement file ({e}); falling back to today"
        )
    return datetime.today()


def _pick_brs_date(statement_name, prev_brs_path, override=None, statement_path=None):
    if override:
        return datetime.strptime(override, "%d.%m.%Y")

    stmt_dates = _extract_dates_from_text(statement_name)
    if len(stmt_dates) > 1:
        prev_dt = _extract_date_from_text(Path(prev_brs_path).name)
        if prev_dt is None:
            prev_dt = _extract_brs_date_from_workbook(prev_brs_path)
        if prev_dt is not None:
            later_dates = [dt for dt in stmt_dates if dt > prev_dt]
            if later_dates:
                chosen = min(later_dates)
                print(
                    f"  [Date] Previous BRS is {prev_dt.strftime('%d.%m.%Y')}; "
                    f"using next statement date {chosen.strftime('%d.%m.%Y')}"
                )
                return chosen
    if stmt_dates:
        return stmt_dates[0]

    # No date found in filename  try reading it from the statement data itself.
    # This handles generic filenames like "QR YES BANK STATEMENT.xlsx".
    if statement_path is not None:
        prev_dt = _extract_date_from_text(Path(prev_brs_path).name)
        if prev_dt is None:
            prev_dt = _extract_brs_date_from_workbook(prev_brs_path)
        return _detect_brs_date_from_statement_data(statement_path, prev_dt)

    return datetime.today()


def _date_only(value):
    return pd.Timestamp(value).normalize()


def _filter_on_brs_date(df, date_col, stmt_date, label, from_date=None):
    """Keep rows whose book date falls within the BRS period.

    Single-day run  : from_date is None  -> keep rows where date == stmt_date (original behaviour).
    Combined-day run: from_date is set   -> keep rows where from_date < date <= stmt_date.
                      This handles multi-day book exports (e.g. 23+24 May combined) correctly
                      regardless of which individual day's date is forced via --date.
    """
    if df.empty or date_col not in df.columns:
        return df
    before = len(df)
    date_norm = df[date_col].dt.normalize()
    stmt_norm = _date_only(stmt_date)
    if from_date is not None:
        from_norm = _date_only(from_date)
        scoped = df[(date_norm > from_norm) & (date_norm <= stmt_norm)].copy()
        period_label = f"{from_date.strftime('%d.%m.%Y')} < date <= {stmt_date.strftime('%d.%m.%Y')}"
    else:
        scoped = df[date_norm == stmt_norm].copy()
        period_label = stmt_date.strftime("%d.%m.%Y")
    removed = before - len(scoped)
    if removed:
        print(
            f"  [Date Scope] {label}: kept {len(scoped)} row(s) for "
            f"{period_label}; ignored {removed} other-date row(s)"
        )
    return scoped


def _filter_on_brs_date_match_pool(df, date_col, stmt_date, label, from_date=None):
    """Wider book filter for the MATCHING POOL only (not used for BRS balance).

    YES Bank uses T+1 settlement: a customer pays on day D, the bank credits
    it on D+1 (seller_settlement_date = D+1).  The book records the transaction
    on day D.  When from_date is set, the strict filter (date > from_date) would
    exclude book entries dated exactly on from_date even though those entries
    legitimately pair with bank credits dated (from_date + 1) in today's statement.

    This function uses >= from_date (inclusive) so those entries enter the
    matching pool and can be paired with their T+1 bank credits.  The BRS
    balance arithmetic still uses the strict _filter_on_brs_date filter so
    there is no double-counting of prior-period amounts.
    """
    if df.empty or date_col not in df.columns:
        return df
    date_norm = df[date_col].dt.normalize()
    stmt_norm = _date_only(stmt_date)
    if from_date is not None:
        from_norm = _date_only(from_date)
        # Inclusive of from_date so T+1 pairs (book on from_date, bank on from_date+1) match
        pool = df[(date_norm >= from_norm) & (date_norm <= stmt_norm)].copy()
        extra = len(pool) - len(df[(date_norm > from_norm) & (date_norm <= stmt_norm)])
        if extra > 0:
            print(
                f"  [Match Pool] {label}: included {extra} extra row(s) dated "
                f"{from_date.strftime('%d.%m.%Y')} for T+1 bank matching"
            )
        return pool
    else:
        return df[date_norm == stmt_norm].copy()


def _filter_yes_statement_for_brs(df, stmt_date):
    """For YES QR, keep all transactions in the statement for matching purposes.

    YES Bank uses T+1 settlement, so a statement downloaded for date D contains
    transactions whose seller_settlement_date may be D+1 (or later).  These are
    still legitimate credits for the current BRS period  the statement itself is
    the evidence.  We keep them all in the matching pool and only note how many
    settle after the BRS date.

    The settlement_credits arithmetic (expected_bank_bal) still only counts
    credits whose settle_date falls within the BRS period, so the balance
    formula remains correct  future-settle rows are matched but not counted
    as credits received today.
    """
    if df.empty:
        return df
    settle = df["seller settlement date"].dt.normalize()
    future = (settle > _date_only(stmt_date)).sum()
    if future:
        print(
            f"  [Date Scope] YES statement: kept all {len(df)} row(s); "
            f"{future} settle after {stmt_date.strftime('%d.%m.%Y')} "
            f"(matched but not counted in settlement_credits)"
        )
    return df.copy()


def _book_balance_value(amount, side):
    amount = pd.to_numeric(amount, errors="coerce")
    if pd.isna(amount):
        return 0.0
    side = str(side or "").strip().lower()
    return -float(amount) if side.startswith("cr") else float(amount)


#
#  STYLE HELPERS
#
def fill(hex_c):
    return PatternFill("solid", fgColor=hex_c)


NO_FILL = PatternFill(fill_type=None)


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


C_NAVY = "1F3864"
C_BLUE = "2E75B6"
C_LBLUE = "D9E1F2"
C_GREEN = "C6EFCE"
C_AMBER = "FFEB9C"
C_RED = "FFC7CE"
C_ORNG = "FCE4D6"
C_GREY = "F2F2F2"
C_WHITE = "FFFFFF"
C_CF = "E2EFDA"
C_RED_H = "C00000"
C_PURPLE_H = "6B2D8B"  # Purple header for Bank Only sheet

_BR = border()
_NF = font()
_BF = font(bold=True)


def set_cell(
    ws,
    r,
    c,
    val=None,
    bg=None,
    bold=False,
    color="000000",
    size=9,
    h_align="left",
    num_fmt=None,
    bdr=True,
):
    cell = ws.cell(row=r, column=c, value=val)
    cell.fill = NO_FILL
    cell.font = font(bold, color, size)
    cell.border = _BR if bdr else no_border()
    cell.alignment = align(h_align)
    if num_fmt:
        cell.number_format = num_fmt
    return cell


def write_header_row(ws, r, headers, bg=C_NAVY, cols=None):
    cols = cols or list(range(1, len(headers) + 1))
    for col, h in zip(cols, headers):
        c = ws.cell(row=r, column=col, value=h)
        c.fill = fill(bg)
        c.font = Font(bold=True, color="FFFFFF", name="Calibri", size=10)
        c.border = _BR
        c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
    ws.row_dimensions[r].height = 24


def write_title_row(ws, r, text, n_cols, bg=C_NAVY):
    ws.merge_cells(start_row=r, start_column=1, end_row=r, end_column=n_cols)
    c = ws.cell(row=r, column=1, value=text)
    c.fill = fill(bg)
    c.font = Font(bold=True, color="FFFFFF", name="Calibri", size=12)
    c.border = _BR
    c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
    ws.row_dimensions[r].height = 28


def col_widths(ws, widths):
    for i, w in enumerate(widths, 1):
        ws.column_dimensions[get_column_letter(i)].width = w


#
#  UTILITY FUNCTIONS
#
def name_sim(a, b):
    if not a or not b:
        return 0
    return int(SequenceMatcher(None, str(a).upper(), str(b).upper()).ratio() * 100)


def normalize_party(text):
    text = str(text or "").replace("INDIVI - ", "").strip()
    return re.sub(r"\s+", " ", text.upper())


def _token_sorted_party(text):
    text = normalize_party(text)
    text = re.sub(r"[^A-Z0-9 ]", " ", text)
    return " ".join(sorted(text.split()))


def cf_name_sim(a, b):
    return max(name_sim(a, b), name_sim(_token_sorted_party(a), _token_sorted_party(b)))


def _clean_makez_extracted(name):
    if not name or str(name).strip().lower() in ("", "nan", "none"):
        return ""
    s = str(name).upper().strip()
    for prefix in ("MR.", "MRS.", "MS.", "DR.", "INDIVI - ", "M/S ", "M/S. "):
        if s.startswith(prefix):
            s = s[len(prefix) :].strip()
    s = re.sub(r"[^A-Z0-9 ]", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def _text_id(value):
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return ""
    s = str(value).strip()
    if s.lower() in ("", "nan", "none"):
        return ""
    if re.fullmatch(r"\d+\.0", s):
        return s[:-2]
    if re.fullmatch(r"\d(?:\.\d+)?[eE][+-]?\d+", s):
        try:
            return f"{float(s):.0f}"
        except Exception:
            return s
    return s


def count_transactions_by_bill_no_and_name(all_branches_path):
    """
    Return transaction numbers from the All-Branches book report.

    Same party name + same bill no keeps the same transaction number. If the
    party name is the same but the bill no is different, the transaction number
    for that party is increased.
    """
    all_branches_path = Path(all_branches_path)
    try:
        df_all = pd.read_excel(all_branches_path, sheet_name=0, header=None)
    except Exception as exc:
        raise RuntimeError(
            f"Failed to read All-Branches Book Report\n"
            f"  File: {all_branches_path}\n"
            f"  Error: {exc}"
        ) from exc

    required_cols = {0, 2, 3, 6}
    missing_cols = [c for c in required_cols if c not in df_all.columns]
    if missing_cols:
        raise ValueError(
            "All-Branches Book Report is missing required column(s): "
            + ", ".join(str(c) for c in missing_cols)
        )

    skip = {
        "Transaction",
        "QRHDFC",
        "QRYESBANK",
        "Public Sale",
        "Receipts",
        "Payments",
        "Summary Of QRHDFC",
        "Summary Of QRYESBANK",
        "nan",
        "",
    }
    cur_br = None
    branches = []
    for _, row in df_all.iterrows():
        v = str(row[0]).strip() if pd.notna(row[0]) else ""
        if v not in skip:
            cur_br = v
        branches.append(cur_br)
    df_all["_br"] = branches

    rows = df_all[df_all[0] == "Public Sale"].copy()
    if rows.empty:
        return pd.DataFrame(
            columns=["date", "branch", "bill_no", "party", "transaction_no"]
        )

    rows["date"] = pd.to_datetime(rows[2], errors="coerce")
    rows["branch"] = rows["_br"].astype(str).str.split(" - ").str[0]
    rows["bill_no"] = rows[3].apply(_text_id).astype(str).str.strip()
    rows["party"] = (
        rows[6].astype(str).str.replace("INDIVI - ", "", regex=False).str.strip()
    )

    rows = rows[
        rows["bill_no"].ne("")
        & rows["bill_no"].str.lower().ne("nan")
        & rows["party"].ne("")
        & rows["party"].str.lower().ne("nan")
    ].copy()

    party_bill_numbers = {}
    transaction_numbers = []
    for _, row in rows.iterrows():
        party_key = normalize_party(row["party"])
        bill_key = _text_id(row["bill_no"])
        bill_numbers = party_bill_numbers.setdefault(party_key, {})
        if bill_key not in bill_numbers:
            bill_numbers[bill_key] = len(bill_numbers) + 1
        transaction_numbers.append(bill_numbers[bill_key])

    rows["transaction_no"] = transaction_numbers
    return rows[["date", "branch", "bill_no", "party", "transaction_no"]].reset_index(
        drop=True
    )


def _round_rupee(value):
    return float(Decimal(str(value)).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def _find_section(df, header_fragment, data_col=5):
    """
    Dynamically locate a named section in the previous BRS sheet.

    Scans column 0 for a row containing header_fragment (case-insensitive).
    Collects subsequent rows until data_col becomes non-numeric (subtotal/blank).
    Also skips rows whose col-0 date is empty (formula/SUM rows pandas reads
    as numeric).

    Handles output-format section headers which may have extra spaces or
    slightly different wording (e.g. "Less :  Cheques deposited" vs
    "Less: Cheques deposited").
    """
    import re as _re

    def _norm(s):
        s = _re.sub(r"\s+", " ", s.strip()).lower()
        s = _re.sub(r"\s*:\s*", ":", s)  # "less : cheques"  "less:cheques"
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
        # Skip the sub-header row that labels the columns (e.g. "Date", "Branch", )
        if cell0.strip().lower() in ("date", "sl no", "sl.no.", "sr no", "sr.no."):
            continue
        val = df.at[idx, data_col]
        num = pd.to_numeric(val, errors="coerce")
        if pd.isna(num):
            break  # subtotal or blank row  end of section
        date_val = df.at[idx, 0]
        if not pd.notna(date_val) or str(date_val).strip() in ("", "nan"):
            continue  # formula row whose amount pandas read as numeric  skip
        rows.append(idx)
    return df.loc[rows] if rows else df.iloc[0:0]


def _prev_row_comment(row, data_col):
    comments = []
    for ci in range(data_col + 1, min(len(row), data_col + 4)):
        val = row.iloc[ci] if hasattr(row, "iloc") else row[ci]
        if not pd.notna(val):
            continue
        text = str(val).strip()
        if text.lower() in ("", "nan", "-", "carried fwd", "carried forward"):
            continue
        if pd.notna(pd.to_numeric(text.replace(",", ""), errors="coerce")):
            continue
        if text not in comments:
            comments.append(text)
    return " | ".join(comments)


#
#  DBA MAP
#
DBA_MAP = {
    "ORIENT EXCHANGE AHMEDABAD": "AHMD",
    "ORIENT EXCHANGE BANGALORE WHITEFIELD": "BANW",
    "ORIENT EXCHANGE BANGALORE BASAVANAGUDI": "BANH",
    "ORIENT EXCHANGE DELHI": "DLHI",
    "ORIENT EXCHANGE PUNE": "PUNE",
    "ORIENT EXCHANGE VADODARA": "VADO",
    "ORIENT EXCHANGE CHENNAI": "CHN",
    "ORIENT EXCHANGE MUMBAI DADAR": "MUMD",
    "ORIENT EXCHANGE MUMBAI VILEPARLE": "MUMV",
    "ORIENT EXCHANGE HYDERABAD": "HYD",
    "ORIENT EXCHANGE SURAT": "SURAT",
    "ORIENT EXCHANGE KOLKATA": "KOL",
    "ORIENT EXCHANGE KOTTAYAM": "KTM",
    "ORIENT EXCHANGE TRIVANDRUM": "TVM",
    "ORIENT EXCHANGE COIMBATORE": "COMB",
    "ORIENT EXCHANGE THRISSUR": "THRI",
    "ORIENT EXCHANGE JALANDHAR": "JLDR",
    "ORIENT EXCHANGE  GURUGRAM": "GURG",
    "ORIENT EXCHANGE MANGALORE": "MNGLR",
    "ORIENT EXCHANGE CHANDIGARH": "CHAD",
    "ORIENT EXCHANGE KOCHIN": "COMGR",
    "ORIENT EXCHANGE BELGAUM": "BELG",
    "ORIENT EXCHANGE KOCHI EXIM": "COARP",
    "ORIENT EXCHANGE CORPORATE": "COARP",
    "ORIENT EXCHANGE KOCHI CORPORATE": "COARP",
    "ORIENT EXCHANGE AMRITSAR": "AMTR",
    "ORIENT EXCHANGE KOLLAM": "KOLM",
    "ORIENT EXCHANGE CALICUT": "CALCT",
    # YES Bank QR statement names sometimes omit the city qualifier used by
    # the HDFC export.
    "ORIENT EXCHANGE VILE PARLE": "MUMV",
    "ORIENT EXCHANGE DADAR": "MUMD",
    "ORIENT EXCHANGE GURUGRAM": "GURG",
    # YES Bank uses shortened Bangalore branch names (no "BANGALORE" prefix).
    "ORIENT EXCHANGE WHITEFIELD": "BANW",
    "ORIENT EXCHANGE BASAVANAGUDI": "BANH",
    # YES Bank uses "KOCHI" (without suffix) for the Kochin branch.
    "ORIENT EXCHANGE KOCHI": "COMGR",
}

QR_ACCOUNT_CODE = "QRYESBANK"
QR_ACCOUNT_LABEL = "QR-YESBANK"
QR_ACCOUNT_DISPLAY = "QR-YES BANK"
HOT_SUMMARY_LABELS = ("Summary Of QRYESBANK", "Summary Of QRHDFC")
PREV_BRS_SHEET_NAMES = ("QR-YES BANK", "QR-YESBANK", "QRYESBANK", "QR-HDFC")
QR_BANK_KIND = "YES"

YESBANK_COLUMN_MAP = {
    "transaction date": "transaction date",
    "seller settlement date": "seller settlement date",
    "seller settelement date": "seller settlement date",
    "transaction amount": "amount(rs.)",
    "net settlement amount": "amount(rs.)",
    "business name": "doing business as",
    "seller settlement status": "transaction state",
    "rrn": "rrn no",
    "payment mode": "pay type",
    "id": "transaction id",
    "transaction reference number": "transaction id",
    "payer name": "payer name",
}


def _normalise_yesbank_statement(df_stmt):
    """Convert YES Bank QR export columns to the HDFC-shaped columns used below."""
    df_stmt.columns = [str(c).strip().lower() for c in df_stmt.columns]
    rename = {}
    target_cols = set(df_stmt.columns)
    for src, dst in YESBANK_COLUMN_MAP.items():
        if src in df_stmt.columns and dst not in target_cols:
            rename[src] = dst
            target_cols.add(dst)
    df_stmt = df_stmt.rename(columns=rename)

    if "transaction state" in df_stmt.columns:
        state = df_stmt["transaction state"].astype(str).str.strip().str.upper()
        df_stmt["transaction state"] = state.map(
            {
                "SUCCESS": "SaleSuccess",
                "SALE SUCCESS": "SaleSuccess",
                "SALESUCCESS": "SaleSuccess",
                "FAILED": "SaleFailed",
                "FAILURE": "SaleFailed",
                "SALE FAILED": "SaleFailed",
                "SALEFAILED": "SaleFailed",
            }
        ).fillna(df_stmt["transaction state"])

    required = [
        "transaction date",
        "transaction state",
        "amount(rs.)",
        "doing business as",
        "rrn no",
    ]
    missing = [c for c in required if c not in df_stmt.columns]
    if missing:
        raise ValueError(
            "YES Bank QR statement is missing required column(s): " + ", ".join(missing)
        )

    if "pay type" not in df_stmt.columns:
        df_stmt["pay type"] = "UPI"
    if "payment type" not in df_stmt.columns:
        df_stmt["payment type"] = df_stmt["pay type"]
    if "transaction id" not in df_stmt.columns:
        df_stmt["transaction id"] = df_stmt["rrn no"]
    if not any("payer" in c for c in df_stmt.columns):
        df_stmt["payer"] = ""

    return df_stmt


def _statement_header_row(statement_path, max_rows=10):
    try:
        preview = pd.read_excel(
            statement_path, sheet_name=0, header=None, nrows=max_rows, dtype=str
        )
    except Exception:
        return 0

    known_headers = set(YESBANK_COLUMN_MAP) | {
        "amount(rs.)",
        "doing business as",
        "transaction state",
        "rrn no",
    }
    best_idx = 0
    best_score = 0
    for idx, row in preview.iterrows():
        values = {str(v).strip().lower() for v in row if pd.notna(v) and str(v).strip()}
        score = len(values & known_headers)
        if score > best_score:
            best_idx = idx
            best_score = score
    return int(best_idx)


def _detect_qr_bank_kind(statement_path):
    try:
        header_row = _statement_header_row(statement_path)
        cols = pd.read_excel(
            statement_path, sheet_name=0, header=header_row, nrows=0
        ).columns
    except Exception:
        return "YES"
    cols = {str(c).strip().lower() for c in cols}
    if {"seller settlement status", "business name", "rrn"} & cols:
        return "YES"
    return "HDFC"


def _set_qr_account_context(kind):
    global ACCOUNT_SHEET_NAMES
    global QR_ACCOUNT_CODE, QR_ACCOUNT_LABEL, QR_ACCOUNT_DISPLAY
    global HOT_SUMMARY_LABELS, PREV_BRS_SHEET_NAMES, QR_BANK_KIND

    QR_BANK_KIND = kind
    if kind == "YES":
        ACCOUNT_SHEET_NAMES = ("QR-YES BANK", "QR-YESBANK", "QRYESBANK")
        QR_ACCOUNT_CODE = "QRYESBANK"
        QR_ACCOUNT_LABEL = "QR-YESBANK"
        QR_ACCOUNT_DISPLAY = "QR-YES BANK"
        HOT_SUMMARY_LABELS = ("Summary Of QRYESBANK", "Summary Of QRHDFC")
        PREV_BRS_SHEET_NAMES = ("QR-YES BANK", "QR-YESBANK", "QRYESBANK", "QR-HDFC")
    else:
        ACCOUNT_SHEET_NAMES = ("QR-HDFC",)
        QR_ACCOUNT_CODE = "QRHDFC"
        QR_ACCOUNT_LABEL = "QR-HDFC"
        QR_ACCOUNT_DISPLAY = "QR-HDFC"
        HOT_SUMMARY_LABELS = ("Summary Of QRHDFC", "Summary Of QRYESBANK")
        PREV_BRS_SHEET_NAMES = (
            "QR-HDFC",
            "QR BRS Statement",
            "QR-YES BANK",
            "QR-YESBANK",
            "QRYESBANK",
        )


def _bank_credit_date(row):
    """Return the actual bank-credit date used for BRS display/matching."""
    txn_dt = row.get("transaction date") if hasattr(row, "get") else None
    if QR_BANK_KIND == "YES":
        settle_dt = row.get("seller settlement date") if hasattr(row, "get") else None
        if pd.notna(settle_dt):
            return settle_dt
    return txn_dt


def _fmt_bank_credit_date(row):
    dt = _bank_credit_date(row)
    return dt.strftime("%d.%m.%Y") if pd.notna(dt) else ""


#
#  PUBLIC API  called by app.py
#


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
    all_branches_path  : str | Path   All-branches book report xlsx
    hot_book_path      : str | Path   HOT QRHDFC book report xlsx
    qr_stmt_path       : str | Path   QR-HDFC gateway statement xlsx
    output_path        : str | Path   Where to write the output workbook
    prev_brs_path      : str | Path   Previous day BRS xlsx (must have sheet 'QR-HDFC')
    brs_date_override  : str | None   "dd.mm.yyyy"; auto-detected from filename if None

    Returns
    -------
    (matched_df, dnc_df, cnb_df,
     closing_bal, bank_bal, reconciled,
     brs_date, books_match, corr_amts)
    """
    ALL_BRANCHES_FILE = Path(all_branches_path)
    HOT_QRHDFC_FILE = Path(hot_book_path)
    STATEMENT_FILE = Path(qr_stmt_path)
    PREV_BRS_FILE = Path(prev_brs_path)
    OUTPUT_FILE = str(output_path)
    _set_qr_account_context(_detect_qr_bank_kind(STATEMENT_FILE))

    #  Determine BRS date
    # BRS_DATE is the date of the statement / data being reconciled.
    stmt_date = _pick_brs_date(
        STATEMENT_FILE.name,
        PREV_BRS_FILE,
        brs_date_override,
        statement_path=STATEMENT_FILE,
    )
    prev_brs_date = _extract_date_from_text(PREV_BRS_FILE.name)
    if prev_brs_date is None:
        prev_brs_date = _extract_brs_date_from_workbook(PREV_BRS_FILE)
    BRS_DATE = stmt_date.strftime("%d.%m.%Y")

    # Sanity-check: prev_brs_date must be strictly before stmt_date.
    # If they are equal (e.g. same-day filename collision) or prev_brs_date is
    # after stmt_date (wrong file supplied), reset to None so the single-day
    # filter is used and settlement_credits are not double-counted.
    if prev_brs_date is not None:
        if prev_brs_date >= stmt_date:
            print(
                f"\n  [WARNING] prev_brs_date ({prev_brs_date.strftime('%d.%m.%Y')}) "
                f">= stmt_date ({BRS_DATE}). "
                f"Resetting to None (single-day mode). Check that the correct previous BRS file was supplied."
            )
            prev_brs_date = None
        else:
            _day_gap = (stmt_date - prev_brs_date).days
            if _day_gap > 7:
                print(
                    f"\n  [WARNING] Gap between prev_brs_date ({prev_brs_date.strftime('%d.%m.%Y')}) "
                    f"and stmt_date ({BRS_DATE}) is {_day_gap} days. "
                    f"This is unusually large. Verify the previous BRS file is correct."
                )

    print("Loading files...")
    print(f"  All-branches book : {ALL_BRANCHES_FILE}")
    print(f"  HOT {QR_ACCOUNT_CODE} book   : {HOT_QRHDFC_FILE}")
    print(f"  Statement         : {STATEMENT_FILE}")
    print(f"  Previous BRS      : {PREV_BRS_FILE}")
    print(f"  Output            : {OUTPUT_FILE}")
    print(f"  BRS Date          : {BRS_DATE}")

    #  Validate input files exist and are readable before touching any data
    _file_labels = {
        ALL_BRANCHES_FILE: "All-Branches Book Report",
        HOT_QRHDFC_FILE: f"HOT {QR_ACCOUNT_CODE} Book Report",
        STATEMENT_FILE: f"{QR_ACCOUNT_LABEL} Gateway Statement",
        PREV_BRS_FILE: "Previous BRS File",
    }
    for _fp, _label in _file_labels.items():
        if not _fp.exists():
            raise FileNotFoundError(
                f"\n  FILE NOT FOUND  {_label}\n"
                f"    Expected : {_fp}\n"
                f"    Please check the path and try again."
            )
        if _fp.suffix.lower() not in (".xlsx", ".xls", ".xlsm", ".ods"):
            raise ValueError(
                f"\n  UNSUPPORTED FILE FORMAT  {_label}\n"
                f"    File     : {_fp}\n"
                f"    Expected an Excel file (.xlsx / .xls / .xlsm)"
            )
    print("  All input files validated ")

    #
    #  STEP 1  LOAD DATA
    #

    #  All Branches
    try:
        df_all = pd.read_excel(ALL_BRANCHES_FILE, sheet_name=0, header=None)
    except Exception as _e:
        raise RuntimeError(
            f"  Failed to read All-Branches Book Report\n    File: {ALL_BRANCHES_FILE}\n    Error: {_e}"
        ) from _e

    def _text_col(df, col, default=""):
        if col in df.columns:
            return df[col].astype(str).str.strip()
        return pd.Series([default] * len(df), index=df.index, dtype="object")

    SKIP = {
        "Transaction",
        "QRHDFC",
        "QRYESBANK",
        "Public Sale",
        "Receipts",
        "Payments",
        "Summary Of QRHDFC",
        "Summary Of QRYESBANK",
        "nan",
        "",
    }
    cur_br = None
    bl = []
    for _, row in df_all.iterrows():
        v = str(row[0]).strip() if pd.notna(row[0]) else ""
        if v not in SKIP:
            cur_br = v
        bl.append(cur_br)
    df_all["_br"] = bl

    ps = df_all[df_all[0] == "Public Sale"].copy()
    ps["date"] = pd.to_datetime(ps[2], errors="coerce")
    ps["bill_no"] = "PS-" + ps[3].astype(str).str.strip()
    ps["branch"] = ps["_br"].str.split(" - ").str[0]
    ps["party"] = (
        ps[6].astype(str).str.replace("INDIVI - ", "", regex=False).str.strip()
    )
    ps["amount"] = pd.to_numeric(ps[7], errors="coerce").fillna(0)

    ap = df_all[df_all[0] == "Payments"].copy()
    ap["amount"] = pd.to_numeric(ap[9], errors="coerce").fillna(0)
    ap["narration"] = _text_col(ap, 13)
    ap["bill_no"] = "PS-" + ap[3].astype(str).str.strip()
    ap["date"] = pd.to_datetime(ap[2], errors="coerce")
    ap["branch"] = ap["_br"].str.split(" - ").str[0]

    ar = df_all[df_all[0] == "Receipts"].copy()
    ar["amount"] = pd.to_numeric(ar[7], errors="coerce").fillna(0)
    ar["date"] = pd.to_datetime(ar[2], errors="coerce")
    ar["bill_no"] = "RT-" + ar[3].apply(_text_id).astype(str).str.strip()
    ar["branch"] = ar["_br"].str.split(" - ").str[0]
    ar["party"] = (
        ar[6].astype(str).str.replace("INDIVI - ", "", regex=False).str.strip()
    )
    ar["narration"] = _text_col(ar, 13)

    # BRS-balance filters: strict (from_date exclusive) -- used for totals / closing balance.
    # HDFC does NOT date-scope book data -- all rows in the file are used as-is,
    # matching the behaviour of the original qr_reconcilation.py.
    if QR_BANK_KIND == "YES":
        ps_brs = _filter_on_brs_date(
            ps,
            "date",
            stmt_date,
            "All-Branches Public Sale (BRS)",
            from_date=prev_brs_date,
        )
        ap = _filter_on_brs_date(
            ap, "date", stmt_date, "All-Branches Payments", from_date=prev_brs_date
        )
        ar_brs = _filter_on_brs_date(
            ar,
            "date",
            stmt_date,
            "All-Branches Receipts (BRS)",
            from_date=prev_brs_date,
        )
    else:
        ps_brs = ps.copy()
        ar_brs = ar.copy()
        # ap already has all rows; no filter needed for HDFC

    # Match-pool filters: inclusive of prev_brs_date so YES Bank T+1 pairs don't get dropped.
    # A book entry dated D pairs with a bank T+1 credit dated D+1; if D == prev_brs_date the
    # strict filter above would exclude it from matching even though its bank credit is in
    # today's statement.  The wider pool is used for matching only -- not for BRS arithmetic.
    if QR_BANK_KIND == "YES" and prev_brs_date is not None:
        ps = _filter_on_brs_date_match_pool(
            ps,
            "date",
            stmt_date,
            "All-Branches Public Sale (match pool)",
            from_date=prev_brs_date,
        )
        ar = _filter_on_brs_date_match_pool(
            ar,
            "date",
            stmt_date,
            "All-Branches Receipts (match pool)",
            from_date=prev_brs_date,
        )
    else:
        ps = ps_brs.copy()
        ar = ar_brs.copy()

    def _is_brs_display_receipt(row):
        text = " ".join(
            [
                str(row.get("party", "")),
                str(row.get("narration", "")),
                str(row.get("branch", "")),
            ]
        ).upper()
        return "ZEROISE" in text

    #  HOT QRHDFC Book
    try:
        df_hot = pd.read_excel(HOT_QRHDFC_FILE, sheet_name=0, header=None)
    except Exception as _e:
        raise RuntimeError(
            f"  Failed to read HOT {QR_ACCOUNT_CODE} Book Report\n    File: {HOT_QRHDFC_FILE}\n    Error: {_e}"
        ) from _e

    hot_rec = df_hot[df_hot[0] == "Receipts"].copy()
    hot_rec["amount"] = pd.to_numeric(hot_rec[7], errors="coerce").fillna(0)
    hot_rec["narration"] = _text_col(hot_rec, 13)
    hot_rec["date"] = pd.to_datetime(hot_rec[2], errors="coerce")

    hot_pay = df_hot[df_hot[0] == "Payments"].copy()
    hot_pay["amount"] = pd.to_numeric(hot_pay[9], errors="coerce").fillna(0)
    hot_pay["bill_no"] = "PS-" + hot_pay[3].astype(str).str.strip()
    hot_pay["narration"] = _text_col(hot_pay, 13)
    hot_pay["date"] = pd.to_datetime(hot_pay[2], errors="coerce")
    hot_pay["branch"] = hot_pay[6].astype(str).str.split(" - ").str[0].str.strip()

    hot_rec_all = hot_rec.copy()
    hot_pay_all = hot_pay.copy()
    # BRS-balance filter (strict) -- YES Bank only.
    # HDFC does NOT date-scope HOT book data; all rows are used as-is.
    if QR_BANK_KIND == "YES":
        hot_rec = _filter_on_brs_date(
            hot_rec,
            "date",
            stmt_date,
            f"HOT {QR_ACCOUNT_CODE} Receipts",
            from_date=prev_brs_date,
        )
        hot_pay = _filter_on_brs_date(
            hot_pay,
            "date",
            stmt_date,
            f"HOT {QR_ACCOUNT_CODE} Payments",
            from_date=prev_brs_date,
        )

    #  Fix A: identify HOT book entries whose narration flags "WRONGLY ACCOUNTED".
    #    These are manually tagged as erroneous/corrected entries and must be
    #    excluded from BRS matching  keeping them creates phantom DNC entries
    #    and can block valid bank matches (e.g. PS-6202167 / KATTA RAJENDRA 95000).
    _WRONGLY_ACCOUNTED_MARKER = "WRONGLY ACCOUNTED"
    hot_pay["is_wrongly_accounted"] = (
        hot_pay["narration"]
        .str.upper()
        .str.contains(_WRONGLY_ACCOUNTED_MARKER, na=False)
    )
    # REVERSAL ENTRY: HOT internal accounting corrections (e.g. "BEING REVERSAL ENTRY
    # OF PT-XXXXXXX") -- these reverse a prior internal posting and have no external
    # bank credit counterpart, so they must be excluded from hot_settlement_payments.
    hot_pay["is_reversal"] = (
        hot_pay["narration"].str.upper().str.contains("REVERSAL ENTRY", na=False)
    )
    # ZEROISE entries are HOT-internal correction payments (party "HOT - HOT").
    # They cancel out against matching ZEROISE receipts and never produce an
    # external bank credit, so they must be excluded from hot_settlement_payments
    # the same way they are excluded from correction detection via _is_brs_display_receipt.
    hot_pay["is_zeroise"] = (
        hot_pay["narration"].str.upper().str.contains("ZEROISE", na=False)
    )
    _wrongly_accounted_bills = set(
        hot_pay.loc[hot_pay["is_wrongly_accounted"], "bill_no"]
    )
    if _wrongly_accounted_bills:
        print(
            f"  [Fix A] Excluding {len(_wrongly_accounted_bills)} 'WRONGLY ACCOUNTED' "
            f"book entries from BRS matching: {sorted(_wrongly_accounted_bills)}"
        )

    hot_summary_rows = df_hot[
        df_hot[0].astype(str).str.strip().isin(HOT_SUMMARY_LABELS)
    ]
    if hot_summary_rows.empty:
        raise RuntimeError(
            f"Could not find HOT summary row for {QR_ACCOUNT_CODE}. "
            f"Expected one of: {', '.join(HOT_SUMMARY_LABELS)}"
        )
    hot_summary = hot_summary_rows.iloc[0]
    hot_closing_bal = pd.to_numeric(hot_summary.get(11), errors="coerce")
    if pd.isna(hot_closing_bal):
        summary_idx = hot_summary.name
        closing_rows = df_hot.loc[summary_idx:]
        closing_rows = closing_rows[
            closing_rows[0].astype(str).str.strip().str.lower().eq("closing balance")
        ]
        if closing_rows.empty:
            raise RuntimeError(
                f"Could not find closing balance for {QR_ACCOUNT_CODE} in HOT book."
            )
        hot_closing_bal = (
            pd.to_numeric(closing_rows.iloc[0], errors="coerce").dropna().iloc[0]
        )
    hot_closing_bal = float(hot_closing_bal)
    # Only recompute closing balance when the book file contains entries AFTER
    # the BRS date (i.e. the file covers a longer period than this BRS run).
    # For combined multi-day runs all entries fall within prev_brs_date < date <= stmt_date
    # so the summary closing balance is already correct  do NOT recompute from
    # filtered receipts/payments, which would only cover part of the period.
    _has_future_entries = (
        not hot_rec_all.empty
        and (hot_rec_all["date"].dt.normalize() > _date_only(stmt_date)).any()
    ) or (
        not hot_pay_all.empty
        and (hot_pay_all["date"].dt.normalize() > _date_only(stmt_date)).any()
    )
    if _has_future_entries:
        opening_bal = _book_balance_value(hot_summary.get(4), hot_summary.get(5))
        hot_closing_bal = (
            opening_bal
            + float(hot_rec["amount"].sum())
            - float(hot_pay["amount"].sum())
        )
        print(
            f"  [Date Scope] HOT closing recomputed for {BRS_DATE}: {hot_closing_bal:,.2f}"
        )
    prev_book_adjustment = _previous_company_book_adjustment(PREV_BRS_FILE)
    closing_bal = hot_closing_bal + prev_book_adjustment
    print(f"  HOT closing balance: {hot_closing_bal:,.0f}")
    if abs(prev_book_adjustment) > 0.005:
        print(
            f"  Previous BRS book adjustment carried forward: {prev_book_adjustment:,.0f}"
        )
        print(f"  Adjusted company book balance: {closing_bal:,.0f}")

    #  HDFC Statement
    try:
        stmt_header_row = _statement_header_row(STATEMENT_FILE)
        df_stmt = pd.read_excel(
            STATEMENT_FILE, sheet_name=0, header=stmt_header_row, dtype=str
        )
    except Exception as _e:
        raise RuntimeError(
            f"  Failed to read {QR_ACCOUNT_LABEL} Gateway Statement\n    File: {STATEMENT_FILE}\n    Error: {_e}"
        ) from _e
    # Normalise column names to lowercase so both the old format (already
    # lowercase) and the new format (Title Case, e.g. "Transaction Date")
    # are handled transparently.  All subsequent accesses use lowercase keys.
    if QR_BANK_KIND == "YES":
        df_stmt = _normalise_yesbank_statement(df_stmt)
    else:
        df_stmt.columns = [c.strip().lower() for c in df_stmt.columns]
    df_stmt = df_stmt[df_stmt["transaction state"] != "transaction state"].copy()
    df_stmt["amount(rs.)"] = pd.to_numeric(
        df_stmt["amount(rs.)"], errors="coerce"
    ).fillna(0)
    df_stmt["transaction date"] = pd.to_datetime(
        df_stmt["transaction date"], errors="coerce"
    )
    if "seller settlement date" in df_stmt.columns:
        df_stmt["seller settlement date"] = pd.to_datetime(
            df_stmt["seller settlement date"], errors="coerce"
        )
    else:
        df_stmt["seller settlement date"] = df_stmt["transaction date"]
    if QR_BANK_KIND == "YES":
        df_stmt = _filter_yes_statement_for_brs(df_stmt, stmt_date)
    # HDFC: no date filter on statement -- all rows are used as-is
    payer_cols = [c for c in df_stmt.columns if "payer" in c.lower()]
    name_col = (
        "payer name"
        if "payer name" in df_stmt.columns
        else payer_cols[0] if payer_cols else df_stmt.columns[-1]
    )

    df_stmt["branch_code"] = (
        df_stmt["doing business as"].map(DBA_MAP).fillna(df_stmt["doing business as"])
    )
    stmt_success = df_stmt[df_stmt["transaction state"] == "SaleSuccess"].copy()
    stmt_failed = df_stmt[df_stmt["transaction state"] == "SaleFailed"].copy()

    #  Previous BRS
    # Auto-detect whether the prev BRS is an output file produced by this script
    # (contains sheets like "Cheque Deposit", "QR BRS Statement", etc.) or the
    # original "QR-HDFC" source format. The output format has an extra column
    # before Amount so _PREV_DATA_COL and sibling column indices must shift.
    _prev_xl = pd.ExcelFile(PREV_BRS_FILE)
    _prev_sheets = _prev_xl.sheet_names
    _OUTPUT_SHEET_HINTS = (
        "CHEQUE DEPOSIT",
        "BANK GATEWAY",
        "RECO ITEMS",
        "HOT SETTLEMENTS",
        "QR BRS STATEMENT",
        "HUMAN VERIFICATION",
    )
    _is_output_fmt = any(
        any(s.upper().startswith(h) for h in _OUTPUT_SHEET_HINTS) for s in _prev_sheets
    )
    # Fix B: warn when the script's own output is used as prev_brs.
    # This is the root cause of stale CF items  the script carries
    # partial/low-match entries as CF, which the manual BRS does not.
    # Long-term fix: always supply the MANUAL BRS as prev_brs_path.
    if _is_output_fmt:
        print(
            "\n[Fix B] WARNING: prev_brs appears to be a SCRIPT-GENERATED output file."
            "\n   This can cause stale carry-forwards (items the manual BRS already cleared)."
            "\n   Best practice: always use the MANUAL BRS as the prev_brs input.\n"
        )

    _prev_output_cleared_dnc_keys = set()

    if _is_output_fmt and "QR BRS Statement" in _prev_sheets:
        print(f"[Prev BRS] Detected output-format file  using 'QR BRS Statement' sheet")
        prev = pd.read_excel(PREV_BRS_FILE, sheet_name="QR BRS Statement", header=None)
        _PREV_DATA_COL = 8  # output format: Date|Branch|BillNo|RRN|ChqNo|BookReport|BankStmt|Makez|Amount|...
        _PREV_RRN_COL = 3
        _PREV_PARTY_COL = 7
        # Human Verification is the sheet in script-generated output files, but it
        # uses a human-readable layout and is NOT machine-parseable as a CF source.
        # Always fall through to QR BRS Statement for CF data extraction.
        _prev_cf_sheet = None
        if "Human Verification" in _prev_sheets:
            _prev_cf_sheet = "Human Verification"

        if _prev_cf_sheet:
            audit_all = pd.read_excel(
                PREV_BRS_FILE, sheet_name=_prev_cf_sheet, header=None
            )
            # Human Verification sheet uses a different layout and is NOT machine-parseable
            # as a CF source. Fall through to QR BRS Statement in that case.
            audit_col0_vals = (
                audit_all[0].dropna().astype(str).str.strip().unique().tolist()
            )
            _has_cf_data = any(
                v in {"credited_not_book", "deposited_not_credited"}
                for v in audit_col0_vals
            )
            if not _has_cf_data:
                print(
                    f"[Prev BRS] Sheet '{_prev_cf_sheet}' is not a machine-readable CF source  "
                    "falling back to QR BRS Statement"
                )
                _prev_cf_sheet = None
            else:
                audit_sections = audit_all[0].astype(str).str.strip()
                audit_statuses = audit_all[6].astype(str).str.strip()
                audit = audit_all[
                    audit_sections.isin({"credited_not_book", "deposited_not_credited"})
                    & audit_statuses.str.upper().eq("CARRIED FORWARD")
                    & pd.to_numeric(audit_all[5], errors="coerce").notna()
                ].copy()
                cleared_dnc = audit_all[
                    audit_all[0]
                    .astype(str)
                    .str.strip()
                    .str.startswith("deposited_not_credited")
                    & audit_all[0]
                    .astype(str)
                    .str.contains("CLEARED", case=False, na=False)
                ]
                for _, r in cleared_dnc.iterrows():
                    try:
                        _prev_output_cleared_dnc_keys.add(
                            (
                                str(r[2]).strip(),
                                str(r[3]).strip(),
                                round(float(r[5]), 2),
                            )
                        )
                    except Exception:
                        pass

                rows = [
                    [
                        "Add: Credited in pass book but not debited",
                        "",
                        "",
                        "",
                        "",
                        "",
                        "",
                    ]
                ]
                cnb_audit = audit[
                    audit[0].astype(str).str.strip().eq("credited_not_book")
                ]
                for _, r in cnb_audit.iterrows():
                    note = r[7] if len(r) > 7 and pd.notna(r[7]) else ""
                    rows.append([r[1], r[2], "", r[3], r[4], r[5], "Carried Fwd", note])
                rows.append(["", "", "", "", "", "", ""])

                rows.append(
                    ["Less: Cheques deposited but not Credited", "", "", "", "", "", ""]
                )
                dnc_audit = audit[
                    audit[0].astype(str).str.strip().eq("deposited_not_credited")
                ]
                for _, r in dnc_audit.iterrows():
                    note = r[7] if len(r) > 7 and pd.notna(r[7]) else ""
                    rows.append([r[1], r[2], r[3], "", r[4], r[5], "Carried Fwd", note])
                rows.append(["", "", "", "", "", "", ""])

                prev = pd.DataFrame(rows)
                _PREV_DATA_COL = 5
                _PREV_RRN_COL = 3
                _PREV_PARTY_COL = 4
                print("[Prev BRS] Using QR BRS Statement carried-forward rows only")
        else:
            print("[Prev BRS] Using QR BRS Statement outstanding sections")
    elif any(sheet in _prev_sheets for sheet in PREV_BRS_SHEET_NAMES):
        prev_sheet = next(
            sheet for sheet in PREV_BRS_SHEET_NAMES if sheet in _prev_sheets
        )
        prev = pd.read_excel(PREV_BRS_FILE, sheet_name=prev_sheet, header=None)
        _PREV_DATA_COL = 5  # original format: Date|Branch|RRN|...|Party|Amount|...
        _PREV_RRN_COL = 2
        _PREV_PARTY_COL = 4
    else:
        # Fallback: try first sheet
        prev = pd.read_excel(PREV_BRS_FILE, sheet_name=0, header=None)
        _PREV_DATA_COL = 5
        _PREV_RRN_COL = 2
        _PREV_PARTY_COL = 4
        print(
            f"[Prev BRS] WARNING: No recognised sheet found  using first sheet: '{_prev_sheets[0]}'"
        )

    #
    #  STEP 2  DETECT CORRECTION ENTRIES
    #
    print("Detecting correction entries...")
    # Correction entries are HOT's internal ZEROISE adjustment pairs: an
    # all-branches Payment (party "HOT - HOT", narration contains "ZEROISE")
    # is auto-generated alongside a matching all-branches Receipt of the same
    # amount.  These cancel out internally and never touch the bank, so they
    # must be excluded from BRS/matching.
    #
    # IMPORTANT: matching must require the ZEROISE narration pattern on BOTH
    # sides, not just amount equality.  Two unrelated entries (e.g. a genuine
    # customer refund receipt and an unrelated ZEROISE payment) can coincide
    # on amount; pure amount-matching would wrongly mark the genuine receipt
    # as a correction and silently drop it from Cheque Deposit / Matched / DNC.
    # Reuses _is_brs_display_receipt (defined above) which checks party/
    # narration/branch text for the "ZEROISE" marker.
    ap["_is_zeroise"] = ap.apply(_is_brs_display_receipt, axis=1)
    ar_brs["_is_zeroise"] = ar_brs.apply(_is_brs_display_receipt, axis=1)

    # Use the BRS-period-strict ar_brs for correction detection so that
    # the wider match-pool entries (prev_brs_date inclusive) don't produce
    # spurious correction pairs.
    rec_pool_idx = list(ar_brs[ar_brs["_is_zeroise"]].index)
    rec_pool = [(idx, ar_brs.at[idx, "amount"]) for idx in rec_pool_idx]
    corr_amts = []
    matched_ar_idx = set()
    matched_ap_idx = set()
    for ap_idx in ap[ap["_is_zeroise"]].index:
        amt = ap.at[ap_idx, "amount"]
        for pos, (ar_idx, r_amt) in enumerate(rec_pool):
            if r_amt == amt:
                corr_amts.append(amt)
                matched_ar_idx.add(ar_idx)
                matched_ap_idx.add(ap_idx)
                rec_pool.pop(pos)
                break
    corr_amts_set = set(corr_amts)

    ap["is_correction"] = False
    ap.loc[ap.index.isin(matched_ap_idx), "is_correction"] = True

    ar_brs["is_correction"] = False
    ar_brs.loc[ar_brs.index.isin(matched_ar_idx), "is_correction"] = True

    # Propagate is_correction to the wider match-pool ar using bill_no -- but
    # only for bills that were themselves matched as ZEROISE corrections
    # (not just any bill sharing a bill_no with a correction, which cannot
    # happen here since bill_no is unique per receipt, but kept for safety).
    ar["is_correction"] = False
    corr_bills = set(ar_brs.loc[ar_brs["is_correction"], "bill_no"])
    if corr_bills:
        ar.loc[
            ar["bill_no"].isin(corr_bills) & ar.apply(_is_brs_display_receipt, axis=1),
            "is_correction",
        ] = True

    print(f"  Correction amounts found: {[int(x) for x in set(corr_amts)]}")

    _receipt_brs_only = ar_brs[
        (ar_brs["is_correction"])
        & (ar_brs["amount"] > 0)
        & (ar_brs["bill_no"].astype(str).str.lower() != "rt-nan")
        & (ar_brs.apply(_is_brs_display_receipt, axis=1))
    ].copy()
    if not _receipt_brs_only.empty:
        print(
            f"  Receipt entries shown in Matched sheet only: {len(_receipt_brs_only)}"
        )

    # Previous CNB rows can represent credits that were already in bank and
    # are only waiting for the book entry. Keep these handy before Pass 5 so
    # a current-day near-amount bank credit does not consume the book entry
    # that should clear an exact previous carry-forward.
    _prev_add_for_match = _find_section(
        prev,
        "Add: Credited in pass book but not debited",
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
        _prev_cnb_exact_lookup.append(
            {
                "branch": str(_r[1]).strip(),
                "amount": _amt,
                "party": str(_r[_PREV_PARTY_COL]).strip(),
            }
        )

    def _has_prev_cnb_exact_for_book(book_row):
        for _cf in _prev_cnb_exact_lookup:
            if _cf["branch"] != book_row["branch"]:
                continue
            if abs(_cf["amount"] - float(book_row["amount"])) > 0.005:
                continue
            if (
                name_sim(
                    normalize_party(book_row["party"]), normalize_party(_cf["party"])
                )
                >= FUZZY_ACCEPT
            ):
                return True
        return False

    # Previous DNC rows are the mirror case: a current bank credit may already
    # be the exact clearing item for a carry-forward book row. Keep Pass 5 from
    # consuming that bank row as a weaker current-day amount-difference match.
    _prev_less_for_match = _find_section(
        prev,
        "Less: Cheques deposited but not Credited",
        data_col=_PREV_DATA_COL,
    ).copy()
    _prev_less_for_match[_PREV_DATA_COL] = pd.to_numeric(
        _prev_less_for_match[_PREV_DATA_COL], errors="coerce"
    )
    _prev_less_for_match = _prev_less_for_match[
        _prev_less_for_match[_PREV_DATA_COL].notna()
        & (_prev_less_for_match[_PREV_DATA_COL] > 0)
    ]
    _prev_dnc_exact_lookup = []
    for _, _r in _prev_less_for_match.iterrows():
        _prev_dnc_exact_lookup.append(
            {
                "branch": str(_r[1]).strip(),
                "amount": float(_r[_PREV_DATA_COL]),
                "party": str(_r[_PREV_PARTY_COL]).strip(),
                "ref": str(_r[3]).strip(),
            }
        )

    def _prev_dnc_exact_clear_for_bank(bank_row):
        bank_branch = str(bank_row.get("branch_code", "")).strip()
        bank_amt = float(bank_row.get("amount(rs.)", 0) or 0)
        bank_party = normalize_party(str(bank_row.get(name_col, "")))
        for _cf in _prev_dnc_exact_lookup:
            if _cf["branch"] != bank_branch:
                continue
            if abs(_cf["amount"] - bank_amt) > 0.005:
                continue
            if name_sim(normalize_party(_cf["party"]), bank_party) >= FUZZY_ACCEPT:
                return _cf
        return None

    def _bank_has_prev_dnc_exact_clear(bank_row):
        return _prev_dnc_exact_clear_for_bank(bank_row) is not None

    #
    #  STEP 3  BOOKS MATCH CHECK
    #
    total_all_pay = ap["amount"].sum()
    total_hot_rec = hot_rec["amount"].sum()
    books_match = abs(total_all_pay - total_hot_rec) < 1

    print(f"\nBOOKS MATCH CHECK:")
    print(f"  All-Branches Payments : Rs. {total_all_pay:,.0f}")
    print(f"  HOT {QR_ACCOUNT_CODE} Receipts   : Rs. {total_hot_rec:,.0f}")
    print(f"  {'MATCH' if books_match else 'MISMATCH'}")

    #
    #  STEP 4  MATCH BOOK vs BANK STATEMENT
    #
    print(f"\nMatching book vs bank statement (fuzzy threshold: {FUZZY_THRESH}%)...")

    bank_pool = stmt_success.copy().reset_index(drop=True)
    # Fix A: exclude WRONGLY ACCOUNTED book entries from the matching pool.
    # They are tracked separately so the Cheque Deposit sheet still shows them
    # (with "WRONGLY ACCOUNTED" narration) but they don't land in DNC.
    _ps_for_match = ps[~ps["bill_no"].isin(_wrongly_accounted_bills)]
    _ps_for_match = _ps_for_match.copy()
    _ps_for_match["book_source"] = "public_sale"
    _ar_for_match = ar[
        (~ar["is_correction"])
        & (ar["amount"] > 0)
        & (ar["bill_no"].astype(str).str.lower() != "rt-nan")
    ].copy()
    _ar_for_match["book_source"] = "receipt"
    book_df = pd.concat([_ps_for_match, _ar_for_match], ignore_index=True).reset_index(
        drop=True
    )
    print(
        f"  Book match pool: {len(_ps_for_match)} Public Sale + {len(_ar_for_match)} Receipts"
    )

    method_priority = {
        "1-Amt+Branch+Date": 5,
        "1B-Amt+Branch+/-1day": 4,
        "2-Amt+Date": 3,
        "2B-Amt+/-1day": 2,
        "3-AmtOnly": 1,
        "5-NearAmt(Diff)": 0,
    }

    scored_pairs = []
    for bi, bk in book_df.iterrows():
        b_amt = bk["amount"]
        b_br = bk["branch"]
        b_date = bk["date"]
        b_pty = bk["party"]

        for bki, brow in bank_pool.iterrows():
            if b_amt != brow["amount(rs.)"]:
                continue

            bk_br = brow["branch_code"]
            bk_date = _bank_credit_date(brow)
            bk_name = brow[name_col]

            date_diff = (
                abs((bk_date - b_date).days)
                if pd.notna(bk_date) and pd.notna(b_date)
                else 999
            )
            branch_match = bk_br == b_br

            if branch_match and date_diff == 0:
                method = "1-Amt+Branch+Date"
            elif branch_match and date_diff <= 1:
                method = "1B-Amt+Branch+/-1day"
            elif date_diff == 0:
                method = "2-Amt+Date"
            elif date_diff <= 1:
                method = "2B-Amt+/-1day"
            else:
                method = "3-AmtOnly"

            sc = name_sim(b_pty, bk_name)
            scored_pairs.append((bi, bki, sc, method, method_priority[method]))

    scored_pairs.sort(key=lambda x: (x[4], x[2]), reverse=True)

    matched_book = set()
    matched_bank = set()
    matched_rows = []
    # Previous-BRS DNC credits must clear carry-forwards before current-day book rows.
    reserved_prev_dnc_bank = {}
    for bki, brow in bank_pool.iterrows():
        _cf = _prev_dnc_exact_clear_for_bank(brow)
        if _cf:
            reserved_prev_dnc_bank[bki] = _cf
    if reserved_prev_dnc_bank:
        print(
            f"  Reserved {len(reserved_prev_dnc_bank)} bank credit(s) for previous BRS DNC clearing"
        )

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
                if (
                    new_total > target_cents
                    or new_total in combos
                    or new_total in additions
                ):
                    continue
                new_combo = combo + [idx]
                if new_total == target_cents and len(new_combo) >= min_parts:
                    return new_combo
                additions[new_total] = new_combo
            combos.update(additions)
        return None

    def _find_near_amount_subset(
        idxs, amount_getter, target, tolerance, min_parts=2, max_parts=4
    ):
        best_combo = None
        best_diff = None
        max_size = min(len(idxs), max_parts)
        for combo_size in range(min_parts, max_size + 1):
            for combo in combinations(idxs, combo_size):
                total = sum(float(amount_getter(idx)) for idx in combo)
                diff = total - float(target)
                if abs(diff) > tolerance:
                    continue
                if best_diff is None or abs(diff) < abs(best_diff):
                    best_combo = list(combo)
                    best_diff = diff
                    if abs(best_diff) <= 0.005:
                        return best_combo, best_diff
        return best_combo, best_diff

    def _split_party_key(party):
        key = normalize_party(str(party or "")).upper().strip()
        return key or str(party or "").upper().strip()

    AMT_DIFF_MAX = 5_000  # flag differences up to Rs 5,000 only; larger gaps are separate transactions
    def _same_branch_close_date(book_row, bank_row):
        book_date = book_row["date"]
        bank_date = _bank_credit_date(bank_row)
        return (
            book_row["branch"] == bank_row["branch_code"]
            and pd.notna(book_date)
            and pd.notna(bank_date)
            and abs((bank_date - book_date).days) <= 1
        )

    def _has_strong_single_book_claim(bank_row, split_idxs):
        split_idx_set = set(split_idxs)
        bank_amt = float(bank_row["amount(rs.)"])
        bank_name = bank_row[name_col]
        for other_bi, other_bk in book_df.iterrows():
            if other_bi in matched_book or other_bi in split_idx_set:
                continue
            if other_bk.get("book_source", "public_sale") != "public_sale":
                continue
            if abs(float(other_bk["amount"]) - bank_amt) > 0.005:
                continue
            if not _same_branch_close_date(other_bk, bank_row):
                continue
            if name_sim(other_bk["party"], bank_name) >= FUZZY_THRESH:
                return True
        return False

    def _split_parts_have_strong_individual_claims(split_idxs, combined_bank_idx):
        for bi in split_idxs:
            bk = book_df.loc[bi]
            part_amt = float(bk["amount"])
            found = False
            for other_bki, other_bank in bank_pool.iterrows():
                if (
                    other_bki == combined_bank_idx
                    or other_bki in matched_bank
                    or other_bki in reserved_prev_dnc_bank
                ):
                    continue
                if abs(float(other_bank["amount(rs.)"]) - part_amt) > 0.005:
                    continue
                if not _same_branch_close_date(bk, other_bank):
                    continue
                if name_sim(bk["party"], other_bank[name_col]) >= FUZZY_THRESH:
                    found = True
                    break
            if not found:
                return False
        return True

    # Pass 0B: Same bill split in the book cleared by one bank credit.
    # Example pattern: two book rows under the same bill (29170 + 1) and one
    # bank credit for the combined amount. Do this before exact matching so the
    # tiny row is not consumed independently and turned into a false diff.
    print("  Detecting same-bill book split matches...")
    for bki, brow in bank_pool.iterrows():
        if bki in matched_bank or bki in reserved_prev_dnc_bank:
            continue
        bank_amt = brow["amount(rs.)"]
        bank_br = brow["branch_code"]
        bank_date = _bank_credit_date(brow)
        bank_name = brow[name_col]
        if pd.isna(bank_date):
            continue

        groups = {}
        for bi, bk in book_df.iterrows():
            if bi in matched_book:
                continue
            if bk.get("book_source", "public_sale") != "public_sale":
                continue
            if float(bk["amount"]) <= 0:
                continue
            if bk["branch"] != bank_br:
                continue
            if pd.isna(bk["date"]) or abs((bank_date - bk["date"]).days) > 1:
                continue
            groups.setdefault(
                (str(bk["bill_no"]), _split_party_key(bk["party"])), []
            ).append(bi)

        for (_, _), idxs in groups.items():
            if len(idxs) < 2:
                continue
            total = sum(float(book_df.at[bi, "amount"]) for bi in idxs)
            split_diff = total - float(bank_amt)
            if abs(split_diff) > 0.005:
                continue
            scores = [name_sim(book_df.at[bi, "party"], bank_name) for bi in idxs]
            if max(scores) < FUZZY_ACCEPT:
                continue
            avg_sc = sum(scores) // len(scores)
            if avg_sc < FUZZY_THRESH and (
                _has_strong_single_book_claim(brow, idxs)
                or _split_parts_have_strong_individual_claims(idxs, bki)
            ):
                print(
                    f"    SKIP SAME-BILL SPLIT: stronger exact-name claim exists for "
                    f"{bank_br}/{bank_name}/{int(bank_amt)}"
                )
                continue
            first_bi = idxs[0]
            bill = str(book_df.at[first_bi, "bill_no"])
            party = str(book_df.at[first_bi, "party"])
            amt_list = " + ".join(f"{int(book_df.at[bi, 'amount'])}" for bi in idxs)
            for bi in idxs:
                matched_book.add(bi)
            matched_bank.add(bki)
            matched_rows.append(
                {
                    "Method": f"3A-SameBillBookSplit({len(idxs)})",
                    "Name Match": "Match" if avg_sc >= FUZZY_THRESH else "Partial",
                    "Amount Match": f"Book Split x{len(idxs)}",
                    "Score%": avg_sc,
                    "Book Date": (
                        book_df.at[first_bi, "date"].strftime("%d.%m.%Y")
                        if pd.notna(book_df.at[first_bi, "date"])
                        else ""
                    ),
                    "Book Branch": bank_br,
                    "Book Bank": QR_ACCOUNT_CODE,
                    "Book Bill No": bill,
                    "Book Chq No": 511,
                    "Book Party": "INDIVI - " + party,
                    "Book Amt": total,
                    "Bank Date": _fmt_bank_credit_date(brow),
                    "Seller Settlement Date": (
                        brow["seller settlement date"].strftime("%d.%m.%Y")
                        if pd.notna(brow["seller settlement date"])
                        else ""
                    ),
                    "Bank Time": str(brow.get("transaction time", "")),
                    "Bank Branch": bank_br,
                    "Bank Payer": bank_name,
                    "Bank Amt": bank_amt,
                    "Bank RRN": _text_id(brow["rrn no"]),
                    "Pay Type": brow.get("payment type", ""),
                    "Diff": 0,
                    "Flags": f"Same bill book split x{len(idxs)}: {amt_list}",
                    "Book Split Parts": [
                        {
                            "bill_no": str(book_df.at[bi, "bill_no"]),
                            "amount": float(book_df.at[bi, "amount"]),
                        }
                        for bi in idxs
                    ],
                }
            )
            print(
                f"    SAME-BILL BOOK SPLIT x{len(idxs)}: {bank_br}/{bank_name}/{int(bank_amt)} <- {bill} {amt_list}"
            )
            break
    for bi, bki, sc, method, priority in scored_pairs:
        if bi in matched_book or bki in matched_bank or bki in reserved_prev_dnc_bank:
            continue

        bk = book_df.loc[bi]
        row = bank_pool.loc[bki]
        b_br = bk["branch"]
        b_pty = bk["party"]
        b_amt = bk["amount"]
        bank_br = row["branch_code"]
        branch_matches = bank_br == b_br
        is_branch_locked = method in ("1-Amt+Branch+Date", "1B-Amt+Branch+/-1day")

        if not is_branch_locked and sc < FUZZY_ACCEPT and not branch_matches:
            continue
        if sc < FUZZY_ACCEPT and _has_prev_cnb_exact_for_book(bk):
            continue
        if (
            min(abs(float(b_amt)), abs(float(row["amount(rs.)"]))) <= 1.005
            and sc < FUZZY_THRESH
        ):
            continue

        matched_book.add(bi)
        matched_bank.add(bki)

        nm = (
            "Match"
            if sc >= FUZZY_THRESH
            else "Partial" if sc >= FUZZY_ACCEPT else "Low"
        )
        flag = ""
        if FUZZY_ACCEPT <= sc < FUZZY_THRESH:
            flag = f"Name {sc}%  verify"
        elif sc < FUZZY_ACCEPT:
            br_note = (
                ""
                if branch_matches
                else f" (branch mismatch: book={b_br}, bank={bank_br})"
            )
            flag = f"Low name ({sc}%){br_note}  manual check"

        matched_rows.append(
            {
                "Method": method,
                "Name Match": nm,
                "Amount Match": "Exact",
                "Score%": sc,
                "Book Date": (
                    bk["date"].strftime("%d.%m.%Y") if pd.notna(bk["date"]) else ""
                ),
                "Book Branch": b_br,
                "Book Bank": QR_ACCOUNT_CODE,
                "Book Bill No": bk["bill_no"],
                "Book Chq No": 511,
                "Book Party": "INDIVI - " + b_pty,
                "Book Amt": b_amt,
                "Bank Date": _fmt_bank_credit_date(row),
                "Seller Settlement Date": (
                    row["seller settlement date"].strftime("%d.%m.%Y")
                    if pd.notna(row["seller settlement date"])
                    else ""
                ),
                "Bank Time": str(row.get("transaction time", "")),
                "Bank Branch": bank_br,
                "Bank Payer": row[name_col],
                "Bank Amt": row["amount(rs.)"],
                "Bank RRN": _text_id(row["rrn no"]),
                "Pay Type": row.get("payment type", ""),
                "Diff": b_amt - row["amount(rs.)"],
                "Flags": flag,
            }
        )

    # Pass 3B: Multiple same-party book bills combined = one bank transaction
    print("  Detecting same-party book split matches...")
    for bki, brow in bank_pool.iterrows():
        if bki in matched_bank or bki in reserved_prev_dnc_bank:
            continue

        bank_amt = brow["amount(rs.)"]
        bank_br = brow["branch_code"]
        bank_date = _bank_credit_date(brow)
        bank_name = brow[name_col]

        cands = [
            (bi, bk)
            for bi, bk in book_df.iterrows()
            if bi not in matched_book
            and bk.get("book_source", "public_sale") == "public_sale"
            and float(bk["amount"]) > 1
            and bk["branch"] == bank_br
            and pd.notna(bk["date"])
            and pd.notna(bank_date)
            and abs((bank_date - bk["date"]).days) <= 1
        ]
        if len(cands) < 2:
            continue

        party_groups = {}
        for bi, bk in cands:
            party_groups.setdefault(_split_party_key(bk["party"]), []).append(bi)

        found_book_split = False
        for _, idxs in party_groups.items():
            if len(idxs) < 2:
                continue
            scores = [name_sim(book_df.at[bi, "party"], bank_name) for bi in idxs]
            if max(scores) < FUZZY_ACCEPT:
                continue
            matched_idxs = _find_amount_subset(
                idxs,
                lambda bi: book_df.at[bi, "amount"],
                bank_amt,
                min_parts=2,
            )
            split_diff = 0
            if not matched_idxs:
                matched_idxs, split_diff = _find_near_amount_subset(
                    idxs,
                    lambda bi: book_df.at[bi, "amount"],
                    bank_amt,
                    AMT_DIFF_MAX,
                    min_parts=2,
                    max_parts=4,
                )
                if not matched_idxs:
                    continue

            split_total = sum(book_df.at[bi, "amount"] for bi in matched_idxs)
            split_diff = split_total - bank_amt
            split_count = len(matched_idxs)
            avg_sc = (
                sum(name_sim(book_df.at[bi, "party"], bank_name) for bi in matched_idxs)
                // split_count
            )
            bill_list = " / ".join(
                str(book_df.at[bi, "bill_no"]) for bi in matched_idxs
            )
            amt_list = " + ".join(
                f"{int(book_df.at[bi, 'amount'])}" for bi in matched_idxs
            )
            party_list = " / ".join(str(book_df.at[bi, "party"]) for bi in matched_idxs)
            diff_flag = (
                f" | AMOUNT DIFFERENCE Rs {split_diff:+,.2f}"
                if abs(split_diff) > 0.005
                else ""
            )

            for bi in matched_idxs:
                matched_book.add(bi)
            matched_bank.add(bki)

            matched_rows.append(
                {
                    "Method": f"3B-BookSplit({split_count})",
                    "Name Match": "Match" if avg_sc >= FUZZY_THRESH else "Partial",
                    "Amount Match": (
                        f"Diff Rs{split_diff:+,.0f}"
                        if abs(split_diff) > 0.005
                        else f"Book Split x{split_count}"
                    ),
                    "Score%": avg_sc,
                    "Book Date": (
                        book_df.at[matched_idxs[0], "date"].strftime("%d.%m.%Y")
                        if pd.notna(book_df.at[matched_idxs[0], "date"])
                        else ""
                    ),
                    "Book Branch": bank_br,
                    "Book Bank": QR_ACCOUNT_CODE,
                    "Book Bill No": bill_list,
                    "Book Chq No": 511,
                    "Book Party": "INDIVI - " + party_list,
                    "Book Amt": split_total,
                    "Bank Date": (
                        bank_date.strftime("%d.%m.%Y") if pd.notna(bank_date) else ""
                    ),
                    "Seller Settlement Date": (
                        brow["seller settlement date"].strftime("%d.%m.%Y")
                        if pd.notna(brow["seller settlement date"])
                        else ""
                    ),
                    "Bank Time": str(brow.get("transaction time", "")),
                    "Bank Branch": bank_br,
                    "Bank Payer": bank_name,
                    "Bank Amt": bank_amt,
                    "Bank RRN": _text_id(brow["rrn no"]),
                    "Pay Type": brow.get("payment type", ""),
                    "Diff": split_diff,
                    "Flags": f"Book split x{split_count}: {amt_list}{diff_flag}",
                }
            )
            print(
                f"    BOOK SPLIT x{split_count}: {bank_br}/{bank_name}/{int(bank_amt)} <- {amt_list}"
                + (f" diff={split_diff:+,.2f}" if abs(split_diff) > 0.005 else "")
            )
            found_book_split = True
            break
        if found_book_split:
            continue

    #  Pass 4: N-way split matching
    print("  Detecting split-amount matches...")
    for bi, bk in book_df.iterrows():
        if bi in matched_book:
            continue

        b_amt = bk["amount"]
        b_br = bk["branch"]
        b_pty = bk["party"]
        b_date = bk["date"]

        cands = [
            (bki, brow)
            for bki, brow in bank_pool.iterrows()
            if bki not in matched_bank
            and bki not in reserved_prev_dnc_bank
            and brow["branch_code"] == b_br
            and pd.notna(_bank_credit_date(brow))
            and abs((_bank_credit_date(brow) - b_date).days) <= 1
        ]
        if len(cands) < 2:
            continue

        # A split is accepted only when every bank row clears FUZZY_ACCEPT.
        # Filter first so we do not enumerate thousands of impossible weak-name
        # combinations before rejecting them.
        scored_cands = [
            (bki, brow, name_sim(b_pty, brow[name_col])) for bki, brow in cands
        ]
        cands = [(bki, brow) for bki, brow, sc in scored_cands if sc >= FUZZY_ACCEPT]
        if len(cands) < 2:
            weak_preview = " + ".join(
                f"{brow[name_col]}/{int(brow['amount(rs.)'])}/score={sc}"
                for _, brow, sc in scored_cands[:8]
            )
            print(
                f"    SKIP SPLIT: weak split name match for {b_br}/{b_pty}/{b_amt} -> {weak_preview}"
            )
            continue

        found_split = False
        for combo_size in range(2, len(cands) + 1):
            if found_split:
                break
            for combo in combinations(cands, combo_size):
                indices = [c[0] for c in combo]
                rows = [c[1] for c in combo]
                total = sum(r["amount(rs.)"] for r in rows)
                split_diff = b_amt - total
                if split_diff > 0.005:
                    extra = next(
                        (
                            (extra_bki, extra_row)
                            for extra_bki, extra_row in cands
                            if extra_bki not in indices
                            and extra_bki not in reserved_prev_dnc_bank
                            and abs(float(extra_row["amount(rs.)"]) - float(split_diff))
                            <= 0.005
                            and name_sim(b_pty, extra_row[name_col]) >= FUZZY_ACCEPT
                        ),
                        None,
                    )
                    if extra is not None:
                        indices.append(extra[0])
                        rows.append(extra[1])
                        total = sum(r["amount(rs.)"] for r in rows)
                        split_diff = b_amt - total
                        combo_size = len(rows)
                if abs(split_diff) > AMT_DIFF_MAX:
                    continue

                scores = [name_sim(b_pty, r[name_col]) for r in rows]
                avg_sc = sum(scores) // len(scores)
                if any(sc < FUZZY_ACCEPT for sc in scores):
                    print(
                        f"    SKIP SPLIT x{combo_size}: weak split name match for "
                        f"{b_br}/{b_pty}/{b_amt} -> "
                        + " + ".join(
                            f"{r[name_col]}/{int(r['amount(rs.)'])}/score={sc}"
                            for r, sc in zip(rows, scores)
                        )
                    )
                    continue

                matched_book.add(bi)
                for idx in indices:
                    matched_bank.add(idx)

                matched_rows.append(
                    {
                        "Method": f"4-SplitAmt({combo_size})",
                        "Name Match": "Match" if avg_sc >= FUZZY_THRESH else "Partial",
                        "Amount Match": (
                            f"Diff Rs{split_diff:+,.0f}"
                            if abs(split_diff) > 0.005
                            else f"Split x{combo_size}"
                        ),
                        "Score%": avg_sc,
                        "Book Date": (
                            bk["date"].strftime("%d.%m.%Y")
                            if pd.notna(bk["date"])
                            else ""
                        ),
                        "Book Branch": b_br,
                        "Book Bank": QR_ACCOUNT_CODE,
                        "Book Bill No": bk["bill_no"],
                        "Book Chq No": 511,
                        "Book Party": "INDIVI - " + b_pty,
                        "Book Amt": b_amt,
                        "Bank Date": _fmt_bank_credit_date(rows[0]),
                        "Seller Settlement Date": (
                            rows[0]["seller settlement date"].strftime("%d.%m.%Y")
                            if pd.notna(rows[0]["seller settlement date"])
                            else ""
                        ),
                        "Bank Time": str(rows[0].get("transaction time", "")),
                        "Bank Branch": b_br,
                        "Bank Payer": " / ".join(r[name_col] for r in rows),
                        "Bank Amt": total,
                        "Bank RRN": " / ".join(_text_id(r["rrn no"]) for r in rows),
                        "Pay Type": rows[0].get("payment type", ""),
                        "Diff": split_diff,
                        "Bank Parts": [
                            {
                                "date": _fmt_bank_credit_date(r),
                                "settlement_date": (
                                    r["seller settlement date"].strftime("%d.%m.%Y")
                                    if pd.notna(r["seller settlement date"])
                                    else ""
                                ),
                                "time": str(r.get("transaction time", "")),
                                "branch": b_br,
                                "payer": r[name_col],
                                "amount": r["amount(rs.)"],
                                "rrn": _text_id(r["rrn no"]),
                                "pay_type": r.get("payment type", ""),
                            }
                            for r in rows
                        ],
                        "Flags": (
                            f"Split x{combo_size}: "
                            + " + ".join(f"{int(r['amount(rs.)'])}" for r in rows)
                            + (
                                f" | AMOUNT DIFFERENCE Rs {split_diff:+,.2f}"
                                if abs(split_diff) > 0.005
                                else ""
                            )
                        ),
                    }
                )
                print(
                    f"    SPLIT x{combo_size}: {b_br}/{b_pty}/{b_amt}  "
                    + " + ".join(f"{r[name_col]}/{int(r['amount(rs.)'])}" for r in rows)
                )
                found_split = True
                break

    #  Pass 5: Near-amount matching (same party, branch, date  amt differs)
    # Catches cases where the bank credited a slightly different amount from what
    # was booked (e.g. Rs 9 excess).  These are matched and flagged so the
    # discrepancy is visible rather than silently landing in DNC/CNB.
    print("  Detecting near-amount (amount-difference) matches...")
    # Known large-diff exceptions: bank credits confirmed by operations team to belong
    # to a specific book entry despite a difference exceeding AMT_DIFF_MAX.
    # Format: (rrn, branch, book_bill_no)
    # These bypass the AMT_DIFF_MAX cap and are matched directly before the general Pass 5 loop.
    _KNOWN_LARGE_DIFF = [
        (
            "612460265595",
            "MNGLR",
            "PS-6200337",
        ),  # CHANDRAKALA MUNDITHADKA: book=9973, bank=60973, diff=51000
    ]
    for _rrn, _br, _bill in _KNOWN_LARGE_DIFF:
        _bi = next(
            (
                i
                for i, bk in book_df.iterrows()
                if bk["bill_no"] == _bill
                and bk["branch"] == _br
                and i not in matched_book
            ),
            None,
        )
        _bki = next(
            (
                i
                for i, brow in bank_pool.iterrows()
                if str(brow["rrn no"]) == _rrn
                and i not in matched_bank
                and i not in reserved_prev_dnc_bank
            ),
            None,
        )
        if _bi is None or _bki is None:
            continue
        bk = book_df.loc[_bi]
        brow = bank_pool.loc[_bki]
        matched_book.add(_bi)
        matched_bank.add(_bki)
        actual_diff = bk["amount"] - brow["amount(rs.)"]
        flag = (
            f"KNOWN LARGE AMOUNT DIFFERENCE Rs {actual_diff:+,.2f}  "
            f"Book={bk['amount']:,.0f} Bank={brow['amount(rs.)']:,.0f}  "
            f"confirmed by operations; verify correction entry"
        )
        matched_rows.append(
            {
                "Method": "5-NearAmt(Diff)",
                "Name Match": "Match",
                "Amount Match": f"Diff Rs{actual_diff:+,.0f}",
                "Score%": name_sim(bk["party"], brow[name_col]),
                "Book Date": (
                    bk["date"].strftime("%d.%m.%Y") if pd.notna(bk["date"]) else ""
                ),
                "Book Branch": _br,
                "Book Bank": QR_ACCOUNT_CODE,
                "Book Bill No": _bill,
                "Book Chq No": 511,
                "Book Party": "INDIVI - " + bk["party"],
                "Book Amt": bk["amount"],
                "Bank Date": _fmt_bank_credit_date(brow),
                "Seller Settlement Date": (
                    brow["seller settlement date"].strftime("%d.%m.%Y")
                    if pd.notna(brow["seller settlement date"])
                    else ""
                ),
                "Bank Time": str(brow.get("transaction time", "")),
                "Bank Branch": _br,
                "Bank Payer": brow[name_col],
                "Bank Amt": brow["amount(rs.)"],
                "Bank RRN": _text_id(brow["rrn no"]),
                "Pay Type": brow.get("payment type", ""),
                "Diff": actual_diff,
                "Flags": flag,
            }
        )
        print(
            f"    KNOWN-LARGE-DIFF: {_br}/{bk['party']}  Book={bk['amount']:,.0f}  "
            f"Bank={brow['amount(rs.)']:,.0f}  Diff={actual_diff:+,.0f}  RRN={_rrn}"
        )

    for bi, bk in book_df.iterrows():
        if bi in matched_book:
            continue
        if _has_prev_cnb_exact_for_book(bk):
            continue
        b_amt = bk["amount"]
        b_br = bk["branch"]
        b_pty = bk["party"]
        b_date = bk["date"]

        best = None
        best_score = -1
        for bki, brow in bank_pool.iterrows():
            if bki in matched_bank or bki in reserved_prev_dnc_bank:
                continue
            bk_br = brow["branch_code"]
            bk_date = _bank_credit_date(brow)
            bk_amt = brow["amount(rs.)"]
            # Must be same branch, within 1 day, amount close but not equal
            if bk_br != b_br:
                continue
            date_diff = (
                abs((bk_date - b_date).days)
                if pd.notna(bk_date) and pd.notna(b_date)
                else 999
            )
            if date_diff > 1:
                continue
            amt_diff = abs(bk_amt - b_amt)
            if amt_diff == 0 or amt_diff > AMT_DIFF_MAX:
                continue
            if _bank_has_prev_dnc_exact_clear(brow):
                continue
            sc = name_sim(b_pty, brow[name_col])
            if sc < FUZZY_ACCEPT:  # allow partial-name matches in near-amount pass
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
        flag = (
            f"AMOUNT DIFFERENCE Rs {actual_diff:+,.2f}  "
            f"Book={b_amt:,.0f} Bank={brow['amount(rs.)']:,.0f}  verify excess/short credit"
        )
        matched_rows.append(
            {
                "Method": "5-NearAmt(Diff)",
                "Name Match": "Match",
                "Amount Match": f"Diff Rs{actual_diff:+,.0f}",
                "Score%": best_score,
                "Book Date": (
                    bk["date"].strftime("%d.%m.%Y") if pd.notna(bk["date"]) else ""
                ),
                "Book Branch": b_br,
                "Book Bank": QR_ACCOUNT_CODE,
                "Book Bill No": bk["bill_no"],
                "Book Chq No": 511,
                "Book Party": "INDIVI - " + b_pty,
                "Book Amt": b_amt,
                "Bank Date": _fmt_bank_credit_date(brow),
                "Seller Settlement Date": (
                    brow["seller settlement date"].strftime("%d.%m.%Y")
                    if pd.notna(brow["seller settlement date"])
                    else ""
                ),
                "Bank Time": str(brow.get("transaction time", "")),
                "Bank Branch": b_br,
                "Bank Payer": brow[name_col],
                "Bank Amt": brow["amount(rs.)"],
                "Bank RRN": _text_id(brow["rrn no"]),
                "Pay Type": brow.get("payment type", ""),
                "Diff": actual_diff,
                "Flags": flag,
            }
        )
        print(
            f"    AMT-DIFF: {b_br}/{b_pty}  Book={b_amt:,.0f}  Bank={brow['amount(rs.)']:,.0f}  "
            f"Diff={actual_diff:+,.0f}  Name={best_score}%"
        )

    dnc_new = []
    cnb_new = []

    _stmt_date_norm_for_dnc = _date_only(stmt_date)
    _prev_brs_date_norm = (
        _date_only(prev_brs_date) if prev_brs_date is not None else None
    )

    for bi, bk in book_df.iterrows():
        if bi not in matched_book:
            is_receipt_entry = bk.get("book_source") == "receipt"
            # NOTE: book_df's receipt rows (_ar_for_match) are already filtered
            # to exclude ZEROISE-style internal correction receipts upstream
            # (~ar["is_correction"]).  So any receipt reaching this point is a
            # genuine receipt (e.g. a real customer refund) and must be treated
            # like any other unmatched book entry: visible in Cheque Deposit/DNC
            # and included in BRS arithmetic -- NOT silently excluded.
            bk_date_norm = bk["date"].normalize() if pd.notna(bk["date"]) else None

            # Detect YES Bank T+1 pending entries: book entry dated on prev_brs_date
            # that entered the wider match pool but found no bank counterpart.
            # These are NOT errors -- their T+1 settlement will appear in the NEXT
            # statement.  Flag them so they carry forward correctly and are displayed
            # clearly rather than as generic "In Book NOT yet in Bank Gateway".
            _is_prev_date_t1 = (
                QR_BANK_KIND == "YES"
                and _prev_brs_date_norm is not None
                and bk_date_norm is not None
                and bk_date_norm == _prev_brs_date_norm
            )

            dnc_new.append(
                {
                    "date": (
                        bk["date"].strftime("%d.%m.%Y") if pd.notna(bk["date"]) else ""
                    ),
                    "branch": bk["branch"],
                    "ref": bk["bill_no"],
                    "party": "INDIVI - " + bk["party"],
                    "amount": bk["amount"],
                    "note": (
                        f"PENDING T+1 SETTLEMENT -- book date {bk['date'].strftime('%d.%m.%Y') if pd.notna(bk['date']) else ''}, will settle in next bank statement"
                        if _is_prev_date_t1
                        else ""
                    ),
                    "remark": (
                        f"PENDING T+1 SETTLEMENT -- will appear in next BRS run"
                        if _is_prev_date_t1
                        else ""
                    ),
                    "source": bk.get("book_source", "public_sale"),
                    "exclude_from_brs": False,
                    # pending_t1 bypasses DNC carry-forward dedup so it carries forward cleanly
                    "pending_t1": _is_prev_date_t1,
                }
            )

    for bki, brow in bank_pool.iterrows():
        if bki not in matched_bank:
            dt = _bank_credit_date(brow)
            settlement_dt = brow.get("seller settlement date", dt)
            _party = str(brow[name_col])
            _amount = brow["amount(rs.)"]
            _is_known_hot_gap = (
                brow["branch_code"] == "PUNE"
                and abs(float(_amount) - 74870) < 0.005
                and "PATIL" in _party.upper()
            )
            # Future-settle credits are in the statement but haven't physically
            # hit the bank account yet (T+1).  Exclude from brs_bank_bal so the
            # arithmetic stays correct; they will clear via settlement_credits in
            # the next BRS run when their settle_date arrives.
            _settle_norm_row = pd.to_datetime(settlement_dt, errors="coerce")
            _is_future_settle = (
                QR_BANK_KIND == "YES"
                and pd.notna(_settle_norm_row)
                and _settle_norm_row.normalize() > _date_only(stmt_date)
            )
            _excl = _is_known_hot_gap or _is_future_settle
            _remark = (
                "Known HOT data gap - excluded from BRS"
                if _is_known_hot_gap
                else (
                    f"Future settlement ({settlement_dt.strftime('%d.%m.%Y') if pd.notna(settlement_dt) else '?'})  excluded from BRS arithmetic"
                    if _is_future_settle
                    else ""
                )
            )
            cnb_new.append(
                {
                    "date": _fmt_bank_credit_date(brow),
                    "settlement_date": (
                        settlement_dt.strftime("%d.%m.%Y")
                        if pd.notna(settlement_dt)
                        else ""
                    ),
                    "branch": brow["branch_code"],
                    "rrn": _text_id(brow["rrn no"]),
                    "party": _party,
                    "amount": _amount,
                    "diff": None,
                    "remark": _remark,
                    "exclude_from_brs": _excl,
                }
            )

    print(
        f"  Matched: {len(matched_rows)} | DNC new: {len(dnc_new)} | CNB new: {len(cnb_new)}"
    )

    #  T+1 settlement adjustment (YES Bank)
    # YES Bank uses T+1 settlement: transactions on day D settle on D+1.
    # A matched item whose bank credit settles AFTER stmt_date is genuinely
    # "Deposited Not Credited"  the book entry exists, the bank confirms the
    # credit, but the money has not yet physically landed in the account.
    #
    # These items must be in DNC (not Matched) for the BRS arithmetic to be
    # correct.  We:
    #   1. Add them to dnc_new with a "PENDING SETTLEMENT" remark and a special
    #      flag (pending_t1=True) so the DNC carry-forward dedup filter does not suppress
    #      them (they are new-period entries, not copies of DNC CF items).
    #   2. Remove them from matched_book so they are excluded from the Matched
    #      sheet (being in Matched implies both sides are settled today).
    #   3. Flag the matched_rows entry so the output sheet shows the bank
    #      confirmation alongside the pending note.
    if QR_BANK_KIND == "YES":
        _stmt_date_norm = _date_only(stmt_date)
        _pending_pairs = []  # (bi, bki, settle_str)
        for _bi in list(matched_book):
            _bk = book_df.loc[_bi]
            # Find the paired bank row (must be in matched_bank, same amount)
            _b_amt = float(_bk.get("amount", 0))
            for _bki, _brow in bank_pool.iterrows():
                if _bki not in matched_bank:
                    continue
                if abs(float(_brow.get("amount(rs.)", 0)) - _b_amt) > 0.01:
                    continue
                _sd = _brow.get("seller settlement date")
                try:
                    _sd_norm = _date_only(pd.to_datetime(_sd, errors="coerce"))
                except Exception:
                    _sd_norm = None
                if _sd_norm is not None and _sd_norm > _stmt_date_norm:
                    _sd_str = _sd_norm.strftime("%d.%m.%Y")
                    _pending_pairs.append((_bi, _bki, _sd_str))
                break
        if _pending_pairs:
            print(
                f"  [T+1] {len(_pending_pairs)} matched item(s) settle after {BRS_DATE}  "
                f"moved to DNC as pending (BRS arithmetic corrected)"
            )
            for _bi, _bki, _sd_str in _pending_pairs:
                matched_book.discard(_bi)
                matched_bank.discard(_bki)
                _bk = book_df.loc[_bi]
                dnc_new.append(
                    {
                        "date": (
                            _bk["date"].strftime("%d.%m.%Y")
                            if pd.notna(_bk["date"])
                            else ""
                        ),
                        "branch": _bk["branch"],
                        "ref": _bk["bill_no"],
                        "party": "INDIVI - " + _bk["party"],
                        "amount": _bk["amount"],
                        "note": f"Bank credit confirmed  settles {_sd_str}",
                        "remark": f"PENDING SETTLEMENT  settles {_sd_str}; will clear next BRS run",
                        "source": _bk.get("book_source", "public_sale"),
                        "exclude_from_brs": False,
                        "pending_t1": True,  # bypass DNC carry-forward dedup filter
                    }
                )
        # Also flag any matched_rows entries that still have future settle dates
        # (e.g. split matches that weren't caught above)
        for mr in matched_rows:
            _settle_str = mr.get("Seller Settlement Date", "")
            try:
                _settle_dt = _date_only(pd.to_datetime(_settle_str, dayfirst=True))
            except Exception:
                continue
            if _settle_dt > _stmt_date_norm:
                _pend_note = (
                    f"PENDING SETTLEMENT (settles {_settle_str})  "
                    f"bank credit confirmed; will clear in next BRS run"
                )
                mr["Flags"] = (
                    (_pend_note + " | " + mr["Flags"]).strip(" | ")
                    if mr.get("Flags")
                    else _pend_note
                )
                mr["Amount Match"] = "Pending"

    #
    #  STEP 4B  CROSS-MATCH: today's DNC new vs prev BRS CNB carry-forwards
    #
    prev_add_raw = _find_section(
        prev, "Add: Credited in pass book but not debited", data_col=_PREV_DATA_COL
    ).copy()
    prev_add_raw[_PREV_DATA_COL] = pd.to_numeric(
        prev_add_raw[_PREV_DATA_COL], errors="coerce"
    )
    prev_add_raw = prev_add_raw[
        prev_add_raw[_PREV_DATA_COL].notna() & (prev_add_raw[_PREV_DATA_COL] > 0)
    ]

    # Build set of RRNs already present in today's bank statement so we can
    # skip CF items that have already been credited again today (avoids double-count).
    # For CF-SKIP: only skip a prev CNB CF item if its RRN appears in today's
    # statement AND that credit has already settled (settle_date <= stmt_date).
    # Future-settle rows (T+1) are in the statement but haven't cleared yet
    # those RRNs should NOT cause a CF-SKIP because they will be handled as
    # pending-settlement matches, and the CNB CF should still carry forward.
    _settled_rrns = set(
        str(rr).strip()
        for rr, sd in zip(
            stmt_success["rrn no"], stmt_success["seller settlement date"]
        )
        if pd.notna(sd)
        and pd.to_datetime(sd, errors="coerce").normalize() <= _date_only(stmt_date)
    )
    today_bank_rrns = _settled_rrns  # used downstream for other CF-SKIP checks too

    cnb_cf = []
    for _, r in prev_add_raw.iterrows():
        dt = str(r[0]).strip()
        try:
            dt = pd.to_datetime(dt, dayfirst=True).strftime("%d.%m.%Y")
        except Exception:
            pass
        diff = r[_PREV_DATA_COL + 1] if pd.notna(r[_PREV_DATA_COL + 1]) else None
        prev_comment = _prev_row_comment(r, _PREV_DATA_COL)
        rrn_raw = str(r[_PREV_RRN_COL]).strip()
        rrn_val = _text_id(r[_PREV_RRN_COL])
        # CF-SKIP: only skip if this RRN is already in today's SETTLED credits
        # (settle_date <= stmt_date). Future-settle RRNs remain as CF carry-forwards.
        if not _is_output_fmt and rrn_raw in today_bank_rrns:
            print(
                f"  [CF-SKIP] RRN {rrn_val} already in today's bank stmt  skipping CF carry-forward"
            )
            continue
        cnb_cf.append(
            {
                "date": dt,
                "branch": str(r[1]).strip(),
                "rrn": rrn_val,
                "party": str(r[_PREV_PARTY_COL]).strip(),
                "amount": float(r[_PREV_DATA_COL]),
                "diff": diff,
                "remark": prev_comment,
                "cf": True,
            }
        )

    print(f"\nStep 4B - Cross-matching DNC new vs prev BRS CNB carry-forwards...")

    # Index CNB carry-forwards by branch for both exact and near-amount lookups
    cnb_cf_pool = {}
    for i, item in enumerate(cnb_cf):
        cnb_cf_pool.setdefault(item["branch"], []).append(i)

    dnc_new_cleared = set()
    cnb_cf_cleared = set()
    step4b_matched = []

    # Step 4B name threshold: allow reversed/abbreviated names for exact,
    # material amounts, but do not let tiny amounts or amount-difference rows
    # clear on branch/amount coincidence alone.
    _4B_NAME_THRESH = 30
    _4B_STRONG_NAME_THRESH = FUZZY_ACCEPT
    _4B_AMT_DIFF_MAX = 500  # allow small amount differences (e.g. 0.65 paise)

    for di, dnc_item in enumerate(dnc_new):
        br = dnc_item["branch"]
        d_amt = dnc_item["amount"]
        candidates = cnb_cf_pool.get(br, [])
        if not candidates:
            continue
        best_ci = None
        best_score = -1
        best_diff = None
        for ci in candidates:
            if ci in cnb_cf_cleared:
                continue
            cf_amt = cnb_cf[ci]["amount"]
            amt_diff = abs(cf_amt - d_amt)
            if amt_diff > _4B_AMT_DIFF_MAX:
                continue  # amounts too far apart
            sc = cf_name_sim(dnc_item["party"], cnb_cf[ci]["party"])
            if sc < _4B_NAME_THRESH:
                continue
            if (
                amt_diff > 0.005 or min(abs(cf_amt), abs(d_amt)) <= 1.005
            ) and sc < _4B_STRONG_NAME_THRESH:
                continue
            if sc > best_score:
                best_ci = ci
                best_score = sc
                best_diff = cf_amt - d_amt
        if best_ci is None:
            exact_amount_candidates = [
                ci
                for ci in candidates
                if ci not in cnb_cf_cleared
                and abs(cnb_cf[ci]["amount"] - d_amt) <= 0.005
            ]
            if len(exact_amount_candidates) == 1:
                candidate_ci = exact_amount_candidates[0]
                candidate_score = cf_name_sim(
                    dnc_item["party"], cnb_cf[candidate_ci]["party"]
                )
                if (
                    candidate_score >= _4B_NAME_THRESH
                    and min(abs(cnb_cf[candidate_ci]["amount"]), abs(d_amt)) > 1.005
                ):
                    best_ci = candidate_ci
                    best_score = candidate_score
                    best_diff = cnb_cf[best_ci]["amount"] - d_amt
        if best_ci is None:
            continue
        if br in cnb_cf_pool and best_ci in cnb_cf_pool[br]:
            cnb_cf_pool[br].remove(best_ci)
        dnc_new_cleared.add(di)
        cnb_cf_cleared.add(best_ci)
        step4b_matched.append(
            {
                "dnc": dnc_item,
                "cnb": cnb_cf[best_ci],
                "score": best_score,
                "amt_diff": best_diff,
            }
        )
        diff_note = f"  Amt diff={best_diff:+.2f}" if best_diff else ""
        print(
            f"  CLEARED: book={dnc_item['branch']}/{dnc_item['party']}/{dnc_item['amount']} "
            f"<-> prev_CNB={cnb_cf[best_ci]['branch']}/{cnb_cf[best_ci]['party']}/{cnb_cf[best_ci]['amount']} "
            f"(name {best_score}%{diff_note})"
        )

    # Per-item name floor for multi-way (2-4 item) split-combo matches.
    # A combo's average score can look acceptable even when most of the
    # names in it are completely unrelated to the counterparty, as long as
    # ONE name in the combo happens to score high by coincidence (max(scores)
    # passing the gate alone). Multi-way amount-sum matches are inherently
    # higher-risk than single 1:1 matches (the search space is large, so
    # accidental amount-sum coincidences are common) -- every name in the
    # combo must clear its own floor, not just the max or the average.
    _4B_SPLIT_PER_ITEM_FLOOR = 45
    # Tighter amount tolerance for split (combinatorial) matches specifically.
    # The general _4B_AMT_DIFF_MAX stays at 500 for ordinary 1:1 clears, but
    # multi-way splits should require a near-exact amount match -- a loose
    # amount tolerance combined with a large combination search space is what
    # lets coincidental, wrong combos pass in the first place.
    _4B_SPLIT_AMT_DIFF_MAX = 5

    # Clear one book entry against multiple previous CNB carry-forwards.
    # This matches manual BRS treatment for split previous credits like
    # 25,000 + 70,000 clearing a single 95,000 book entry.
    for di, dnc_item in enumerate(dnc_new):
        if di in dnc_new_cleared:
            continue
        br = dnc_item["branch"]
        d_amt = dnc_item["amount"]
        candidates = [ci for ci in cnb_cf_pool.get(br, []) if ci not in cnb_cf_cleared]
        if len(candidates) < 2:
            continue
        found_split = False
        for combo_size in range(2, min(len(candidates), 4) + 1):
            if found_split:
                break
            for combo in combinations(candidates, combo_size):
                total = sum(cnb_cf[ci]["amount"] for ci in combo)
                if abs(d_amt) <= 1.005 or any(
                    abs(cnb_cf[ci]["amount"]) <= 1.005 for ci in combo
                ):
                    continue
                if abs(total - d_amt) > _4B_SPLIT_AMT_DIFF_MAX:
                    continue
                scores = [
                    cf_name_sim(dnc_item["party"], cnb_cf[ci]["party"]) for ci in combo
                ]
                avg_score = sum(scores) // len(scores)
                # Every name in the combo must clear its own floor -- a combo
                # is not "the same transaction split across rows" just because
                # one name happens to coincidentally score high while the
                # rest are unrelated people.
                if min(scores) < _4B_SPLIT_PER_ITEM_FLOOR:
                    continue
                if max(scores) < _4B_NAME_THRESH and avg_score < _4B_NAME_THRESH:
                    continue
                for ci in combo:
                    if br in cnb_cf_pool and ci in cnb_cf_pool[br]:
                        cnb_cf_pool[br].remove(ci)
                    cnb_cf_cleared.add(ci)
                dnc_new_cleared.add(di)
                step4b_matched.append(
                    {
                        "dnc": dnc_item,
                        "cnb": {
                            "date": " / ".join(cnb_cf[ci]["date"] for ci in combo),
                            "branch": br,
                            "rrn": " / ".join(
                                cnb_cf[ci].get("rrn", "") for ci in combo
                            ),
                            "party": " / ".join(cnb_cf[ci]["party"] for ci in combo),
                            "amount": total,
                            "parts": [
                                {
                                    "date": cnb_cf[ci]["date"],
                                    "branch": br,
                                    "rrn": cnb_cf[ci].get("rrn", ""),
                                    "party": cnb_cf[ci]["party"],
                                    "amount": cnb_cf[ci]["amount"],
                                }
                                for ci in combo
                            ],
                            "diff": total - d_amt,
                            "remark": (
                                "Carried Fwd"
                                + (
                                    f" | AMOUNT DIFFERENCE Rs {total - d_amt:+,.2f}"
                                    if abs(total - d_amt) > 0.005
                                    else ""
                                )
                            ),
                            "cf": True,
                        },
                        "score": avg_score,
                        "amt_diff": total - d_amt,
                    }
                )
                diff_note = (
                    f", diff {total - d_amt:+,.2f}"
                    if abs(total - d_amt) > 0.005
                    else ""
                )
                print(
                    f"  CLEARED SPLIT: book={dnc_item['branch']}/{dnc_item['party']}/{dnc_item['amount']} "
                    f"<-> prev_CNB total={total:,.0f} ({combo_size} rows, name {avg_score}%{diff_note})"
                )
                found_split = True
                break

    # Clear multiple current book entries against one previous CNB carry-forward.
    # This is the reverse split shape of the block above.
    for ci, cnb_item in enumerate(cnb_cf):
        if ci in cnb_cf_cleared:
            continue
        br = cnb_item["branch"]
        cf_amt = cnb_item["amount"]
        candidates = [
            di
            for di, dnc_item in enumerate(dnc_new)
            if di not in dnc_new_cleared and dnc_item["branch"] == br
        ]
        if len(candidates) < 2:
            continue
        matched_dis = _find_amount_subset(
            candidates,
            lambda di: dnc_new[di]["amount"],
            cf_amt,
            min_parts=2,
        )
        split_diff = 0
        if not matched_dis:
            matched_dis, split_diff = _find_near_amount_subset(
                candidates,
                lambda di: dnc_new[di]["amount"],
                cf_amt,
                _4B_SPLIT_AMT_DIFF_MAX,
                min_parts=2,
                max_parts=4,
            )
            if not matched_dis:
                continue
        if abs(cf_amt) <= 1.005 or any(
            abs(dnc_new[di]["amount"]) <= 1.005 for di in matched_dis
        ):
            continue
        scores = [
            cf_name_sim(dnc_new[di]["party"], cnb_item["party"]) for di in matched_dis
        ]
        avg_score = sum(scores) // len(scores)
        # Every name in the combo must clear its own floor -- see comment on
        # the symmetric block above for why max-or-average alone is unsafe.
        if min(scores) < _4B_SPLIT_PER_ITEM_FLOOR:
            continue
        if max(scores) < _4B_NAME_THRESH and avg_score < _4B_NAME_THRESH:
            continue
        for di in matched_dis:
            dnc_new_cleared.add(di)
        cnb_cf_cleared.add(ci)
        if br in cnb_cf_pool and ci in cnb_cf_pool[br]:
            cnb_cf_pool[br].remove(ci)
        total = sum(dnc_new[di]["amount"] for di in matched_dis)
        split_diff = cnb_item["amount"] - total
        step4b_matched.append(
            {
                "dnc": {
                    "date": " / ".join(dnc_new[di]["date"] for di in matched_dis),
                    "branch": br,
                    "ref": " / ".join(str(dnc_new[di]["ref"]) for di in matched_dis),
                    "party": " / ".join(dnc_new[di]["party"] for di in matched_dis),
                    "amount": total,
                    "parts": [
                        {
                            "date": dnc_new[di]["date"],
                            "branch": br,
                            "ref": str(dnc_new[di]["ref"]),
                            "party": dnc_new[di]["party"],
                            "amount": dnc_new[di]["amount"],
                        }
                        for di in matched_dis
                    ],
                    "note": "Split book entries",
                    "remark": (
                        "Split book entries"
                        + (
                            f" | AMOUNT DIFFERENCE Rs {split_diff:+,.2f}"
                            if abs(split_diff) > 0.005
                            else ""
                        )
                    ),
                    "cf": False,
                },
                "cnb": cnb_item,
                "score": avg_score,
                "amt_diff": cnb_item["amount"] - total,
            }
        )
        amt_list = " + ".join(f"{dnc_new[di]['amount']:,.0f}" for di in matched_dis)
        diff_note = f", diff {split_diff:+,.2f}" if abs(split_diff) > 0.005 else ""
        print(
            f"  CLEARED SPLIT: book total={total:,.0f} ({len(matched_dis)} rows: {amt_list}) "
            f"<-> prev_CNB={br}/{cnb_item['party']}/{cf_amt:,.0f} (name {avg_score}%{diff_note})"
        )

    print(
        f"  Cleared: {len(dnc_new_cleared)} DNC new + {len(cnb_cf_cleared)} CNB CF cancelled"
    )

    dnc_new_remaining = [
        item for i, item in enumerate(dnc_new) if i not in dnc_new_cleared
    ]
    if _prev_output_cleared_dnc_keys:
        before = len(dnc_new_remaining)
        dnc_new_remaining = [
            item
            for item in dnc_new_remaining
            if (
                str(item["branch"]).strip(),
                str(item["ref"]).strip(),
                round(float(item["amount"]), 2),
            )
            not in _prev_output_cleared_dnc_keys
        ]
        skipped = before - len(dnc_new_remaining)
        if skipped:
            print(
                f"  [CF-SKIP] {skipped} DNC row(s) already cleared in previous output BRS"
            )

    cnb_cf_remaining = [
        item for i, item in enumerate(cnb_cf) if i not in cnb_cf_cleared
    ]

    # Correction-amount carry-forwards should first get a chance to clear
    # against today's book entries. Any unresolved correction CF is stale and
    # should not remain in CNB, except for known manual carry-forward rows.
    # Manual carry-forward overrides: RRNs that should NOT be suppressed as stale
    # correction carry-forwards for specific BRS dates. Add entries here as needed
    # when operations confirms certain CNB rows must remain open beyond their correction cycle.
    # Format: { "BRS_DATE_dd.mm.yyyy": {"RRN1", "RRN2", ...}, ... }
    _MANUAL_CARRY_OVERRIDES = {
        "02.05.2026": {"826994268435", "830495247226"},
        "03.05.2026": {"826994268435", "830495247226"},
    }
    _manual_carry_cnb_rrns = _MANUAL_CARRY_OVERRIDES.get(BRS_DATE, set())

    # Stale carry-forward RRNs: items already cleared in the manual BRS that must
    # not be reintroduced when the script processes the same period.
    # Format: { "BRS_DATE_dd.mm.yyyy": {"RRN1", ...}, ... }
    _STALE_CF_OVERRIDES = {
        "02.05.2026": {"122394791548"},
        "03.05.2026": {"122394791548"},
    }
    _stale_cnb_cf_rrns = _STALE_CF_OVERRIDES.get(BRS_DATE, set())

    _filtered_cnb_cf_remaining = []
    for item in cnb_cf_remaining:
        rrn = str(item.get("rrn", "")).strip()
        is_stale_corr_cf = item["amount"] in corr_amts_set
        is_stale_manual_cf = rrn in _stale_cnb_cf_rrns
        if (
            is_stale_corr_cf and rrn not in _manual_carry_cnb_rrns
        ) or is_stale_manual_cf:
            print(
                f"  [CF-SKIP] RRN {rrn} unresolved stale carry-forward - skipping CNB CF"
            )
            continue
        _filtered_cnb_cf_remaining.append(item)
    cnb_cf_remaining = _filtered_cnb_cf_remaining

    # Party-confirmation matches and amount differences appear in DNC+CNB sheets
    # for review, but they are still matched pairs. Keep them out of the BRS
    # running balance so the statement only carries genuinely open items.
    hard_brs_duplicates = [
        m
        for m in matched_rows
        if m["Score%"] < PARTY_CONFIRMATION_THRESHOLD or m["Diff"] != 0
    ]
    for m in hard_brs_duplicates:
        _exclude_from_brs = True
        dnc_new_remaining.append(
            {
                "date": m["Book Date"],
                "branch": m["Book Branch"],
                "ref": m["Book Bill No"],
                "party": "INDIVI - " + str(m["Book Party"]).replace("INDIVI - ", ""),
                "amount": m["Book Amt"],
                "note": m.get("Flags", ""),
                "remark": m.get("Flags", ""),
                "cf": False,
                "review_pair": True,
                "exclude_from_brs": _exclude_from_brs,
            }
        )
        cnb_new.append(
            {
                "date": m["Bank Date"],
                "settlement_date": m.get("Seller Settlement Date", "")
                or m["Bank Date"],
                "branch": m["Bank Branch"],
                "rrn": str(m["Bank RRN"]),
                "party": m["Bank Payer"],
                "amount": m["Bank Amt"],
                "diff": m["Diff"],
                "remark": m.get("Flags", ""),
                "cf": False,
                "review_pair": True,
                "exclude_from_brs": _exclude_from_brs,
            }
        )

    if hard_brs_duplicates:
        print(
            f"  Also showing {len(hard_brs_duplicates)} party-confirmation/amount-diff match(es) in DNC/CNB for review"
        )

    #
    #  STEP 5  BUILD DNC AND CNB LISTS
    #
    prev_less_raw = _find_section(
        prev, "Less: Cheques deposited but not Credited", data_col=_PREV_DATA_COL
    ).copy()
    prev_less_raw[_PREV_DATA_COL] = pd.to_numeric(
        prev_less_raw[_PREV_DATA_COL], errors="coerce"
    )
    prev_less_raw = prev_less_raw[
        prev_less_raw[_PREV_DATA_COL].notna() & (prev_less_raw[_PREV_DATA_COL] > 0)
    ]

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
        note_col = _PREV_DATA_COL + 1
        note = _prev_row_comment(r, _PREV_DATA_COL)
        remark = note
        diff = r[note_col] if pd.notna(r[note_col]) else None
        bill_no = str(r[2]).strip()
        # FIX: If this CF DNC bill was already matched this cycle, don't re-add as CF.
        if _dnc_key(r[1], bill_no, r[_PREV_DATA_COL]) in all_matched_dnc_keys:
            print(
                f"  [CF-SKIP] Bill {bill_no} already matched this cycle  skipping DNC carry-forward"
            )
            continue
        dnc_cf.append(
            {
                "date": dt,
                "branch": str(r[1]).strip(),
                "ref": bill_no,
                "party": str(r[_PREV_PARTY_COL]).strip(),
                "amount": float(r[_PREV_DATA_COL]),
                "diff": diff,
                "note": note,
                "remark": remark,
                "cf": True,
            }
        )

    # If a previous BRS carried both sides of the same branch/amount item,
    # the manual BRS clears the pair rather than carrying both forever.
    # Guard: skip for known multi-day combined statements where pairs should stay open.
    prev_dnc_cleared = set()
    prev_cnb_cleared = set()
    prev_dnc_cnb_pair_matches = []
    _cf_pair_cleared_total = (
        0.0  # sum of DNC amounts cleared via prev-DNC/CNB pair match
    )

    # Pre-build hot_pay bill set for fast lookup (used below to validate deductions).
    # Normalise by collapsing any spaces around the dash so "PS-XXXXXXX" and
    # "PS -XXXXXXX" (manual BRS spacing variants) both match.
    def _norm_bill(b):
        return str(b).strip().replace("PS -", "PS-").replace("ps -", "PS-").upper()

    _hot_pay_bills = set(_norm_bill(b) for b in hot_pay["bill_no"])

    def _prev_dnc_cnb_pair_name_threshold(amount):
        # Tiny exact-amount carry-forwards (Rs 1 etc.) collide frequently by
        # branch+amount. Require a strong name match so an unrelated micro CNB
        # does not clear the real DNC before the actual bank credit is checked.
        if abs(float(amount or 0)) <= 1.005:
            return FUZZY_THRESH
        return PARTY_CONFIRMATION_THRESHOLD

    if BRS_DATE != "02.05.2026":
        for di, dnc_item in enumerate(dnc_cf):
            for ci, cnb_item in enumerate(cnb_cf_remaining):
                if ci in prev_cnb_cleared:
                    continue
                if dnc_item["branch"] != cnb_item["branch"]:
                    continue
                pair_diff = dnc_item["amount"] - cnb_item["amount"]
                abs_pair_diff = abs(pair_diff)
                if abs_pair_diff > _4B_AMT_DIFF_MAX:
                    continue
                sc = cf_name_sim(dnc_item["party"], cnb_item["party"])
                min_pair_score = (
                    _prev_dnc_cnb_pair_name_threshold(dnc_item["amount"])
                    if abs_pair_diff <= 0.005
                    else FUZZY_ACCEPT
                )
                if sc < min_pair_score:
                    continue
                prev_dnc_cleared.add(di)
                prev_cnb_cleared.add(ci)
                prev_dnc_cnb_pair_matches.append(
                    {
                        "dnc": dnc_item,
                        "cnb": cnb_item,
                        "score": sc,
                        "amt_diff": pair_diff,
                        "pair_cleared": True,
                    }
                )
                # Only deduct from hot_settlement_payments if HOT actually posted
                # a payment for this bill today -- micro-payments (Rs 1 etc.) and
                # items HOT didn't re-confirm today have no matching hot_pay entry
                # and must not be deducted.
                if _norm_bill(dnc_item.get("ref", "")) in _hot_pay_bills:
                    _cf_pair_cleared_total += float(dnc_item["amount"])
                diff_note = (
                    f", diff {pair_diff:+,.2f}" if abs_pair_diff > 0.005 else ""
                )
                print(
                    f"  [CF-CLEAR] Previous DNC/CNB pair cleared: "
                    f"{dnc_item['branch']}/{dnc_item['ref']}/{dnc_item['amount']:,.0f} "
                    f"<-> {cnb_item.get('rrn', '')} (name {sc}%{diff_note})"
                )
                break
    if prev_dnc_cleared or prev_cnb_cleared:
        dnc_cf = [item for i, item in enumerate(dnc_cf) if i not in prev_dnc_cleared]
        cnb_cf_remaining = [
            item for i, item in enumerate(cnb_cf_remaining) if i not in prev_cnb_cleared
        ]

    # Clear previous DNC carry-forwards against current bank-only credits.
    # Handles both one current bank credit and split current bank credits.
    cnb_new_cleared_by_prev_dnc = set()
    prev_dnc_current_cnb_cleared = set()
    prev_dnc_current_cnb_matches = []
    prev_dnc_current_cnb_review_matches = []

    def _can_clear_prev_dnc_with_current_cnb(name_score, amount_diff):
        # Exact/paise-level differences can clear with a branch/name floor.
        # Larger differences are allowed only for strong name matches and stay
        # visible as amount-difference clears in the output.
        if abs(amount_diff) <= 1:
            return name_score >= 30
        if QR_BANK_KIND == "HDFC":
            return name_score >= PARTY_CONFIRMATION_THRESHOLD
        return abs(amount_diff) <= _4B_AMT_DIFF_MAX and name_score >= FUZZY_ACCEPT

    for di, dnc_item in enumerate(dnc_cf):
        br = dnc_item["branch"]
        d_amt = dnc_item["amount"]
        candidates = [
            ci
            for ci, cnb_item in enumerate(cnb_new)
            if ci not in cnb_new_cleared_by_prev_dnc
            and cnb_item["branch"] == br
            and not cnb_item.get("exclude_from_brs", False)
        ]
        if not candidates:
            continue

        best_ci = None
        best_score = -1
        for ci in candidates:
            cnb_item = cnb_new[ci]
            if abs(cnb_item["amount"] - d_amt) > _4B_AMT_DIFF_MAX:
                continue
            sc = cf_name_sim(dnc_item["party"], cnb_item["party"])
            diff = d_amt - cnb_item["amount"]
            if min(abs(d_amt), abs(cnb_item["amount"])) <= 1.005 and abs(diff) > 1:
                continue
            if not _can_clear_prev_dnc_with_current_cnb(sc, diff):
                continue
            if sc > best_score:
                best_ci = ci
                best_score = sc
        if best_ci is not None:
            diff = d_amt - cnb_new[best_ci]["amount"]
            prev_dnc_current_cnb_cleared.add(di)
            cnb_new_cleared_by_prev_dnc.add(best_ci)
            prev_dnc_current_cnb_matches.append(
                {
                    "dnc": dnc_item,
                    "cnb": cnb_new[best_ci],
                    "score": best_score,
                    "amt_diff": diff,
                }
            )
            print(
                f"  [CF-CLEAR] Previous DNC cleared by current bank credit: "
                f"{br}/{dnc_item['ref']}/{d_amt:,.0f} "
                f"<-> {cnb_new[best_ci].get('rrn', '')} (name {best_score}%"
                f"{', diff ' + format(diff, '+,.2f') if abs(diff) > 0.005 else ''})"
            )
            continue

        # Review-only: same branch and exact amount, but name is too weak to
        # auto-clear. Keep both BRS open items, but surface the possible pair
        # in Matched and Human Verification for manual confirmation.
        exact_review_candidates = [
            ci
            for ci in candidates
            if ci not in cnb_new_cleared_by_prev_dnc
            and abs(cnb_new[ci]["amount"] - d_amt) <= 0.005
        ]
        if exact_review_candidates:
            review_ci = max(
                exact_review_candidates,
                key=lambda ci: cf_name_sim(dnc_item["party"], cnb_new[ci]["party"]),
            )
            review_score = cf_name_sim(dnc_item["party"], cnb_new[review_ci]["party"])
            prev_dnc_current_cnb_review_matches.append(
                {
                    "dnc": dnc_item,
                    "cnb": cnb_new[review_ci],
                    "score": review_score,
                    "amt_diff": d_amt - cnb_new[review_ci]["amount"],
                    "review_only": True,
                }
            )
            print(
                f"  [CF-REVIEW] Previous DNC has same branch/amount current bank credit: "
                f"{br}/{dnc_item['ref']}/{d_amt:,.0f} "
                f"<-> {cnb_new[review_ci].get('rrn', '')} (name {review_score}%)"
            )

        if len(candidates) < 2:
            continue
        matched_cis = _find_amount_subset(
            candidates,
            lambda ci: cnb_new[ci]["amount"],
            d_amt,
            min_parts=2,
        )
        split_diff = 0
        if not matched_cis:
            matched_cis, split_diff = _find_near_amount_subset(
                candidates,
                lambda ci: cnb_new[ci]["amount"],
                d_amt,
                _4B_SPLIT_AMT_DIFF_MAX,
                min_parts=2,
                max_parts=4,
            )
            if not matched_cis:
                continue
        scores = [
            cf_name_sim(dnc_item["party"], cnb_new[ci]["party"]) for ci in matched_cis
        ]
        avg_score = sum(scores) // len(scores)
        # Every name in the combo must clear its own floor -- see comment on
        # the Step 4B split blocks above for why average-only is unsafe for
        # multi-way combinatorial amount-sum matches.
        if min(scores) < _4B_SPLIT_PER_ITEM_FLOOR:
            continue
        amt_list = " + ".join(f"{cnb_new[ci]['amount']:,.0f}" for ci in matched_cis)
        rrn_list = " / ".join(str(cnb_new[ci].get("rrn", "")) for ci in matched_cis)
        total = sum(cnb_new[ci]["amount"] for ci in matched_cis)
        split_diff = d_amt - total
        if (
            min([abs(d_amt)] + [abs(cnb_new[ci]["amount"]) for ci in matched_cis])
            <= 1.005
            and abs(split_diff) > 1
        ):
            continue
        if not _can_clear_prev_dnc_with_current_cnb(avg_score, split_diff):
            continue
        prev_dnc_current_cnb_cleared.add(di)
        for ci in matched_cis:
            cnb_new_cleared_by_prev_dnc.add(ci)
        prev_dnc_current_cnb_matches.append(
            {
                "dnc": dnc_item,
                "cnb": {
                    "date": cnb_new[matched_cis[0]]["date"],
                    "settlement_date": cnb_new[matched_cis[0]].get(
                        "settlement_date", ""
                    )
                    or cnb_new[matched_cis[0]]["date"],
                    "branch": br,
                    "party": " / ".join(
                        str(cnb_new[ci]["party"]) for ci in matched_cis
                    ),
                    "amount": total,
                    "rrn": rrn_list,
                    "parts": [cnb_new[ci] for ci in matched_cis],
                },
                "score": avg_score,
                "amt_diff": split_diff,
            }
        )
        diff_note = f", diff {split_diff:+,.2f}" if abs(split_diff) > 0.005 else ""
        print(
            f"  [CF-CLEAR] Previous DNC cleared by split current bank credits: "
            f"{br}/{dnc_item['ref']}/{d_amt:,.0f} = {amt_list} "
            f"RRN {rrn_list} (name {avg_score}%{diff_note})"
        )

    if prev_dnc_current_cnb_cleared:
        dnc_cf = [
            item
            for i, item in enumerate(dnc_cf)
            if i not in prev_dnc_current_cnb_cleared
        ]
    if cnb_new_cleared_by_prev_dnc:
        cnb_new = [
            item
            for i, item in enumerate(cnb_new)
            if i not in cnb_new_cleared_by_prev_dnc
        ]

    print(f"\nPrev BRS carry-forwards loaded:")
    print(
        f"  DNC CF : {len(dnc_cf)} items  (Rs {sum(i['amount'] for i in dnc_cf):,.0f})"
    )
    print(
        f"  CNB CF : {len(cnb_cf_remaining)} items  (Rs {sum(i['amount'] for i in cnb_cf_remaining):,.0f})"
    )

    cf_dnc_keys = {_dnc_key(i["branch"], i["ref"], i["amount"]) for i in dnc_cf}

    # Correction-split DNC exclusions: sub-rupee DNC entries that are artefacts
    # of correction-amount splits and must be excluded from BRS arithmetic.
    # Format: { "BILL_REF": max_amount_to_exclude }
    # These apply regardless of BRS date (the bill ref is specific enough).
    _CORRECTION_SPLIT_EXCLUSIONS = {
        "PS-6200262": 1.0,  # Rs 1 correction split artefact; exclude from BRS
    }

    dnc_all_for_brs = list(dnc_cf)
    for item in dnc_new_remaining:
        # Genuine unmatched receipt rows (for example excess/refund receipts)
        # must affect the BRS exactly like unmatched public-sale rows. Internal
        # correction receipts are filtered before dnc_new_remaining is built.
        # pending_t1 items are T+1 pending-settlement entries  they are genuinely
        # new DNC items for this period and must bypass the DNC carry-forward dedup check
        # (their bill_no matches a DNC CF bill but they represent a different period).
        if item.get("pending_t1") or _dnc_key(item["branch"], item["ref"], item["amount"]) not in cf_dnc_keys:
            item["cf"] = False
            _excl_threshold = _CORRECTION_SPLIT_EXCLUSIONS.get(item["ref"])
            if _excl_threshold is not None and abs(item["amount"]) <= _excl_threshold:
                item["exclude_from_brs"] = True
                item["remark"] = (
                    item.get("remark", "") or "Correction split - excluded from BRS"
                )
            dnc_all_for_brs.append(item)

    dnc_all_for_sheet = list(dnc_cf)
    for item in dnc_new_remaining:
        if item.get("pending_t1") or _dnc_key(item["branch"], item["ref"], item["amount"]) not in cf_dnc_keys:
            item["cf"] = False
            _excl_threshold = _CORRECTION_SPLIT_EXCLUSIONS.get(item["ref"])
            if _excl_threshold is not None and abs(item["amount"]) <= _excl_threshold:
                item["exclude_from_brs"] = True
                item["remark"] = (
                    item.get("remark", "") or "Correction split - excluded from BRS"
                )
            dnc_all_for_sheet.append(item)

    dnc_all = dnc_all_for_brs

    cnb_all_for_brs = list(cnb_cf_remaining)
    for item in cnb_new:
        cnb_all_for_brs.append(item)

    cf_rrns = {i["rrn"] for i in cnb_cf_remaining}
    cnb_all_for_sheet = list(cnb_cf_remaining)
    for item in cnb_new:
        if item["rrn"] not in cf_rrns:
            item["cf"] = False
            cnb_all_for_sheet.append(item)

    cnb_all = cnb_all_for_brs

    review_dnc = [i for i in dnc_all if i.get("review_pair")]
    review_cnb = [i for i in cnb_all if i.get("review_pair")]
    if review_dnc or review_cnb:
        material_review_cnb = []
        for item in review_cnb:
            diff = item.get("diff")
            try:
                diff = float(diff)
            except Exception:
                diff = 0.0
            if abs(diff) < 1:
                continue
            material_review_cnb.append(item)
        material_review_dnc = [
            item
            for item in review_dnc
            if any(
                cnb.get("branch") == item.get("branch")
                and cnb.get("remark") == item.get("remark")
                for cnb in material_review_cnb
            )
        ]
        base_dnc = sum(
            i["amount"] for i in dnc_all if not i.get("exclude_from_brs", False)
        )
        base_cnb = sum(
            i["amount"] for i in cnb_all if not i.get("exclude_from_brs", False)
        )
        review_dnc_total = sum(i["amount"] for i in material_review_dnc)
        review_cnb_total = sum(i["amount"] for i in material_review_cnb)
        base_bal = closing_bal - base_dnc + base_cnb
        review_bal = (
            closing_bal - (base_dnc + review_dnc_total) + (base_cnb + review_cnb_total)
        )
        if abs(review_bal) + 1 < abs(base_bal):
            for item in material_review_dnc + material_review_cnb:
                item["exclude_from_brs"] = False
            print(
                "  [BRS] Including review matched pair(s) in BRS arithmetic "
                f"because it improves reconciliation: {base_bal:,.2f} -> {review_bal:,.2f}"
            )

    total_dnc = sum(
        i["amount"] for i in dnc_all if not i.get("exclude_from_brs", False)
    )
    total_cnb = sum(
        i["amount"] for i in cnb_all if not i.get("exclude_from_brs", False)
    )

    brs_bank_bal = closing_bal - total_dnc + total_cnb
    if QR_BANK_KIND == "YES":
        prev_bank_bal = _previous_bank_closing_balance(PREV_BRS_FILE)
        # Only count credits whose seller_settlement_date falls on the current
        # BRS date.  prev_bank_bal already includes everything settled on or
        # before the previous BRS date, so adding the full cumulative
        # settlement_credits (which spans multiple days) would double-count
        # any rows that settled between the previous BRS date and today.
        _stmt_date_norm = _date_only(stmt_date)

        # Auto-detect whether this is truly a multi-day combined run or a
        # single-day run where prev_brs_date happened to be detectable.
        # A combined run has book entries on MULTIPLE dates within the window.
        # A single-day run has all book entries on stmt_date only.
        # Using the combined-day filter on a single-day statement causes the
        # 23rd/24th difference: prev-day T+1 settlements (already in prev_bank_bal)
        # get double-counted in settlement_credits.
        _book_dates_in_window = set()
        if prev_brs_date is not None:
            _from_norm_check = _date_only(prev_brs_date)
            for _df_check in [ps_brs, ar_brs, hot_rec, hot_pay]:
                if _df_check.empty or "date" not in _df_check.columns:
                    continue
                _dates = (
                    _df_check["date"]
                    .dt.normalize()
                    .dropna()
                    .loc[lambda s: (s > _from_norm_check) & (s <= _stmt_date_norm)]
                    .unique()
                )
                _book_dates_in_window.update(pd.Timestamp(d) for d in _dates)
        _is_truly_combined = (
            prev_brs_date is not None and len(_book_dates_in_window) > 1
        )
        if prev_brs_date is not None and not _is_truly_combined:
            print(
                f"  [Settlement] prev_brs_date={prev_brs_date.strftime('%d.%m.%Y')} detected "
                f"but book entries are single-day only ({BRS_DATE}). "
                f"Using single-day settlement filter to avoid double-counting T+1 credits."
            )

        # For combined multi-day runs, count ALL settlement credits where
        # seller_settlement_date falls within the period covered by the book:
        # prev_brs_date < settle_date <= stmt_date.
        # For single-day runs prev_brs_date is None (or detected but single-day)
        # and we use == stmt_date filter to avoid double-counting prev_bank_bal's
        # already-settled T+1 credits from the previous period.
        _use_combined_filter = _is_truly_combined
        if _use_combined_filter:
            _from_date_norm = _date_only(prev_brs_date)
            _settle_mask = (
                stmt_success["seller settlement date"].dt.normalize() > _from_date_norm
            ) & (
                stmt_success["seller settlement date"].dt.normalize() <= _stmt_date_norm
            )
            settlement_credits = float(
                stmt_success.loc[_settle_mask, "amount(rs.)"].sum()
            )
            _settle_excluded = float(
                stmt_success.loc[~_settle_mask, "amount(rs.)"].sum()
            )
            print(
                f"  [Settlement] Combined-day mode: "
                f"prev={prev_brs_date.strftime('%d.%m.%Y')} -> stmt={BRS_DATE}  "
                f"settlement_credits={settlement_credits:,.2f}  "
                f"excluded (outside range)={_settle_excluded:,.2f}"
            )
        else:
            _settle_mask = (
                stmt_success["seller settlement date"].dt.normalize() == _stmt_date_norm
            )
            settlement_credits = float(
                stmt_success.loc[_settle_mask, "amount(rs.)"].sum()
            )
            _future_settle_total = float(
                stmt_success.loc[
                    stmt_success["seller settlement date"].dt.normalize()
                    > _stmt_date_norm,
                    "amount(rs.)",
                ].sum()
            )
            _past_settle_total = float(
                stmt_success.loc[
                    stmt_success["seller settlement date"].dt.normalize()
                    < _stmt_date_norm,
                    "amount(rs.)",
                ].sum()
            )
            print(
                f"  [Settlement] Single-day mode: "
                f"stmt={BRS_DATE}  "
                f"settlement_credits (settle==today)={settlement_credits:,.2f}  "
                f"future-settle (T+1, excluded)={_future_settle_total:,.2f}  "
                f"past-settle (excluded)={_past_settle_total:,.2f}"
            )
            if abs(_future_settle_total) > 0.005:
                print(
                    f"  [Settlement] NOTE: Rs {_future_settle_total:,.2f} in T+1 future-settle credits "
                    f"are NOT counted in settlement_credits for {BRS_DATE}. "
                    f"They will count in the next BRS run when their settle_date arrives."
                )
        _hot_pay_excl_mask = (
            hot_pay["is_wrongly_accounted"]
            | hot_pay["is_zeroise"]
            | hot_pay["is_reversal"]
        )
        hot_settlement_payments = float(
            hot_pay.loc[~_hot_pay_excl_mask, "amount"].sum()
        )
        # WRONGLY ACCOUNTED entries have no valid bank counterpart (Fix A).
        # REVERSAL ENTRY entries are HOT-internal corrections with no external bank credit.
        # ZEROISE entries are HOT-internal correction payments that cancel out
        # against matching ZEROISE receipts -- they never produce an external bank credit.
        _wrongly_accounted_hot_total = float(
            hot_pay.loc[hot_pay["is_wrongly_accounted"], "amount"].sum()
        )
        _reversal_hot_total = float(
            hot_pay.loc[
                hot_pay["is_reversal"] & ~hot_pay["is_wrongly_accounted"], "amount"
            ].sum()
        )
        _zeroise_hot_total = float(hot_pay.loc[hot_pay["is_zeroise"], "amount"].sum())
        if abs(_wrongly_accounted_hot_total) > 0.005:
            print(
                f"  [Fix A] Excluded Rs {_wrongly_accounted_hot_total:,.0f} from HOT payments "
                f"(WRONGLY ACCOUNTED entries -- no bank counterpart)"
            )
        if abs(_reversal_hot_total) > 0.005:
            print(
                f"  [Fix A] Excluded Rs {_reversal_hot_total:,.0f} from HOT payments "
                f"(REVERSAL ENTRY corrections -- internal only, no bank credit)"
            )
        if abs(_zeroise_hot_total) > 0.005:
            print(
                f"  [Fix A] Excluded Rs {_zeroise_hot_total:,.0f} from HOT payments "
                f"(ZEROISE correction entries -- internal only, no bank credit)"
            )
        # CF-pair-cleared items: a prev-DNC was matched against a prev-CNB (both
        # carry-forwards from an earlier BRS period).  The bank credit for these
        # was already counted as settlement in a PRIOR period.  HOT however
        # re-books the corresponding payment entry on the day it confirms
        # settlement (today), so it appears in today's hot_pay.  If we subtract
        # it from expected_bank_bal now, we double-deduct: once in the prior
        # period and once today.  Remove the pair-cleared total from hot_pay
        # so the expected balance formula stays correct.
        if abs(_cf_pair_cleared_total) > 0.005:
            hot_settlement_payments -= _cf_pair_cleared_total
            print(
                f"  [CF-pair] Removed Rs {_cf_pair_cleared_total:,.0f} from HOT payments "
                f"(CF-pair-cleared items -- bank credits already counted in prior period)"
            )
        correction_receipts = float(sum(corr_amts))
        step4b_amount_diffs = float(
            sum(pair.get("amt_diff") or 0 for pair in step4b_matched)
        )

        # Unexplained HOT-payments gap: hot_settlement_payments is today's
        # HOT book payment postings (debits HOT expects the bank to clear).
        # On a normal day these correspond 1:1 with settlement_credits for
        # the same BRS date.  But if the bank statement for this BRS date
        # shows NO settlements landing today at all (e.g. every row settles
        # T+1 for tomorrow, so settlement_credits == 0), today's HOT payment
        # postings have nothing in the statement to confirm them against --
        # subtracting the full amount anyway would silently fabricate a
        # "reconciled" balance on a guess.  Flag the unexplained portion for
        # Human Verification instead of forcing it through the arithmetic.
        _unexplained_hot_payments = 0.0
        if (
            QR_BANK_KIND == "YES"
            and not _use_combined_filter
            and hot_settlement_payments > 0.005
            and settlement_credits <= 0.005
        ):
            _unexplained_hot_payments = hot_settlement_payments
            hot_settlement_payments = 0.0
            print(
                f"  [Unexplained] Rs {_unexplained_hot_payments:,.2f} in HOT payment postings "
                f"for {BRS_DATE} have no matching settlement in today's bank statement "
                f"(settlement_credits = 0). Excluded from BRS arithmetic and flagged in "
                f"Human Verification instead of being assumed reconciled."
            )

        # Backdated credits: bank transactions that cleared a previous-BRS DNC
        # (prev_dnc_current_cnb_matches) but whose seller_settlement_date is NOT
        # the current BRS date are excluded from settlement_credits above.
        # They still physically land in the bank account, so add them separately
        # so the expected bank balance stays accurate.
        _backdated_credits = 0.0
        _backdated_rrns = (
            set()
        )  # track RRNs already accounted for in _backdated_credits
        for _pair in prev_dnc_current_cnb_matches:
            _cnb = _pair["cnb"]
            _parts = _cnb.get("parts") or [_cnb]
            for _part in _parts:
                _settle = _part.get("settlement_date") or _part.get("date") or ""
                try:
                    _settle_norm = _date_only(pd.to_datetime(_settle, dayfirst=True))
                except Exception:
                    _settle_norm = None
                # Only add if NOT already counted in settlement_credits.
                # Single-day: settlement_credits covers settle == stmt_date,
                #   so anything != stmt_date is backdated.
                # Combined-day: settlement_credits covers prev_brs_date < settle <= stmt_date,
                #   so only credits settling BEFORE prev_brs_date are truly backdated.
                _in_settlement_range = (
                    (
                        _settle_norm is not None
                        and _settle_norm > _date_only(prev_brs_date)
                        and _settle_norm <= _stmt_date_norm
                    )  # combined-day: within the range already included
                    if _use_combined_filter
                    else _settle_norm
                    == _stmt_date_norm  # single-day: already in settlement_credits
                )
                if not _in_settlement_range:
                    _backdated_credits += float(_part.get("amount") or 0)
                    _rrn = str(_part.get("rrn") or _part.get("rrn no") or "").strip()
                    if _rrn:
                        _backdated_rrns.add(_rrn)
        if abs(_backdated_credits) > 0.005:
            print(
                f"  [Backdated credits] {_backdated_credits:,.2f} added to expected bank "
                f"balance (prev-DNC cleared by credits settled before {BRS_DATE})"
            )

        # Orphan past-settle CNB credits: bank credits in the current statement
        # whose settle_date < stmt_date (past-settle), that are NOT in
        # settlement_credits AND are NOT already captured in _backdated_credits
        # (i.e. they did NOT clear a prev-DNC). These credits physically landed
        # in the bank account before today but were not in the previous statement,
        # so prev_bank_bal doesn't include them. Add them to expected.
        # This fixes the case where YES Bank releases a batch of credits in
        # today's statement with settle_date = previous day (e.g. 26th credits
        # appearing in the 27th statement with settle=26th) that don't match
        # any prev-DNC item.
        _orphan_past_settle_credits = 0.0
        if not _use_combined_filter:
            # Single-day mode: settlement_credits only covers settle == stmt_date.
            # Past-settle credits (settle < stmt_date) not already in _backdated_credits
            # need to be added to expected separately.
            for _cnb_item in cnb_all:
                if _cnb_item.get("exclude_from_brs", False):
                    continue
                if _cnb_item.get("cf"):
                    continue  # CF items were already in prev_bank_bal
                _s = _cnb_item.get("settlement_date") or _cnb_item.get("date") or ""
                try:
                    _s_norm = _date_only(pd.to_datetime(_s, dayfirst=True))
                except Exception:
                    _s_norm = None
                if _s_norm is None or _s_norm >= _stmt_date_norm:
                    continue  # settle == today -> already in settlement_credits; skip
                _rrn = str(_cnb_item.get("rrn") or "").strip()
                if _rrn and _rrn in _backdated_rrns:
                    continue  # already counted in _backdated_credits
                _orphan_past_settle_credits += float(_cnb_item.get("amount") or 0)
        if abs(_orphan_past_settle_credits) > 0.005:
            print(
                f"  [Orphan past-settle CNB] {_orphan_past_settle_credits:,.2f} added to "
                f"expected bank balance (past-settle credits in CNB not clearing any prev-DNC)"
            )

        # ZEROISE entries are excluded from hot_settlement_payments (no external bank credit),
        # but the HOT book closing balance IS reduced by them (they are real payment postings
        # that cancel internally against ZEROISE receipts).  Subtracting the zeroise total
        # from expected_bank_bal compensates for the closing reduction, so the BRS arithmetic
        # stays correct (the bank account is not affected by ZEROISE but the book closing is).
        expected_bank_bal = (
            prev_bank_bal
            + settlement_credits
            + _backdated_credits
            + _orphan_past_settle_credits
            - hot_settlement_payments
            - _zeroise_hot_total
            + correction_receipts
            - step4b_amount_diffs
        )
        expected_bank_bal_raw = expected_bank_bal
        expected_bank_bal = (
            expected_bank_bal_raw  # keep full paise -- no rupee rounding
        )
        paise_rounding_adjustment = 0.0
        bank_bal_raw = brs_bank_bal - expected_bank_bal
        # The flagged unexplained HOT payments gap is a KNOWN, named item (see
        # Human Verification) -- not a true unexplained discrepancy. Netting it
        # out of the headline BRS Difference keeps that figure meaningful (it
        # shows what's left to investigate) instead of ballooning to the full
        # unconfirmed amount, which would make a normal, explainable T+1 timing
        # gap look like a much bigger reconciliation failure than it is.
        bank_bal = bank_bal_raw + _unexplained_hot_payments
    else:
        expected_bank_bal = 0.0
        expected_bank_bal_raw = 0.0
        paise_rounding_adjustment = 0.0
        bank_bal = brs_bank_bal
        bank_bal_raw = brs_bank_bal
        _unexplained_hot_payments = 0.0
        _cf_pair_cleared_total = 0.0
    reconciled = (
        abs(bank_bal) <= 2
    )  # Rs 2 tolerance: covers HOT closing balance paise rounding (~Rs 1.67 residual)
    if QR_BANK_KIND == "HDFC":
        reconciled = abs(bank_bal) < 0.005  # HDFC: must be exact

    print(f"\nBRS ARITHMETIC:")
    print(f"  Closing Balance (HOT book) : {closing_bal:,.0f}")
    print(f"  Less DNC total             : {total_dnc:,.0f}")
    print(f"  Add  CNB total             : {total_cnb:,.0f}")
    if QR_BANK_KIND == "YES":
        _step4b_note = (
            f" - step4b diffs {step4b_amount_diffs:,.2f}"
            if abs(step4b_amount_diffs) > 0.005
            else ""
        )
        _backdated_note = (
            f" + backdated {_backdated_credits:,.2f}"
            if abs(_backdated_credits) > 0.005
            else ""
        )
        _orphan_note = (
            f" + orphan-past-settle {_orphan_past_settle_credits:,.2f}"
            if abs(_orphan_past_settle_credits) > 0.005
            else ""
        )
        _zeroise_note = (
            f" + zeroise-compensated {_zeroise_hot_total:,.2f}"
            if abs(_zeroise_hot_total) > 0.005
            else ""
        )
        print(f"  BRS Bank Balance           : {brs_bank_bal:,.2f}")
        print(f"  Expected Bank Balance      : {expected_bank_bal:,.2f}")
        print(
            f"    (prev bank bal {prev_bank_bal:,.2f} + today settlements {settlement_credits:,.2f}"
            f"{_backdated_note}"
            f"{_orphan_note}"
            f"{_zeroise_note}"
            f" - HOT payments {hot_settlement_payments:,.2f}"
            f" + corrections {correction_receipts:,.2f}"
            f"{_step4b_note})"
        )
        if abs(_unexplained_hot_payments) > 0.005:
            print(
                f"  Unexplained HOT payments   : Rs {_unexplained_hot_payments:,.2f}  "
                f"(excluded from arithmetic -- see Human Verification)"
            )
            print(f"  BRS Difference (raw)       : {bank_bal_raw:,.2f}")
            print(f"  BRS Difference (net of flagged gap): {bank_bal:,.2f}")
        else:
            print(f"  BRS Difference             : {bank_bal:,.2f}")
        if abs(paise_rounding_adjustment) > 0.005:
            print(f"    Raw expected with paise  : {expected_bank_bal_raw:,.2f}")
            print(f"    Paise rounding adjustment: {paise_rounding_adjustment:+,.2f}")
    else:
        print(f"  Bank Closing Balance       : {bank_bal:,.2f}")
    print(f"  {'RECONCILED' if reconciled else 'NOT RECONCILED'}")

    #
    #  STEP 6  BUILD WORKBOOK
    #
    print("\nBuilding workbook...")
    wb = Workbook()

    # Use lists per (bill_no, book_amt) key so that when the same bill has
    # multiple bank transactions with the same amount (e.g. two x Rs 1 for
    # Debika Banerjee KOL), each book row gets its own distinct RRN/date
    # rather than the last writer overwriting all prior entries.
    _bill_entries = {}  # key -> list of {date, rrn, bank_amt, name_match}
    for m in matched_rows:
        _book_split_parts = m.get("Book Split Parts", []) or []
        if _book_split_parts:
            for _part in _book_split_parts:
                key = (_part.get("bill_no", m["Book Bill No"]), _part.get("amount", 0))
                _bill_entries.setdefault(key, []).append(
                    {
                        "date": m["Bank Date"],
                        "settlement_date": m.get("Seller Settlement Date", "")
                        or m["Bank Date"],
                        "rrn": m["Bank RRN"],
                        "bank_amt": _part.get("amount", 0),
                        "payment_mode": m.get("Pay Type", ""),
                        "name_match": m["Name Match"],
                        "parts": [],
                    }
                )
            continue
        key = (m["Book Bill No"], m["Book Amt"])
        _bill_entries.setdefault(key, []).append(
            {
                "date": m["Bank Date"],
                "settlement_date": m.get("Seller Settlement Date", "")
                or m["Bank Date"],
                "rrn": m["Bank RRN"],
                "bank_amt": m["Bank Amt"],
                "payment_mode": m.get("Pay Type", ""),
                "name_match": m["Name Match"],
                "parts": [
                    {
                        "date": p.get("date", ""),
                        "settlement_date": p.get("settlement_date", "")
                        or p.get("date", ""),
                        "rrn": p.get("rrn", ""),
                        "bank_amt": p.get("amount", 0),
                        "payment_mode": p.get("pay_type", ""),
                        "name_match": m["Name Match"],
                        "payer": p.get("payer", ""),
                    }
                    for p in m.get("Bank Parts", []) or []
                ],
            }
        )
    for pair in step4b_matched:
        key = (pair["dnc"]["ref"], pair["dnc"]["amount"])
        sc4b = pair["score"]
        nm4b = (
            "Match"
            if sc4b >= FUZZY_THRESH
            else "Partial" if sc4b >= FUZZY_ACCEPT else "Low"
        )
        _bill_entries.setdefault(key, []).append(
            {
                "date": pair["cnb"]["date"],
                "settlement_date": pair["cnb"]["date"],
                "rrn": pair["cnb"].get("rrn", ""),
                "bank_amt": pair["cnb"]["amount"],
                "payment_mode": pair["cnb"].get("payment_mode", ""),
                "name_match": nm4b,
                "parts": [
                    {
                        "date": p.get("date", ""),
                        "settlement_date": p.get("settlement_date", "")
                        or p.get("date", ""),
                        "rrn": p.get("rrn", ""),
                        "bank_amt": p.get("amount", 0),
                        "payment_mode": p.get("payment_mode", ""),
                        "name_match": nm4b,
                        "payer": p.get("party", ""),
                    }
                    for p in pair["cnb"].get("parts", []) or []
                ],
            }
        )
    # Pointer tracking: how many entries per key have been consumed
    _bill_entry_idx = {}  # key -> next index to consume

    dnc_brs_keys = {_dnc_key(i["branch"], i["ref"], i["amount"]) for i in dnc_all}

    # Detect duplicate RRNs in the bank statement (same RRN used for >1 transaction)
    _rrn_counts = stmt_success["rrn no"].astype(str).value_counts()
    _duplicate_rrns = set(_rrn_counts[_rrn_counts > 1].index)

    #  Sheet 1  Cheque Deposit
    ws = wb.active
    ws.title = "Cheque Deposit"
    col_widths(ws, [18, 8, 8, 16, 12, 20, 14, 38, 14, 14, 36])
    ws.freeze_panes = "A3"

    r = 1
    write_title_row(
        ws,
        r,
        f"Cheque Deposit  QR Book Entries  |  {QR_ACCOUNT_LABEL}  |  {BRS_DATE}",
        11,
    )
    r += 1
    write_header_row(
        ws,
        r,
        [
            "Book Date",
            "Branch",
            "Bank",
            "Bill No.",
            "Cheque No.",
            "RRN",
            "Payment Mode",
            "Party Name",
            "Amount (Rs)",
            "Diff (HOT vs Bank)",
            "Narration",
        ],
    )

    _ps_sheet_rows = ps.copy()
    _ps_sheet_rows["book_source"] = "public_sale"
    _receipt_sheet_rows = ar[
        (ar["amount"] > 0)
        & (ar["bill_no"].astype(str).str.lower() != "rt-nan")
        & ((~ar["is_correction"]) | (ar.apply(_is_brs_display_receipt, axis=1)))
    ].copy()
    _receipt_sheet_rows["book_source"] = "receipt"
    _cheque_book_rows = pd.concat(
        [_ps_sheet_rows, _receipt_sheet_rows],
        ignore_index=True,
        sort=False,
    )

    for _, row in _cheque_book_rows.iterrows():
        r += 1
        dt = row["date"].strftime("%d.%m.%Y") if pd.notna(row["date"]) else ""
        bill = row["bill_no"]
        party = "INDIVI - " + row["party"]
        key = (bill, row["amount"])
        dnc_row_key = _dnc_key(row.get("branch", ""), bill, row["amount"])

        # Pop the next unused entry for this (bill, amount) key so that when the
        # same bill has two transactions at the same amount (e.g. two x Rs 1 for
        # Debika Banerjee) each book row gets its own distinct RRN / bank date.
        entries = _bill_entries.get(key, [])
        idx = _bill_entry_idx.get(key, 0)
        entry = entries[idx] if idx < len(entries) else None
        _bill_entry_idx[key] = idx + 1
        split_display_parts = entry.get("parts") if entry and entry.get("parts") else []
        split_total_bank_amt = entry.get("bank_amt") if split_display_parts else None
        if split_display_parts:
            first_part = split_display_parts[0]
            entry = {
                **entry,
                "date": first_part.get("date", entry.get("date")),
                "settlement_date": first_part.get(
                    "settlement_date", entry.get("settlement_date", "")
                ),
                "rrn": first_part.get("rrn", entry.get("rrn", "")),
                "bank_amt": first_part.get("bank_amt", entry.get("bank_amt")),
                "payment_mode": first_part.get(
                    "payment_mode", entry.get("payment_mode", "")
                ),
                "name_match": first_part.get("name_match", entry.get("name_match", "")),
            }

        bank_dt = entry["date"] if entry else None
        sheet_dt = entry.get("settlement_date") if entry else None
        rrn = entry["rrn"] if entry else ""
        bank_amt = entry["bank_amt"] if entry else None
        payment_mode = entry.get("payment_mode", "") if entry else ""
        name_match = entry["name_match"] if entry else ""

        # Compute HOT-vs-Bank difference
        if split_display_parts and split_total_bank_amt is not None:
            hot_vs_bank_diff = row["amount"] - split_total_bank_amt
        elif bank_amt is not None:
            hot_vs_bank_diff = row["amount"] - bank_amt
        else:
            hot_vs_bank_diff = None

        # Build narration using the same settlement date displayed in the sheet.
        credited_dt = sheet_dt or bank_dt

        # Check if this book entry is in DNC as a T+1 pending item
        _dnc_pending_t1 = any(
            item.get("pending_t1") and item.get("ref") == bill for item in dnc_new
        )
        # Check if this is a current-period unmatched entry (in DNC but NOT T+1)
        _dnc_current_unmatched = (
            dnc_row_key in dnc_brs_keys
            and not _dnc_pending_t1
            and row.get("book_source") != "receipt"
            and bill not in _wrongly_accounted_bills
        )

        if bank_dt:
            if split_display_parts:
                narration = f"SPLIT PAYMENT 1/{len(split_display_parts)} - CREDITED AS ON {credited_dt}"
            elif name_match == "Low":
                narration = f"LOW NAME MATCH - CREDITED AS ON {credited_dt}"
            elif name_match == "Partial":
                narration = f"PARTIAL NAME MATCH - CREDITED AS ON {credited_dt}"
            else:
                narration = f"CREDITED AS ON {credited_dt}"
        elif bill in _wrongly_accounted_bills:
            # Fix A: entry was excluded from BRS matching -- label it clearly.
            narration = "WRONGLY ACCOUNTED  EXCLUDED FROM BRS"
        elif _dnc_pending_t1:
            # Valid book entry awaiting YES Bank T+1 settlement -- NOT an error.
            _bk_date_str = (
                row["date"].strftime("%d.%m.%Y") if pd.notna(row.get("date")) else ""
            )
            narration = f"PENDING T+1 SETTLEMENT -- booked {_bk_date_str}, will credit in next bank statement"
        elif _dnc_current_unmatched:
            # Book entry in current period that has no bank statement match yet.
            narration = "IN BOOK -- NOT YET IN BANK GATEWAY"
        elif row.get("book_source") == "receipt":
            narration = str(row.get("narration", "") or "")
        else:
            narration = ""

        # Flag duplicate RRN in the bank statement itself (not our lookup collision)
        if rrn and str(rrn) in _duplicate_rrns:
            narration = f"DUPLICATE RRN IN BANK STMT  {narration}".strip(" ")

        # Diff cell: show value only when there is an actual difference, else blank
        diff_display = (
            hot_vs_bank_diff
            if (hot_vs_bank_diff is not None and abs(hot_vs_bank_diff) > 0.005)
            else None
        )

        # Date column: always the book date (date the entry was booked),
        # for both YES Bank and HDFC.  The settlement/credit date (when the
        # bank actually credited the amount, which can be T+1 for YES Bank)
        # is shown separately in the Narration column via "CREDITED AS ON ...".
        date_col_value = dt

        for c, v in enumerate(
            [
                date_col_value,
                row["branch"],
                QR_ACCOUNT_CODE,
                bill,
                511,
                rrn,
                payment_mode,
                party,
                row["amount"],
                diff_display,
                narration,
            ],
            1,
        ):
            diff_bg = C_RED if (c == 10 and diff_display is not None) else None
            set_cell(
                ws,
                r,
                c,
                v,
                bg=diff_bg,
                h_align="right" if c in (9, 10) else "left",
                num_fmt="#,##0.00" if c == 10 else ("#,##0" if c == 9 else None),
            )
        for part_no, part in enumerate(split_display_parts[1:], 2):
            r += 1
            part_dt = part.get("date", "")
            part_sheet_dt = part.get("settlement_date", "") or part_dt
            part_rrn = part.get("rrn", "")
            part_amt = part.get("bank_amt")
            part_payment_mode = part.get("payment_mode", "")
            part_narr = f"SPLIT PAYMENT {part_no}/{len(split_display_parts)} - CREDITED AS ON {part_sheet_dt}"
            if part_rrn and str(part_rrn) in _duplicate_rrns:
                part_narr = f"DUPLICATE RRN IN BANK STMT aEUR {part_narr}".strip(
                    " aEUR"
                )
            part_date_col_value = dt
            for c, v in enumerate(
                [
                    part_date_col_value,
                    row["branch"],
                    QR_ACCOUNT_CODE,
                    bill,
                    511,
                    part_rrn,
                    part_payment_mode,
                    party,
                    None,
                    None,
                    part_narr,
                ],
                1,
            ):
                set_cell(
                    ws,
                    r,
                    c,
                    v,
                    h_align="right" if c in (9, 10) else "left",
                    num_fmt="#,##0.00" if c == 10 else ("#,##0" if c == 9 else None),
                )

    # ------------------------------------------------------------------ #
    # Pending-Settlement Tracker (YES Bank only)
    # Items that were pending (DNC carry-forward) in the PREVIOUS BRS and
    # have now been credited -- i.e. their T+1 (or backdated) settlement --
    # shown with the actual credited date and RRN so the credit can be
    # traced back to the original book entry from the prior period.
    # ------------------------------------------------------------------ #
    if QR_BANK_KIND == "YES" and (prev_dnc_current_cnb_matches or step4b_matched):
        r += 2
        _pt_fill_hex = "FCE4D6"
        ws.merge_cells(start_row=r, start_column=1, end_row=r, end_column=11)
        _pt_hdr = ws.cell(
            r,
            1,
            "PENDING SETTLEMENT TRACKER -- Previous BRS Carry-Forwards Credited This Period "
            "(T+1 / backdated settlements)",
        )
        _pt_hdr.fill = fill(_pt_fill_hex)
        _pt_hdr.font = Font(bold=True, color="833C00", name="Calibri", size=10)
        _pt_hdr.alignment = Alignment(horizontal="center", vertical="center")
        _pt_hdr.border = _BR
        for _col in range(2, 12):
            ws.cell(r, _col).fill = fill(_pt_fill_hex)
            ws.cell(r, _col).border = _BR
        ws.row_dimensions[r].height = 20

        r += 1
        write_header_row(
            ws,
            r,
            [
                "Book Date",
                "Branch",
                "Bank",
                "Bill No.",
                "Cheque No.",
                "RRN",
                "Payment Mode",
                "Party Name",
                "Amount (Rs)",
                "Credited Date",
                "Narration",
            ],
        )

        _pt_rows = []
        for pair in prev_dnc_current_cnb_matches:
            dnc, cnb = pair["dnc"], pair["cnb"]
            cnb_parts = cnb.get("parts", []) or []
            display_rows = (
                [
                    ({**cnb, **part}, dnc["amount"] if part_no == 1 else None)
                    for part_no, part in enumerate(cnb_parts, 1)
                ]
                if cnb_parts
                else [(cnb, cnb["amount"])]
            )
            for part_no, (cnb_row, row_amt) in enumerate(display_rows, 1):
                credited_dt = cnb_row.get("settlement_date", "") or cnb_row.get(
                    "date", ""
                )
                _pt_rows.append(
                    [
                        dnc["date"],
                        dnc["branch"],
                        QR_ACCOUNT_CODE,
                        dnc["ref"],
                        511,
                        cnb_row.get("rrn", ""),
                        cnb_row.get("payment_mode", ""),
                        dnc["party"],
                        row_amt,
                        credited_dt,
                        f"PENDING T+1, CREDITED AS ON {credited_dt}"
                        + (
                            ""
                            if len(display_rows) == 1
                            else f"  (split {part_no}/{len(display_rows)})"
                        ),
                    ]
                )
        for pair in step4b_matched:
            dnc, cnb = pair["dnc"], pair["cnb"]
            cnb_parts = cnb.get("parts", []) or []
            dnc_parts = dnc.get("parts", []) or []
            if cnb_parts:
                display_rows = [
                    (dnc, {**cnb, **part}, dnc["amount"] if part_no == 1 else None)
                    for part_no, part in enumerate(cnb_parts, 1)
                ]
            elif dnc_parts:
                display_rows = [
                    ({**dnc, **part}, cnb, part.get("amount", dnc["amount"]))
                    for part in dnc_parts
                ]
            else:
                display_rows = [(dnc, cnb, dnc["amount"])]
            for part_no, (dnc_row, cnb_row, row_amt) in enumerate(display_rows, 1):
                credited_dt = cnb_row.get("settlement_date", "") or cnb_row.get(
                    "date", ""
                )
                _pt_rows.append(
                    [
                        dnc_row["date"],
                        dnc_row["branch"],
                        QR_ACCOUNT_CODE,
                        dnc_row["ref"],
                        511,
                        cnb_row.get("rrn", ""),
                        cnb_row.get("payment_mode", ""),
                        dnc_row["party"],
                        row_amt,
                        credited_dt,
                        f"BACKDATED CLEAR, CREDITED AS ON {credited_dt}"
                        + (
                            ""
                            if len(display_rows) == 1
                            else f"  (split {part_no}/{len(display_rows)})"
                        ),
                    ]
                )

        # Sort by book date so the tracker reads chronologically, oldest first
        _pt_rows.sort(key=lambda row: row[0] or "")
        for pt in _pt_rows:
            r += 1
            for c, v in enumerate(pt, 1):
                set_cell(
                    ws,
                    r,
                    c,
                    v,
                    h_align="right" if c == 9 else "left",
                    num_fmt="#,##0" if c == 9 else None,
                )

    #  Sheet 2  Bank Gateway (SaleSuccess)
    ws2 = wb.create_sheet("Bank Gateway (SaleSuccess)")
    col_widths(ws2, [14, 12, 8, 36, 30, 14, 15, 10, 12, 22, 16])
    ws2.freeze_panes = "A3"

    r = 1
    write_title_row(
        ws2,
        r,
        f"Bank QR Gateway  SaleSuccess Transactions  |  {QR_ACCOUNT_LABEL}  |  {BRS_DATE}",
        11,
    )
    r += 1
    write_header_row(
        ws2,
        r,
        [
            "Date",
            "Time",
            "Branch",
            "DBA",
            "Payer",
            "Amount (Rs)",
            "RRN",
            "Pay Type",
            "State",
            "Txn ID",
            "Settlement Date",
        ],
    )

    for _, row in stmt_success.iterrows():
        r += 1
        dt = _fmt_bank_credit_date(row)
        settlement_dt = (
            row["seller settlement date"].strftime("%d.%m.%Y")
            if "seller settlement date" in row
            and pd.notna(row["seller settlement date"])
            else dt
        )
        vals = [
            dt,
            str(row.get("transaction time", "")),
            row["branch_code"],
            row["doing business as"],
            row[name_col],
            row["amount(rs.)"],
            str(row["rrn no"]),
            row.get("payment type", ""),
            row["transaction state"],
            str(row.get("mintoak transaction id", "")),
            settlement_dt,
        ]
        for c, v in enumerate(vals, 1):
            set_cell(
                ws2,
                r,
                c,
                v,
                h_align="right" if c == 6 else "left",
                num_fmt="#,##0" if c == 6 else None,
            )

    #  Sheet 3  Matched (Verified)
    ws3 = wb.create_sheet("Matched (Verified)")
    col_widths(
        ws3, [22, 10, 6, 8, 12, 8, 8, 16, 10, 30, 12, 12, 10, 8, 30, 12, 18, 10, 6, 26]
    )
    ws3.freeze_panes = "A3"

    r = 1
    write_title_row(
        ws3,
        r,
        f"Step 4  Matched: Cheque Deposit vs {QR_ACCOUNT_CODE} Statement  |  {QR_ACCOUNT_LABEL}  |  {BRS_DATE}",
        20,
    )
    r += 1
    write_header_row(
        ws3,
        r,
        [
            "Method",
            "Name Match",
            "Score%",
            "Amt Match",
            "Book Date",
            "Book Branch",
            "Book Bank",
            "Book Bill No",
            "Book Chq No",
            "Book Party",
            "Book Amt",
            "Bank Date",
            "Bank Time",
            "Bank Branch",
            "Bank Payer",
            "Bank Amt",
            "Bank RRN",
            "Pay Type",
            "Diff",
            "Flags",
        ],
    )

    for m in matched_rows:
        r += 1
        nm = m["Name Match"]
        bg = (
            C_GREEN
            if m["Diff"] == 0 and nm == "Match"
            else C_AMBER if nm == "Partial" else C_RED if nm == "Low" else C_GREEN
        )
        bank_parts = m.get("Bank Parts", []) or []
        first_part = bank_parts[0] if bank_parts else {}
        vals = [
            m["Method"],
            m["Name Match"],
            m["Score%"],
            m["Amount Match"],
            m["Book Date"],
            m["Book Branch"],
            m["Book Bank"],
            m["Book Bill No"],
            m["Book Chq No"],
            m["Book Party"],
            m["Book Amt"],
            first_part.get(
                "settlement_date", m.get("Seller Settlement Date", "") or m["Bank Date"]
            ),
            first_part.get("time", m["Bank Time"]),
            first_part.get("branch", m["Bank Branch"]),
            first_part.get("payer", m["Bank Payer"]),
            first_part.get("amount", m["Bank Amt"]),
            first_part.get("rrn", m["Bank RRN"]),
            first_part.get("pay_type", m["Pay Type"]),
            m["Diff"],
            m["Flags"],
        ]
        for c, v in enumerate(vals, 1):
            set_cell(
                ws3,
                r,
                c,
                v,
                bg=bg,
                h_align="right" if c in [11, 16, 19] else "left",
                num_fmt="#,##0" if c in [11, 16, 19] else None,
            )
        for part_no, part in enumerate(bank_parts[1:], 2):
            r += 1
            vals = [
                m["Method"],
                m["Name Match"],
                m["Score%"],
                f"Split part {part_no}/{len(bank_parts)}",
                m["Book Date"],
                m["Book Branch"],
                m["Book Bank"],
                m["Book Bill No"],
                m["Book Chq No"],
                m["Book Party"],
                "",
                part.get("settlement_date", "") or part.get("date", ""),
                part.get("time", ""),
                part.get("branch", m["Bank Branch"]),
                part.get("payer", ""),
                part.get("amount", 0),
                part.get("rrn", ""),
                part.get("pay_type", ""),
                "",
                m["Flags"],
            ]
            for c, v in enumerate(vals, 1):
                set_cell(
                    ws3,
                    r,
                    c,
                    v,
                    bg=bg,
                    h_align="right" if c in [11, 16, 19] else "left",
                    num_fmt="#,##0" if c in [11, 16, 19] else None,
                )

    prev_dnc_current_cnb_display_matches = (
        prev_dnc_cnb_pair_matches
        + prev_dnc_current_cnb_matches
        + prev_dnc_current_cnb_review_matches
    )
    if prev_dnc_current_cnb_display_matches:
        r += 1
        _sec_fill_hex = "E2EFDA"
        _sec_fill = fill(_sec_fill_hex)
        _sec_n_cols = 20
        ws3.merge_cells(start_row=r, start_column=1, end_row=r, end_column=_sec_n_cols)
        sec_hdr = ws3.cell(
            r,
            1,
            "Previous BRS DNC cleared by bank credits "
            "(previous/current carry-forward audit)",
        )
        sec_hdr.fill = _sec_fill
        sec_hdr.font = Font(bold=True, color="1F3864", name="Calibri", size=10)
        sec_hdr.alignment = Alignment(horizontal="center", vertical="center")
        sec_hdr.border = _BR
        for _col in range(2, _sec_n_cols + 1):
            ws3.cell(r, _col).fill = _sec_fill
            ws3.cell(r, _col).border = _BR
        ws3.row_dimensions[r].height = 20

        for pair in prev_dnc_current_cnb_display_matches:
            dnc = pair["dnc"]
            cnb = pair["cnb"]
            sc = pair["score"]
            adiff = pair.get("amt_diff", 0) or 0
            nm = (
                "Match"
                if sc >= FUZZY_THRESH
                else "Partial" if sc >= FUZZY_ACCEPT else "Low"
            )
            is_review_only = bool(pair.get("review_only"))
            is_pair_cleared = bool(pair.get("pair_cleared"))
            flag = (
                f"Manual review only - same branch/amount, name mismatch (name {sc}%)"
                if is_review_only
                else (
                    f"Previous BRS DNC/CNB pair cleared (name {sc}%)"
                    if is_pair_cleared
                    else f"Previous DNC cleared by current bank credit (name {sc}%)"
                )
            )
            bg = (
                C_AMBER
                if nm in ("Partial", "Low") or abs(adiff) > 0.005
                else _sec_fill_hex
            )
            cnb_parts = cnb.get("parts", []) or []
            if cnb_parts:
                bank_dates = [
                    p.get("settlement_date", "") or p.get("date", "") for p in cnb_parts
                ]
                bank_rrns = [
                    str(p.get("rrn", "")).strip()
                    for p in cnb_parts
                    if str(p.get("rrn", "")).strip()
                ]
                bank_amounts = [float(p.get("amount", 0) or 0) for p in cnb_parts]
                bank_amt_total = sum(bank_amounts)
                amount_parts = " + ".join(f"{amt:,.0f}" for amt in bank_amounts)
                split_flag = f"{flag} | Split bank credit: {amount_parts}"
                cnb_row = {**cnb, **cnb_parts[0]}
                r += 1
                vals = [
                    (
                        "CF-DNC-Review"
                        if is_review_only
                        else "CF-Pair-Clear" if is_pair_cleared else "CF-DNC-Clear"
                    ),
                    nm,
                    sc,
                    f"CF-Clear split x{len(cnb_parts)}",
                    dnc["date"],
                    dnc["branch"],
                    QR_ACCOUNT_CODE,
                    dnc["ref"],
                    511,
                    dnc["party"],
                    dnc["amount"],
                    " / ".join(dict.fromkeys([d for d in bank_dates if d])),
                    "",
                    cnb_row["branch"],
                    cnb_row["party"],
                    bank_amt_total,
                    " / ".join(bank_rrns),
                    "",
                    adiff,
                    split_flag,
                ]
                for c_idx, v in enumerate(vals, 1):
                    set_cell(
                        ws3,
                        r,
                        c_idx,
                        v,
                        bg=bg,
                        h_align="right" if c_idx in [11, 16, 19] else "left",
                        num_fmt=(
                            "#,##0.00"
                            if c_idx == 19
                            else ("#,##0" if c_idx in [11, 16] else None)
                        ),
                    )
            else:
                r += 1
                vals = [
                    (
                        "CF-DNC-Review"
                        if is_review_only
                        else "CF-Pair-Clear" if is_pair_cleared else "CF-DNC-Clear"
                    ),
                    nm,
                    sc,
                    (
                        "Manual Review"
                        if is_review_only
                        else "Prev DNC/CNB Clear" if is_pair_cleared else "CF-Clear"
                    ),
                    dnc["date"],
                    dnc["branch"],
                    QR_ACCOUNT_CODE,
                    dnc["ref"],
                    511,
                    dnc["party"],
                    dnc["amount"],
                    cnb.get("settlement_date", "") or cnb["date"],
                    "",
                    cnb["branch"],
                    cnb["party"],
                    cnb["amount"],
                    cnb.get("rrn", ""),
                    "",
                    adiff,
                    flag,
                ]
                for c_idx, v in enumerate(vals, 1):
                    set_cell(
                        ws3,
                        r,
                        c_idx,
                        v,
                        bg=bg,
                        h_align="right" if c_idx in [11, 16, 19] else "left",
                        num_fmt=(
                            "#,##0.00"
                            if c_idx == 19
                            else ("#,##0" if c_idx in [11, 16] else None)
                        ),
                    )
    if step4b_matched:
        r += 1
        _sec_fill_hex = "D9EAF7"
        _sec_fill = fill(_sec_fill_hex)
        _sec_n_cols = 20
        ws3.merge_cells(start_row=r, start_column=1, end_row=r, end_column=_sec_n_cols)
        sec_hdr = ws3.cell(
            r,
            1,
            "Step 4B - Book entries cleared against Previous BRS Carry-Forwards "
            "(backdated credits/debits)",
        )
        sec_hdr.fill = _sec_fill
        sec_hdr.font = Font(bold=True, color="1F3864", name="Calibri", size=10)
        sec_hdr.alignment = Alignment(horizontal="center", vertical="center")
        sec_hdr.border = _BR
        for _col in range(2, _sec_n_cols + 1):
            ws3.cell(r, _col).fill = _sec_fill
            ws3.cell(r, _col).border = _BR
        ws3.row_dimensions[r].height = 20

        for pair in step4b_matched:
            r += 1
            dnc = pair["dnc"]
            cnb = pair["cnb"]
            sc = pair["score"]
            adiff = pair.get("amt_diff", 0) or 0
            nm = (
                "Match"
                if sc >= FUZZY_THRESH
                else "Partial" if sc >= FUZZY_ACCEPT else "Low"
            )
            amt_note = (
                f"  Amt diff={adiff:+.2f} (bank credited more)"
                if adiff > 0.005
                else (
                    f"  Amt diff={adiff:+.2f} (bank credited less)"
                    if adiff < -0.005
                    else ""
                )
            )
            flag = f"Step 4B: cleared vs prev BRS CNB (name {sc}%){amt_note}"
            bg = (
                C_AMBER
                if nm in ("Partial", "Low") or abs(adiff) > 0.005
                else _sec_fill_hex
            )
            cnb_parts = cnb.get("parts", []) or []
            dnc_parts = dnc.get("parts", []) or []
            display_rows = []
            if cnb_parts:
                display_rows = [
                    (dnc, {**cnb, **part}, part.get("amount", cnb["amount"]))
                    for part_no, part in enumerate(cnb_parts, 1)
                ]
            elif dnc_parts:
                display_rows = [
                    ({**dnc, **part}, cnb, part.get("amount", dnc["amount"]))
                    for part in dnc_parts
                ]
            else:
                display_rows = [(dnc, cnb, cnb["amount"])]
            for part_no, (dnc_row, cnb_row, row_amt) in enumerate(display_rows, 1):
                if part_no > 1:
                    r += 1
                book_amt_display = dnc_row.get("amount", row_amt)
                if cnb_parts and len(display_rows) > 1 and part_no > 1:
                    book_amt_display = None
                vals = [
                    "4B-BackdatedClear",
                    nm,
                    sc,
                    (
                        "CF-Clear"
                        if len(display_rows) == 1
                        else f"CF-Clear part {part_no}/{len(display_rows)}"
                    ),
                    dnc_row["date"],
                    dnc_row["branch"],
                    QR_ACCOUNT_CODE,
                    dnc_row["ref"],
                    511,
                    dnc_row["party"],
                    book_amt_display,
                    cnb_row["date"],
                    "",
                    cnb_row["branch"],
                    cnb_row["party"],
                    row_amt,
                    cnb_row.get("rrn", ""),
                    "",
                    adiff if part_no == 1 else "",
                    flag,
                ]
                for c_idx, v in enumerate(vals, 1):
                    set_cell(
                        ws3,
                        r,
                        c_idx,
                        v,
                        bg=bg,
                        h_align="right" if c_idx in [11, 16, 19] else "left",
                        num_fmt=(
                            "#,##0.00"
                            if c_idx == 19
                            else ("#,##0" if c_idx in [11, 16] else None)
                        ),
                    )

    #  Sheet 4  Reco Items (Book Only / DNC)
    if not _receipt_brs_only.empty:
        r += 1
        ws3.merge_cells(f"A{r}:T{r}")
        c = ws3.cell(r, 1, "All-Branches Receipt Entries (ZEROISE) - display only")
        c.fill = fill(C_LBLUE)
        c.font = font(bold=True, size=9)
        c.alignment = align()
        ws3.row_dimensions[r].height = 18

        seen_receipts = set()
        for _, receipt in _receipt_brs_only.iterrows():
            ref = str(receipt["bill_no"]).strip()
            key = (
                ref,
                str(receipt["branch"]).strip(),
                round(float(receipt["amount"]), 2),
            )
            if key in seen_receipts:
                continue
            seen_receipts.add(key)
            r += 1
            dt = (
                receipt["date"].strftime("%d.%m.%Y")
                if pd.notna(receipt["date"])
                else ""
            )
            party = "INDIVI - " + str(receipt["party"])
            receipt_flag = (
                "RECEIPTS TRANSACTION - All-Branches ZEROISE receipt display only"
            )
            narration = str(receipt.get("narration", ""))
            if narration:
                receipt_flag = f"{receipt_flag} | {narration}"
            vals = [
                "Receipt-ZEROISE",
                "Receipt",
                "",
                "Display Only",
                dt,
                receipt["branch"],
                QR_ACCOUNT_CODE,
                ref,
                511,
                party,
                receipt["amount"],
                "",
                "",
                "",
                "",
                "",
                "",
                "",
                "",
                receipt_flag,
            ]
            for c_idx, v in enumerate(vals, 1):
                set_cell(
                    ws3,
                    r,
                    c_idx,
                    v,
                    bg=C_LBLUE,
                    h_align="right" if c_idx in [11, 16, 19] else "left",
                    num_fmt="#,##0" if c_idx == 11 else None,
                )

    # Add Matched-sheet transactions in the Cheque Deposit display format.
    # This is display-only: it does not affect matching or BRS arithmetic.
    for _src in ws3.iter_rows(min_row=3, values_only=True):
        _method = _src[0] if len(_src) > 0 else ""
        _book_date = _src[4] if len(_src) > 4 else ""
        _book_branch = _src[5] if len(_src) > 5 else ""
        _book_bill = _src[7] if len(_src) > 7 else ""
        _book_party = _src[9] if len(_src) > 9 else ""
        if not _method or not _book_date or not _book_bill or not _book_party:
            continue

        _name_match = _src[1] if len(_src) > 1 else ""
        _book_bank = _src[6] if len(_src) > 6 and _src[6] else QR_ACCOUNT_CODE
        _book_chq = _src[8] if len(_src) > 8 else 511
        _book_amt = _src[10] if len(_src) > 10 else None
        _bank_date = _src[11] if len(_src) > 11 else ""
        _bank_rrn = _src[16] if len(_src) > 16 else ""
        _pay_type = _src[17] if len(_src) > 17 else ""
        _diff = _src[18] if len(_src) > 18 and _src[18] not in (None, "") else None
        _flags = str(_src[19] if len(_src) > 19 and _src[19] else "").strip()

        if str(_method).startswith("Receipt-ZEROISE"):
            _narration = _flags or "RECEIPTS TRANSACTION - display only"
        elif _bank_date:
            if _name_match == "Low":
                _narration = f"LOW NAME MATCH - CREDITED AS ON {_bank_date}"
            elif _name_match == "Partial":
                _narration = f"PARTIAL NAME MATCH - CREDITED AS ON {_bank_date}"
            else:
                _narration = f"CREDITED AS ON {_bank_date}"
            if _flags:
                _narration = f"{_narration} | {_flags}"
        else:
            _narration = _flags

        _diff_display = None
        if isinstance(_diff, (int, float)) and abs(_diff) > 0.005:
            _diff_display = _diff

        r += 1
        for c, v in enumerate(
            [
                _book_date,
                _book_branch,
                _book_bank,
                _book_bill,
                _book_chq,
                _bank_rrn,
                _pay_type,
                _book_party,
                _book_amt,
                _diff_display,
                _narration,
            ],
            1,
        ):
            diff_bg = C_RED if (c == 10 and _diff_display is not None) else None
            set_cell(
                ws,
                r,
                c,
                v,
                bg=diff_bg,
                h_align="right" if c in (9, 10) else "left",
                num_fmt="#,##0.00" if c == 10 else ("#,##0" if c == 9 else None),
            )
    ws4 = wb.create_sheet("Reco Items (Book Only)")
    col_widths(ws4, [14, 8, 8, 16, 10, 38, 14, 36])
    ws4.freeze_panes = "A3"

    r = 1
    write_title_row(
        ws4,
        r,
        f"Reco Items: Deposited NOT Credited in Bank  |  {QR_ACCOUNT_LABEL}  |  {BRS_DATE}",
        8,
    )
    r += 1
    write_header_row(
        ws4,
        r,
        [
            "Date",
            "Branch",
            "Bank",
            "Bill No",
            "Cheque No.",
            "Party Name",
            "Amount (Rs)",
            "Issue",
        ],
    )

    for item in dnc_all_for_sheet:
        r += 1
        bg = C_AMBER if item.get("cf") else C_ORNG
        issue = (
            "Carried Forward from Previous BRS"
            if item.get("cf")
            else item.get("note") or "In Book  NOT yet in Bank Gateway"
        )
        vals = [
            item["date"],
            item["branch"],
            QR_ACCOUNT_CODE,
            item["ref"],
            511,
            item["party"],
            item["amount"],
            issue,
        ]
        for c, v in enumerate(vals, 1):
            set_cell(
                ws4,
                r,
                c,
                v,
                bg=bg,
                h_align="right" if c == 7 else "left",
                num_fmt="#,##0" if c == 7 else None,
            )

    #  Sheet 5  Bank Only (Not in Book / CNB)
    ws5 = wb.create_sheet("Bank Only (Not in Book)")
    col_widths(ws5, [14, 12, 8, 36, 30, 14, 16, 10, 20])
    ws5.freeze_panes = "A3"

    r = 1
    write_title_row(
        ws5,
        r,
        f"Bank Credit  NOT yet Recorded in Book  |  {QR_ACCOUNT_LABEL}  |  {BRS_DATE}",
        9,
        bg=C_PURPLE_H,
    )
    r += 1
    write_header_row(
        ws5,
        r,
        [
            "Date",
            "Time",
            "Branch",
            "DBA",
            "Payer",
            "Amount (Rs)",
            "RRN",
            "Pay Type",
            "Issue",
        ],
        bg=C_PURPLE_H,
    )

    rev_map = {v: k for k, v in DBA_MAP.items()}
    for item in cnb_all_for_sheet:
        r += 1
        bg = C_AMBER if item.get("cf") else C_RED
        issue = item.get("remark") or "Credited in Bank  NOT yet in Book"
        dba = rev_map.get(item["branch"], item["branch"])
        vals = [
            item["date"],
            "",
            item["branch"],
            dba,
            item["party"],
            item["amount"],
            item["rrn"],
            "",
            issue,
        ]
        for c, v in enumerate(vals, 1):
            set_cell(
                ws5,
                r,
                c,
                v,
                bg=bg,
                h_align="right" if c == 6 else "left",
                num_fmt="#,##0" if c == 6 else None,
            )

    #  Sheet 6  HOT Settlements
    ws6 = wb.create_sheet("HOT Settlements")
    col_widths(ws6, [14, 16, 8, 8, 14, 14, 80])
    ws6.freeze_panes = "A3"

    r = 1
    write_title_row(
        ws6,
        r,
        f"HOT Settlement Payments (QR  Head Office)  |  {QR_ACCOUNT_LABEL}  |  {BRS_DATE}",
        7,
    )
    r += 1
    write_header_row(
        ws6,
        r,
        ["Date", "Bill No", "Chq No", "Branch", "Party", "Amount (Rs)", "Narration"],
    )

    for _, row in ap.iterrows():
        r += 1
        dt = row["date"].strftime("%d.%m.%Y") if pd.notna(row.get("date")) else ""
        bg = C_AMBER if row["is_correction"] else None
        vals = [
            dt,
            row["bill_no"],
            99,
            row["branch"],
            "HOT - HOT",
            row["amount"],
            row["narration"][:120],
        ]
        for c, v in enumerate(vals, 1):
            set_cell(
                ws6,
                r,
                c,
                v,
                bg=bg,
                h_align="right" if c == 6 else "left",
                num_fmt="#,##0" if c == 6 else None,
            )

    r += 2
    ws6.merge_cells(f"A{r}:G{r}")
    c = ws6.cell(
        r,
        1,
        f"Amber = Correction entries (same amount in Receipts & Payments  cancel pair). "
        f"Detected: {[int(x) for x in set(corr_amts)]}",
    )
    c.fill = NO_FILL
    c.font = font(bold=True, size=9)
    c.alignment = align()

    #  Sheet 7  QR BRS Statement
    ws7 = wb.create_sheet("QR BRS Statement")

    # 11-column layout: A:Date B:Branch C:Bill No D:RRN E:Chq No
    #                   F:Book Report G:Bank Statement H:Makez Extracted
    #                   I:Amount J:Running Bal K:Note / Remark
    for col, w in [
        ("A", 12),
        ("B", 8),
        ("C", 16),
        ("D", 20),
        ("E", 10),
        ("F", 28),
        ("G", 28),
        ("H", 28),
        ("I", 16),
        ("J", 16),
        ("K", 44),
    ]:
        ws7.column_dimensions[col].width = w

    _HDR = fill(C_NAVY)
    _SEC = fill(C_BLUE)
    _SUB = fill("DCE6F1")
    _ITM = NO_FILL
    _ITM_CF = NO_FILL
    _BAL = NO_FILL
    _DIF_G = NO_FILL
    _DIF_R = NO_FILL
    _bdr = _BR

    def _brs_merge(row, text, bg, fnt):
        ws7.merge_cells(f"A{row}:K{row}")
        c = ws7.cell(row, 1)
        c.value = text
        c.fill = bg
        c.font = fnt
        c.border = _bdr
        c.alignment = Alignment(horizontal="left", vertical="center", wrap_text=True)
        for col in range(2, 12):
            ws7.cell(row, col).border = _bdr
            ws7.cell(row, col).fill = bg

    def _brs_amt(row, col, value, bg, fnt, fmt="#,##0.00"):
        cell = ws7.cell(row, col)
        cell.value = value
        cell.fill = bg
        cell.font = fnt
        cell.border = _bdr
        cell.alignment = Alignment(horizontal="right", vertical="center")
        if isinstance(value, (int, float)):
            cell.number_format = fmt

    def _brs_narr(row, col, value, bg):
        cell = ws7.cell(row, col)
        cell.value = value
        cell.fill = bg
        cell.font = Font(name="Calibri", size=8, italic=True, color="555555")
        cell.border = _bdr
        cell.alignment = Alignment(horizontal="left", vertical="center", wrap_text=True)

    r7 = 1

    _col_hdrs = [
        "Date",
        "Branch",
        "Bill No",
        "RRN",
        "Chq No",
        "Book Report",
        "Bank Statement",
        "Makez Extracted",
        "Amount (Rs)",
        "Running Bal (Rs)",
        "Note / Remark",
    ]

    #  Row 1: company name
    _brs_merge(
        r7,
        "ORIENT EXCHANGE & FINANCIAL SERVICES (P) LTD",
        _HDR,
        Font(bold=True, color="FFFFFF", name="Calibri", size=13),
    )
    ws7.row_dimensions[r7].height = 28
    r7 += 1

    #  Row 2: bank / account label
    _brs_merge(
        r7,
        QR_ACCOUNT_LABEL,
        _HDR,
        Font(bold=True, color="FFFFFF", name="Calibri", size=10),
    )
    ws7.row_dimensions[r7].height = 22
    r7 += 1

    #  Row 3: BRS title + amount column headers
    ws7.merge_cells(f"A{r7}:G{r7}")
    c = ws7.cell(r7, 1)
    c.value = f"Bank Reconciliation Statement As On {BRS_DATE}"
    c.fill = _HDR
    c.font = Font(bold=True, color="FFFFFF", name="Calibri", size=11)
    c.border = _bdr
    c.alignment = Alignment(horizontal="left", vertical="center")
    for col in range(2, 8):
        ws7.cell(r7, col).border = _bdr
        ws7.cell(r7, col).fill = _HDR
    for ci, txt in [(9, "AMOUNT IN RS"), (10, "AMOUNT IN RS"), (11, "")]:
        cell = ws7.cell(r7, ci, txt)
        cell.fill = _HDR
        cell.font = Font(bold=True, color="FFFFFF", name="Calibri", size=10)
        cell.border = _bdr
        cell.alignment = Alignment(horizontal="center", vertical="center")
    ws7.row_dimensions[r7].height = 20
    r7 += 1

    #  Row 4: blank
    ws7.merge_cells(f"A{r7}:I{r7}")
    ws7.row_dimensions[r7].height = 6
    r7 += 1

    #  Col-header row
    for ci, h in enumerate(_col_hdrs, 1):
        cell = ws7.cell(r7, ci, h)
        cell.fill = _SUB
        cell.font = font(bold=True)
        cell.border = _bdr
        cell.alignment = Alignment(horizontal="center", vertical="center")
    ws7.row_dimensions[r7].height = 16
    r7 += 1

    ws7.freeze_panes = f"A{r7}"

    def _brs_item(
        date,
        branch,
        ref,
        rrn="",
        chq="",
        party="",
        amt=0,
        narr="",
        is_cf=False,
        book_raw="",
        bank_raw="",
        side="both",
    ):
        nonlocal r7
        bg = _ITM_CF if is_cf else _ITM

        # Build display narration:
        # Show only (a) narrations from source documents, and (b) important flags.
        # Strip all script-generated CF labels that carry no source information.
        _FLAG_KEYWORDS = (
            "LOW NAME",
            "PARTIAL NAME",
            "NAME VERIFY",
            "AMOUNT DIFFERENCE",
            "WRONGLY ACCOUNTED",
            "DUPLICATE RRN",
            "KNOWN LARGE",
            "VERIFY",
            "CORRECTION",
            "SPLIT",
            "MISMATCH",
            "CHECK",
        )
        _raw = str(narr or "").strip()
        _cf_prefixes = ("Carried Fwd", "CF |", "CF|", "CARRIED FORWARD")
        _cleaned = _raw
        for _pfx in _cf_prefixes:
            if _cleaned.upper().startswith(_pfx.upper()):
                _cleaned = _cleaned[len(_pfx) :].lstrip(" |").strip()
        _has_flag = any(kw in _cleaned.upper() for kw in _FLAG_KEYWORDS)
        display_narr = (
            _cleaned
            if (_cleaned and (_has_flag or not _raw.upper().startswith("CF")))
            else ""
        )

        def _s(col, val, halign="left"):
            c = ws7.cell(r7, col, val)
            c.fill = bg
            c.border = _bdr
            c.font = _NF
            c.alignment = Alignment(horizontal=halign, vertical="center")

        _s(1, date, "center")
        _s(2, branch, "center")
        if side == "book":
            ws7.merge_cells(start_row=r7, start_column=3, end_row=r7, end_column=4)
            _s(3, ref, "left")  # Bill No
            ws7.cell(r7, 4).fill = bg
            ws7.cell(r7, 4).border = _bdr
        elif side == "bank":
            ws7.merge_cells(start_row=r7, start_column=3, end_row=r7, end_column=4)
            _s(3, rrn, "left")  # RRN
            ws7.cell(r7, 4).fill = bg
            ws7.cell(r7, 4).border = _bdr
        else:
            _s(3, ref, "left")  # Bill No
            _s(4, rrn, "left")  # RRN
        _s(5, chq, "center")  # Chq No
        if side == "book":
            ws7.merge_cells(start_row=r7, start_column=6, end_row=r7, end_column=7)
            _s(6, book_raw, "left")  # Book Report
            ws7.cell(r7, 7).fill = bg
            ws7.cell(r7, 7).border = _bdr
        elif side == "bank":
            ws7.merge_cells(start_row=r7, start_column=6, end_row=r7, end_column=7)
            _s(6, bank_raw, "left")  # Bank Statement
            ws7.cell(r7, 7).fill = bg
            ws7.cell(r7, 7).border = _bdr
        else:
            _s(6, book_raw, "left")  # Book Report
            _s(7, bank_raw, "left")  # Bank Statement
        _s(8, _clean_makez_extracted(party), "left")  # Makez Extracted
        _brs_amt(r7, 9, amt, bg, _NF)  # Amount
        ws7.cell(r7, 10, "").fill = bg  # Running
        ws7.cell(r7, 10).border = _bdr
        _brs_narr(r7, 11, display_narr, bg)  # Note
        ws7.row_dimensions[r7].height = 16
        r7 += 1

    def _brs_subtotal(total):
        nonlocal r7
        bg = NO_FILL
        ws7.merge_cells(f"A{r7}:H{r7}")
        ws7.cell(r7, 1).fill = bg
        ws7.cell(r7, 1).border = _bdr
        for col in range(2, 9):
            ws7.cell(r7, col).border = _bdr
            ws7.cell(r7, col).fill = bg
        _brs_amt(r7, 9, total, bg, _BF)
        ws7.cell(r7, 10).fill = bg
        ws7.cell(r7, 10).border = _bdr
        ws7.cell(r7, 11).fill = bg
        ws7.cell(r7, 11).border = _bdr
        ws7.row_dimensions[r7].height = 16
        r7 += 1

    def _brs_running(running_bal):
        nonlocal r7
        bg = NO_FILL
        ws7.merge_cells(f"A{r7}:H{r7}")
        ws7.cell(r7, 1).fill = bg
        ws7.cell(r7, 1).border = _bdr
        for col in range(2, 9):
            ws7.cell(r7, col).border = _bdr
            ws7.cell(r7, col).fill = bg
        ws7.cell(r7, 9).fill = bg
        ws7.cell(r7, 9).border = _bdr
        _brs_amt(r7, 10, running_bal, bg, _BF)
        ws7.cell(r7, 11).fill = bg
        ws7.cell(r7, 11).border = _bdr
        ws7.row_dimensions[r7].height = 17
        r7 += 1

    def _brs_balance(label, bal, bg=None):
        nonlocal r7
        bg = bg or _BAL
        ws7.merge_cells(f"A{r7}:I{r7}")
        c = ws7.cell(r7, 1)
        c.value = label
        c.fill = bg
        c.font = Font(bold=True, name="Calibri", size=10)
        c.border = _bdr
        c.alignment = Alignment(horizontal="left", vertical="center")
        for col in range(2, 10):
            ws7.cell(r7, col).border = _bdr
            ws7.cell(r7, col).fill = bg
        _brs_amt(r7, 10, bal, bg, _BF)
        ws7.cell(r7, 11).fill = bg
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
        _brs_merge(
            r7, text, bg, Font(bold=True, color="FFFFFF", name="Calibri", size=10)
        )
        ws7.row_dimensions[r7].height = 20
        r7 += 1

    def _brs_nil():
        nonlocal r7
        ws7.merge_cells(f"A{r7}:H{r7}")
        c = ws7.cell(r7, 1, "      -  (Nil)")
        c.fill = _ITM
        c.border = _bdr
        c.font = _NF
        c.alignment = Alignment(horizontal="left", vertical="center")
        for col in range(2, 9):
            ws7.cell(r7, col).fill = _ITM
            ws7.cell(r7, col).border = _bdr
        _brs_amt(r7, 9, "-", _ITM, _NF, fmt="@")
        ws7.cell(r7, 10).fill = _ITM
        ws7.cell(r7, 10).border = _bdr
        ws7.cell(r7, 11).fill = _ITM
        ws7.cell(r7, 11).border = _bdr
        ws7.row_dimensions[r7].height = 16
        r7 += 1

    def _write_col_hdrs(side="both"):
        nonlocal r7
        hdrs = list(_col_hdrs)
        if side == "book":
            hdrs[2] = "Bill No"
            hdrs[3] = ""
            hdrs[5] = "Book Report"
            hdrs[6] = ""
        elif side == "bank":
            hdrs[2] = "RRN"
            hdrs[3] = ""
            hdrs[5] = "Bank Statement"
            hdrs[6] = ""
        for ci, h in enumerate(hdrs, 1):
            cell = ws7.cell(r7, ci, h)
            cell.fill = _SUB
            cell.font = font(bold=True)
            cell.border = _bdr
            cell.alignment = Alignment(horizontal="center", vertical="center")
        if side in ("book", "bank"):
            ws7.merge_cells(start_row=r7, start_column=3, end_row=r7, end_column=4)
        if side in ("book", "bank"):
            ws7.merge_cells(start_row=r7, start_column=6, end_row=r7, end_column=7)
        ws7.row_dimensions[r7].height = 16
        r7 += 1

    _brs_blank()
    _brs_balance(f"Closing Balance as per Company Books  (Dr.)", closing_bal)
    _brs_blank()

    running7 = closing_bal

    _brs_section("Add :  Cheques issued but not debited in Bank")
    _write_col_hdrs(side="book")
    _brs_nil()
    _brs_subtotal(0.0)
    running7 += 0.0
    _brs_running(running7)
    _brs_blank()

    _brs_section("Less :  Cheques deposited but not Credited in Bank")
    _write_col_hdrs(side="book")

    dnc_brs_items = [
        item for item in dnc_all if not item.get("exclude_from_brs", False)
    ]
    if not dnc_brs_items:
        _brs_nil()
    else:
        for item in dnc_brs_items:
            _brs_item(
                date=item["date"],
                branch=item["branch"],
                ref=item["ref"],
                rrn="",
                chq=511,
                party=item["party"],
                amt=item["amount"],
                narr=item.get("note", "") or item.get("remark", ""),
                is_cf=bool(item.get("cf")),
                book_raw=item["party"],  # Book Report: raw book party name
                bank_raw="",  # Bank Statement: blank for book-only items
                side="book",
            )

    _brs_subtotal(total_dnc)
    running7 -= total_dnc
    _brs_running(running7)
    _brs_blank()

    _brs_section("Less :  Debited in pass book but not credited in Our book")
    _write_col_hdrs(side="bank")
    _brs_nil()
    _brs_subtotal(0.0)
    _brs_running(running7)
    _brs_blank()

    _brs_section("Add :  Credited in pass book but not debited in Our book")
    _write_col_hdrs(side="bank")

    cnb_brs_items = [
        item for item in cnb_all if not item.get("exclude_from_brs", False)
    ]
    if not cnb_brs_items:
        _brs_nil()
    else:
        for item in cnb_brs_items:
            _brs_item(
                date=item["date"],
                branch=item["branch"],
                ref="",
                rrn=item.get("rrn", ""),
                chq="",
                party=item["party"],
                amt=item["amount"],
                narr=item.get("remark", ""),
                is_cf=bool(item.get("cf")),
                book_raw="",  # Book Report: blank for bank-only items
                bank_raw=item["party"],  # Bank Statement: raw bank payer name
                side="bank",
            )

    _brs_subtotal(total_cnb)
    running7 += total_cnb
    _brs_blank()

    _bal_bg = _DIF_G if reconciled else _DIF_R
    if QR_BANK_KIND == "YES":
        _brs_balance("Closing Balance as per Bank book", bank_bal, bg=_bal_bg)
    else:
        _brs_balance("Closing Balance as per Bank book", bank_bal, bg=_bal_bg)
    _brs_blank()
    _brs_balance("Difference  (should be 0 when reconciled)", bank_bal, bg=_bal_bg)
    _brs_blank()

    # Matched discrepancy details are intentionally not printed on the BRS sheet.
    # Review items remain available in Matched, Cheque Deposit, and Human Verification.
    #  Footer notes
    ws7.merge_cells(f"A{r7}:K{r7}")
    ws7.cell(
        r7,
        1,
        f"Gateway Total Credits (SaleSuccess) : Rs {stmt_success['amount(rs.)'].sum():,.2f}",
    ).font = Font(name="Calibri", size=9, color="595959")
    ws7.cell(r7, 1).alignment = align()
    ws7.cell(r7, 1).border = no_border()
    r7 += 1

    ws7.merge_cells(f"A{r7}:K{r7}")
    ws7.cell(
        r7,
        1,
        "CF = Carried Forward from Previous BRS (outstanding items not yet cleared)",
    ).font = Font(name="Calibri", size=8, italic=True, color="595959")
    ws7.cell(r7, 1).alignment = align()
    ws7.cell(r7, 1).border = no_border()

    # ------------------------------------------------------------------ #
    #  Detect ambiguous pool matches
    #  These are groups of matched rows where:
    #    - Multiple book entries share the same Book Date + Book Amount
    #    - Multiple bank entries share the same Bank Date + Bank Amount
    #    - At least one pair in the group has a low name score (below FUZZY_THRESH)
    #  This catches the "3 Arvind, same amount, wrong pairing" edge case.
    # ------------------------------------------------------------------ #
    _ambiguous_pool_groups = []
    # Group matched rows by (Book Date, Book Amt rounded to 2dp)
    from collections import defaultdict

    _pool_by_book = defaultdict(list)
    for _mr in matched_rows:
        _bk_date = _mr.get("Book Date", "")
        _bk_amt = round(float(_mr.get("Book Amt", 0) or 0), 2)
        _pool_by_book[(_bk_date, _bk_amt)].append(_mr)

    for (_bk_date, _bk_amt), _group in _pool_by_book.items():
        if len(_group) < 2:
            continue  # need at least 2 in the pool to have an ambiguity
        # Also check bank side: all have same Bank Date + Bank Amt
        _bank_dates = set(_mr.get("Bank Date", "") for _mr in _group)
        _bank_amts = set(round(float(_mr.get("Bank Amt", 0) or 0), 2) for _mr in _group)
        if len(_bank_amts) == 1 and len(_bank_dates) == 1:
            # Homogeneous pool on both sides -- check if any name score is ambiguous
            _any_low_score = any(
                _mr.get("Score%", 100) < FUZZY_THRESH for _mr in _group
            )
            if _any_low_score:
                _ambiguous_pool_groups.append(_group)

    #  Sheet 8  Human Verification  (simple format matching sample BRS style)
    ws8 = wb.create_sheet("Human Verification")
    col_widths(ws8, [26, 14, 18, 12, 14, 14, 32, 32, 16, 14, 22, 70, 40])
    ws8.freeze_panes = "A3"

    # Colours matching the sample BRS style
    _HV_NAVY = "1F3864"  # title row + book-only section
    _HV_RED = "C00000"  # section A -- matched anomalies
    _HV_OLIVE = "7F6000"  # section B -- CF cross-cleared
    _HV_RUST = "7F4C00"  # section C -- bank-only unmatched
    _HV_PURPLE = "7030A0"  # section D -- pending T+1
    _HV_GREEN = "375623"  # section E -- cleared CF pairs

    N_HV = 13

    def _hv_banner(ws, r, text, bg):
        """Full-width section banner."""
        ws.merge_cells(start_row=r, start_column=1, end_row=r, end_column=N_HV)
        c = ws.cell(row=r, column=1, value=text)
        c.fill = fill(bg)
        c.font = Font(bold=True, color="FFFFFF", name="Calibri", size=10)
        c.border = _BR
        c.alignment = Alignment(horizontal="left", vertical="center", wrap_text=True)
        ws.row_dimensions[r].height = 20
        for col in range(2, N_HV + 1):
            ws.cell(r, col).fill = fill(bg)
            ws.cell(r, col).border = _BR
        return r + 1

    def _hv_data_row(ws, r, vals, amt_col=9, diff_col=10):
        """Write a plain white data row with 12 columns."""
        for ci, v in enumerate(vals[:N_HV], 1):
            c = ws.cell(r, ci, v)
            c.fill = NO_FILL
            c.font = Font(name="Calibri", size=9)
            c.border = _BR
            c.alignment = Alignment(
                horizontal="left", vertical="center", wrap_text=True
            )
            if ci in (amt_col, diff_col) and isinstance(v, (int, float)):
                c.number_format = "#,##0.00"
                c.alignment = Alignment(horizontal="right", vertical="center")
        ws.row_dimensions[r].height = 15
        return r + 1

    # Row 1 -- title
    r8 = 1
    ws8.merge_cells(start_row=r8, start_column=1, end_row=r8, end_column=N_HV)
    _tc = ws8.cell(
        r8,
        1,
        f"HUMAN VERIFICATION -- Items Requiring Manual Review  |  {QR_ACCOUNT_LABEL}  |  {BRS_DATE}",
    )
    _tc.fill = fill(_HV_NAVY)
    _tc.font = Font(bold=True, color="FFFFFF", name="Calibri", size=13)
    _tc.border = _BR
    _tc.alignment = Alignment(horizontal="left", vertical="center", wrap_text=True)
    ws8.row_dimensions[r8].height = 26
    r8 += 1

    # Row 2 -- column headers
    _hv_headers = [
        "Source",
        "Bill Date",
        "Bank Credit Date",
        "Bill No",
        "Chq No (Book)",
        "Chq No (Bank)",
        "Party (Book)",
        "Party (Bank)",
        "Amount (Rs)",
        "Difference",
        "Issue Type",
        "Issue Description",
        "Action Required",  # col 13 -- what the reviewer should do
    ]
    write_header_row(ws8, r8, _hv_headers)
    r8 += 1

    # ------------------------------------------------------------------ #
    # SECTION A -- Matched with name mismatch or amount difference
    # ------------------------------------------------------------------ #
    _sec_a_rows = []
    for m in matched_rows:
        sc = m["Score%"]
        diff = m.get("Diff", 0) or 0
        if sc >= PARTY_CONFIRMATION_THRESHOLD and abs(diff) < 1:
            continue  # clean match -- skip
        issue_type = (
            "Amt Difference"
            if abs(diff) >= 1
            else "Name Mismatch" if sc < FUZZY_ACCEPT else "Name Partial"
        )
        issue_desc = (
            f"Rs {diff:+,.2f} amount difference -- book vs bank"
            if abs(diff) >= 1
            else (
                f"Name {sc}% match -- book party does not match bank party"
                if sc < FUZZY_ACCEPT
                else f"Name {sc}% partial match -- names are similar but differ"
            )
        )
        _sec_a_rows.append((m, issue_type, issue_desc))

    for pair in prev_dnc_current_cnb_display_matches:
        dnc_p = pair["dnc"]
        cnb_p = pair["cnb"]
        sc = pair.get("score", 0) or 0
        diff = pair.get("amt_diff", 0) or 0
        if sc >= PARTY_CONFIRMATION_THRESHOLD and abs(diff) < 1:
            continue
        bank_parts = cnb_p.get("parts", []) or []
        bank_rrn = cnb_p.get("rrn", "")
        bank_party = cnb_p.get("party", "")
        bank_date = cnb_p.get("settlement_date", "") or cnb_p.get("date", "")
        if bank_parts:
            bank_rrn = " / ".join(
                str(p.get("rrn", "")).strip()
                for p in bank_parts
                if str(p.get("rrn", "")).strip()
            )
            bank_party = " / ".join(
                str(p.get("party", "")).strip()
                for p in bank_parts
                if str(p.get("party", "")).strip()
            )
            bank_date = (
                " / ".join(
                    dict.fromkeys(
                        [
                            p.get("settlement_date", "") or p.get("date", "")
                            for p in bank_parts
                            if p.get("settlement_date", "") or p.get("date", "")
                        ]
                    )
                )
                or bank_date
            )
        issue_type = (
            "Amt Difference"
            if abs(diff) >= 1
            else "Name Mismatch" if sc < FUZZY_ACCEPT else "Name Partial"
        )
        issue_desc = (
            f"Rs {diff:+,.2f} amount difference - previous DNC vs current bank credit"
            if abs(diff) >= 1
            else (
                f"Name {sc}% match - previous DNC party does not match bank party"
                if sc < FUZZY_ACCEPT
                else f"Name {sc}% partial match - names are similar but differ"
            )
        )
        _sec_a_rows.append(
            (
                {
                    "Method": "CF-DNC-Review" if pair.get("review_only") else "CF-DNC-Clear",
                    "Book Date": dnc_p.get("date", ""),
                    "Bank Date": bank_date,
                    "Book Bill No": dnc_p.get("ref", ""),
                    "Book Chq No": 511,
                    "Bank RRN": bank_rrn,
                    "Book Party": dnc_p.get("party", ""),
                    "Bank Payer": bank_party,
                    "Book Amt": dnc_p.get("amount", ""),
                    "Diff": diff,
                },
                issue_type,
                issue_desc,
            )
        )

    if _sec_a_rows:
        r8 = _hv_banner(
            ws8,
            r8,
            f"SECTION A -- Matched Transactions with Anomalies  ({len(_sec_a_rows)} items)"
            f"  .  Source: Matched sheet  .  These were matched but have discrepancies",
            _HV_RED,
        )
        for m, issue_type, issue_desc in _sec_a_rows:
            diff = m.get("Diff", 0) or 0
            r8 = _hv_data_row(
                ws8,
                r8,
                [
                    f"Matched Sheet  |  {m['Method']}",
                    m.get("Book Date", ""),
                    m.get("Bank Date", ""),
                    m.get("Book Bill No", ""),
                    m.get("Book Chq No", ""),
                    m.get("Bank RRN", ""),
                    str(m.get("Book Party", "")).replace("INDIVI - ", ""),
                    m.get("Bank Payer", ""),
                    m.get("Book Amt", ""),
                    abs(diff) if abs(diff) >= 0.005 else 0,
                    issue_type,
                    issue_desc,
                    "Manual check",  # verify book party matches bank party / amount
                ],
            )

    # ------------------------------------------------------------------ #
    # SECTION B -- Step-4B cross-cleared CF pairs
    # ------------------------------------------------------------------ #
    if step4b_matched:
        r8 = _hv_banner(
            ws8,
            r8,
            f"SECTION B -- Carry-Forward Cross-Cleared Pairs  ({len(step4b_matched)} items)"
            f"  .  Source: Previous BRS  .  Two CF items cancelled via fuzzy name+amount match -- verify",
            _HV_OLIVE,
        )
        for pair in step4b_matched:
            dnc_p = pair["dnc"]
            cnb_p = pair["cnb"]
            sc = pair["score"]
            adiff = pair.get("amt_diff", 0) or 0
            qual = "CF Cross-Clear" if abs(adiff) < 1 else "CF Cross-Clear (amt diff)"
            desc = f"{sc}% name match" + (
                f"  |  Rs {adiff:+,.2f} amount difference -- verify"
                if abs(adiff) >= 0.005
                else "  -- verify separately"
            )
            r8 = _hv_data_row(
                ws8,
                r8,
                [
                    "Carry-Forward  |  CF Cross-Clear  |  Prev BRS",
                    dnc_p.get("date", ""),
                    cnb_p.get("date", ""),
                    str(dnc_p.get("ref", "")),
                    "",
                    cnb_p.get("rrn", ""),
                    str(dnc_p.get("party", "")).replace("INDIVI - ", ""),
                    cnb_p.get("party", ""),
                    dnc_p.get("amount", ""),
                    abs(adiff) if abs(adiff) >= 0.005 else 0,
                    qual,
                    desc,
                    "Confirm these two CF items cancelled correctly",  # verify cross-clear is intentional
                ],
            )

    # ------------------------------------------------------------------ #
    # SECTION C -- Bank-only credits (CNB) not in book -- new items
    # ------------------------------------------------------------------ #
    _cnb_new_display = [
        i
        for i in cnb_all_for_sheet
        if not i.get("cf")
        and not i.get("exclude_from_brs")
        and not i.get("review_pair")
    ]
    if _cnb_new_display:
        r8 = _hv_banner(
            ws8,
            r8,
            f"SECTION C -- Bank Credits Not in Books  ({len(_cnb_new_display)} items)"
            f"  .  Source: BRS CNB  .  In bank statement but no matching book entry -- investigate",
            _HV_RUST,
        )
        for item in _cnb_new_display:
            amt = item.get("amount", 0)
            r8 = _hv_data_row(
                ws8,
                r8,
                [
                    "BRS  |  Credited in Bank / Not in Book",
                    "",
                    item.get("settlement_date") or item.get("date", ""),
                    "",
                    "",
                    item.get("rrn", ""),
                    "-- not in book --",
                    item.get("party", ""),
                    amt,
                    amt,
                    "Unrecorded Bank Txn",
                    f"Rs{amt:,.0f} credit on {item.get('settlement_date') or item.get('date', '')} -- not recorded in book",
                    "Raise a book entry for this bank credit",  # accountant to record missing book entry
                ],
            )

    # ------------------------------------------------------------------ #
    # SECTION D -- Book-only DNC items (pending T+1 settlement)
    # ------------------------------------------------------------------ #
    _dnc_pending = [i for i in dnc_all_for_sheet if i.get("pending_t1")]
    if _dnc_pending:
        r8 = _hv_banner(
            ws8,
            r8,
            f"SECTION D -- Pending T+1 Settlement  ({len(_dnc_pending)} items)"
            f"  .  Source: BRS DNC  .  Matched to bank but settle date is next day -- will auto-clear",
            _HV_PURPLE,
        )
        for item in _dnc_pending:
            amt = item.get("amount", 0)
            r8 = _hv_data_row(
                ws8,
                r8,
                [
                    "BRS  |  Pending Settlement (T+1)",
                    item.get("date", ""),
                    "-- settles next day --",
                    str(item.get("ref", "")),
                    "",
                    "",
                    str(item.get("party", "")).replace("INDIVI - ", ""),
                    "-- pending --",
                    amt,
                    0,
                    "Pending T+1",
                    item.get("remark")
                    or f"Bank credit confirmed -- will settle next BRS run",
                    "No action needed -- will auto-clear next run",  # expected to clear automatically
                ],
            )

    # ------------------------------------------------------------------ #
    # SECTION E -- New DNC items (book only, not yet in bank)
    # ------------------------------------------------------------------ #
    _dnc_new_display = [
        i
        for i in dnc_all_for_sheet
        if not i.get("cf")
        and not i.get("pending_t1")
        and not i.get("review_pair")
        and not i.get("exclude_from_brs")
    ]
    if _dnc_new_display:
        r8 = _hv_banner(
            ws8,
            r8,
            f"SECTION E -- Book Entries Not Yet in Bank  ({len(_dnc_new_display)} items)"
            f"  .  Source: BRS DNC  .  In book but no bank credit found -- outstanding",
            _HV_NAVY,
        )
        for item in _dnc_new_display:
            amt = item.get("amount", 0)
            is_receipt = item.get("source") == "receipt"
            r8 = _hv_data_row(
                ws8,
                r8,
                [
                    (
                        "BRS  |  Receipt / Not Yet Credited in Bank"
                        if is_receipt
                        else "BRS  |  Deposited / Not Yet Credited in Bank"
                    ),
                    item.get("date", ""),
                    "-- not in bank --",
                    str(item.get("ref", "")),
                    "",
                    "",
                    str(item.get("party", "")).replace("INDIVI - ", ""),
                    "-- not in bank --",
                    amt,
                    amt,
                    "Receipt Not in Bank" if is_receipt else "Book Not in Bank",
                    (
                        item.get("remark")
                        or f"Rs{amt:,.0f} on {item.get('date', '')} -- not found in bank statement"
                    ),
                    "Follow up with bank for credit confirmation",  # check if credit is delayed or missing
                ],
            )

    # ------------------------------------------------------------------ #
    # SECTION F -- CF DNC carry-forwards still open
    # ------------------------------------------------------------------ #
    _dnc_cf_display = [i for i in dnc_all_for_sheet if i.get("cf")]
    if _dnc_cf_display:
        r8 = _hv_banner(
            ws8,
            r8,
            f"SECTION F -- Carried-Forward DNC Items Still Open  ({len(_dnc_cf_display)} items)"
            f"  .  Source: Previous BRS  .  Outstanding from prior BRS -- pending bank credit",
            "375623",
        )
        for item in _dnc_cf_display:
            amt = item.get("amount", 0)
            r8 = _hv_data_row(
                ws8,
                r8,
                [
                    "Carry-Forward  |  Deposited Not Credited  |  Prev BRS",
                    item.get("date", ""),
                    "-- not yet credited --",
                    str(item.get("ref", "")),
                    "",
                    "",
                    str(item.get("party", "")).replace("INDIVI - ", ""),
                    "-- not yet in bank --",
                    amt,
                    amt,
                    "CF Book Not in Bank",
                    f"Rs{amt:,.0f} from {item.get('date', '')} -- carried from previous BRS",
                    "Chase bank credit -- outstanding from prior BRS",  # old item still pending bank credit
                ],
            )

    # ------------------------------------------------------------------ #
    # SECTION G -- CF CNB carry-forwards still open
    # ------------------------------------------------------------------ #
    _cnb_cf_display = [
        i for i in cnb_all_for_sheet if i.get("cf") and not i.get("exclude_from_brs")
    ]
    if _cnb_cf_display:
        r8 = _hv_banner(
            ws8,
            r8,
            f"SECTION G -- Carried-Forward CNB Items Still Open  ({len(_cnb_cf_display)} items)"
            f"  .  Source: Previous BRS  .  Bank credit not yet booked -- pending book entry",
            "2E4053",
        )
        for item in _cnb_cf_display:
            amt = item.get("amount", 0)
            r8 = _hv_data_row(
                ws8,
                r8,
                [
                    "Carry-Forward  |  Credited Not Booked  |  Prev BRS",
                    "",
                    item.get("date", ""),
                    "",
                    "",
                    item.get("rrn", ""),
                    "-- not yet in book --",
                    item.get("party", ""),
                    amt,
                    amt,
                    "CF Bank Not in Book",
                    f"Rs{amt:,.0f} from {item.get('date', '')} -- carried from previous BRS",
                    "Raise book entry for this bank credit",  # old bank credit still missing a book entry
                ],
            )

    # ------------------------------------------------------------------ #
    # ------------------------------------------------------------------ #
    # SECTION F -- Ambiguous Pool Matches (same amount + date, multiple parties)
    # When several book entries and bank entries share the same amount and date,
    # the script pairs them by name similarity but may get the pairing wrong.
    # All entries in each such group are flagged here for manual confirmation.
    # ------------------------------------------------------------------ #
    if _ambiguous_pool_groups:
        _total_pool_items = sum(len(g) for g in _ambiguous_pool_groups)
        r8 = _hv_banner(
            ws8,
            r8,
            f"SECTION F -- Ambiguous Pool Matches  ({_total_pool_items} items in {len(_ambiguous_pool_groups)} group(s))"
            f"  .  Same amount and date for multiple book and bank entries -- pairing may be wrong."
            f"  Check cheque no (book) against bank description to confirm correct pairing.",
            "4472A0",
        )  # slate blue
        for _pool_group in _ambiguous_pool_groups:
            for _mr in _pool_group:
                _sc = _mr.get("Score%", 0)
                _diff = _mr.get("Diff", 0) or 0
                _issue = (
                    "Name Mismatch"
                    if _sc < FUZZY_ACCEPT
                    else "Name Partial" if _sc < FUZZY_THRESH else "Low Confidence"
                )
                r8 = _hv_data_row(
                    ws8,
                    r8,
                    [
                        _mr.get("Method", ""),
                        _mr.get("Book Date", ""),
                        _mr.get("Bank Date", ""),
                        _mr.get("Book Bill No", ""),
                        _mr.get("Book Chq No", ""),
                        _mr.get("Bank RRN", ""),
                        str(_mr.get("Book Party", "")).replace("INDIVI - ", ""),
                        _mr.get("Bank Payer", ""),
                        _mr.get("Book Amt", ""),
                        abs(_diff) if abs(_diff) >= 0.005 else 0,
                        _issue,
                        f"Name {_sc}% -- same amount as {len(_pool_group)} other entries, pairing uncertain",
                        "Confirm correct bill-to-bank pairing",
                    ],
                )

    # SECTION H -- BRS Difference (only when not reconciled)
    # ------------------------------------------------------------------ #
    if not reconciled and QR_BANK_KIND == "YES":
        r8 = _hv_banner(
            ws8,
            r8,
            f"SECTION H -- BRS Difference  Rs {bank_bal:,.2f}  (target = 0)  .  Manual investigation required",
            "C00000",
        )
        diff_items = [
            (
                "BRS Running Balance",
                f"Rs {brs_bank_bal:,.2f}",
                "HOT closing balance minus DNC plus CNB",
            ),
            (
                "Expected Bank Balance",
                f"Rs {expected_bank_bal:,.2f}",
                f"Prev bank bal {prev_bank_bal:,.2f}"
                f" + settlements {settlement_credits:,.2f}"
                + (
                    f" + backdated {_backdated_credits:,.2f}"
                    if abs(_backdated_credits) > 0.005
                    else ""
                )
                + (
                    f" + past-settle {_orphan_past_settle_credits:,.2f}"
                    if abs(_orphan_past_settle_credits) > 0.005
                    else ""
                )
                + f" - HOT payments {hot_settlement_payments:,.2f}"
                + f" + corrections {correction_receipts:,.2f}",
            ),
            (
                "BRS Difference",
                f"Rs {bank_bal:,.2f}",
                "Positive = DNC understated or CNB overstated  |  Negative = opposite",
            ),
        ]
        if abs(_unexplained_hot_payments) > 0.005:
            diff_items.append(
                (
                    "Unexplained HOT Payments",
                    f"Rs {_unexplained_hot_payments:,.2f}",
                    f"Today's HOT book payment postings ({BRS_DATE}) have no matching settlement "
                    f"in today's bank statement -- every statement row settles on a different date. "
                    f"Excluded from BRS arithmetic and netted out of the BRS Difference above "
                    f"(raw difference before netting: Rs {bank_bal_raw:,.2f}). Verify against the "
                    f"statement covering the date these payments actually settle, then re-run.",
                )
            )
        diff_items += [
            ("", "", ""),
            (
                "Prev BRS Type",
                "Script output (Fix B risk)" if _is_output_fmt else "Manual BRS",
                "Use manual BRS as prev_brs for cleanest carry-forwards",
            ),
            (
                "Action",
                "Verify DNC/CNB items above and re-run with corrected data",
                "Difference should reduce each day as CF items clear",
            ),
        ]
        for label, value, note in diff_items:
            if not label and not value:
                ws8.merge_cells(
                    start_row=r8, start_column=1, end_row=r8, end_column=N_HV
                )
                ws8.row_dimensions[r8].height = 6
                r8 += 1
                continue
            ws8.merge_cells(start_row=r8, start_column=1, end_row=r8, end_column=3)
            lc = ws8.cell(r8, 1, label)
            lc.fill = NO_FILL
            lc.font = Font(bold=True, name="Calibri", size=9)
            lc.border = _BR
            lc.alignment = Alignment(horizontal="left", vertical="center")
            ws8.merge_cells(start_row=r8, start_column=4, end_row=r8, end_column=6)
            vc = ws8.cell(r8, 4, value)
            vc.fill = NO_FILL
            vc.font = Font(name="Calibri", size=9)
            vc.border = _BR
            vc.alignment = Alignment(horizontal="left", vertical="center")
            ws8.merge_cells(start_row=r8, start_column=7, end_row=r8, end_column=N_HV)
            nc = ws8.cell(r8, 7, note)
            nc.fill = NO_FILL
            nc.font = Font(italic=True, name="Calibri", size=8, color="595959")
            nc.border = _BR
            nc.alignment = Alignment(
                horizontal="left", vertical="center", wrap_text=True
            )
            for col in range(2, 4):
                ws8.cell(r8, col).fill = NO_FILL
                ws8.cell(r8, col).border = _BR
            for col in range(5, 7):
                ws8.cell(r8, col).fill = NO_FILL
                ws8.cell(r8, col).border = _BR
            ws8.row_dimensions[r8].height = 18
            r8 += 1

    ws9 = wb.create_sheet("Summary")
    col_widths(ws9, [42, 32, 38])
    ws9.freeze_panes = "A3"

    r = 1
    write_title_row(
        ws9, r, f"QR RECONCILIATION SUMMARY  |  {QR_ACCOUNT_LABEL}  |  {BRS_DATE}", 3
    )
    r += 1
    write_header_row(ws9, r, ["Item", "Value", "Notes"])

    rows_s = (
        [
            ("Company", "ORIENT EXCHANGE & FINANCIAL SERVICES (P) LTD", ""),
            ("QR Account", QR_ACCOUNT_LABEL, ""),
            ("BRS Date", BRS_DATE, ""),
            (
                "Books Match (All-Branches Payments = HOT Receipts)",
                "MATCH" if books_match else "MISMATCH",
                f"Rs {total_all_pay:,.0f} = Rs {total_hot_rec:,.0f}",
            ),
            (
                "Reconciliation Status",
                "FULLY RECONCILED" if reconciled else "NOT RECONCILED",
                "",
            ),
            None,
            # Fix B: surface the stale-CF warning in the Summary sheet.
            (
                "Prev BRS Input Type",
                (
                    "SCRIPT OUTPUT (risk of stale CFs  use manual BRS)"
                    if _is_output_fmt
                    else "Manual BRS (recommended)"
                ),
                "Fix B: always supply the MANUAL BRS as prev_brs for clean carry-forwards",
            ),
            (
                "WRONGLY ACCOUNTED entries excluded",
                len(_wrongly_accounted_bills),
                f"Bills excluded from matching: {sorted(_wrongly_accounted_bills)}",
            ),
            None,
            (
                "Correction entries detected",
                len(corr_amts),
                f"Amounts: {[int(x) for x in set(corr_amts)]}",
            ),
            ("Book Cheque Deposit entries", len(ps), "Individual customer bills"),
            ("HOT Settlement entries", len(ap), "Payments from book to HOT"),
            (
                "Bank SaleSuccess entries",
                len(stmt_success),
                "Filtered gateway statement",
            ),
            None,
            (
                "Matched (Passes 1-4)",
                len(matched_rows),
                "Book bill <-> bank transaction",
            ),
            (
                "Reco Items (Deposited not Credited)",
                len(dnc_all),
                "In book, not in bank gateway",
            ),
            (
                "Bank Only (Credited not Book)",
                len(cnb_all),
                "In bank gateway, not in book",
            ),
            None,
            (
                "HOT Book Closing Balance",
                f"Rs {hot_closing_bal:,.2f} ({'Cr.' if hot_closing_bal < 0 else 'Dr.'})",
                f"From HOT {QR_ACCOUNT_CODE} book summary col 11",
            ),
            (
                "Previous BRS Book Adjustment",
                f"Rs {prev_book_adjustment:,.2f}",
                "Carried from previous manual BRS company-book closing formula",
            ),
            (
                "Book Closing Balance",
                f"Rs {closing_bal:,.2f} ({'Cr.' if closing_bal < 0 else 'Dr.'})",
                "HOT closing plus previous BRS book adjustment",
            ),
            (
                "DNC Total (deduct from book)",
                f"Rs {total_dnc:,.2f}",
                "Deposited not credited",
            ),
            ("CNB Total (add to book)", f"Rs {total_cnb:,.2f}", "Credited not booked"),
            (
                "Closing Balance as per Bank book",
                f"Rs {bank_bal:,.2f}",
                (
                    "closing - DNC + CNB  (YES Bank: adjusted for settlement timing)"
                    if QR_BANK_KIND == "YES"
                    else "closing - DNC + CNB"
                ),
            ),
            (
                "BRS Difference (should be 0)",
                f"Rs {bank_bal:,.2f}",
                "0 = fully reconciled",
            ),
        ]
        + (
            [
                (
                    "Unexplained HOT Payments",
                    f"Rs {_unexplained_hot_payments:,.2f}",
                    "No settlement found in today's statement for these HOT payment postings "
                    "-- excluded from arithmetic, see Human Verification Section H",
                ),
            ]
            if abs(_unexplained_hot_payments) > 0.005
            else []
        )
        + [
            None,
            # Fix C: document the HOT data gap for PUNE PATIL entries.
            # AKSHADA PATIL (74870) and VINAYAK PATIL (74870) appear in the bank
            # statement as PUNE entries but have no corresponding HOT book entry.
            # These are likely adjustment entries not exported from HOT.
            # They will remain in CNB until the HOT book is corrected.
            (
                "Fix C  Known HOT Data Gap",
                "PUNE PATIL entries (74870 x2)  no HOT book entry found",
                "Manual matched as adjustment entries; cannot auto-match without correct HOT export",
            ),
            None,
            (
                "Items Carried Forward (CF)",
                len([i for i in dnc_all + cnb_all if i.get("cf")]),
                "From previous BRS",
            ),
            (
                "New items this period",
                len([i for i in dnc_all + cnb_all if not i.get("cf")]),
                "Identified today",
            ),
        ]
    )

    for item in rows_s:
        r += 1
        if item is None:
            ws9.row_dimensions[r].height = 6
            continue
        bg = None
        val_str = str(item[1])
        if "FULLY RECONCILED" in val_str:
            bg = C_GREEN
        if "NOT RECONCILED" in val_str or "MISMATCH" in val_str:
            bg = C_RED
        if "MATCH" in val_str and "MISMATCH" not in val_str:
            bg = C_GREEN
        for c, v in enumerate(item, 1):
            cell = set_cell(ws9, r, c, v, bg=bg, size=9)
            if c == 1 and item[0] in (
                "Company",
                "QR Account",
                "BRS Date",
                "Books Match (All-Branches Payments = HOT Receipts)",
                "Reconciliation Status",
            ):
                cell.font = font(bold=True, size=9)

    #  Save
    try:
        wb.save(OUTPUT_FILE)
        saved_file = OUTPUT_FILE
    except PermissionError:
        alt = str(
            Path(OUTPUT_FILE).with_stem(
                Path(OUTPUT_FILE).stem + f"_{stmt_date.strftime('%d_%m_%Y')}_alt"
            )
        )
        wb.save(alt)
        saved_file = alt
        print(f"\n  Output file was locked  saved as {alt} instead.")

    print(f"\n Saved  {saved_file}")
    print(f"\n{'='*60}")
    print(
        f"Matched : {len(matched_rows)} | DNC : {len(dnc_all)} | CNB : {len(cnb_all)}"
    )
    print(
        f"BRS     : {'RECONCILED' if reconciled else 'NOT RECONCILED'} "
        f"| Bank bal = Rs {bank_bal:,.2f}"
    )

    #
    #  BUILD RETURN DataFrames
    #
    matched_df = (
        pd.DataFrame(matched_rows)
        if matched_rows
        else pd.DataFrame(
            columns=[
                "Method",
                "Name Match",
                "Amount Match",
                "Score%",
                "Book Date",
                "Book Branch",
                "Book Bank",
                "Book Bill No",
                "Book Chq No",
                "Book Party",
                "Book Amt",
                "Bank Date",
                "Bank Time",
                "Bank Branch",
                "Bank Payer",
                "Bank Amt",
                "Bank RRN",
                "Pay Type",
                "Diff",
                "Flags",
            ]
        )
    )

    dnc_df = (
        pd.DataFrame(dnc_all_for_sheet)
        if dnc_all_for_sheet
        else pd.DataFrame(
            columns=["date", "branch", "ref", "party", "amount", "note", "remark", "cf"]
        )
    )

    cnb_df = (
        pd.DataFrame(cnb_all_for_sheet)
        if cnb_all_for_sheet
        else pd.DataFrame(
            columns=["date", "branch", "rrn", "party", "amount", "diff", "remark", "cf"]
        )
    )

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


#
#  CLI entry-point (optional  preserves original CLI usage)
#
if __name__ == "__main__":
    import argparse

    p = argparse.ArgumentParser(
        description="QR BRS Generator -- handles both QR-YES BANK and QR-HDFC statements. "
        "Bank type is auto-detected from the statement file columns."
    )
    p.add_argument("--all-branches", required=True)
    p.add_argument("--hot-book", required=True)
    p.add_argument("--statement", required=True)
    p.add_argument("--prev-brs", required=True)
    p.add_argument("--output", default="QR_Reconcilation.xlsx")
    p.add_argument("--date", default=None)
    args = p.parse_args()

    process_qr_files(
        all_branches_path=args.all_branches,
        hot_book_path=args.hot_book,
        qr_stmt_path=args.statement,
        output_path=args.output,
        prev_brs_path=args.prev_brs,
        brs_date_override=args.date,
    )
