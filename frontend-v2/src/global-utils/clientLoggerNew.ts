import { config } from '../config/default';

const LOCAL_STORAGE_KEY = 'clientLoggerQueue';
const processingIds = new Set<string>();

const getQueue = () => {
    try {
        const q = localStorage.getItem(LOCAL_STORAGE_KEY);
        return q ? JSON.parse(q) : [];
    } catch {
        return [];
    }
};

const saveQueue = (queue: any[]) => {
    try {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(queue));
    } catch {
        // ignore
    }
};

const removeFromQueue = (id: string) => {
    const queue = getQueue();
    saveQueue(queue.filter((item: any) => item.id !== id));
};

const processQueue = async () => {
    const queue = getQueue();

    let accessToken: string;
    try {
        const raw = window?.sessionStorage?.getItem('accessToken');
        accessToken = raw ? JSON.parse(raw) : '';
    } catch (e) {
        accessToken = window?.sessionStorage?.getItem('accessToken') || '';
    }

    const jsonHeaders = {
        Accept: 'application/json',
        'Content-Type': 'application/json;charset=UTF-8',
        authorization: `Bearer ${accessToken}`
    };

    for (const item of queue) {
        if (processingIds.has(item.id)) continue;

        processingIds.add(item.id);

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000); // 10 seconds timeout

            const options: RequestInit = {
                method: 'POST',
                headers: jsonHeaders,
                body: JSON.stringify(item.data),
                signal: controller.signal
            };

            const response = await fetch(`${config.nodeApiUrl}/log-client-error`, options);
            clearTimeout(timeoutId);

            if (response.ok) {
                const json = await response.json().catch(() => ({}));
                if (json.status === 'logged') {
                    removeFromQueue(item.id);
                }
            }
        } catch (error) {
            console.error('Error logging to client logger:', error);
        } finally {
            processingIds.delete(item.id);
        }
    }
};

const clientLoggerNew = (data?: any) => {
    if (data) {
        const queue = getQueue();
        const id = Date.now().toString() + '-' + Math.random().toString(36).substr(2, 9);
        queue.push({ id, data });
        saveQueue(queue);
    }

    processQueue();
};

export default clientLoggerNew;
