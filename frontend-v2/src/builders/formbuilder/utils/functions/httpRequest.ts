export const httpRequest = async (method: string, url: string, data: Record<string, any> = {}) => {
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

        if (!response.ok) {
            let errorMessage = `Request failed with status ${response.status}`;
            try {
                const errorData = await response.json();
                errorMessage = errorData.message || errorMessage;
            } catch (jsonError) {
                console.warn('Failed to parse error response as JSON:', jsonError);
            }
            throw new Error(errorMessage);
        }

        return response.json();
    } catch (error: any) {
        console.error('HTTP Request Error:', error);
        throw new Error(error.message || 'An unexpected error occurred');
    }
};
