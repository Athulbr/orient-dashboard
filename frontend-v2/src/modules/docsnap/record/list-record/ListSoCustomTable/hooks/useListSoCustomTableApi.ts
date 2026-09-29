import { useToastStore } from '../../../../../../components/toast/ToastStore';
import httpRequest from '../../../../../../global-utils/httpRequest';
import { useListSoCustomTableState } from './listSoCustomTableStateContext';
import { config } from '../../../../../../config/default';

export const useListSoCustomTableApi = () => {
    const toast = useToastStore();
    const { setState } = useListSoCustomTableState();

    const getSoListApi = async () => {
        try {
            setState(prev => ({ ...prev, loadingRecords: true, failedToFetch: false }));
            const res: any = await httpRequest('POST', `${config.nodeApiUrl}/idp/tally/listAllSalesOrders`, {});
            const vouchers = res?.data?.vouchers ?? [];
            setState(prev => ({ ...prev, loadingRecords: false, records: vouchers, totalRecords: vouchers.length }));
            return true;
        } catch (error) {
            setState(prev => ({ ...prev, loadingRecords: false, failedToFetch: true }));
            toast.error('Failed to fetch sales orders');
            return null;
        }
    };

    return { getSoListApi };
};
