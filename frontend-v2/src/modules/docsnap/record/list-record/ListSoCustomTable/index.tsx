import { useState, useMemo } from 'react';
import { TableHeader } from './TableHeader';
import { TableBody } from './TableBody';
import { ListSoCustomTableStateProvider, useListSoCustomTableState } from './hooks/listSoCustomTableStateContext';
import { buildInitialTableState } from '../../../../../hooks/useTablepersistance';
import { SoDetailDialog } from './components/SoDetailDialog';

export interface ListSoCustomTableStateIF {
    records: Record<string, any>[];
    loadingRecords: boolean;
    pageSize: number;
    page: number;
    totalRecords: number;
    failedToFetch: boolean;
    selectedRows: string[];
    selectedRecord: Record<string, any> | null;
}

export const ListSoCustomTable: React.FC = () => {
    const initialState = useMemo<ListSoCustomTableStateIF>(
        () => ({
            records: [],
            loadingRecords: false,
            pageSize: 10,
            page: 1,
            totalRecords: 0,
            failedToFetch: false,
            selectedRows: [],
            selectedRecord: null,
        }),
        []
    );

    const mergedInitialState = useMemo<ListSoCustomTableStateIF>(
        () => ({ ...initialState, ...buildInitialTableState(initialState) }),
        [initialState]
    );
    const [state, setState] = useState<ListSoCustomTableStateIF>(mergedInitialState);

    return (
        <ListSoCustomTableStateProvider value={{ state, setState }}>
            <div className="bg-background dark:bg-background-dark flex min-w-[770px] flex-1 flex-col overflow-y-auto">
                <div className="h-full overflow-y-auto rounded-lg border">
                    <TableLineLoader />
                    <table className="min-w-full table-fixed">
                        <TableHeader />
                        <TableBody />
                    </table>
                    {state.failedToFetch ? (
                        <div className="flex h-full items-center justify-center text-sm text-gray-400 relative bottom-15">😖&nbsp;Failed to fetch the data</div>
                    ) : !state.loadingRecords && state.records.length === 0 ? (
                        <div className="flex h-full items-center justify-center text-sm text-gray-400 relative bottom-15">🤗&nbsp;No Data Found</div>
                    ) : null}
                </div>
            </div>
            <SoDetailDialog />
        </ListSoCustomTableStateProvider>
    );
};

const TableLineLoader: React.FC = () => {
    const { state } = useListSoCustomTableState();
    if (!state.loadingRecords) return null;
    return (
        <div className="w-full overflow-hidden">
            <div className="relative h-[1.5px] bg-gray-200">
                <div className="absolute left-0 top-0 h-full w-1/2 bg-green-500 animate-table-line-loader" />
            </div>
        </div>
    );
};
