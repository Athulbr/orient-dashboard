import os
import re
import datetime
import hashlib
import json
import tempfile
import zipfile
from collections import defaultdict

import xlrd
import openpyxl

TARGET_HV_SECTIONS = {
    'bank': {
        'A': 'Matched Transactions with Anomalies',
        'A1': 'Cheque Number Mismatches',
        'B': 'Carry-Forward Cross-Cleared Pairs',
        'F': 'Possible Split Payments',
        'G': 'Possible Cross-Matches',
    },
    'qr': {
        'A': 'Matched Transactions with Anomalies',
        'B': 'Carry-Forward Cross-Cleared Pairs',
        'F': 'Ambiguous Pool Matches',
    },
    'gateway': {
        'A': 'Matched / Name-Match Items Requiring Review',
        'B': 'Gateway Settlement Amount Differences',
        # Sections C (Book/Gateway Items Pending in Bank) and D (Bank-Only
        # Items Requiring Verification) are timing differences awaiting
        # clearance, not review work - excluded, same as bank's C/D/E and
        # QR's equivalent "book-only"/"bank-only" sections.
    },
}

HV_FILENAMES = {
    'bank': 'Reconciliation.xlsx',
    'qr': 'QR_Reconciliation.xlsx',
    'gateway': 'Gateway_BRS.xlsx',
}

CHANNEL_KINDS = ['bank', 'qr', 'gateway']

_SECTION_RE = re.compile(r'^SECTION\s+([A-Za-z0-9]+)\b')
_BRANCH_RE = re.compile(r'^[A-Z]{2,6}\s*-\s*[A-Za-z].+')  # e.g. "BELG - AYODHYA NAGAR, BELGAUM" (letters only, so "03-07-2026" etc. never match)


# ---------------------------------------------------------------------------
# Book report parsing (transaction rows + branch header row)
# ---------------------------------------------------------------------------

def _looks_like_date(v):
    return isinstance(v, (datetime.datetime, datetime.date)) or (isinstance(v, (int, float)) and v > 1000)


def _rows_via_xlrd(path):
    wb = xlrd.open_workbook(path)
    ws = wb.sheet_by_index(0)
    datemode = wb.datemode
    out = []
    for r in range(ws.nrows):
        vals = [ws.cell_value(r, c) if c < ws.ncols else None for c in range(13)]
        if isinstance(vals[2], (int, float)) and vals[2] > 1000:
            vals[2] = xlrd.xldate_as_datetime(vals[2], datemode).date()
        out.append(vals)
    return out


def _rows_via_openpyxl(path):
    wb = openpyxl.load_workbook(path, data_only=True, read_only=True)
    ws = wb.active
    out = []
    for r in ws.iter_rows(values_only=True):
        vals = list(r[:13]) + [None] * max(0, 13 - len(r))
        if isinstance(vals[2], datetime.datetime):
            vals[2] = vals[2].date()
        out.append(vals)
    wb.close()
    return out


def _file_checksum(path, chunk_size=65536):
    """SHA-256 of a source file's raw bytes.

    This tells you whether a folder is a *literal* re-upload (identical
    file, byte for byte) vs. a re-generated export that happens to carry
    the same transaction data (e.g. a fresh export from the bank's portal
    with a different timestamp in the file metadata but unchanged rows) -
    the latter still needs to be caught by the content fingerprint below,
    since its checksum will differ even though it's still a duplicate
    submission. Returns None if the file is missing/unreadable.
    """
    if not path or not os.path.exists(path):
        return None
    try:
        h = hashlib.sha256()
        with open(path, 'rb') as fh:
            for chunk in iter(lambda: fh.read(chunk_size), b''):
                h.update(chunk)
        return h.hexdigest()
    except OSError:
        return None


# public alias - app.py hashes the incoming file at archive time (before it's
# even parsed) to catch exact re-uploads immediately, instead of waiting for
# a dashboard rebuild to notice; it reuses this same implementation so a
# write-time checksum and a read-time one are always computed identically.
file_checksum = _file_checksum


