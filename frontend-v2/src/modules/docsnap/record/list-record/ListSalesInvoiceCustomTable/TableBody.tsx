import { memo, useCallback } from 'react';
import { cn } from '../../../../../global-utils/twMerge';
import { StatusBadge } from '../ListPoCustomTable/components/StatusBadge';
import { useListSalesInvoiceCustomTableState } from './hooks/listSalesInvoiceCustomTableStateContext';

const formatTallyDate = (raw: string) => {
    if (!raw || raw.length !== 8) return raw || 'N/A';
    return `${raw.slice(6, 8)}-${raw.slice(4, 6)}-${raw.slice(0, 4)}`;
};

const formatCurrency = (value: number) =>
    value != null ? `₹${value.toLocaleString('en-IN')}` : 'N/A';

export const TableBody: React.FC = memo(() => {
    const { state, setState } = useListSalesInvoiceCustomTableState();

    const rowStyle = 'w-fit max-w-[220px] min-w-[80px] truncate text-xs whitespace-nowrap text-gray-800 lg:text-sm';

    const handleRowSelect = useCallback(
        (row: any) => {
            setState(prev => {
                const isSelected = prev.selectedRows.includes(row.number);
                return {
                    ...prev,
                    selectedRows: isSelected
                        ? prev.selectedRows.filter((id: string) => id !== row.number)
                        : [...prev.selectedRows, row.number]
                };
            });
        },
        [setState]
    );

    return (
        <tbody className="divide-y divide-gray-200 border-b border-b-gray-200">
            {state.records?.map((row: any) => (
                <tr
                    key={row.number}
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => setState(prev => ({ ...prev, selectedRecord: row }))}
                >
                    <td className="px-5 py-4 whitespace-nowrap" onClick={e => e.stopPropagation()}>
                        <input
                            type="checkbox"
                            checked={state.selectedRows.includes(row.number)}
                            onChange={() => handleRowSelect(row)}
                            className="cursor-pointer rounded border-gray-300 p-0 text-blue-600 focus:ring-blue-500"
                        />
                    </td>
                    <td className="px-2 py-4 xl:px-5">
                        <div className={cn(rowStyle)}>{row.reference || 'N/A'}</div>
                    </td>
                    <td className="px-2 py-4 xl:px-5">
                        <div className={cn(rowStyle)}>{row.number || 'N/A'}</div>
                    </td>
                    <td className="px-2 py-4 xl:px-5">
                        <div className={cn(rowStyle)}>
                            <StatusBadge status={row.status} />
                        </div>
                    </td>
                    <td className="px-2 py-4 xl:px-5">
                        <div className={cn(rowStyle)} title={row.partyLedgerName}>{row.partyLedgerName || 'N/A'}</div>
                    </td>
                    <td className="px-2 py-4 xl:px-5">
                        <div className={cn(rowStyle)}>{formatTallyDate(row.date)}</div>
                    </td>
                    <td className="px-2 py-4 xl:px-5">
                        <div className={cn(rowStyle)}>{formatTallyDate(row.closingDate)}</div>
                    </td>
                    <td className="px-2 py-4 xl:px-5">
                        <div className={cn(rowStyle)}>{row.balanceQuantity ?? 'N/A'}</div>
                    </td>
                    <td className="px-2 py-4 xl:px-5">
                        <div className={cn(rowStyle)}>{formatCurrency(row.remainingBalance)}</div>
                    </td>
                </tr>
            ))}
        </tbody>
    );
});
