import { config } from '../../../../../../config/default';

const API_BASE = `${config.workflowService}/workflow/field-corrections`;

const getHeaders = () => {
    const token = localStorage.getItem('token') || '';
    return {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
    };
};

export const fetchCorrectedFields = async (page: number = 1, limit: number = 10, startDate?: string, endDate?: string, search?: string) => {
    let url = `${API_BASE}/fields/all?page=${page}&limit=${limit}`;
    if (startDate && endDate) {
        url += `&startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`;
    }
    if (search) {
        url += `&search=${encodeURIComponent(search)}`;
    }
    const response = await fetch(url, {
        headers: getHeaders()
    });
    if (!response.ok) throw new Error('Failed to fetch field corrections');
    return response.json();
};

export const fetchFieldOrders = async (fieldId: string, startDate?: string, endDate?: string) => {
    let url = `${API_BASE}/fields/${fieldId}`;
    if (startDate && endDate) {
        url += `?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`;
    }
    const response = await fetch(url, {
        headers: getHeaders()
    });
    if (!response.ok) throw new Error('Failed to fetch field orders');
    return response.json();
};

export const fetchExportData = async (tab: string = 'fields', startDate?: string, endDate?: string, search?: string) => {
    let url = `${API_BASE}/export/data?tab=${tab}`;
    if (startDate && endDate) {
        url += `&startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`;
    }
    if (search) {
        url += `&search=${encodeURIComponent(search)}`;
    }
    const response = await fetch(url, {
        headers: getHeaders()
    });
    if (!response.ok) throw new Error('Failed to export data');
    return response.json();
};
