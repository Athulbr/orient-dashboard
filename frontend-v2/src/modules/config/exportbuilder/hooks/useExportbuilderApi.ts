import { useParams } from 'react-router-dom';
import { useExportbuilderState } from './exportbuilderContext';
import { useToastStore } from '../../../../components/toast/ToastStore';
import { useEffect } from 'react';
import httpRequest from '../../../../global-utils/httpRequest';
import { config } from '../../../../config/default';

export const useExportbuilderApi = () => {
    const { state, setState } = useExportbuilderState();
    const toast = useToastStore();

    // ============================= CREATE ==================================
    const createExportbuilderApi = async (payload: any) => {
        try {
            const res = await httpRequest('POST', `${config.nodeApiUrl}/builder/recordbuilder`, payload);
            setState(prev => ({ ...prev, loading: false, id: '', refresh: prev.refresh + 1 }));
            toast.success('Exportbuilder Created Successfully');
        } catch (error) {
            console.error('error:===========', error);
            toast.error('Failed to Create Exportbuilder');
        }
    };

    // ============================= UPDATE ==================================
    const updateExportbuilderApi = async (payload: any) => {
        try {
            setState(prev => ({ ...prev, loading: true }));
            const res = await httpRequest('PUT', `${config.nodeApiUrl}/builder/recordbuilder/${state.id}`, payload);
            setState(prev => ({ ...prev, loading: false, refresh: (prev.refresh || 0) + 1 }));
            toast.success('Exportbuilder Updated Successfully');
        } catch (error) {
            console.error('error:===========', error);
            toast.error('Failed to Update Exportbuilder');
        }
    };

    // ============================= GET BY ID ===============================
    const getExportbuilderByIdApi = async (id: string) => {
        try {
            setState(prev => ({ ...prev, loading: true }));
            const res = await httpRequest('GET', `${config.nodeApiUrl}/builder/recordbuilder/${id}`);
            setState(prev => ({ ...prev, loading: false, exportbuilder: res.data }));
        } catch (error) {
            console.error('error:===========', error);
            toast.error('Failed to fetch Exportbuilder');
        }
    };

    // ============================= DELETE ==================================
    const deleteExportbuilderApi = async (id: string) => {
        try {
            const res = await httpRequest('DELETE', `${config.nodeApiUrl}/builder/recordbuilder/${id}`);
            setState(prev => ({ ...prev, id: '', refresh: (prev.refresh || 0) + 1 }));
            toast.success('Exportbuilder deleted successfully');
            return true;
        } catch (error) {
            console.error('error:===========', error);
            toast.error('Failed to delete Exportbuilder');
        }
    };
    // ============================= get Records ==================================
    const getRecordsApi = async (payload: any) => {
        try {
            const module = sessionStorage.getItem('module');
            const res = await httpRequest('POST', `${config.nodeApiUrl}/idp/history`, { ...payload, module });
            setState(prev => ({ ...prev, records: res.data, totalRecords: res.total }));
            return res;
        } catch (error) {
            console.error('error:===========', error);
            toast.error('Failed to fetch records');
        }
    };

    // ============================= EXPORT (server-side) ==============================
    const exportBuilderApi = async (payload: any) => {
        try {
            setState(prev => ({ ...prev, loading: true }));

            const accessToken = window?.sessionStorage?.getItem('accessToken') || '';
            const selectedTenant = window?.sessionStorage?.getItem('selectedTenant') || '';
            const user: any = window?.sessionStorage?.getItem('user') || '';

            const headers: HeadersInit = {
                Accept: 'application/json, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'Content-Type': 'application/json;charset=UTF-8',
                tenantid: selectedTenant ? selectedTenant : user?.tenant?._id
            };

            if (accessToken) {
                headers.authorization = `Bearer ${JSON.parse(accessToken)}`;
            }

            const response = await fetch(`${config.nodeApiUrl}/idp/history/exportbuilder`, {
                method: 'POST',
                headers,
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(errorText || 'Export failed');
            }

            const contentType = response.headers.get('content-type') || '';
            const disposition = response.headers.get('content-disposition') || '';
            let fileName = 'Record_Export.xlsx';
            const match = disposition.match(/filename="?([^";]+)"?/i);
            if (match && match[1]) {
                fileName = match[1];
            }

            if (contentType.includes('application/json')) {
                const jsonData = await response.json();
                setState(prev => ({ ...prev, loading: false }));
                return { fileName: fileName.replace(/\.xlsx$/i, '.json'), jsonData };
            }

            const blob = await response.blob();
            setState(prev => ({ ...prev, loading: false }));
            return { fileName, blob };
        } catch (error) {
            console.error('error:===========', error);
            setState(prev => ({ ...prev, loading: false }));
            toast.error('Failed to export records');
            throw error;
        }
    };

    return { createExportbuilderApi, getExportbuilderByIdApi, updateExportbuilderApi, deleteExportbuilderApi, getRecordsApi, exportBuilderApi };
};
