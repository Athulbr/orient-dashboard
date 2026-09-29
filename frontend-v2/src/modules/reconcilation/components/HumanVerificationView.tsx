import React, { useMemo } from 'react';
import MatchedTable, { isDiscrepancy } from './MatchedTable';
import styles from '../styles/DataTable.module.css';
import { cx } from '../utils/cx';
import type { MatchedRecord, BookOnlyRecord, BankOnlyRecord } from '../types';

interface HumanVerificationViewProps {
  matched: MatchedRecord[];
  bookOnly: BookOnlyRecord[];
  bankOnly: BankOnlyRecord[];
  selectedMatchedIds: Set<string>;
  onSelectionChange: (ids: Set<string>) => void;
  onUnmatch: (ids: string[]) => void;
  onApprove: (id: string) => void;
  onGoToBookOnly: () => void;
  onGoToBankOnly: () => void;
  // Book Only / Bank Only rows here share the exact same selection state as
  // the dedicated tabs (many-to-many allowed there too) — picking
  // a pair right here works the same as picking one on each tab, and the
  // floating Confirm Match bar in Results.tsx picks it up automatically.
  selectedBookOnlyIds: Set<string>;
  selectedBankOnlyIds: Set<string>;
  onToggleBookOnly: (id: string) => void;
  onToggleBankOnly: (id: string) => void;
}

const isCF = (r: BookOnlyRecord | BankOnlyRecord): boolean =>
  !!r['Is CF'] ||
  !!r['Issue']?.includes('Carried Forward') ||
  !!('Narration' in r && r['Narration']?.includes('[CF from prev BRS]'));

const isBookRecord = (r: BookOnlyRecord | BankOnlyRecord): r is BookOnlyRecord =>
  'Book Amt (Rs)' in r;

const fmtAmt = (v: number) =>
  Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// This mirrors the Excel's "Human Verification" sheet, which is a much
