import { formatDate } from '../../../../../builders/tablebuilder/render-tablebuilder/utils/formatDate';
import { cn } from '../../../../../global-utils/twMerge';
import { usePermissionStore } from '../../../../../zustand-store/PermissionStore';
import { RecordStatusCustomUI } from '../components/RecordStatusCustomUI';
import { Polink } from '../ListRecordComponent';
import { ActionButtons } from './components/ActionButtons';
import { useListRecordCustomTableState } from './hooks/listRecordCustomTableStateContext';
import { useNavigate } from 'react-router-dom';
import { useMemo, useCallback, memo } from 'react';

export const TableBody: React.FC = memo(() => {
    const navigate = useNavigate();
    const { state, setState } = useListRecordCustomTableState();
    const { checkPermission, user } = usePermissionStore();

    const rowStyle = 'w-fit max-w-[300px] min-w-[80px] truncate text-xs whitespace-nowrap text-gray-800 lg:text-sm';

    const showPolink = useMemo(
        () => String(user?.tenant?.name).toLowerCase() == 'rehabmart' || sessionStorage.getItem('selectedTenantName')?.toLowerCase() == 'rehabmart',
        [user?.tenant?.name]
    );

    const showBlogLink = useMemo(() => sessionStorage.getItem('module')?.toLowerCase() == 'content-creation', []);

    const handleRowSelect = useCallback(
        (row: any) => {
            setState(prev => {
                const isSelected = prev.selectedRows.includes(row._id);
                return {
                    ...prev,
                    selectedRows: isSelected ? prev.selectedRows.filter((id: string) => id !== row._id) : [...prev.selectedRows, row._id]
                };
            });
        },
        [setState]
    );

    const rowClickHandler = useCallback(
        (row: any, data: any) => {
            const url = window.location.href;
            const module = sessionStorage.getItem('module');
            if (module === 'document-generation') {
                navigate(`/document-generation/view/${row._id}`, { state: { from: url } });
                return;
            }
            if (module === 'content-creation') {
                navigate(`/content-creation/view/${row._id}`, { state: { from: url } });
                return;
            }
            navigate(`/docsnap/record/view/${row._id}`, { state: { from: url } });
            window?.sessionStorage?.setItem('recordIdList', JSON.stringify(data.map((item: any) => item._id)));
        },
        [navigate]
    );

    // Find the first extracted record index
    const firstExtractedIndex = useMemo(() => {
        return state.records?.findIndex((record: any) => record.status === 'extracted');
    }, [state.records]);

    return (
        <tbody className="divide-y divide-gray-200 border-b-[1px] border-b-gray-200">
            {state.records?.map((row: any, idx: number) => {
                const isFirstExtracted = idx === firstExtractedIndex && row.status === 'extracted';
                return (
                    <tr key={row._id} onClick={() => rowClickHandler(row, state.records)}>
                        <td className="px-5 py-4 whitespace-nowrap">
                            <input
                                type="checkbox"
                                checked={state.selectedRows.includes(row._id)}
                                onChange={() => handleRowSelect(row)}
                                onClick={e => e.stopPropagation()}
                                className="cursor-pointer rounded border-gray-300 p-0 text-blue-600 focus:ring-blue-500"
                            />
                        </td>

                        <td className="px-2 py-4 xl:px-5">
                            <div className={cn(rowStyle)}>{row.name}</div>
                        </td>
                        <td className="px-2 py-4 xl:px-5">
                            <div className={cn(rowStyle)}>{row.documentNumber || 'N/A'}</div>
                        </td>
                        <td className="px-2 py-4 xl:px-5">
                            <div className={cn(rowStyle)}>
                                <RecordStatusCustomUI data={row} isFirstExtracted={isFirstExtracted} />
                            </div>
                        </td>
                        {(showPolink || showBlogLink) && (
                            <td className="px-2 py-4 xl:px-5">
                                <Polink data={row} />
                            </td>
                        )}
                        <td className="px-2 py-4 xl:px-5">
                            <div className={cn(rowStyle)}>{row.extractedBy || 'N/A'}</div>
                        </td>
                        <td className="px-2 py-4 xl:px-5">
                            <div className={cn(rowStyle)}>{formatDate(row.updatedAt)}</div>
                        </td>
                        <td className="px-2 py-4 xl:px-5">
                            <div className={cn(rowStyle)}>{row.documentconfidence ? `${row.documentconfidence}%` : 'N/A'}</div>
                        </td>
                        <td className="px-2 py-4 xl:px-5 flex items-center justify-center">
                            <ActionButtons row={row} />
                        </td>
                    </tr>
                );
            })}
        </tbody>
    );
});
