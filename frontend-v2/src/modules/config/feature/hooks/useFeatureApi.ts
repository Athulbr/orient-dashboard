import { useParams } from 'react-router-dom';
import { useFeatureState } from './featureContext';
import { useToastStore } from '../../../../components/toast/ToastStore';
import { useEffect } from 'react';
import httpRequest from '../../../../global-utils/httpRequest';
import { config } from '../../../../config/default';

export const useFeaturesApi = () => {
    const { state, setState } = useFeatureState();
    const { id } = useParams();
    const toast = useToastStore();

    useEffect(() => {
        if (!id) return;
        setState(prev => ({ ...prev, projectId: id }));
    }, [id]);

    // ============================= CREATE ==================================

    const createFeatureApi = async (payload: any) => {
        try {
            setState(prev => ({ ...prev, loading: true }));
            const res = await httpRequest('POST', `${config.nodeApiUrl}/feature/create`, payload);
            setState(prev => ({ ...prev, loading: false, showCreateDialog: false, id: '', refresh: state.refresh + 1 }));
            toast.success('Feature Created Successfully');
        } catch (error) {
            console.error('error:===========', error);
            setState(prev => ({ ...prev, loading: false }));
            toast.error('Failed to Create Feature');
        }
    };

    const updateFeatureApi = async (feature: any) => {
        try {
            setState(prev => ({ ...prev, loading: true }));
            const res = await httpRequest('PATCH', `${config.nodeApiUrl}/feature/update/${state.id}`, feature);
            setState(prev => ({ ...prev, loading: false, showCreateDialog: false, showCreatePage: false, id: '', refresh: state.refresh + 1 }));
            toast.success('Feature Updated Successfully');
        } catch (error) {
            console.error('error:===========', error);
            setState(prev => ({ ...prev, loading: false }));
            toast.error('Failed to Update Feature');
        }
    };

    const getFeatureByIdApi = async (id: string) => {
        try {
            setState(prev => ({ ...prev, loading: true }));
            const res = await httpRequest('GET', `${config.nodeApiUrl}/feature/${id}`);
            toast.success('Feature fetched successfully');
            setState(prev => ({ ...prev, loading: false, feature: res.data, fields: res.data.fields }));
        } catch (error) {
            console.error('error:===========', error);
            toast.error('Failed to fetch Feature');
        }
    };

    const deleteFeatureApi = async (id: string) => {
        try {
            const res = await httpRequest('DELETE', `${config.nodeApiUrl}/feature/delete/${id}`);
            setState(prev => ({ ...prev, showCreateDialog: false, showCreatePage: false, id: '', refresh: state.refresh + 1 }));
            toast.success('Feature deleted successfully');
            return true;
        } catch (error) {
            console.error('error:===========', error);
            toast.error('Failed to delete Feature');
        }
    };

    return { createFeatureApi, getFeatureByIdApi, updateFeatureApi, deleteFeatureApi };
};