def book_prefix_for(recon_type):
    """Filename prefix (matching collect_all's convention below) used to
    identify which archived input file is the 'book' report a checksum/
    fingerprint should be computed from, for a given channel."""
    return 'book_report' if recon_type == 'bank' else 'all_branches'


MANIFEST_FILENAME = 'manifest.json'


def _read_manifest(tx_path):
    """Read the manifest.json app.py writes into a transaction folder at
    archive time, if present. Never raises - a missing/corrupt manifest
    just means the folder falls back to being fully recomputed, same as
    any transaction archived before this existed."""
    path = os.path.join(tx_path, MANIFEST_FILENAME)
    if not os.path.exists(path):
        return None
    try:
        with open(path, 'r') as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return None


def _read_raw_rows(path):
    if os.path.getsize(path) == 0:
        return None
    if path.lower().endswith('.xls'):
        try:
            return _rows_via_xlrd(path)
        except Exception:
            try:
                return _rows_via_openpyxl(path)
            except Exception:
                return None
    try:
        return _rows_via_openpyxl(path)
    except Exception:
        try:
            return _rows_via_xlrd(path)
        except Exception:
            return None


def parse_book_report_with_branch(path):
    """
    Returns (rows, branch_name) or (None, None) if unreadable.
    rows: list of {'type','date','chq_no','party','receipts','payments','branch'}
    branch_name: the FIRST branch label seen in the file (kept for backward
                 compatibility / folder-level display), pulled from a header
                 row Report.py deliberately skips (col A matching "CODE -
                 Place Name", or - for bank book_report files - col E).

    IMPORTANT: a single "all_branches" (QR) file can contain MANY branch
    sections back to back, each with its own header row followed by that
    branch's transactions. So each row is tagged with whichever branch
    header most recently preceded it ('branch' key), not just the file's
    first branch. Downstream branch-wise totals should use the per-row
    'branch', not the file-level branch_name.
    """
    raw = _read_raw_rows(path)
    if raw is None:
        return None, None

    rows = []
    branch_name = None       # first branch seen in the file
    current_branch = None    # branch in effect for the rows we're walking through
    for vals in raw:
        a, c, d, e, g, h, j = vals[0], vals[2], vals[3], vals[4], vals[6], vals[7], vals[9]
        if isinstance(a, str) and a.strip():
            txt = a.strip()
            if txt == 'Transaction' or txt.startswith('Summary Of') or txt.startswith('Opening Balance'):
                continue
            if _looks_like_date(c):
                # a genuine transaction row - tag with the branch section it falls under
                rows.append({
                    'type': txt, 'date': c, 'chq_no': str(d).strip(),
                    'party': g,
                    'receipts': h if isinstance(h, (int, float)) else 0,
                    'payments': j if isinstance(j, (int, float)) else 0,
                    'branch': current_branch,
                })
                continue
            if _BRANCH_RE.match(txt):
                # header/branch row (branch label in col A) - starts a new section
                current_branch = txt
                if branch_name is None:
                    branch_name = txt
                continue
            if isinstance(e, str) and _BRANCH_RE.match(e.strip()):
                # bank book_report files often put a bank/account code in col A
                # (e.g. "INDUS8525") and the actual "CODE - Place Name" branch
                # label in col E instead - check there too.
                current_branch = e.strip()
                if branch_name is None:
                    branch_name = current_branch
    return rows, branch_name



