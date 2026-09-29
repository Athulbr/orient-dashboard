import { useToastStore } from '../../../../../components/toast/ToastStore';
import httpRequest from '../../../../../global-utils/httpRequest';
import { config } from '../../../../../config/default';

export const useTallyApi = () => {
    const toast = useToastStore();

    const tallyHealthCheck = async () => {
        try {
            const response = await httpRequest('GET', `${config.nodeApiUrl}/idp/tally/check`);
            return response;
        } catch (error) {
            return null;
        }
    };

    const getAllLedgerApi = async () => {
        try {
            const response = await httpRequest('POST', `${config.nodeApiUrl}/idp/tally/listAllLedgers`, {});
            return response;
        } catch (error) {
            console.error('error:===========', error);
            toast.error('Failed to fetch ledger list');
            return null;
        }
    };

    const listAllPurchaseOrdersApi = async () => {
        try {
            const response = await httpRequest('POST', `${config.nodeApiUrl}/idp/tally/listAllPurchaseOrders`, {});
            return response;
        } catch (error) {
            console.error('error:===========', error);
            toast.error('Failed to fetch purchase orders');
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

    const listSundryCreditorLedgersApi = async () => {
        try {
            const response = await httpRequest('POST', `${config.nodeApiUrl}/idp/tally/listSundryCreditorLedgers`, {});
            return response;
        } catch (error) {
            console.error('error:===========', error);
            toast.error('Failed to fetch sundry creditor ledgers');
            return null;
        }
    };

    const createPurchaseVoucher = async (payload: any) => {
        try {
            const res: any = await httpRequest('POST', `${config.nodeApiUrl}/idp/tally/createPurchaseVoucher`, payload);
            toast.success('successfully store with PO partially consumed');
            return res;
        } catch (error) {
            console.error('error:===========', error);
            toast.error('Failed to create purchase voucher');
            return null;
        }
    };

    const createJournalVoucherApi = async (payload: any) => {
        try {
            const res: any = await httpRequest('POST', `${config.nodeApiUrl}/idp/tally/createJournalVoucher`, payload);
            return res;
        } catch (error) {
            console.error('error:===========', error);
            toast.error('Failed to create journal voucher');
            return null;
        }
    };

    const createSoApi = async (payload: any) => {
        try {
            const res: any = await httpRequest('POST', `${config.nodeApiUrl}/idp/tally/createSO`, payload);
            toast.success('Sales Order created successfully');
            return res;
        } catch (error) {
            console.error('error:===========', error);
            toast.error('Failed to create sales order');
            return null;
        }
    };

    return {
        tallyHealthCheck,
        getAllLedgerApi,
        listAllPurchaseOrdersApi,
        listAllStockItemsApi,
        listPurchaseAccountLedgersApi,
        listSundryCreditorLedgersApi,
        createPurchaseVoucher,
        createJournalVoucherApi,
        createSoApi
    };
};
