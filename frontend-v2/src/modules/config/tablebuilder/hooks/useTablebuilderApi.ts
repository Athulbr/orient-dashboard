import { useParams } from 'react-router-dom';
import { useTablebuilderState } from './tablebuilderContext';
import { useToastStore } from '../../../../components/toast/ToastStore';
import { useEffect } from 'react';
import httpRequest from '../../../../global-utils/httpRequest';
import { config } from '../../../../config/default';

export const useTablebuilderApi = () => {
    const { state, setState } = useTablebuilderState();
    const { id } = useParams();
    const toast = useToastStore();

    useEffect(() => {
        if (!id) return;
        setState(prev => ({ ...prev, id }));
    }, [id]);

    // ============================= CREATE ==================================
    const createTablebuilderApi = async (payload: any) => {
        try {
            const res = await httpRequest('POST', `${config.nodeApiUrl}/tablebuilder/create`, payload);
            setState(prev => ({ ...prev, loading: false, id: '', refresh: prev.refresh + 1 }));
            toast.success('Tablebuilder Created Successfully');
        } catch (error) {
            console.error('error:===========', error);
            toast.error('Failed to Create Tablebuilder');
        }
    };

    // ============================= UPDATE ==================================
    const updateTablebuilderApi = async (tablebuilder: any) => {
        try {
            setState(prev => ({ ...prev, loading: true }));
            const res = await httpRequest('PATCH', `${config.nodeApiUrl}/tablebuilder/update/${state.id}`, tablebuilder);
            setState(prev => ({ ...prev, loading: false, id: '', refresh: (prev.refresh || 0) + 1 }));
            toast.success('Tablebuilder Updated Successfully');
        } catch (error) {
            console.error('error:===========', error);
            toast.error('Failed to Update Tablebuilder');
        }
    };

    // ============================= GET BY ID ===============================
    const getTablebuilderByIdApi = async (id: string) => {
        try {
            setState(prev => ({ ...prev, loading: true }));
            const res = await httpRequest('GET', `${config.nodeApiUrl}/tablebuilder/${id}`);
            toast.success('Tablebuilder fetched successfully');
            setState(prev => ({ ...prev, loading: false, tablebuilder: res.data }));
        } catch (error) {
            console.error('error:===========', error);
            toast.error('Failed to fetch Tablebuilder');
        }
    };

    // ============================= DELETE ==================================
    const deleteTablebuilderApi = async (id: string) => {
        try {
            const res = await httpRequest('DELETE', `${config.nodeApiUrl}/builder/tablebuilder/delete/${id}`);
            setState(prev => ({ ...prev, id: '', refresh: (prev.refresh || 0) + 1 }));
            toast.success('Tablebuilder deleted successfully');
            return true;
        } catch (error) {
            console.error('error:===========', error);
            toast.error('Failed to delete Tablebuilder');
        }
    };
    // ============================= Refresh Cache ==================================
    const refreshCache = async () => {
        try {
            setState(prev => ({ ...prev, refreshingCache: true }));
            const tablebuilderesponse = await httpRequest('POST', `${config.nodeApiUrl}/builder/tablebuilder/query`, { pageSize: 1000 });
            window?.sessionStorage?.setItem('tablebuilder', JSON.stringify(tablebuilderesponse?.data));
            toast.success('Cache refreshed successfully');
        } catch (error) {
            console.error('error:===========', error);
            toast.error('Failed to refresh cache');
        } finally {
            setState(prev => ({ ...prev, refreshingCache: false }));
        }
    };

    return { createTablebuilderApi, getTablebuilderByIdApi, updateTablebuilderApi, deleteTablebuilderApi, refreshCache };
};
