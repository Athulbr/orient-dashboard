import type { ColumnDef, Row, Table } from '@tanstack/react-table';
import styles from '../styles/DataTable.module.css';

/**
 * A checkbox (or radio, for single-select tables) column for TanStack Table
 * row selection. Used by MatchedTable / BookOnlyTable / BankOnlyTable so the
 * un-match and confirm-match actions can read `table.getSelectedRowModel()`.
 */
export function makeSelectColumn<T>(opts: { multi?: boolean } = {}): ColumnDef<T> {
  const multi = opts.multi ?? true;
  return {
    id: 'select',
    header: multi
      ? ({ table }: { table: Table<T> }) => (
          <input
            type="checkbox"
            className={styles['row-select-input']}
            checked={table.getIsAllRowsSelected()}
            ref={(el) => {
              if (el) el.indeterminate = table.getIsSomeRowsSelected() && !table.getIsAllRowsSelected();
            }}
            onChange={table.getToggleAllRowsSelectedHandler()}
            onClick={(e) => e.stopPropagation()}
            aria-label="Select all rows"
          />
        )
      : undefined,
    cell: ({ row }: { row: Row<T> }) => (
      <input
        type={multi ? 'checkbox' : 'radio'}
        className={styles['row-select-input']}
        checked={row.getIsSelected()}
        onChange={row.getToggleSelectedHandler()}
        onClick={(e) => e.stopPropagation()}
        aria-label="Select row"
      />
    ),
    size: 36,
    enableSorting: false,
  };
}
