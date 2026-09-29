import { config } from '../config/default';
import clientLogger from './clientLog';

const httpFileRequest = async (method: string, url: string, data: Record<string, any> = {}, token?: string): Promise<Blob> => {
    const sessionStorageAccessToken = window?.sessionStorage?.getItem('accessToken') || '';
    const selectedTenant = window?.sessionStorage?.getItem('selectedTenant') || '';
    const selectedModule = window?.sessionStorage?.getItem('module') || '';
    const selectedRole = window?.sessionStorage?.getItem('selectedRole') || '';
    const user: any = JSON.parse(window?.sessionStorage?.getItem('user') || '{}');
    const normalizedMethod = method.toUpperCase();

    const headers: HeadersInit = {
        Accept: 'application/pdf',
        tenantid: selectedTenant ? selectedTenant : user?.tenant?._id,
        roleid: selectedRole ? selectedRole : user?.role?._id,
        module: selectedModule,
        'x-api-key': 'secret1'
    };

    if (sessionStorageAccessToken) {
        headers.authorization = `Bearer ${JSON.parse(sessionStorageAccessToken)}`;
    }
    if (token) {
        headers.authorization = `Bearer ${token}`;
    }

    const isReadMethod = ['GET', 'HEAD'].includes(normalizedMethod);

    const options: RequestInit = {
        method: normalizedMethod,
        headers,
        credentials: 'same-origin',
        body: isReadMethod ? undefined : JSON.stringify(data),
        cache: isReadMethod ? 'no-cache' : 'no-store'
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000000);

    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal
        });

        if (response?.status === 401) {
            clientLogger('POST', `${config.nodeApiUrl}/log-client-error`, { error: 'Unauthorized', data: { url: response?.url } });
            window.sessionStorage.clear();
            window?.location?.replace('/');
        }

        if (!response?.ok) {
            throw new Error(`Request failed with status ${response?.status}`);
        }

        return await response.blob();
    } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
            throw new Error('Request timeout');
        }
        throw error instanceof Error ? error : new Error('Unknown error occurred');
    } finally {
        clearTimeout(timeoutId);
    }
};

export default httpFileRequest;
