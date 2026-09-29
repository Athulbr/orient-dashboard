import React, { useMemo, useState } from 'react';
import ResultsTabs from './ResultsTabs';
import Summary from './Summary';
import MatchedTable, { isDiscrepancy } from './MatchedTable';
import HumanVerificationView from './HumanVerificationView';
import BookOnlyTable from './BookOnlyTable';
import BankOnlyTable from './BankOnlyTable';
import BRSStatement from './BRSStatement';
import ActionReasonDialog from './ActionReasonDialog';
import { useReconciliationSession } from '../useReconciliationSession';
import type { MatchedRecord, BookOnlyRecord, BankOnlyRecord, BRSData } from '../types';
import styles from '../styles/Results.module.css';

interface GatewaySummaryItem {
  name:       string;
  gw_net:     number;
  bank_total: number;
  gross:      number;
  fees:       number;
  tax:        number;
  difference: number;
  matched:    number;
  unmatched:  number;
}

interface ResultsData {
  matched:   MatchedRecord[];
  book_only: BookOnlyRecord[];
  bank_only: BankOnlyRecord[];
  brs?:      BRSData;
  summary: {
    book_entries:      number;
    bank_entries:      number;
    matched:           number;
    matched_perfect:   number;
    matched_with_diff: number;
    book_only:         number;
    bank_only:         number;
    difference:        number;
  };
  download_url:        string;
  file_name:           string;
  company_name?:  string;
  account_info?:  string;
  brs_date?:      string;
  recon_type?:    string;
  transaction_ref?: string | null;
  gateway_summary?: GatewaySummaryItem[];
  books_match?:     boolean;
  reconciled?:      boolean;
}

interface ResultsProps {
  data:       ResultsData;
  apiBaseUrl: string;
}

const hexToBlob = (hex: string): Blob => {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  return new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
};

const triggerDownload = (url: string, filename: string) => {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
};

// Strip the client-only `_id` before sending a record back to the backend —
// it isn't a workbook column, it only exists so tables/actions can key rows.
const stripId = <T extends { _id: string }>(records: T[]): Omit<T, '_id'>[] =>
  records.map(({ _id, ...rest }) => rest);

