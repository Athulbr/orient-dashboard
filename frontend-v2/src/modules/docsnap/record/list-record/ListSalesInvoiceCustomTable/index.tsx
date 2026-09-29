import { useState, useMemo } from 'react';
import { TableHeader } from './TableHeader';
import { TableBody } from './TableBody';
import TableToolbar from './TableToolbar';
import { ListSalesInvoiceCustomTableStateProvider, useListSalesInvoiceCustomTableState } from './hooks/listSalesInvoiceCustomTableStateContext';
import { buildInitialTableState } from '../../../../../hooks/useTablepersistance';
import { CreateSalesVoucherPayload } from './hooks/useListSalesInvoiceCustomTableApi';
import { CreateSalesInvoiceDialog, emptySalesInvoiceForm } from './components/CreateSalesInvoiceDialog';
import { SalesInvoiceDetailDialog } from './components/SalesInvoiceDetailDialog';

export interface ListSalesInvoiceCustomTableStateIF {
    records: Record<string, any>[];
    loadingRecords: boolean;
    pageSize: number;
    page: number;
    totalRecords: number;
    failedToFetch: boolean;
    selectedRows: string[];
    selectedRecord: Record<string, any> | null;
    showCreateDialog: boolean;
    createLoading: boolean;
    taxMode: 'igst' | 'cgst_sgst';
    createForm: CreateSalesVoucherPayload;
    partyLedgers: string[];
    loadingPartyLedgers: boolean;
    salesLedgers: string[];
    loadingSalesLedgers: boolean;
    taxLedgers: string[];
    loadingTaxLedgers: boolean;
    stockItems: string[];
    loadingStockItems: boolean;
    units: string[];
    loadingUnits: boolean;
}

export const ListSalesInvoiceCustomTable: React.FC = () => {
    const initialState = useMemo<ListSalesInvoiceCustomTableStateIF>(
        () => ({
            records: [],
            loadingRecords: false,
            pageSize: 10,
            page: 1,
            totalRecords: 0,
            failedToFetch: false,
            selectedRows: [],
            selectedRecord: null,
            showCreateDialog: false,
            createLoading: false,
            taxMode: 'igst',
            createForm: emptySalesInvoiceForm(),
            partyLedgers: [],
            loadingPartyLedgers: false,
            salesLedgers: [],
            loadingSalesLedgers: false,
            taxLedgers: [],
            loadingTaxLedgers: false,
            stockItems: [],
            loadingStockItems: false,
            units: [],
            loadingUnits: false
        }),
        []
    );

    const mergedInitialState = useMemo<ListSalesInvoiceCustomTableStateIF>(
        () => ({ ...initialState, ...buildInitialTableState(initialState) }),
        [initialState]
    );
    const [state, setState] = useState<ListSalesInvoiceCustomTableStateIF>(mergedInitialState);

    return (
        <ListSalesInvoiceCustomTableStateProvider value={{ state, setState }}>
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
            </div>
            <CreateSalesInvoiceDialog />
            <SalesInvoiceDetailDialog />
        </ListSalesInvoiceCustomTableStateProvider>
    );
};

const TableLineLoader: React.FC = () => {
    const { state } = useListSalesInvoiceCustomTableState();
    if (!state.loadingRecords) return null;
    return (
        <div className="w-full overflow-hidden">
            <div className="relative h-[1.5px] bg-gray-200">
                <div className="absolute left-0 top-0 h-full w-1/2 bg-green-500 animate-table-line-loader" />
            </div>
        </div>
    );
};
