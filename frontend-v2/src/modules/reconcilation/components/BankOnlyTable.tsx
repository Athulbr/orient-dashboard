import React, { useMemo, useState } from 'react';
import {
  useReactTable, getCoreRowModel, getPaginationRowModel,
  type ColumnDef, type RowSelectionState,
} from '@tanstack/react-table';
import styles from '../styles/DataTable.module.css';
import { cx } from '../utils/cx';
import type { BankOnlyRecord } from '../types';

interface BankOnlyTableProps {
  data: BankOnlyRecord[];
  selectedIds: Set<string>;
  onSelectionChange: (ids: Set<string>) => void;
  canConfirmMatch: boolean;
  onConfirmMatchRequest: () => void;
}

// The bank-reconciliation endpoint never attaches an 'Issue' label the way
// the QR/gateway endpoints do, so 'Issue' alone is always undefined for
// that recon type and every carried-forward row used to fall through to
// "Unrecorded". The backend now sets 'Is CF' explicitly on every
// carry-forward row for all three recon types — check both.
const isCarriedForward = (record: BankOnlyRecord): boolean =>
  !!record['Is CF'] || !!record['Issue']?.includes('Carried Forward');

const PER_PAGE = 25;

const BankOnlyTable: React.FC<BankOnlyTableProps> = ({
  data, selectedIds, onSelectionChange, canConfirmMatch, onConfirmMatchRequest,
}) => {
  const [page, setPage] = useState(0);

  const rowSelection: RowSelectionState = useMemo(() => {
    const rs: RowSelectionState = {};
    selectedIds.forEach((id) => { rs[id] = true; });
    return rs;
  }, [selectedIds]);

  const columns = useMemo<ColumnDef<BankOnlyRecord>[]>(() => [
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
        <p>All bank entries have been matched with book records.</p>
      </div>
    );
  }

  const rows = table.getRowModel().rows;
  const fmtAmt = (v: string | number | undefined) => {
    const n = Number(v);
    return isNaN(n) || !v ? '—' : n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  return (
    <div className={styles['table-container']}>
      <div className={cx(styles['notice-bar'], styles['notice-danger'])}>
        <strong>{data.length} transactions</strong> found in the bank statement with no corresponding book entry.
        These must be investigated and recorded immediately.
        {' '}Select one or more rows here, plus one or more rows on Book Only, to Confirm Match.
      </div>

      {selectedIds.size > 0 && (
        <div className={styles['selection-actions']}>
          <span className={styles['selection-count']}>{selectedIds.size} bank row{selectedIds.size > 1 ? 's' : ''} selected</span>
          <button
            className={cx(styles['btn-action'], styles['btn-action--confirm'])}
            disabled={!canConfirmMatch}
            onClick={onConfirmMatchRequest}
            title={canConfirmMatch ? 'Merge with the selected Book Only row(s)' : 'Also select one or more Book Only rows'}
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
              <th>Date</th>
              <th>Cheque No</th>
              <th>Description</th>
              <th>Party</th>
              <th>Direction</th>
              <th>Debit (Rs)</th>
              <th>Credit (Rs)</th>
              <th>Amount (Rs)</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const record = row.original;
              const isCF = isCarriedForward(record);
              const isManual = !!record['Is Manual'];
              const description = record['Description'] ?? record['Bank Statement'] ?? '';
              return (
                <tr
                  key={record._id}
                  className={cx(
                    styles['data-row'],
                    isCF ? styles['row-cf'] : styles['row-unrecorded'],
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
                  <td className={styles['cell-mono']}>{record['Date']}</td>
                  <td className={styles['cell-mono']}>{record['Chq No'] || '—'}</td>
                  <td className={styles['cell-description']}>{description}</td>
                  <td className={styles['cell-party']}>{record['Party']}</td>
                  <td>
                    <span className={cx(styles['dir-badge'], styles[`dir-${record['Direction']?.toLowerCase()}`])}>
                      {record['Direction']}
                    </span>
                  </td>
                  <td className={cx(styles['cell-amount'], styles['cell-debit'])}>{fmtAmt(record['Debit (Rs)'])}</td>
                  <td className={cx(styles['cell-amount'], styles['cell-credit'])}>{fmtAmt(record['Credit (Rs)'])}</td>
                  <td className={cx(styles['cell-amount'], styles['cell-amount-bold'])}>{fmtAmt(record['Bank Amt (Rs)'])}</td>
                  <td>
                    {isManual
                      ? <span className={cx(styles['badge'], styles['badge-info'])}>Un-matched by user</span>
                      : isCF
                      ? <span className={cx(styles['badge'], styles['badge-info'])}>Carried Forward</span>
                      : <span className={cx(styles['badge'], styles['badge-danger'])}>Unrecorded</span>}
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

export default BankOnlyTable;
