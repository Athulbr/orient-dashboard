import { useTenantState } from './tenantContext';
import { useToastStore } from '../../../../components/toast/ToastStore';
import httpRequest from '../../../../global-utils/httpRequest';
import { config } from '../../../../config/default';

export const useTenantsApi = () => {
    const { state, setState } = useTenantState();
    const toast = useToastStore();

    // ============================= CREATE ==================================

    const createTenantApi = async (payload: any) => {
        try {
            setState(prev => ({ ...prev, loading: true }));
            const res = await httpRequest('POST', `${config.nodeApiUrl}/tenant/create`, payload);
            setState(prev => ({ ...prev, loading: false, showCreateDialog: false, id: '', refresh: state.refresh + 1 }));
            toast.success('Tenant Created Successfully');
        } catch (error) {
            console.error('error:===========', error);
            setState(prev => ({ ...prev, loading: false }));
            toast.error('Failed to Create Tenant');
        }
    };

    const updateTenantApi = async (tenant: any) => {
        try {
            setState(prev => ({ ...prev, loading: true }));
            const res = await httpRequest('PATCH', `${config.nodeApiUrl}/tenant/update/${state.id}`, tenant);
            setState(prev => ({ ...prev, loading: false, showCreateDialog: false, showCreatePage: false, id: '', refresh: state.refresh + 1 }));
            toast.success('Tenant Updated Successfully');
        } catch (error) {
            console.error('error:===========', error);
            setState(prev => ({ ...prev, loading: false }));
            toast.error('Failed to Update Tenant');
        }
    };

    const getTenantByIdApi = async (id: string) => {
        try {
            setState(prev => ({ ...prev, loading: true }));
            const res = await httpRequest('GET', `${config.nodeApiUrl}/tenant/${id}`);
            toast.success('Tenant fetched successfully');
            setState(prev => ({ ...prev, loading: false, tenant: res.data, fields: res.data.fields }));
        } catch (error) {
            console.error('error:===========', error);
            toast.error('Failed to fetch Tenant');
        }
    };

    const deleteTenantApi = async (id: string) => {
        try {
            const res = await httpRequest('DELETE', `${config.nodeApiUrl}/tenant/delete/${id}`);
            setState(prev => ({ ...prev, showCreateDialog: false, showCreatePage: false, id: '', refresh: state.refresh + 1 }));
            toast.success('Tenant deleted successfully');
            return true;
        } catch (error) {
            console.error('error:===========', error);
            toast.error('Failed to delete Tenant');
        }
    };

    return { createTenantApi, getTenantByIdApi, updateTenantApi, deleteTenantApi };
};
