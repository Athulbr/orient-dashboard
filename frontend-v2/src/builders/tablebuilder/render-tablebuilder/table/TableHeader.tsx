import { ChevronDown, ChevronUp, ChevronsUpDown } from 'lucide-react';
import { useTablebuilderState } from '../hooks/useTablebuilderStateContext';
import { usePermissionStore } from '../../../../zustand-store/PermissionStore';

export function TableHeader() {
    const { settings, state, setState } = useTablebuilderState();
    const { rowSelection, columns } = settings;
    const { selectedIds, data, sorts } = state;
    const { injectedData } = useTablebuilderState();
    const { checkPermission } = usePermissionStore();
    const { onRowSelect, hiddenColumns, deletePermission, updatePermission } = injectedData;

    const selectable = rowSelection.showRowSelection;

    const getSortIcon = (columnKey: string) => {
        const sort = sorts.find(s => s.column === columnKey);
        if (!sort) return <ChevronsUpDown className="h-4 w-4" />;
        return sort.direction === 'asc' ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />;
    };

    const onSelectAllRow = (e: any) => {
        if (onRowSelect) {
            onRowSelect(e.target.checked ? data.map(d => d._id) : []);
        }
        setState({ ...state, selectedIds: e.target.checked ? data.map(d => d._id) : [] });
    };

    return (
        <thead>
            <tr>
                {selectable && (
                    <th scope="col" className="sticky top-0 w-12 bg-gray-50 px-5 py-3">
                        <input
                            type="checkbox"
                            className="cursor-pointer rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            checked={Boolean(selectedIds.length && selectedIds.length === data.length)}
                            onChange={e => onSelectAllRow(e)}
                        />
                    </th>
                )}
                {columns.map((column, index) => {
                    if (column.hidden) return null;
                    if (hiddenColumns?.includes(column.key)) return null;
                    if (column.header === 'Actions' && !checkPermission(deletePermission) && !checkPermission(updatePermission)) return null;

                    return (
                        <th
                            key={index + 5}
                            scope="col"
                            className={`sticky top-0 z-1 h-14 bg-gray-50 px-2 py-3 text-left text-xs font-medium tracking-wider text-nowrap text-gray-500 uppercase xl:px-5 ${
                                column.sortable ? 'cursor-pointer select-none' : ''
                            }`}
                            // onClick={column.sortable ? e => handleSort(column.key, e.shiftKey) : undefined} todo
                        >
                            <div className="flex items-center gap-2 md:text-xs lg:text-sm">
                                {column.header}
                                {column.sortable && getSortIcon(column.key as string)}
                            </div>
                        </th>
                    );
                })}
            </tr>
        </thead>
    );
}