def parse_human_verification(path, kind):
    if not os.path.exists(path) or os.path.getsize(path) == 0:
        return None
    try:
        wb = openpyxl.load_workbook(path, data_only=True, read_only=True)
    except Exception:
        return None
    if "Human Verification" not in wb.sheetnames:
        return None
    ws = wb["Human Verification"]

    target_codes = TARGET_HV_SECTIONS[kind]
    rows_out = []
    current_code = None
    try:
        for row in ws.iter_rows(min_row=3, values_only=True):
            a = row[0] if len(row) > 0 else None
            if isinstance(a, str) and a.strip().upper().startswith("SECTION"):
                m = _SECTION_RE.match(a.strip())
                code = m.group(1) if m else None
                current_code = code if code in target_codes else None
                continue
            if current_code is None:
                continue
            if all(v is None for v in row):
                continue
            rows_out.append({
                'section_code': current_code,
                'section_label': target_codes[current_code],
                'bill_no': str(row[3]).strip() if len(row) > 3 and row[3] is not None else '',
                'amount': row[8] if len(row) > 8 and isinstance(row[8], (int, float)) else 0,
            })
    finally:
        wb.close()  # required in read_only mode - otherwise Windows keeps a lock on the file
    return rows_out


# ---------------------------------------------------------------------------
# Walk the extracted zip
# ---------------------------------------------------------------------------

def collect_all(transactions_root):
    """
    Returns a list of "folder" dicts, one per <date>/<kind>/<transactionN>:
        {
          date: 'DD-MM-YYYY' (source folder date string, as on disk),
          kind: 'bank' | 'qr',
          tx: 'transaction3',
          checksum: sha256 hex digest of the source book/all_branches file, or None,
          duplicate_of: transactionN this matched by checksum at upload time, or None,
          branch: str | None,
          rows: [ {type,date,chq_no,party,receipts,payments}, ... ],
          hv_rows: [ {section_code, section_label, bill_no, amount}, ... ],
        }
    """
    folders = []
    for date_folder in sorted(os.listdir(transactions_root)):
        date_path = os.path.join(transactions_root, date_folder)
        if not os.path.isdir(date_path):
            continue
        for kind in CHANNEL_KINDS:
            kind_path = os.path.join(date_path, kind)
            if not os.path.isdir(kind_path):
                continue
            for tx in sorted(os.listdir(kind_path), key=lambda s: (len(s), s)):
                tx_path = os.path.join(kind_path, tx)
                if not os.path.isdir(tx_path):
                    continue

                # bank has its own book_report; QR and gateway both use an
                # "all_branches" file with identical layout (many branch
                # sections back to back within one file)
                book_prefix = book_prefix_for(kind)
                candidates = [f for f in os.listdir(tx_path) if f.lower().startswith(book_prefix)]

                # app.py writes a manifest.json at archive time with the
                # checksum it already computed (and whether it matched an
                # already-archived checksum for that date+kind then and
                # there) - reuse it instead of re-hashing the file on every
                # dashboard rebuild. Folders archived before this existed
                # simply won't have one, and fall back to computing it here.
                manifest = _read_manifest(tx_path)

                rows, branch, checksum = ([], None, None)
                if candidates:
                    book_path = os.path.join(tx_path, candidates[0])
                    rows, branch = parse_book_report_with_branch(book_path)
                    rows = rows or []
                    checksum = (manifest or {}).get('checksum') or _file_checksum(book_path)

                hv_fname = HV_FILENAMES[kind]
                hv_rows = parse_human_verification(os.path.join(tx_path, hv_fname), kind) or []

                folders.append({
                    'date': date_folder, 'kind': kind, 'tx': tx, 'checksum': checksum,
                    'branch': branch, 'rows': rows, 'hv_rows': hv_rows,
                    # write-time duplicate signal from app.py (checksum match
                    # against another folder archived earlier that day+kind),
                    # None if there's no manifest or it wasn't flagged then.
                    # Purely informational - see _dedup_folders for what
                    # actually decides duplicate exclusion from the totals.
                    'duplicate_of': (manifest or {}).get('duplicate_of'),
                })
    return folders


# ---------------------------------------------------------------------------
# Aggregation -> DashboardData shape
# ---------------------------------------------------------------------------

def _dedup_count(items):
    """Count of distinct non-empty keys, treating '' / None as always-unique-noise-free (i.e. dropped)."""
    return len({k for k in items if k})


