import { useToastStore } from '../../../../../../components/toast/ToastStore';
import httpRequest from '../../../../../../global-utils/httpRequest';
import { useListPoCustomTableState } from './listPoCustomTableStateContext';
import { config } from '../../../../../../config/default';

export const useListPoCustomTableApi = () => {
    const toast = useToastStore();
    const { setState } = useListPoCustomTableState();

    const getPoListApi = async () => {
        try {
            setState(prev => ({ ...prev, loadingRecords: true, failedToFetch: false }));
            const res: any = await httpRequest('POST', `${config.nodeApiUrl}/idp/tally/listAllPurchaseOrders`, {});
            const vouchers = res?.data?.vouchers ?? [];
            setState(prev => ({ ...prev, loadingRecords: false, records: vouchers, totalRecords: vouchers.length }));
            return true;
        } catch (error) {
            setState(prev => ({ ...prev, loadingRecords: false, failedToFetch: true }));
            toast.error('Failed to fetch purchase orders');
            return null;
        }
    };

    const listSundryCreditorLedgersApi = async () => {
        try {
            const response: any = await httpRequest('POST', `${config.nodeApiUrl}/idp/tally/listSundryCreditorLedgers`, {});
            return response;
        } catch (error) {
            console.error('error:===========', error);
            toast.error('Failed to fetch sundry creditor ledgers');
            return null;
        }
    };

    const listPurchaseAccountLedgersApi = async () => {
        try {
            const response = await httpRequest('POST', `${config.nodeApiUrl}/idp/tally/listPurchaseAccountLedgers`, {});
            return response;
        } catch (error) {
            console.error('error:===========', error);
            toast.error('Failed to fetch purchase ledgers');
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

    return { getPoListApi, listSundryCreditorLedgersApi, listPurchaseAccountLedgersApi, listAllStockItemsApi, listAllUnitsApi };
};

export interface CreatePoPayload {
    partyLedgerName: string;
    poNumber: string;
    poDate: string;
    dueDate: string;
    otherReferences: string;
    purchaseLedgerName: string;
    items: {
        stockItemName: string;
        quantity: number;
        unit: string;
        rate: number;
        amount: number;
    }[];
}

export const useCreatePoApi = () => {
    const toast = useToastStore();

    const createPoApi = async (payload: CreatePoPayload) => {
        try {
            await httpRequest('POST', `${config.nodeApiUrl}/idp/tally/createPO`, payload);
            toast.success('Purchase Order created successfully');
            return true;
        } catch (error) {
            toast.error('Failed to create Purchase Order');
            return null;
        }
    };

    return { createPoApi };
};
