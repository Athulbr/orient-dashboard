import React from 'react';
import summaryStyles from '../styles/Summary.module.css';
import gwStyles from '../styles/GatewayTable.module.css';
import { cx } from '../utils/cx';

// Merge both module style objects so we can reference all classes via `s`
const s = { ...summaryStyles, ...gwStyles };

interface BRSData {
  book_closing_bal:   number;
  bank_closing_bal:   number;
  add_issued:         number;
  less_deposited:     number;
  less_debited_nb:    number;
  add_credited_nb:    number;
  reconciled_balance: number;
  brs_difference:     number;
}

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

interface SummaryData {
  book_entries:      number;
  bank_entries:      number;
  matched:           number;
  matched_perfect:   number;
  matched_with_diff: number;
  book_only:         number;
  bank_only:         number;
  difference:        number;
}

interface SummaryProps {
  data:             SummaryData;
  brs?:             BRSData;
  recon_type?:      string;
  gateway_summary?: GatewaySummaryItem[];
  books_match?:     boolean;
}

const fmt = (n: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency', currency: 'INR', minimumFractionDigits: 2,
  }).format(Math.abs(n));

const fmtAmt = (n: number) =>
  new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

const Summary: React.FC<SummaryProps> = ({
  data, brs, recon_type, gateway_summary, books_match,
}) => {
  const isGateway    = recon_type === 'gateway';
  const isReconciled = Math.abs(data.difference) < 0.01;
  const hasUnmatched = data.book_only > 0 || data.bank_only > 0;
  const matchedWithDiff = data.matched_with_diff != null
    ? data.matched_with_diff
    : Math.max(0, data.matched - data.matched_perfect);

  const totalMatched   = data.matched_perfect + matchedWithDiff;
  const matchQuality   = totalMatched > 0
    ? (data.matched_perfect / totalMatched) * 100
    : isReconciled ? 100
    : data.book_only === 0 && data.bank_only === 0 ? 100
    : 50;

  const totalEntries   = totalMatched + data.book_only + data.bank_only;
  const unmatchedRatio = totalEntries > 0 ? (data.book_only + data.bank_only) / totalEntries : 0;
  const brsScore       = isReconciled
    ? 100
    : Math.max(0, Math.round((1 - unmatchedRatio) * 100));

  // If BRS is fully reconciled, accuracy is always 100% regardless of match breakdown
  const matchPct = isReconciled
    ? 100
    : Math.min(100, Math.round(matchQuality * 0.70 + brsScore * 0.30));

  const statusMsg = isReconciled
    ? 'Books and bank are fully reconciled — difference is zero'
    : `BRS difference: ${fmt(data.difference)} — investigate before period close`;

  return (
    <div className={s['summary-container']}>

      {/* Status bar */}
      <div className={cx(s['status-bar'], isReconciled ? s['status-bar--ok'] : s['status-bar--pending'])}>
        <span className={s['status-bar__label']}>
          {isReconciled ? 'Fully Reconciled' : 'Reconciliation Pending'}
        </span>
        <span className={s['status-bar__value']}>{statusMsg}</span>
      </div>

      {/* Books match (gateway only) */}
      {isGateway && books_match !== undefined && (
        <div
          className={cx(s['status-bar'], books_match ? s['status-bar--ok'] : s['status-bar--pending'])}
          style={{ marginTop: '-12px' }}
        >
          <span className={s['status-bar__label']}>Books Match</span>
          <span className={s['status-bar__value']}>
            {books_match
              ? 'All-Branches HOT-HOT Payments = HOT Receipts — books are consistent'
              : 'All-Branches HOT-HOT Payments ≠ HOT Receipts — investigate book discrepancy'}
          </span>
        </div>
      )}

      {/* KPI cards */}
      <div className={s['kpi-grid']}>
        <div className={s['kpi-card']}>
          <span className={s['kpi-card__label']}>Book Entries</span>
          <span className={s['kpi-card__value']}>{data.book_entries.toLocaleString('en-IN')}</span>
        </div>
        <div className={s['kpi-card']}>
          <span className={s['kpi-card__label']}>Bank Entries</span>
          <span className={s['kpi-card__value']}>{data.bank_entries.toLocaleString('en-IN')}</span>
        </div>
        <div className={cx(s['kpi-card'], s['kpi-card--green'])}>
          <span className={s['kpi-card__label']}>Matched</span>
          <span className={s['kpi-card__value']}>{data.matched.toLocaleString('en-IN')}</span>
        </div>
        <div className={cx(s['kpi-card'], data.book_only > 0 ? s['kpi-card--amber'] : s['kpi-card--green'])}>
          <span className={s['kpi-card__label']}>{isGateway ? 'DNC (Book Only)' : 'Book Only'}</span>
          <span className={s['kpi-card__value']}>{data.book_only.toLocaleString('en-IN')}</span>
        </div>
        <div className={cx(s['kpi-card'], data.bank_only > 0 ? s['kpi-card--red'] : s['kpi-card--green'])}>
          <span className={s['kpi-card__label']}>{isGateway ? 'CNB (Bank Only)' : 'Bank Only'}</span>
          <span className={s['kpi-card__value']}>{data.bank_only.toLocaleString('en-IN')}</span>
        </div>
        <div className={cx(s['kpi-card'], isReconciled ? s['kpi-card--green'] : s['kpi-card--red'])}>
          <span className={s['kpi-card__label']}>BRS Difference</span>
          <span className={cx(s['kpi-card__value'], s['kpi-card__value--sm'])}>
            {isReconciled ? '—' : fmt(data.difference)}
          </span>
        </div>
      </div>

      {/* Gateway per-gateway breakdown */}
      {isGateway && gateway_summary && gateway_summary.length > 0 && (
        <div className={s['summary-panel']}>
          <p className={s['panel-heading']}>Gateway Breakdown</p>
          <div className={s['gw-summary-grid']}>
            {gateway_summary.map((gw, i) => {
              const ok = Math.abs(gw.difference) < 1;
              return (
                <div key={i} className={s['gw-summary-card']}>
                  <div className={s['gw-summary-card__header']}>
                    <span className={s['gw-summary-card__name']}>{gw.name}</span>
                    <span className={cx(s['gw-summary-card__status'], ok ? s['gw-summary-card__status--ok'] : s['gw-summary-card__status--err'])}>
                      {ok ? 'Matched' : 'Gap'}
                    </span>
                  </div>
                  <div className={s['gw-summary-card__body']}>
                    {[
                      ['Gross',       `₹${fmtAmt(gw.gross)}`],
                      ['GW Net',      `₹${fmtAmt(gw.gw_net)}`],
                      ['Fees',        `₹${fmtAmt(gw.fees)}`],
                      ['Tax',         `₹${fmtAmt(gw.tax)}`],
                      ['Bank Credit', `₹${fmtAmt(gw.bank_total)}`],
                      ['Difference',  ok ? '— (Nil)' : `₹${fmtAmt(Math.abs(gw.difference))}`],
                    ].map(([label, value], ri) => (
                      <div key={ri} className={s['gw-summary-card__row']}>
                        <span className={s['gw-summary-card__label']}>{label}</span>
                        <span className={cx(
                          s['gw-summary-card__value'],
                          label === 'Difference' && (ok ? s['gw-summary-card__diff--ok'] : s['gw-summary-card__diff--err']),
                        )}>
                          {value}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* BRS Balance summary */}
      {brs && (
        <div className={s['summary-panel']}>
          <p className={s['panel-heading']}>BRS Balance Summary</p>
          <table className={cx(s['breakdown-table'], s['brs-balance-table'])}>
            <tbody>
              <tr className={s['brs-row-opening']}>
                <td>Closing Balance as per Company Books</td>
                <td className={s['breakdown-table__val']}>{fmt(brs.book_closing_bal)}</td>
              </tr>
              {isGateway ? (
                <>
                  <tr>
                    <td>Add: Cheques issued but not debited in bank</td>
                    <td className={cx(s['breakdown-table__val'], s['val--add'])}>{fmt(brs.add_issued)}</td>
                  </tr>
                  <tr>
                    <td>Less: Deposited but not Credited in Bank (DNC)</td>
                    <td className={cx(s['breakdown-table__val'], s['val--less'])}>({fmt(brs.less_deposited)})</td>
                  </tr>
                  <tr>
                    <td>Less: Debited in Bank not in Book</td>
                    <td className={cx(s['breakdown-table__val'], s['val--less'])}>({fmt(brs.less_debited_nb)})</td>
                  </tr>
                  <tr>
                    <td>Add: Credited in Bank not in Book (CNB)</td>
                    <td className={cx(s['breakdown-table__val'], s['val--add'])}>{fmt(brs.add_credited_nb)}</td>
                  </tr>
                </>
              ) : (
                <>
                  <tr>
                    <td>Add: Cheques issued but not debited in bank</td>
                    <td className={cx(s['breakdown-table__val'], s['val--add'])}>{fmt(brs.add_issued)}</td>
                  </tr>
                  <tr>
                    <td>Less: Cheques deposited but not credited in bank</td>
                    <td className={cx(s['breakdown-table__val'], s['val--less'])}>({fmt(brs.less_deposited)})</td>
                  </tr>
                  <tr>
                    <td>Less: Debited in bank but not recorded in book</td>
                    <td className={cx(s['breakdown-table__val'], s['val--less'])}>({fmt(brs.less_debited_nb)})</td>
                  </tr>
                  <tr>
                    <td>Add: Credited in bank but not recorded in book</td>
                    <td className={cx(s['breakdown-table__val'], s['val--add'])}>{fmt(brs.add_credited_nb)}</td>
                  </tr>
                </>
              )}
              <tr className={s['brs-row-subtotal']}>
                <td><strong>Reconciled Balance</strong></td>
                <td className={s['breakdown-table__val']}><strong>{fmt(brs.reconciled_balance)}</strong></td>
              </tr>
              <tr className={s['brs-row-bank']}>
                <td>Closing Balance as per Bank</td>
                <td className={s['breakdown-table__val']}>{fmt(brs.bank_closing_bal)}</td>
              </tr>
              <tr className={cx(s['brs-row-diff'], isReconciled ? s['brs-row-ok'] : s['brs-row-err'])}>
                <td><strong>Difference</strong></td>
                <td className={s['breakdown-table__val']}>
                  <strong>{isReconciled ? '— (Nil)' : fmt(brs.brs_difference)}</strong>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Match rate */}
      <div className={s['summary-panel']}>
        <p className={s['panel-heading']}>Reconciliation Accuracy</p>
        <div className={s['match-rate-row']}>
          <div className={s['match-progress']}>
            <div
              className={cx(
                s['match-progress__fill'],
                matchPct >= 95 ? s['match-progress__fill--high']
                : matchPct >= 75 ? s['match-progress__fill--mid']
                : s['match-progress__fill--low'],
              )}
              style={{ width: `${matchPct}%` }}
            />
          </div>
          <span className={cx(
            s['match-pct'],
            matchPct >= 95 ? s['match-pct--high']
            : matchPct >= 75 ? s['match-pct--mid']
            : s['match-pct--low'],
          )}>
            {matchPct}%
          </span>
        </div>
        <p className={s['match-rate-note']}>
          {isReconciled && matchPct === 100
            ? 'All entries matched perfectly and BRS is fully reconciled.'
            : isReconciled && matchPct >= 85
            ? 'BRS is fully reconciled. Some entries matched with minor differences.'
            : isReconciled
            ? 'BRS is fully reconciled. Review matched entries with amount differences.'
            : matchPct >= 75
            ? 'Not yet reconciled. Review unmatched and differing entries.'
            : 'Significant unmatched items remain. Investigation required before close.'}
        </p>
        <table className={s['breakdown-table']}>
          <tbody>
            <tr>
              <td>Perfect match <span className={s['score-weight']}>(weight 1.00)</span></td>
              <td className={s['breakdown-table__val']}>{data.matched_perfect.toLocaleString('en-IN')}</td>
            </tr>
            <tr>
              <td>Matched with difference <span className={s['score-weight']}>(weight 0.75)</span></td>
              <td className={cx(s['breakdown-table__val'], matchedWithDiff > 0 && s['val--amber'])}>
                {matchedWithDiff.toLocaleString('en-IN')}
              </td>
            </tr>
            <tr>
              <td>
                {isGateway ? 'DNC — deposited not credited' : 'Unmatched — book only'}{' '}
                <span className={s['score-weight']}>(weight 0.30)</span>
              </td>
              <td className={cx(s['breakdown-table__val'], data.book_only > 0 && s['val--amber'])}>
                {data.book_only.toLocaleString('en-IN')}
              </td>
            </tr>
            <tr>
              <td>
                {isGateway ? 'CNB — credited not booked' : 'Unmatched — bank only'}{' '}
                <span className={s['score-weight']}>(weight 0.10)</span>
              </td>
              <td className={cx(s['breakdown-table__val'], data.bank_only > 0 && s['val--red'])}>
                {data.bank_only.toLocaleString('en-IN')}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Recommended actions */}
      {(hasUnmatched || matchedWithDiff > 0 || !isReconciled) && (
        <div className={s['summary-panel']}>
          <p className={s['panel-heading']}>Recommended Actions</p>
          <ol className={s['next-steps']}>
            {data.bank_only > 0 && (
              <li className={cx(s['next-step'], s['next-step--urgent'])}>
                {isGateway
                  ? `Investigate ${data.bank_only} CNB entries — credited in bank but not recorded in book.`
                  : `Investigate ${data.bank_only} bank-only entries — present in bank statement but absent from books.`}
              </li>
            )}
            {data.book_only > 0 && (
              <li className={s['next-step']}>
                {isGateway
                  ? `Review ${data.book_only} DNC entries — deposited in books but not yet credited in bank.`
                  : `Review ${data.book_only} book-only entries — typically cheques not yet cleared.`}
              </li>
            )}
            {matchedWithDiff > 0 && (
              <li className={s['next-step']}>
                Verify {matchedWithDiff} matched {matchedWithDiff === 1 ? 'entry' : 'entries'} with
                amount differences — possible fees or data discrepancies.
              </li>
            )}
            {!isReconciled && (
              <li className={s['next-step']}>
                Resolve the BRS variance of {fmt(data.difference)} before period close.
              </li>
            )}
          </ol>
        </div>
      )}
    </div>
  );
};

export default Summary;