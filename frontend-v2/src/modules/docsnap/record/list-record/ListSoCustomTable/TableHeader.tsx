import { FC, useEffect } from 'react';
import { useListSoCustomTableApi } from './hooks/useListSoCustomTableApi';
import { useListSoCustomTableState } from './hooks/listSoCustomTableStateContext';

const columns = [
    { label: 'Reference' },
    { label: 'SO Number' },
    { label: 'Status' },
    { label: 'Party Ledger' },
    { label: 'Date' },
    { label: 'Closing Date' },
    { label: 'Balance Qty' },
    { label: 'Remaining Balance' },
];

export const TableHeader: FC = () => {
    const { state, setState } = useListSoCustomTableState();
    const { getSoListApi } = useListSoCustomTableApi();

    useEffect(() => {
        getSoListApi();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const onSelectAllRows = (e: React.ChangeEvent<HTMLInputElement>) => {
        setState(prev => ({
            ...prev,
            selectedRows: e.target.checked ? prev.records.map((item: any) => item.number) : []
        }));
    };

    return (
        <thead>
            <tr>
                <th scope="col" className="sticky top-0 w-12 bg-gray-50 px-5 py-3">
                    <input
                        type="checkbox"
                        className="cursor-pointer rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        checked={Boolean(state.selectedRows.length && state.selectedRows.length === state.records.length)}
                        onChange={onSelectAllRows}
                    />
                </th>
                {columns.map((column, index) => (
                    <th
                        key={index}
                        scope="col"
                        className="sticky top-0 z-1 h-14 bg-gray-50 px-2 py-3 text-left text-xs font-medium tracking-wider text-nowrap text-gray-500 uppercase xl:px-5"
                    >
                        <div className="flex items-center gap-2 md:text-xs lg:text-sm">{column.label}</div>
                    </th>
                ))}
            </tr>
        </thead>
    );
};
