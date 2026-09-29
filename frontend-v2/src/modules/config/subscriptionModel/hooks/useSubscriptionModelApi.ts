import { useParams } from 'react-router-dom';
import { useSubscriptionModelState } from './subscriptionModelContext';
import { useToastStore } from '../../../../components/toast/ToastStore';
import httpRequest from '../../../../global-utils/httpRequest';
import { config } from '../../../../config/default';

export const useSubscriptionModelsApi = () => {
    const { state, setState } = useSubscriptionModelState();
    const { id } = useParams();
    const toast = useToastStore();

    // ============================= CREATE ==================================

    const createSubscriptionModelApi = async (payload: any) => {
        try {
            setState(prev => ({ ...prev, loading: true }));
            const res = await httpRequest('POST', `${config.nodeApiUrl}/subscription/create`, payload);
            setState(prev => ({ ...prev, loading: false, showCreateDialog: false, id: '', refresh: state.refresh + 1 }));
            toast.success('Subscription Model Created Successfully');
        } catch (error) {
            console.error('error:===========', error);
            setState(prev => ({ ...prev, loading: false }));
            toast.error('Failed to Create Subscription Model');
        }
    };

    const updateSubscriptionModelApi = async (subscriptionModel: any) => {
        try {
            setState(prev => ({ ...prev, loading: true }));
            const res = await httpRequest('PATCH', `${config.nodeApiUrl}/subscription/update/${state.id}`, subscriptionModel);
            setState(prev => ({ ...prev, loading: false, showCreateDialog: false, showCreatePage: false, id: '', refresh: state.refresh + 1 }));
            toast.success('Subscription Model Updated Successfully');
        } catch (error) {
            console.error('error:===========', error);
            setState(prev => ({ ...prev, loading: false }));
            toast.error('Failed to Update Subscription Model');
        }
    };

    const getSubscriptionModelByIdApi = async (id: string) => {
        try {
            setState(prev => ({ ...prev, loading: true }));
            const res = await httpRequest('GET', `${config.nodeApiUrl}/subscription/${id}`);
            toast.success('Subscription Model fetched successfully');
            setState(prev => ({ ...prev, loading: false, subscriptionModel: res.data, fields: res.data.fields }));
        } catch (error) {
            console.error('error:===========', error);
            toast.error('Failed to fetch Subscription Model');
        }
    };

    // =========================== QUERY LISTS =============================

    const getAllModulesApi = async () => {
        try {
            const res = await httpRequest('POST', `${config.nodeApiUrl}/module`, { pageSize: 1000 });
            const modules = res.data || [];
            setState(prev => ({ ...prev, modules }));
            return modules;
        } catch (error) {
            console.error('error:===========', error);
            toast.error('Failed to fetch Modules');
            throw error;
        }
    };

    const getAllFeaturesApi = async () => {
        try {
            const res = await httpRequest('POST', `${config.nodeApiUrl}/feature`, { pageSize: 1000 });
            const features = res.data || [];
            setState(prev => ({ ...prev, features }));
            return features;
        } catch (error) {
            console.error('error:===========', error);
            toast.error('Failed to fetch Features');
            throw error;
        }
    };

    const deleteSubscriptionModelApi = async (id: string) => {
        try {
            const res = await httpRequest('DELETE', `${config.nodeApiUrl}/subscription/delete/${id}`);
            setState(prev => ({ ...prev, showCreateDialog: false, showCreatePage: false, id: '', refresh: state.refresh + 1 }));
            toast.success('Subscription Model deleted successfully');
            return true;
        } catch (error) {
            console.error('error:===========', error);
            toast.error('Failed to delete Subscription Model');
        }
    };

    return {
        createSubscriptionModelApi,
        getSubscriptionModelByIdApi,
        updateSubscriptionModelApi,
        deleteSubscriptionModelApi,
        getAllModulesApi,
        getAllFeaturesApi
    };
};
