import { useToastStore } from '../../../../../../components/toast/ToastStore';
import httpRequest from '../../../../../../global-utils/httpRequest';
import { useListSalesInvoiceCustomTableState } from './listSalesInvoiceCustomTableStateContext';
import { config } from '../../../../../../config/default';

export const useListSalesInvoiceCustomTableApi = () => {
    const toast = useToastStore();
    const { setState } = useListSalesInvoiceCustomTableState();

    const getSalesInvoiceListApi = async () => {
        try {
            setState(prev => ({ ...prev, loadingRecords: true, failedToFetch: false }));
            const res: any = await httpRequest('POST', `${config.nodeApiUrl}/idp/tally/listAllSalesInvoices`, {});
            const vouchers = res?.data?.vouchers ?? [];
            setState(prev => ({ ...prev, loadingRecords: false, records: vouchers, totalRecords: vouchers.length }));
            return true;
        } catch (error) {
            setState(prev => ({ ...prev, loadingRecords: false, failedToFetch: true }));
            toast.error('Failed to fetch sales invoices');
            return null;
        }
    };

    const listAllLedgersApi = async () => {
        try {
            const response = await httpRequest('POST', `${config.nodeApiUrl}/idp/tally/listAllLedgers`, {});
            return response;
        } catch (error) {
            console.error('error:===========', error);
            toast.error('Failed to fetch ledgers');
            return null;
        }
    };

    const listSalesAccountLedgersApi = async () => {
        try {
            const response = await httpRequest('POST', `${config.nodeApiUrl}/idp/tally/listPurchaseAccountLedgers`, {});
            return response;
        } catch (error) {
            console.error('error:===========', error);
            toast.error('Failed to fetch sales ledgers');
            return null;
        }
    };

    const listAllStockItemsApi = async () => {
        try {
            const response = await httpRequest('POST', `${config.nodeApiUrl}/idp/tally/listAllStockItems`, {});
            return response;
        } catch (error) {
            console.error('error:===========', error);
            toast.error('Failed to fetch stock items');
            return null;
        }
    };

    const listAllUnitsApi = async () => {
        try {
            const response = await httpRequest('POST', `${config.nodeApiUrl}/idp/tally/listAllUnits`, {});
            return response;
        } catch (error) {
            console.error('error:===========', error);
            toast.error('Failed to fetch units');
            return null;
        }
    };

    return { getSalesInvoiceListApi, listAllLedgersApi, listSalesAccountLedgersApi, listAllStockItemsApi, listAllUnitsApi };
};

export interface CreateSalesVoucherPayload {
    partyLedgerName: string;
    invoiceNumber: string;
    invoiceDate: string;
    igstLedgerName?: string;
    igstAmount?: number;
    cgstLedgerName?: string;
    cgstAmount?: number;
    sgstLedgerName?: string;
    sgstAmount?: number;
    items: {
        stockItemName: string;
        quantity: number;
        unit: string;
        rate: number;
        amount: number;
        salesLedgerName: string;
        soNumber: string;
        soDueDate: string;
    }[];
}

export const useCreateSalesVoucherApi = () => {
    const toast = useToastStore();

    const createSalesVoucherApi = async (payload: CreateSalesVoucherPayload) => {
        try {
            await httpRequest('POST', `${config.nodeApiUrl}/idp/tally/createSalesVoucher`, payload);
            toast.success('Sales invoice created in Tally');
            return true;
        } catch (error) {
            toast.error('Failed to create sales voucher');
            return null;
        }
    };

    return { createSalesVoucherApi };
};