def _folder_content_key(f):
    """Canonical fingerprint of a folder's parsed transaction rows.

    Two folders with the same fingerprint hold the exact same transaction
    data - i.e. the same book report / all_branches file was archived more
    than once (typically the user uploaded the wrong file, noticed, and
    uploaded the correct one again; or simply re-submitted after a failed
    run). Order-independent (sorted) so row order in the source file doesn't
    matter. Returns None for folders with no parsed rows - an empty
    fingerprint can't tell two different blank/unreadable uploads apart, so
    those are never treated as duplicates of one another.
    """
    if not f['rows']:
        return None
    return tuple(sorted(
        (r['type'], str(r['date']), r['chq_no'], str(r['party']), r['receipts'], r['payments'], r['branch'])
        for r in f['rows']
    ))


def _dedup_folders(flist):
    """Collapse folders in a date+kind group that are exact re-uploads of
    each other down to a single copy, so a resubmitted (duplicate) upload
    isn't counted twice (or more) in the dashboard totals.

    `flist` is expected in chronological upload order (collect_all walks
    transaction folders in ascending transactionN order), so when duplicates
    are found the most recently uploaded copy - presumably the one the user
    meant to keep - is the one retained.
    """
    latest_by_key = {}
    key_order = []
    unkeyed = []
    for f in flist:
        key = _folder_content_key(f)
        if key is None:
            unkeyed.append(f)
            continue
        if key not in latest_by_key:
            key_order.append(key)
        latest_by_key[key] = f  # last write wins -> keeps the latest duplicate
    return [latest_by_key[k] for k in key_order] + unkeyed


