import { FC, useMemo, useCallback, useEffect } from 'react';
import { useListRecordCustomTableApi } from './hooks/useListRecordCustomTableApi';
import { useListRecordCustomTableState } from './hooks/listRecordCustomTableStateContext';
import { useExtractionStore } from '../../../../../zustand-store/extractionStore';
import { usePermissionStore } from '../../../../../zustand-store/PermissionStore';
import { useRecordViewTour } from '../../../../inApp-Tour/hooks/useRecordViewTour';

interface TableHeaderIF {}

export const TableHeader: FC<TableHeaderIF> = () => {
    const { refreshRecord } = useExtractionStore();
    const { state, setState } = useListRecordCustomTableState();
    const { getRecordsApi } = useListRecordCustomTableApi();
    const { user, checkPermission } = usePermissionStore();

    // Get tour function
    const startRecordViewTour = useRecordViewTour();

    const enablePolink = String(user?.tenant?.name).toLowerCase() == 'rehabmart' || sessionStorage.getItem('selectedTenantName')?.toLowerCase() == 'rehabmart';
    const enableBlogLink = sessionStorage.getItem('module')?.toLowerCase() == 'content-creation';

    const columns = useMemo(
        () => [
            { label: 'Name', visible: true },
            { label: 'Document Number', visible: true },
            { label: 'Status', visible: true },
            {
                label: 'Polink',
                visible: enableBlogLink ? false : enablePolink
            },
            {
                label: 'Blog Link',
                visible: enableBlogLink
            },
            { label: 'Extracted By', visible: true },
            { label: 'Processed Date', visible: true },
            { label: 'Confidence', visible: true },
            { label: 'Actions', visible: checkPermission('delete:record') || checkPermission('update:record') }
        ],
        []
    );

    const { selectedStatuses, selectedTemplates, selectedValidator, searchText, startDate, endDate, pageSize, page } = state;

    const selectedStatusesStr = selectedStatuses.join(',');
    const selectedTemplatesStr = selectedTemplates.join(',');

    useEffect(() => {
        getRecordsApi().then(() => {
            // console.log('✅ API call completed - Records fetched successfully');
            startRecordViewTour();
        });
    }, [refreshRecord, selectedStatusesStr, selectedTemplatesStr, selectedValidator, searchText, startDate, endDate, pageSize, page]);

    const onSelectAllRows = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            setState(prev => ({ ...prev, selectedRows: e.target.checked ? prev.records.map((item: any) => item._id) : [] }));
        },
        [setState]
    );
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
                {columns.map((column: any, index: number) => {
                    if (!column.visible) return null;
                    return (
                        <th key={index} scope="col" className={`sticky top-0 z-1 h-14 bg-gray-50 px-2 py-3 text-left text-xs font-medium tracking-wider text-nowrap text-gray-500 uppercase xl:px-5`}>
                            <div className="flex items-center gap-2 md:text-xs lg:text-sm">{column.label}</div>
                        </th>
                    );
                })}
            </tr>
        </thead>
    );
};
