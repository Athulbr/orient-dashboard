import { useState, useMemo } from 'react';
import { TableHeader } from './TableHeader';
import { TableBody } from './TableBody';
import TableToolbar from './TableToolbar';
import { ListPoCustomTableStateProvider, useListPoCustomTableState } from './hooks/listPoCustomTableStateContext';
import { buildInitialTableState } from '../../../../../hooks/useTablepersistance';
import { CreatePoPayload } from './hooks/useListPoCustomTableApi';
import { CreatePoDialog, emptyPoForm } from './components/CreatePoDialog';
import { PoDetailDialog } from './components/PoDetailDialog';

export interface ListPoCustomTableStateIF {
    records: Record<string, any>[];
    loadingRecords: boolean;
    pageSize: number;
    page: number;
    totalRecords: number;
    failedToFetch: boolean;
    searchText: string;
    startDate: string;
    endDate: string;
    selectedRows: string[];
    selectedRecord: Record<string, any> | null;
    showCreatePoDialog: boolean;
    createPoLoading: boolean;
    createPoForm: CreatePoPayload;
    partyLedgers: string[];
    loadingPartyLedgers: boolean;
    purchaseLedgers: string[];
    loadingPurchaseLedgers: boolean;
    stockItems: string[];
    loadingStockItems: boolean;
    units: string[];
    loadingUnits: boolean;
}

export const ListPoCustomTable: React.FC = () => {
    const initialState = useMemo<ListPoCustomTableStateIF>(
        () => ({
            records: [],
            loadingRecords: false,
            pageSize: 10,
            page: 1,
            totalRecords: 0,
            failedToFetch: false,
            searchText: '',
            startDate: '',
            endDate: '',
            selectedRows: [],
            selectedRecord: null,
            showCreatePoDialog: false,
            createPoLoading: false,
            createPoForm: emptyPoForm(),
            partyLedgers: [],
            loadingPartyLedgers: false,
            purchaseLedgers: [],
            loadingPurchaseLedgers: false,
            stockItems: [],
            loadingStockItems: false,
            units: [],
            loadingUnits: false
        }),
        []
    );

    const mergedInitialState = useMemo<ListPoCustomTableStateIF>(() => ({ ...initialState, ...buildInitialTableState(initialState) }), [initialState]);
    const [state, setState] = useState<ListPoCustomTableStateIF>(mergedInitialState);

    return (
        <ListPoCustomTableStateProvider value={{ state, setState }}>
            <div className="bg-background dark:bg-background-dark flex min-w-[770px] flex-1 flex-col overflow-y-auto">
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
                        <div className="flex h-full items-center justify-center text-sm text-gray-400 relative bottom-15">🤗&nbsp;No Data Found</div>
                    ) : null}
                </div>
                {/* <TableFooter /> */}
            </div>
            <CreatePoDialog />
            <PoDetailDialog />
        </ListPoCustomTableStateProvider>
    );
};

const TableLineLoader: React.FC = () => {
    const { state } = useListPoCustomTableState();
    if (!state.loadingRecords) return null;
    return (
        <div className="w-full overflow-hidden">
            <div className="relative h-[1.5px] bg-gray-200">
                <div className="absolute left-0 top-0 h-full w-1/2 bg-green-500 animate-table-line-loader" />
            </div>
        </div>
    );
};
