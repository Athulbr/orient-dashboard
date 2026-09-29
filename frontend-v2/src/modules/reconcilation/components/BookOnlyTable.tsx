import React, { useMemo, useState } from 'react';
import {
  useReactTable, getCoreRowModel, getPaginationRowModel,
  type ColumnDef, type RowSelectionState,
} from '@tanstack/react-table';
import styles from '../styles/DataTable.module.css';
import { cx } from '../utils/cx';
import type { BookOnlyRecord } from '../types';

interface BookOnlyTableProps {
  data: BookOnlyRecord[];
  selectedIds: Set<string>;
  onSelectionChange: (ids: Set<string>) => void;
  canConfirmMatch: boolean;
  onConfirmMatchRequest: () => void;
}

// The bank-reconciliation endpoint (/reconcile/reconcile-bank) does not attach an
// 'Issue' label the way the QR/gateway endpoints do — for that recon type
// carried-forward rows only carry the backend's 'Is CF' flag (and, for most
// but not all carry-forward paths, a '[CF from prev BRS]' marker inside the
// Narration text). Check all three signals rather than relying on 'Issue'
// alone, so bank-type results correctly show "Carried Forward" instead of
// always falling through to "Pending Clearance".
const isCarriedForward = (record: BookOnlyRecord): boolean =>
  !!record['Is CF'] ||
  !!record['Issue']?.includes('Carried Forward') ||
  !!record['Narration']?.includes('[CF from prev BRS]');

const PER_PAGE = 25;

const BookOnlyTable: React.FC<BookOnlyTableProps> = ({
  data, selectedIds, onSelectionChange, canConfirmMatch, onConfirmMatchRequest,
}) => {
  const [page, setPage] = useState(0);

  const rowSelection: RowSelectionState = useMemo(() => {
    const rs: RowSelectionState = {};
    selectedIds.forEach((id) => { rs[id] = true; });
    return rs;
  }, [selectedIds]);

  const columns = useMemo<ColumnDef<BookOnlyRecord>[]>(() => [
    { id: 'select', accessorKey: '_id' },
  ], []);

  const table = useReactTable({
    data,
    columns,
    state: { rowSelection, pagination: { pageIndex: page, pageSize: PER_PAGE } },
    getRowId: (r) => r._id,
    enableRowSelection: true,
    onRowSelectionChange: (updater) => {
      const next = typeof updater === 'function' ? updater(rowSelection) : updater;
      onSelectionChange(new Set(Object.keys(next).filter((k) => next[k])));
    },
    onPaginationChange: (updater) => {
      const current = { pageIndex: page, pageSize: PER_PAGE };
      const next = typeof updater === 'function' ? updater(current) : updater;
      setPage(next.pageIndex);
    },
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  if (!data || data.length === 0) {
    return (
      <div className={cx(styles['table-empty'], styles['table-empty-success'])}>
        <p>All book entries have been matched with the bank statement.</p>
      </div>
    );
  }

  const rows = table.getRowModel().rows;
  const fmtAmt = (v: number) =>
    Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className={styles['table-container']}>
      <div className={cx(styles['notice-bar'], styles['notice-warning'])}>
        {data.length} entries recorded in the book but not found in the bank statement.
        These are typically cheques not yet cleared or timing differences.
        {' '}Select one or more rows here, plus one or more rows on Bank Only, to Confirm Match.
      </div>

      {selectedIds.size > 0 && (
        <div className={styles['selection-actions']}>
          <span className={styles['selection-count']}>{selectedIds.size} book row{selectedIds.size > 1 ? 's' : ''} selected</span>
          <button
            className={cx(styles['btn-action'], styles['btn-action--confirm'])}
            disabled={!canConfirmMatch}
            onClick={onConfirmMatchRequest}
            title={canConfirmMatch ? 'Merge with the selected Bank Only row(s)' : 'Also select one or more Bank Only rows'}
          >
            Confirm Match
          </button>
          <button className={styles['btn-action-ghost']} onClick={() => onSelectionChange(new Set())}>Clear</button>
        </div>
      )}

      <div className={styles['table-scroll']}>
        <table className={styles['data-table']}>
          <thead>
            <tr>
              <th className={styles['col-select']} />
              <th>Type</th>
              <th>Bill No</th>
              <th>Cheque No</th>
              <th>Party</th>
              <th>Direction</th>
              <th>Amount (Rs)</th>
              <th>Narration</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const record = row.original;
              const isCF = isCarriedForward(record);
              const isManual = !!record['Is Manual'];
              return (
                <tr
                  key={record._id}
                  className={cx(
                    styles['data-row'],
                    isCF ? styles['row-cf'] : styles['row-pending'],
                    row.getIsSelected() && styles['row-selected'],
                  )}
                  onClick={row.getToggleSelectedHandler()}
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
                  <td>{record['Txn Type'] || '—'}</td>
                  <td className={styles['cell-mono']}>{record['Bill No'] || '—'}</td>
                  <td className={styles['cell-mono']}>{record['Chq No'] || '—'}</td>
                  <td className={styles['cell-party']}>{record['Party']}</td>
                  <td>
                    <span className={cx(styles['dir-badge'], styles[`dir-${record['Direction']?.toLowerCase()}`])}>
                      {record['Direction']}
                    </span>
                  </td>
                  <td className={styles['cell-amount']}>{fmtAmt(record['Book Amt (Rs)'])}</td>
                  <td className={styles['cell-narration']}>{record['Narration'] || '—'}</td>
                  <td>
                    {isManual
                      ? <span className={cx(styles['badge'], styles['badge-info'])}>Un-matched by user</span>
                      : isCF
                      ? <span className={cx(styles['badge'], styles['badge-info'])}>Carried Forward</span>
                      : <span className={cx(styles['badge'], styles['badge-warning'])}>Pending Clearance</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className={styles['table-footer']}>
        <span className={styles['table-count']}>
          Showing {page * PER_PAGE + 1}–{Math.min((page + 1) * PER_PAGE, data.length)} of {data.length} records
        </span>
        {table.getPageCount() > 1 && (
          <div className={styles['pagination']}>
            <button className={styles['page-btn']} disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()}>Previous</button>
            <span className={styles['page-info']}>Page {page + 1} of {table.getPageCount()}</span>
            <button className={styles['page-btn']} disabled={!table.getCanNextPage()} onClick={() => table.nextPage()}>Next</button>
          </div>
        )}
      </div>
    </div>
  );
};

export default BookOnlyTable;
