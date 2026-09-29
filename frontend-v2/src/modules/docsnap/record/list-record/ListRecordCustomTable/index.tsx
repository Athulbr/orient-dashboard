import { TableBody } from './TableBody';
import { TableHeader } from './TableHeader';
import { useState, useEffect, useMemo } from 'react';
import useTablepersistance, { buildInitialTableState } from '../../../../../hooks/useTablepersistance';
import TableFooter from './TableFooter';
import TableToolbar from './TableToolbar';
import { ListRecordCustomTableStateProvider, useListRecordCustomTableState } from './hooks/listRecordCustomTableStateContext';
import { usePermissionStore } from '../../../../../zustand-store/PermissionStore';
import { useSearchParams } from 'react-router-dom';

interface ListRecordCustomTableIF {
    test?: string;
}

export interface ListRecordCustomTableStateIF {
    records: Record<string, any>[];
    loadingRecords: boolean;
    pageSize: number;
    page: number;
    totalRecords: number;
    failedToFetch: boolean;
    selectedStatuses: string[];
    selectedTemplates: string[];
    selectedValidator: string;
    searchText: string;
    startDate: string;
    endDate: string;
    selectedRows: string[];
}

export const ListRecordCustomTable: React.FC<ListRecordCustomTableIF> = () => {
    const [searchParams] = useSearchParams();
    const statusParam = searchParams.get('status');

    const initialState = useMemo(
        () => ({
            records: [],
            loadingRecords: false,
            pageSize: 10,
            page: 1,
            totalRecords: 0,
            failedToFetch: false,
            selectedStatuses: statusParam ? statusParam.split(',') : [],
            selectedTemplates: [],
            selectedValidator: '',
            searchText: '',
            startDate: '',
            endDate: '',
            selectedRows: []
        }),
        []
    );

    const mergedInitialState = useMemo(() => buildInitialTableState(initialState), [initialState]);
    const [state, setState] = useState<ListRecordCustomTableStateIF>(mergedInitialState);

    return (
        <ListRecordCustomTableStateProvider value={{ state, setState }}>
            <div className={`bg-background dark:bg-background-dark flex min-w-[770px] flex-1 flex-col overflow-y-auto`} data-tour-id="record-list-table">
                <TableToolbar />
                <div className="h-full overflow-y-auto rounded-lg border">
                    <TableLineLoader />
                    <table className="min-w-full table-fixed">
                        <TableHeader />
                        <TableBody />
                    </table>

                    {state.failedToFetch ? (
                        <div className="flex h-full items-center justify-center text-sm text-gray-400 relative bottom-15">😖&nbsp;Failed to fetch the data</div>
                    ) : !state.loadingRecords && state.records.length === 0 ? (
                        <div className="flex h-full items-center justify-center text-sm text-gray-400 relative bottom-15">🤗 &nbsp;No Data Found</div>
                    ) : null}
                </div>
                <TableFooter />
            </div>
        </ListRecordCustomTableStateProvider>
    );
};

interface TableLineLoaderIF {
    test?: string;
}

const TableLineLoader: React.FC<TableLineLoaderIF> = () => {
    const { state } = useListRecordCustomTableState();

    if (!state.loadingRecords) return null;

    return (
        <div className="w-full overflow-hidden">
            <div className="relative h-[1.5px] bg-gray-200">
                <div className="absolute left-0 top-0 h-full w-1/2 bg-green-500 animate-table-line-loader" />
            </div>
        </div>
    );
};