// broader review list than just ambiguous matches — it also surfaces every
// still-outstanding book-only / bank-only item and previous-BRS
// carry-forwards, since those need a human decision too (chase it up, or
// confirm-match it against something the engine missed). Sections B
// (blocked cross-clears) and F (split-payment candidates) from the Excel
// aren't included here yet — that data isn't in the API response.
const HumanVerificationView: React.FC<HumanVerificationViewProps> = ({
  matched, bookOnly, bankOnly, selectedMatchedIds, onSelectionChange, onUnmatch, onApprove,
  onGoToBookOnly, onGoToBankOnly, selectedBookOnlyIds, selectedBankOnlyIds, onToggleBookOnly, onToggleBankOnly,
}) => {
  const flaggedMatches = useMemo(() => matched.filter(isDiscrepancy), [matched]);
  const bankOnlyNew   = useMemo(() => bankOnly.filter(r => !isCF(r)), [bankOnly]);
  const bookOnlyNew   = useMemo(() => bookOnly.filter(r => !isCF(r)), [bookOnly]);
  const carriedForward = useMemo(
    () => [...bookOnly.filter(isCF), ...bankOnly.filter(isCF)],
    [bookOnly, bankOnly],
  );

  const nothingAtAll =
    flaggedMatches.length === 0 && bankOnlyNew.length === 0 &&
    bookOnlyNew.length === 0 && carriedForward.length === 0;

  if (nothingAtAll) {
    return (
      <div className={cx(styles['table-empty'], styles['table-empty-success'])}>
        <p>Nothing needs a manual look right now.</p>
        <p className={styles['subtitle']}>Ambiguous matches, unrecorded transactions, and outstanding carry-forwards will show up here.</p>
      </div>
    );
  }

  return (
    <div className={styles['table-container']} style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <section>
        <h3 className={styles['section-title']}>Matches worth a second look ({flaggedMatches.length})</h3>
        <MatchedTable
          data={matched}
          selectedIds={selectedMatchedIds}
          onSelectionChange={onSelectionChange}
          onUnmatch={onUnmatch}
          flaggedOnly
          onApprove={onApprove}
        />
      </section>

      {bankOnlyNew.length > 0 && (
        <section>
          <h3 className={styles['section-title']}>
            Bank transactions not yet in the books ({bankOnlyNew.length})
          </h3>
          <p className={styles['section-hint']}>
            Tick one or more, plus a Book Only pick below (or on the{' '}
            <button className={styles['link-btn']} onClick={onGoToBookOnly}>Book Only tab</button>), to Confirm Match —
            or go to the <button className={styles['link-btn']} onClick={onGoToBankOnly}>Bank Only tab</button> directly.
          </p>
          <div className={styles['table-scroll']}>
            <table className={styles['data-table']}>
              <thead>
                <tr><th className={styles['col-select']} /><th>Date</th><th>Party</th><th>Description</th><th>Direction</th><th>Amount (Rs)</th></tr>
              </thead>
              <tbody>
                {bankOnlyNew.map(r => (
                  <tr
                    key={r._id}
                    className={cx(styles['data-row'], selectedBankOnlyIds.has(r._id) && styles['row-selected'])}
                    onClick={() => onToggleBankOnly(r._id)}
                  >
                    <td className={styles['col-select']} onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        className={styles['row-select-input']}
                        checked={selectedBankOnlyIds.has(r._id)}
                        onChange={() => onToggleBankOnly(r._id)}
                        aria-label="Select row"
                      />
                    </td>
                    <td className={styles['cell-mono']}>{r['Date']}</td>
                    <td className={styles['cell-party']}>{r['Party']}</td>
                    <td className={styles['cell-description']}>{r['Description'] ?? r['Bank Statement'] ?? ''}</td>
                    <td><span className={cx(styles['dir-badge'], styles[`dir-${r['Direction']?.toLowerCase()}`])}>{r['Direction']}</span></td>
                    <td className={styles['cell-amount']}>{fmtAmt(r['Bank Amt (Rs)'])}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {bookOnlyNew.length > 0 && (
        <section>
          <h3 className={styles['section-title']}>
            Book entries not yet in the bank statement ({bookOnlyNew.length})
          </h3>
          <p className={styles['section-hint']}>
            Typically cheques not yet cleared, or a timing difference — tick one or more, plus a Bank Only pick, to Confirm Match.
          </p>
          <div className={styles['table-scroll']}>
            <table className={styles['data-table']}>
              <thead>
                <tr><th className={styles['col-select']} /><th>Date</th><th>Party</th><th>Chq No</th><th>Direction</th><th>Amount (Rs)</th></tr>
              </thead>
              <tbody>
                {bookOnlyNew.map(r => (
                  <tr
                    key={r._id}
                    className={cx(styles['data-row'], selectedBookOnlyIds.has(r._id) && styles['row-selected'])}
                    onClick={() => onToggleBookOnly(r._id)}
                  >
                    <td className={styles['col-select']} onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        className={styles['row-select-input']}
                        checked={selectedBookOnlyIds.has(r._id)}
                        onChange={() => onToggleBookOnly(r._id)}
                        aria-label="Select row"
                      />
                    </td>
                    <td className={styles['cell-mono']}>{r['Date'] ?? ''}</td>
                    <td className={styles['cell-party']}>{r['Party']}</td>
                    <td className={styles['cell-mono']}>{r['Chq No'] || '—'}</td>
                    <td><span className={cx(styles['dir-badge'], styles[`dir-${r['Direction']?.toLowerCase()}`])}>{r['Direction']}</span></td>
                    <td className={styles['cell-amount']}>{fmtAmt(r['Book Amt (Rs)'])}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {carriedForward.length > 0 && (
        <section>
          <h3 className={styles['section-title']}>
            Still outstanding from a previous BRS ({carriedForward.length})
          </h3>
          <p className={styles['section-hint']}>
            Carried forward and still not cleared — worth chasing up if they're aging, or confirm-match it here if it turns out to be a match the engine missed.
          </p>
          <div className={styles['table-scroll']}>
            <table className={styles['data-table']}>
              <thead>
                <tr><th className={styles['col-select']} /><th>Party</th><th>Direction</th><th>Amount (Rs)</th></tr>
              </thead>
              <tbody>
                {carriedForward.map(r => {
                  const isBook   = isBookRecord(r);
                  const selected = isBook ? selectedBookOnlyIds.has(r._id) : selectedBankOnlyIds.has(r._id);
                  const onToggle = () => (isBook ? onToggleBookOnly(r._id) : onToggleBankOnly(r._id));
                  return (
                    <tr key={r._id} className={cx(styles['data-row'], selected && styles['row-selected'])} onClick={onToggle}>
                      <td className={styles['col-select']} onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          className={styles['row-select-input']}
                          checked={selected}
                          onChange={onToggle}
                          aria-label="Select row"
                        />
                      </td>
                      <td className={styles['cell-party']}>{r['Party']}</td>
                      <td><span className={cx(styles['dir-badge'], styles[`dir-${r['Direction']?.toLowerCase()}`])}>{r['Direction']}</span></td>
                      <td className={styles['cell-amount']}>
                        {fmtAmt(isBook ? r['Book Amt (Rs)'] : r['Bank Amt (Rs)'])}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
};

export default HumanVerificationView;
