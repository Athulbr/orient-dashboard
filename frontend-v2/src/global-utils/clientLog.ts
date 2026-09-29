import { useToastStore } from '../components/toast/ToastStore';
import { config } from '../config/default';

const clientLogger = async (method: string, url: string, data: any = {}) => {
    const accessToken = window?.sessionStorage?.getItem('accessToken') as string;

    const jsonHeaders = {
        Accept: 'application/json',
        'Content-Type': 'application/json;charset=UTF-8',
        authorization: `Bearer ${accessToken ? JSON.parse(accessToken) : ''}`
    };
    try {
        const options: RequestInit = {
            method,
            headers: jsonHeaders,
            body: method !== 'GET' ? JSON.stringify(data) : undefined
        };

        const response = await fetch(url, options);

        // Parse the body as JSON
        const result = await response.json();

        if (response?.status === 403) {
            clientLogger('POST', `${config.nodeApiUrl}/log-client-error`, { error: result.message, data: { url: response?.url } });
            throw new Error(`Connection error, try again later`);
        }

        if (response?.status === 404) {
            clientLogger('POST', `${config.nodeApiUrl}/log-client-error`, { error: response?.statusText, data: { url: response?.url } });
            throw new Error(`Connection error, try again later`);
        }

        if (response?.status === 504) {
            clientLogger('POST', `${config.nodeApiUrl}/log-client-error`, { error: response?.statusText, data: { url: response?.url } });
            throw new Error(`${response?.statusText}`);
        }

        if (response?.status === 500) {
            // clientLogger('POST', `${config.nodeApiUrl}/log-client-error`, { error: response?.statusText, data: { url: response?.url } })
            const errorMessage = response?.statusText === '' ? 'Connection issue, try again later' : response?.statusText;
            throw new Error(errorMessage);
        }

        if (response?.status === 401) {
            useToastStore.getState().error(`${response?.statusText}`);
            window?.sessionStorage?.clear();
            window?.location?.replace('/login');
            return;
        }

        if (!response?.ok) {
            throw new Error(result?.message || `Request failed with status ${response?.status}`);
        }

        return result;
    } catch (error: any) {
        if (error.status === 401) {
            useToastStore.getState().error('Login Expired, Please login once again');
            window?.sessionStorage?.clear();
            window?.location?.replace('/login');
            return;
        }
        throw new Error(error.message);
    }
};

export default clientLogger;