const Results: React.FC<ResultsProps> = ({ data, apiBaseUrl }) => {
  const [activeTab, setActiveTab] = useState('summary');

  const session = useReconciliationSession({
    matched:       data.matched,
    book_only:     data.book_only,
    bank_only:     data.bank_only,
    brs:           data.brs,
    book_entries:  data.summary?.book_entries,
    bank_entries:  data.summary?.bank_entries,
  });

  const isGateway = data.recon_type === 'gateway';
  const hasBRS    = !!data.brs;
  // Regenerate-on-download is wired up for bank and QR — both have a
  // standalone workbook-writing path the regenerate endpoints can call
  // (build_excel() for bank, the override_dnc/override_cnb/override_matched
  // params on process_qr_files() for QR, and the equivalent
  // override_dnc/override_add1/override_cnb/override_less2/override_matched
  // params on process_gateway_files() for Gateway) — all three recon types
  // now regenerate the same way: substitute edits in right before the
  // workbook-writing code runs, without any of that code changing.
  const canRegenerate = !!data.transaction_ref;

  const [downloadUrl, setDownloadUrl]   = useState(data.download_url);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  // ── Pending actions — both un-match and confirm-match need a reason before applying ──
  const [pendingUnmatchIds, setPendingUnmatchIds] = useState<string[] | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<{ bookIds: string[]; bankIds: string[] } | null>(null);
  const [pendingApproveId, setPendingApproveId] = useState<string | null>(null);

  const canConfirmMatch = session.selectedBookOnlyIds.size > 0 && session.selectedBankOnlyIds.size > 0;
  const requestConfirmMatch = () => {
    if (session.selectedBookOnlyIds.size === 0 || session.selectedBankOnlyIds.size === 0) return;
    setPendingConfirm({ bookIds: Array.from(session.selectedBookOnlyIds), bankIds: Array.from(session.selectedBankOnlyIds) });
  };

  const verificationCount = useMemo(() => {
    const flagged = session.matched.filter(isDiscrepancy).length;
    return flagged + session.bookOnly.length + session.bankOnly.length;
  }, [session.matched, session.bookOnly, session.bankOnly]);

  const tabs = [
    { id: 'summary',       label: 'Summary',       count: undefined,               alert: false },
    { id: 'matched',       label: 'Matched',        count: session.summary.matched, alert: false },
    { id: 'verification',  label: 'Human Verification', count: verificationCount,       alert: verificationCount > 0 },
    { id: 'book-only',     label: isGateway ? 'DNC (Book Only)' : 'Book Only',
                                                     count: session.summary.book_only, alert: session.summary.book_only > 0 },
    { id: 'bank-only',     label: isGateway ? 'CNB (Bank Only)' : 'Bank Only',
                                                     count: session.summary.bank_only, alert: session.summary.bank_only > 0 },
    { id: 'brs',           label: 'BRS Statement', count: undefined,               alert: false },
  ];

  const renderTabContent = () => {
    switch (activeTab) {
      case 'summary':
        return (
          <Summary
            data={session.summary}
            brs={session.brs}
            recon_type={data.recon_type}
            gateway_summary={data.gateway_summary}
            books_match={data.books_match}
          />
        );

      case 'matched':
        return (
          <MatchedTable
            data={session.matched}
            selectedIds={session.selectedMatchedIds}
            onSelectionChange={session.setSelectedMatchedIds}
            onUnmatch={setPendingUnmatchIds}
            onApprove={setPendingApproveId}
          />
        );

      case 'verification':
        return (
          <HumanVerificationView
            matched={session.matched}
            bookOnly={session.bookOnly}
            bankOnly={session.bankOnly}
            selectedMatchedIds={session.selectedMatchedIds}
            onSelectionChange={session.setSelectedMatchedIds}
            onUnmatch={setPendingUnmatchIds}
            onApprove={setPendingApproveId}
            onGoToBookOnly={() => setActiveTab('book-only')}
            onGoToBankOnly={() => setActiveTab('bank-only')}
            selectedBookOnlyIds={session.selectedBookOnlyIds}
            selectedBankOnlyIds={session.selectedBankOnlyIds}
            onToggleBookOnly={session.toggleBookOnlySelection}
            onToggleBankOnly={session.toggleBankOnlySelection}
          />
        );

      case 'book-only':
        return (
          <BookOnlyTable
            data={session.bookOnly}
            selectedIds={session.selectedBookOnlyIds}
            onSelectionChange={session.setSelectedBookOnlyIds}
            canConfirmMatch={canConfirmMatch}
            onConfirmMatchRequest={requestConfirmMatch}
          />
        );

      case 'bank-only':
        return (
          <BankOnlyTable
            data={session.bankOnly}
            selectedIds={session.selectedBankOnlyIds}
            onSelectionChange={session.setSelectedBankOnlyIds}
            canConfirmMatch={canConfirmMatch}
            onConfirmMatchRequest={requestConfirmMatch}
          />
        );

      case 'brs':
        if (!hasBRS) {
          return (
            <div className={styles['brs-unavailable']}>
              <p>BRS data not available. Please re-run reconciliation with all three files.</p>
            </div>
          );
        }
        return (
          <BRSStatement
            brs={session.brs}
            book_only={session.bookOnly}
            bank_only={session.bankOnly}
            matched={session.matched}
            company_name={data.company_name}
            account_info={data.account_info}
            brs_date={data.brs_date}
            recon_type={data.recon_type}
          />
        );

      default:
        return null;
    }
  };

  const handleDownload = async () => {
    setDownloadError(null);
    if (!session.isDirty || !canRegenerate) {
      // Nothing edited, or this recon type doesn't support regenerate yet —
      // hand back the original workbook exactly as the engine produced it.
      setIsDownloading(true);
      try {
        triggerDownload(downloadUrl, data.file_name);
      } finally {
        setIsDownloading(false);
      }
      return;
    }

    setIsDownloading(true);
    try {
      const regenerateEndpoint =
        data.recon_type === 'qr'      ? '/reconcile/regenerate-qr' :
        data.recon_type === 'gateway' ? '/reconcile/regenerate-gateway' :
                                         '/reconcile/regenerate-bank';
      const response = await fetch(`${apiBaseUrl}${regenerateEndpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transaction_ref: data.transaction_ref,
          matched:   stripId(session.matched),
          book_only: stripId(session.bookOnly),
          bank_only: stripId(session.bankOnly),
        }),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => null);
        throw new Error(err?.detail || `Server error: ${response.statusText}`);
      }
      const result = await response.json();
      const blob = hexToBlob(result.file_bytes);
      const newUrl = URL.createObjectURL(blob);
      setDownloadUrl(newUrl);
      triggerDownload(newUrl, result.file_name || data.file_name);
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : 'Failed to regenerate the workbook.');
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className={styles['results-container']}>
      {/* Entry count + download — compact bar above tabs */}
      <div className={styles['results-meta-bar']}>
        <span className={styles['results-entry-count']}>
          {session.summary.book_entries} book {session.summary.book_entries === 1 ? 'entry' : 'entries'} vs{' '}
          {session.summary.bank_entries} bank {session.summary.bank_entries === 1 ? 'entry' : 'entries'}
        </span>
        <button
          onClick={handleDownload}
          disabled={isDownloading}
          className={`${styles['btn']} ${styles['btn-download']}`}
        >
          {isDownloading ? (
            <><span className={styles['spinner-small']} /> {session.isDirty && canRegenerate ? 'Regenerating…' : 'Downloading...'}</>
          ) : session.isDirty && canRegenerate ? (
            'Download Updated Report'
          ) : (
            'Download Report'
          )}
        </button>
      </div>

      {session.isDirty && !canRegenerate && (
        <div className={styles['edit-notice']}>
          Your in-app changes are reflected here for review, but this run wasn't archived on the server,
          so it can't be regenerated from edits — downloading will give you the original engine output.
        </div>
      )}

      {downloadError && (
        <div className={styles['edit-notice']} data-variant="error">{downloadError}</div>
      )}

      <ResultsTabs tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab}>
        {renderTabContent()}
      </ResultsTabs>

      {/* Persistent Confirm Match bar — visible regardless of which tab is
          active, since the two halves of a confirm-match pick can happen on
          Book Only and Bank Only separately. */}
      {canConfirmMatch && activeTab !== 'book-only' && activeTab !== 'bank-only' && (
        <div className={styles['floating-confirm-bar']}>
          <span>
            {session.selectedBookOnlyIds.size} book row{session.selectedBookOnlyIds.size > 1 ? 's' : ''}
            {' + '}
            {session.selectedBankOnlyIds.size} bank row{session.selectedBankOnlyIds.size > 1 ? 's' : ''} selected
          </span>
          <button className={styles['btn-download']} onClick={requestConfirmMatch}>Confirm Match</button>
          <button className={styles['btn-outline']} onClick={session.clearSelections}>Clear</button>
        </div>
      )}

      <ActionReasonDialog
        isOpen={!!pendingUnmatchIds}
        title="Un-match selected row(s)"
        description="These will move back into Book Only and Bank Only, and the BRS will recalculate automatically."
        confirmLabel="Un-match"
        onCancel={() => setPendingUnmatchIds(null)}
        onConfirm={(reason) => {
          if (pendingUnmatchIds) session.unmatchRows(pendingUnmatchIds, reason);
          setPendingUnmatchIds(null);
        }}
      />

      <ActionReasonDialog
        isOpen={!!pendingApproveId}
        title="Confirm matched row"
        description="This match will be confirmed, removed from the BRS outstanding rows, and the reason will be saved in the matched row notes."
        confirmLabel="Match"
        onCancel={() => setPendingApproveId(null)}
        onConfirm={(reason) => {
          if (pendingApproveId) session.approveFlagged(pendingApproveId, reason);
          setPendingApproveId(null);
        }}
      />

      <ActionReasonDialog
        isOpen={!!pendingConfirm}
        title="Confirm Match"
        description="These rows will merge into Matched and drop out of Book Only / Bank Only. The BRS will recalculate automatically."
        confirmLabel="Confirm Match"
        onCancel={() => setPendingConfirm(null)}
        onConfirm={(reason) => {
          if (pendingConfirm) session.confirmMatch(pendingConfirm.bookIds, pendingConfirm.bankIds, reason);
          setPendingConfirm(null);
        }}
      />
    </div>
  );
};

export default Results;
