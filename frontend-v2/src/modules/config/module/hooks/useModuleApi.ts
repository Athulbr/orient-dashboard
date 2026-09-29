import { useParams } from 'react-router-dom';
import { useModuleState } from './moduleContext';
import { useToastStore } from '../../../../components/toast/ToastStore';
import { useEffect } from 'react';
import httpRequest from '../../../../global-utils/httpRequest';
import { config } from '../../../../config/default';

export const useModulesApi = () => {
    const { state, setState } = useModuleState();
    const { id } = useParams();
    const toast = useToastStore();

    useEffect(() => {
        if (!id) return;
        setState(prev => ({ ...prev, projectId: id }));
    }, [id]);

    // ============================= CREATE ==================================

    const createModuleApi = async (payload: any) => {
        try {
            setState(prev => ({ ...prev, loading: true }));
            const res = await httpRequest('POST', `${config.nodeApiUrl}/module/create`, payload);
            setState(prev => ({ ...prev, showCreateDialog: false, id: '', refresh: state.refresh + 1 }));
            toast.success('Module Created Successfully');
        } catch (error) {
            console.error('error:===========', error);
            toast.error('Failed to Create Module');
        } finally {
            setState(prev => ({ ...prev, loading: false }));
        }
    };

    const updateModuleApi = async (module: any) => {
        try {
            setState(prev => ({ ...prev, loading: true }));
            const res = await httpRequest('PATCH', `${config.nodeApiUrl}/module/update/${state.id}`, module);
            setState(prev => ({ ...prev, showCreateDialog: false, showCreatePage: false, id: '', refresh: state.refresh + 1 }));
            toast.success('Module Updated Successfully');
        } catch (error) {
            console.error('error:===========', error);
            toast.error('Failed to Update Module');
        } finally {
            setState(prev => ({ ...prev, loading: false }));
        }
    };

    const getModuleByIdApi = async (id: string) => {
        try {
            const res = await httpRequest('GET', `${config.nodeApiUrl}/module/${id}`);
            toast.success('Module fetched successfully');
            setState(prev => ({ ...prev, module: res.data, fields: res.data.fields }));
        } catch (error) {
            console.error('error:===========', error);
            toast.error('Failed to fetch Module');
        }
    };

    const deleteModuleApi = async (id: string) => {
        try {
            const res = await httpRequest('DELETE', `${config.nodeApiUrl}/module/delete/${id}`);
            setState(prev => ({ ...prev, showCreateDialog: false, showCreatePage: false, id: '', refresh: state.refresh + 1 }));
            toast.success('Module deleted successfully');
            return true;
        } catch (error) {
            console.error('error:===========', error);
            toast.error('Failed to delete Module');
        }
    };

    return { createModuleApi, getModuleByIdApi, updateModuleApi, deleteModuleApi };
};
