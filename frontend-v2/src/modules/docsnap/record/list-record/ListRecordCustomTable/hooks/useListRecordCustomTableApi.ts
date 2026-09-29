import { useToastStore } from '../../../../../../components/toast/ToastStore';
import httpRequest from '../../../../../../global-utils/httpRequest';
import { useListRecordCustomTableState } from './listRecordCustomTableStateContext';
import { config } from '../../../../../../config/default';
import { useExtractionStore } from '../../../../../../zustand-store/extractionStore';

export const useListRecordCustomTableApi = () => {
    const toast = useToastStore();
    const { state, setState } = useListRecordCustomTableState();
    const { updateRefreshRecord } = useExtractionStore();

    // ============================= CREATE ==================================
    const getRecordsApi = async () => {
        try {
            const payload = {
                searchFields: ['name'],
                filters: { deleted: false },
                search: state.searchText,
                pageSize: state.pageSize,
                page: state.page,
                startDate: state.startDate,
                endDate: state.endDate
            };
            // @ts-ignore
            if (state.selectedStatuses.length > 0) payload.filters.status = { $in: state.selectedStatuses };
            // include selected template id(s) at top-level when present
            // @ts-ignore
            if (state.selectedTemplates && state.selectedTemplates.length > 0) payload.templateId = state.selectedTemplates;
            const module = sessionStorage.getItem('module');
            setState(prev => ({ ...prev, loadingRecords: true }));
            const res: any = await httpRequest('POST', `${config.nodeApiUrl}/idp/history`, { ...payload, module });
            setState(prev => ({ ...prev, loadingRecords: false, records: res.data, totalRecords: res.total, failedToFetch: false }));
            window?.sessionStorage?.setItem('recordIdList', JSON.stringify(res.data.map((item: any) => item._id)));
            return true;
        } catch (error) {
            setState(prev => ({ ...prev, loadingRecords: false, failedToFetch: true }));
            toast.error('Failed to fetch record');
        }
    };
    const createRecordApi = async (requestBody: any) => {
        try {
            const res = await httpRequest('POST', `${config.nodeApiUrl}/idp/history/create`, requestBody);
            toast.success('Record created successfully');
            return res;
        } catch (error) {
            toast.error('Failed to Create record');
        }
    };
    const updateRecordApi = async (requestBody: any, id: string) => {
        try {
            const res = await httpRequest('PATCH', `${config.nodeApiUrl}/idp/history/save/extraction/${id}`, requestBody);
            toast.success('Record updated successfully');
        } catch (error) {
            toast.error('Failed to update record');
        }
    };
    const deleteRecordApi = async (id: string) => {
        try {
            const res = await httpRequest('DELETE', `${config.nodeApiUrl}/idp/history/delete/${id}`);
            await getRecordsApi();
            updateRefreshRecord();
            toast.success('Record deleted successfully');
        } catch (error) {
            toast.error('Failed to delete record');
        }
    };

    return { getRecordsApi, createRecordApi, updateRecordApi, deleteRecordApi };
};