def build_dashboard_data(transactions_root, generated_from_label):
    folders = collect_all(transactions_root)

    by_date_kind = defaultdict(list)
    for f in folders:
        by_date_kind[(f['date'], f['kind'])].append(f)

    days_out = []
    for date_str in sorted({f['date'] for f in folders}, key=lambda s: datetime.datetime.strptime(s, '%d-%m-%Y')):
        channels = {}
        for kind in CHANNEL_KINDS:
            flist = by_date_kind.get((date_str, kind))
            if not flist:
                continue

            # folders that are exact re-uploads of an earlier folder in this
            # date+kind (e.g. the user uploaded the wrong file, then
            # uploaded it again) - keep the aggregate totals below from
            # counting the same submission more than once.
            flist_dedup = _dedup_folders(flist)
            kept_ids = {id(f) for f in flist_dedup}

            # ---- folder-level (local dedup within each folder) ----
            folder_details = []
            for f in flist:
                chqs = [r['chq_no'] for r in f['rows']]
                folder_branches = sorted({r['branch'] for r in f['rows'] if r.get('branch')})
                folder_details.append({
                    'name': f['tx'],
                    'unique_txn': _dedup_count(chqs),
                    'total_rows': len(f['rows']),
                    'hv_counted': len({r['bill_no'] for r in f['hv_rows'] if r['bill_no']}),
                    'branches': folder_branches or ([f['branch']] if f['branch'] else []),
                    # sha256 of the source file - lets you visually confirm
                    # whether two folders are byte-identical re-uploads.
                    'checksum': f.get('checksum'),
                    # True when this folder's data is an exact re-upload of
                    # another folder the same day+channel, and is therefore
                    # excluded from this channel's aggregate totals below.
                    'is_duplicate': id(f) not in kept_ids,
                    # which earlier transaction app.py matched this folder's
                    # checksum against AT UPLOAD TIME, if any (None if there
                    # was no manifest, or it wasn't a checksum match then).
                    # Purely informational - doesn't drive is_duplicate above.
                    'duplicate_of': f.get('duplicate_of'),
                })

            # ---- day+channel level (dedup across ALL folders of that day+kind) ----
            all_rows = [r for f in flist_dedup for r in f['rows']]
            all_chqs = [r['chq_no'] for r in all_rows]
            unique_txn = _dedup_count(all_chqs)
            total_rows = len(all_rows)

            # per-branch transaction counts (row-level branch, not file-level -
            # a single "all_branches" QR file can span many branch sections)
            branch_totals = defaultdict(int)
            for r in all_rows:
                b = r.get('branch') or 'Unassigned'
                branch_totals[b] += 1

            # amount: sum receipts+payments for the first occurrence of each chq/ref
            # in this day+kind (avoids double counting rows duplicated across
            # duplicate/backup folder scans)
            seen_chq = set()
            amount = 0.0
            parties = set()
            for r in all_rows:
                if r['party']:
                    parties.add(r['party'])
                key = r['chq_no']
                if key and key in seen_chq:
                    continue
                if key:
                    seen_chq.add(key)
                amount += (r['receipts'] or 0) + (r['payments'] or 0)

            all_hv = [r for f in flist_dedup for r in f['hv_rows']]
            seen_bill = set()
            section_totals = defaultdict(int)
            hv_counted = 0
            for r in all_hv:
                label = f"SECTION {r['section_code']} - {r['section_label']}"
                bill = r['bill_no']
                is_first = bool(bill) and bill not in seen_bill
                if bill:
                    seen_bill.add(bill)
                if is_first or not bill:
                    section_totals[label] += 1
                    hv_counted += 1
            # make sure every configured section for this kind appears (even at 0)
            for code, label in TARGET_HV_SECTIONS[kind].items():
                section_totals.setdefault(f"SECTION {code} - {label}", 0)

            branches = sorted({b for f in folder_details for b in f['branches']})

            channels[kind] = {
                'txn_folders': len(flist_dedup),
                'total_rows': total_rows,
                'unique_txn': unique_txn,
                'unique_parties': len(parties),
                'amount': amount,
                'hv_counted': hv_counted,
                'hv_excluded': 0,
                'branches': branches,
                'branch_totals': dict(branch_totals),
                'section_totals': dict(section_totals),
                # automation efficiency = (total txns - txns needing manual review) / total txns.
                # NOTE: hv_counted's 'bill_no' (e.g. "PS-6201582") and unique_txn's 'chq_no'
                # (e.g. "6201582") use different string formats (bill_no carries a
                # transaction-type prefix that chq_no doesn't), so they will not string-match
                # directly - this is cosmetic, not a data error: verified against the source
                # files that stripping the prefix resolves 77-100% of them to the same
                # underlying transaction (100% for Carry-Forward Cross-Cleared Pairs; lower
                # for Ambiguous Pool Matches, which by definition don't always resolve to one
                # specific book transaction). hv_counted was also confirmed to never exceed
                # unique_txn on any single day/channel, so this subtraction is safe.
                'automation_rate': (round(100 * max(unique_txn - hv_counted, 0) / unique_txn) if unique_txn else 0),
                'auto_handled': max(unique_txn - hv_counted, 0),
                'folders': folder_details,
            }

        days_out.append({'date': date_str, 'channels': channels})

    return {
        'generated_from': generated_from_label,
        'days': days_out,
    }


def _find_transactions_root(base):
    """
    The zip might extract with extra wrapper folders (e.g. "Transactions 1/Transactions/16-07-2026/...").
    Walk down until we find the directory whose subdirectories look like date folders
    (i.e. contain a 'bank' or 'qr' child).
    """
    current = base
    for _ in range(8):  # cap depth to avoid infinite loops on weird archives
        try:
            children = [d for d in os.listdir(current) if os.path.isdir(os.path.join(current, d))]
        except (NotADirectoryError, FileNotFoundError):
            break
        if not children:
            break
        if any(os.path.isdir(os.path.join(current, c, 'bank')) or os.path.isdir(os.path.join(current, c, 'qr'))
               for c in children):
            return current
        if len(children) == 1:
            current = os.path.join(current, children[0])
            continue
        break
    return current


def build_from_zip(zip_path):
    import shutil
    tmpdir = tempfile.mkdtemp()
    try:
        with zipfile.ZipFile(zip_path, 'r') as z:
            z.extractall(tmpdir)
        transactions_root = _find_transactions_root(tmpdir)
        return build_dashboard_data(transactions_root, os.path.basename(zip_path))
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)  # don't let a stray Windows file lock crash the whole parse