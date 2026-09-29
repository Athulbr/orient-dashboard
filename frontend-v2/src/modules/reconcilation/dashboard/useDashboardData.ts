import { useCallback, useEffect, useRef, useState } from 'react';
import type { DashboardData } from './types';

// Same backend the rest of this module talks to directly (see ../index.tsx) —
// GET /reconcile/dashboard-data is served straight off the transactions
// archive, coupled into the same FastAPI app as reconcile-bank/qr/gateway.
const API_BASE_URL = 'http://127.0.0.1:8000';
// const API_BASE_URL = 'http://172.16.0.47';


interface UseDashboardDataReturn {
    data: DashboardData | null;
    isLoading: boolean;
    error: string | null;
    refresh: () => void;
}

export const useDashboardData = (): UseDashboardDataReturn => {
    const [data, setData] = useState<DashboardData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const load = useCallback(async (silent = false) => {
        if (!silent) setIsLoading(true);
        try {
            const response = await fetch(`${API_BASE_URL}/reconcile/dashboard-data`);
            if (response.status === 202) {
                // cache is still (re)building on the backend - not an error, just retry shortly
                retryTimer.current = setTimeout(() => load(true), 2000);
                return;
            }
            if (!response.ok) {
                const body = await response.json().catch(() => ({}));
                throw new Error(body.detail || `Request failed (${response.status})`);
            }
            const json: DashboardData = await response.json();
            setData(json);
            setError(null);
        } catch (err: any) {
            setError(err?.message || 'Failed to load dashboard data.');
        } finally {
            if (!silent) setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
        // freshness is event-driven server-side (cache invalidates the moment a
        // reconciliation is archived) - this interval just picks up whatever's
        // already there, so it can stay cheap and infrequent
        const intervalId = setInterval(() => load(true), 30_000);
        return () => {
            clearInterval(intervalId);
            if (retryTimer.current) clearTimeout(retryTimer.current);
        };
    }, [load]);

    const refresh = useCallback(() => {
        fetch(`${API_BASE_URL}/reconcile/dashboard-refresh`, { method: 'POST' }).catch(() => {});
        // the rebuild runs in the background on the server - give it a moment, then re-poll
        setTimeout(() => load(true), 1500);
    }, [load]);

    return { data, isLoading, error, refresh };
};
