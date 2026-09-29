import React, { useMemo, useState } from 'react';
import {
  useReactTable, getCoreRowModel, getPaginationRowModel,
  type ColumnDef, type RowSelectionState,
} from '@tanstack/react-table';
import styles from '../styles/DataTable.module.css';
import { cx } from '../utils/cx';
import type { MatchedRecord } from '../types';

interface MatchedTableProps {
  data: MatchedRecord[];
  selectedIds: Set<string>;
  onSelectionChange: (ids: Set<string>) => void;
  onUnmatch: (ids: string[]) => void;
  /** Human Verification reuse: show only rows worth a human look. */
  flaggedOnly?: boolean;
  /** Human Verification reuse: confirm a flagged row and clear its BRS legs. */
  onApprove?: (id: string) => void;
}

const nameMatchVariant = (v: string): string => {
  if (v === 'Match')   return 'badge-success';
  if (v === 'Manual')  return 'badge-info';
  if (v === 'Partial') return 'badge-warning';
  return 'badge-danger';
};

const amtMatchVariant = (v: string | undefined): string => {
  if (!v)                                                                 return 'badge-warning';
  if (v === 'Exact')                                                      return 'badge-success';
  if (v.includes('Minor') || v.startsWith('Split') || v.startsWith('CF-Clear')) return 'badge-warning';
  return 'badge-danger';
};

// A matched row worth a human look: a name match that isn't a clean "Match"
// or a user-confirmed "Manual" (bank uses 'Mismatch'/'Partial' for a bad
// name score, QR uses 'Low'/'Partial' — checking for "not a good value"
// instead of allowlisting every backend's specific bad-value string is what
// makes this work correctly across recon types), an amount difference, a
// partial/split payment, or any row the backend flagged with a
// "— verify"/"Low name"/"manual check" note. Reused by the Human
// Verification tab and by BRSStatement's own discrepancy panel.
const GOOD_NAME_MATCH = new Set(['Match', 'Manual']);
export const isDiscrepancy = (row: MatchedRecord): boolean => {
  if (row['Is Reviewed']) return false;
  const nameMatch  = row['Name Match']   || '';
  const amtMatch   = row['Amount Match'] || '';
  const flags      = row['Flags']        || '';
  const isPartial  = row['Partial Payment'] === true;
  const hasNameFlag = flags.includes('— verify') || flags.includes('Low name') || flags.includes('manual check');
  const badNameMatch = nameMatch !== '' && !GOOD_NAME_MATCH.has(nameMatch);
  return badNameMatch || amtMatch.startsWith('Diff') || isPartial || hasNameFlag;
};

const PER_PAGE = 25;

