export const httpUploadRequest = async <T = any>(url: string, file: File, token?: string): Promise<T> => {
    const formData = new FormData();
    formData.append('files', file);

    const headers: HeadersInit = {};

    const sessionStorageAccessToken = window?.sessionStorage?.getItem('accessToken') || '';
    const accessToken = token || (sessionStorageAccessToken && JSON.parse(sessionStorageAccessToken));

    if (accessToken) {
        headers.authorization = `Bearer ${accessToken}`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1000000000);

    try {
        const response = await fetch(url, {
            method: 'POST',
            body: formData,
            headers,
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || `Upload failed with status ${response.status}`);
        }

        return (await response.json()) as T;
    } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
            throw new Error('Upload timeout');
        }
        throw error instanceof Error ? error : new Error('Unknown upload error');
    }
};

export default httpUploadRequest;