const MatchedTable: React.FC<MatchedTableProps> = ({
  data, selectedIds, onSelectionChange, onUnmatch, flaggedOnly = false, onApprove,
}) => {
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('all');

  const baseData = useMemo(() => (flaggedOnly ? data.filter(isDiscrepancy) : data), [data, flaggedOnly]);

  const filtered = useMemo(() => baseData.filter((r) => {
    if (filter === 'all')      return true;
    if (filter === 'perfect')  return r['Name Match'] === 'Match';
    if (filter === 'manual')   return r['Name Match'] === 'Manual';
    if (filter === 'partial')  return r['Name Match'] === 'Partial';
    if (filter === 'mismatch') return r['Name Match'] !== '' && !GOOD_NAME_MATCH.has(r['Name Match']) && r['Name Match'] !== 'Partial';
    if (filter === 'flagged')  return !!r['Flags'] && r['Flags'].trim().length > 0;
    return true;
  }), [baseData, filter]);

  // Controlled row selection — the Set lives in useReconciliationSession so
  // it survives switching tabs (needed so Confirm Match can see a Book Only
  // pick and a Bank Only pick made on different tabs).
  const rowSelection: RowSelectionState = useMemo(() => {
    const rs: RowSelectionState = {};
    selectedIds.forEach((id) => { rs[id] = true; });
    return rs;
  }, [selectedIds]);

  // Only the select column is defined as a real ColumnDef — the rest of the
  // row is still rendered by hand below so all of the existing badge /
  // expand-row presentation carries over untouched. TanStack here owns row
  // model, selection state, and pagination; not per-cell rendering.
  const columns = useMemo<ColumnDef<MatchedRecord>[]>(() => [
    { id: 'select', accessorKey: '_id' },
  ], []);

  const table = useReactTable({
    data: filtered,
    columns,
    state: { rowSelection },
    getRowId: (r) => r._id,
    enableRowSelection: true,
    onRowSelectionChange: (updater) => {
      const next = typeof updater === 'function' ? updater(rowSelection) : updater;
      onSelectionChange(new Set(Object.keys(next).filter((k) => next[k])));
    },
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: PER_PAGE } },
  });

  if (!data || data.length === 0) {
    return (
      <div className={styles['table-empty']}>
        <p>{flaggedOnly ? 'Nothing needs a manual look right now' : 'No matched records found'}</p>
        <p className={styles['subtitle']}>
          {flaggedOnly ? 'Flagged matches (name mismatches, partial names, amount differences) will show up here.'
                       : 'Matched entries will appear here after reconciliation'}
        </p>
      </div>
    );
  }

  const rows = table.getRowModel().rows;
  const selectedCount = Object.keys(rowSelection).length;

  const counts = {
    all:      baseData.length,
    perfect:  baseData.filter(r => r['Name Match'] === 'Match').length,
    manual:   baseData.filter(r => r['Name Match'] === 'Manual').length,
    partial:  baseData.filter(r => r['Name Match'] === 'Partial').length,
    mismatch: baseData.filter(r => r['Name Match'] !== '' && !GOOD_NAME_MATCH.has(r['Name Match']) && r['Name Match'] !== 'Partial').length,
    flagged:  baseData.filter(r => r['Flags'] && r['Flags'].trim().length > 0).length,
  };

  const handleFilterChange = (f: string) => {
    setFilter(f);
    table.setPageIndex(0);
    setExpandedRow(null);
  };

  const fmtAmt = (v: number) =>
    Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  if (filtered.length === 0) {
    return (
      <div className={styles['table-container']}>
        <div className={styles['filter-bar']}>
          {[
            { key: 'all', label: `All (${counts.all})` },
            { key: 'perfect', label: `Perfect Match (${counts.perfect})` },
            { key: 'manual', label: `Manual (${counts.manual})` },
            { key: 'partial', label: `Partial Match (${counts.partial})` },
            { key: 'mismatch', label: `Mismatch (${counts.mismatch})` },
            { key: 'flagged', label: `Flagged (${counts.flagged})` },
          ].map((f) => (
            <button key={f.key} className={cx(styles['filter-btn'], filter === f.key && styles['active'])} onClick={() => handleFilterChange(f.key)}>
              {f.label}
            </button>
          ))}
        </div>
        <div className={styles['table-empty']}>
          <p>No records match this filter</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles['table-container']}>
      <div className={styles['filter-bar']}>
        {[
          { key: 'all',      label: `All (${counts.all})` },
          { key: 'perfect',  label: `Perfect Match (${counts.perfect})` },
          { key: 'manual',   label: `Manual (${counts.manual})` },
          { key: 'partial',  label: `Partial Match (${counts.partial})` },
          { key: 'mismatch', label: `Mismatch (${counts.mismatch})` },
          { key: 'flagged',  label: `Flagged (${counts.flagged})` },
        ].map((f) => (
          <button key={f.key} className={cx(styles['filter-btn'], filter === f.key && styles['active'])} onClick={() => handleFilterChange(f.key)}>
            {f.label}
          </button>
        ))}

        {selectedCount > 0 && (
          <div className={styles['selection-actions']}>
            <span className={styles['selection-count']}>{selectedCount} selected</span>
            <button className={cx(styles['btn-action'], styles['btn-action--warn'])} onClick={() => onUnmatch(Array.from(selectedIds))}>
              Un-match
            </button>
            <button className={styles['btn-action-ghost']} onClick={() => onSelectionChange(new Set())}>
              Clear
            </button>
          </div>
        )}
      </div>

      <div className={styles['table-scroll']}>
        <table className={styles['data-table']}>
          <thead>
            <tr>
              <th className={styles['col-select']} />
              <th className={styles['col-expand']} />
              <th>Type</th>
              <th>Name Match</th>
              <th>Score</th>
              <th>Amount Match</th>
              <th>Book Cheque No</th>
              <th>Bank Cheque No</th>
              <th>Book Party</th>
              <th>Bank Party</th>
              <th>Book Amount</th>
              <th>Bank Amount</th>
              <th>Difference</th>
              <th>Flags</th>
              {flaggedOnly && <th>Action</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const record   = row.original;
              const isExpanded = expandedRow === record._id;
              const diff      = record['Difference (Rs)'];
              const hasFlags  = record['Flags'] && record['Flags'].trim().length > 0;
              const chequeNo  = record['Book Chq'] || '-';
              const isLowScore = Number(record['Fuzzy Score %']) < 50;
              const canUnmatch = record['Name Match'] === 'Match' || record['Name Match'] === 'Partial';
              const colSpan   = flaggedOnly ? 15 : 14;

              return (
                <React.Fragment key={record._id}>
                  <tr
                    className={cx(styles['data-row'], isExpanded && styles['row-expanded'], hasFlags && styles['row-flagged'])}
                    onClick={() => setExpandedRow(isExpanded ? null : record._id)}
                  >
                    <td className={styles['col-select']} onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        className={styles['row-select-input']}
                        checked={row.getIsSelected()}
                        onChange={row.getToggleSelectedHandler()}
                        aria-label="Select row"
                      />
                    </td>
                    <td className={styles['col-expand']}>
                      <button className={styles['expand-btn']} tabIndex={-1}>{isExpanded ? '▾' : '▸'}</button>
                    </td>
                    <td className={styles['cell-method']} title={record['Match Method']}>{record['Book Txn'] || '—'}</td>
                    <td>
                      <span className={cx(styles['badge'], styles[nameMatchVariant(record['Name Match'])])}>
                        {record['Name Match']}
                      </span>
                    </td>
                    <td className={styles['cell-score']}>{record['Name Match'] === 'Manual' ? '—' : `${record['Fuzzy Score %']}%`}</td>
                    <td>
                      <span className={cx(styles['badge'], styles[amtMatchVariant(record['Amount Match'])])}>
                        {record['Amount Match'] === 'Exact' ? 'Exact' : (record['Amount Match'] ?? '').substring(0, 18)}
                      </span>
                    </td>
                    <td className={styles['cell-mono']}>{chequeNo}</td>
                    <td className={styles['cell-mono']}>{record['Bank Chq'] || record['Bank RRN'] || '-'}</td>
                    <td className={styles['cell-party']}>{record['Book Party']}</td>
                    <td className={styles['cell-party']}>{record['Bank Party'] || '—'}</td>
                    <td className={styles['cell-amount']}>{fmtAmt(record['Book Amt (Rs)'])}</td>
                    <td className={styles['cell-amount']}>{fmtAmt(record['Bank Amt (Rs)'])}</td>
                    <td className={cx(styles['cell-amount'], Math.abs(diff) < 0.01 ? styles['diff-zero'] : styles['diff-nonzero'])}>
                      {Math.abs(diff) < 0.01 ? '—' : Number(diff).toLocaleString('en-IN', { minimumFractionDigits: 2, signDisplay: 'always' })}
                    </td>
                    <td className={styles['cell-flags']}>
                      {hasFlags ? <span className={styles['flag-tag']}>Review</span> : null}
                    </td>
                    {flaggedOnly && (
                      <td onClick={(e) => e.stopPropagation()}>
                        <button
                          className={styles['btn-action-ghost']}
                          onClick={() => onApprove?.(record._id)}
                          title="Confirm this match and remove its legs from the BRS"
                        >
                          {isLowScore ? 'Match' : 'Approve'}
                        </button>
                      </td>
                    )}
                  </tr>

                  {isExpanded && (
                    <tr className={styles['expanded-row']}>
                      <td colSpan={colSpan}>
                        <div className={styles['expanded-details']}>
                          <div className={styles['detail-panel']}>
                            <div className={styles['detail-panel-title']}>Book Entry</div>
                            {([
                              ['Transaction Type', record['Book Txn']],
                              ['Bill No',          record['Book Bill No'] || '—'],
                              ['Cheque No',        record['Book Chq'] || '—'],
                              ['Party',            record['Book Party']],
                              ['Direction',        record['Book Direction']],
                              ['Sender',           record['Book Sender']],
                              ['Recipient',        record['Book Recipient']],
                              ['Amount',           fmtAmt(record['Book Amt (Rs)'])],
                            ] as [string, string][]).map(([label, value]) => (
                              <div className={styles['detail-row']} key={label}>
                                <span className={styles['detail-label']}>{label}</span>
                                <span className={styles['detail-value']}>{value}</span>
                              </div>
                            ))}
                          </div>

                          <div className={styles['detail-panel']}>
                            <div className={styles['detail-panel-title']}>Bank Entry</div>
                            {([
                              ['Date',                    record['Bank Date']],
                              ['Cheque No / RRN',         record['Bank Chq'] ?? record['Bank RRN'] ?? '—'],
                              ['Description / Payer',     record['Bank Description'] ?? record['Bank Payer'] ?? '—'],
                              ['Party',                   record['Bank Party']],
                              ['Direction',               record['Bank Direction']],
                              ['Sender',                  record['Bank Sender']],
                              ['Recipient',                record['Bank Recipient']],
                              ['Debit',  record['Debit (Rs)']  ? fmtAmt(Number(record['Debit (Rs)']))  : '—'],
                              ['Credit', record['Credit (Rs)'] ? fmtAmt(Number(record['Credit (Rs)'])) : '—'],
                            ] as [string, string][]).map(([label, value]) => (
                              <div className={styles['detail-row']} key={label}>
                                <span className={styles['detail-label']}>{label}</span>
                                <span className={styles['detail-value']}>{value}</span>
                              </div>
                            ))}
                          </div>

                          {hasFlags && (
                            <div className={cx(styles['detail-panel'], styles['detail-panel-flags'])}>
                              <div className={styles['detail-panel-title']}>Review Notes</div>
                              {record['Flags'].split('|').map((flag, i) => (
                                <div key={i} className={styles['flag-note']}>{flag.trim()}</div>
                              ))}
                            </div>
                          )}

                          <div className={styles['detail-panel']}>
                            {(flaggedOnly || isLowScore) && (
                              <button
                                className={cx(styles['btn-action'], styles['btn-action--confirm'])}
                                onClick={(e) => { e.stopPropagation(); onApprove?.(record._id); }}
                              >
                                {isLowScore ? 'Match this row' : 'Approve this row'}
                              </button>
                            )}
                            {canUnmatch && (
                              <button
                                className={cx(styles['btn-action'], styles['btn-action--warn'])}
                                onClick={(e) => { e.stopPropagation(); onUnmatch([record._id]); }}
                              >
                                Un-match this row
                              </button>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className={styles['table-footer']}>
        <span className={styles['table-count']}>
          Showing {table.getState().pagination.pageIndex * PER_PAGE + 1}
          –{Math.min((table.getState().pagination.pageIndex + 1) * PER_PAGE, filtered.length)} of {filtered.length} records
        </span>
        {table.getPageCount() > 1 && (
          <div className={styles['pagination']}>
            <button className={styles['page-btn']} disabled={!table.getCanPreviousPage()} onClick={() => { table.previousPage(); setExpandedRow(null); }}>
              Previous
            </button>
            <span className={styles['page-info']}>Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}</span>
            <button className={styles['page-btn']} disabled={!table.getCanNextPage()} onClick={() => { table.nextPage(); setExpandedRow(null); }}>
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default MatchedTable;
