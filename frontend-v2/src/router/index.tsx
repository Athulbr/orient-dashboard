import React, { useEffect } from 'react';
import AuthenticatedRoutes from './authenticated-routes';
import UnauthenticatedRoutes from './unauthenticated-routes';
import AuthenticatedLayout from '../modules/layout/AuthenticatedLayout';
import clientLoggerNew from '../global-utils/clientLoggerNew';

const IndexRouter: React.FC = () => {
    const accessToken = window?.sessionStorage?.getItem('accessToken') || '';
    const clientLoggerQueue = window?.localStorage?.getItem('clientLoggerQueue') || '';

    useEffect(() => {
        try {
            if (clientLoggerQueue) {
                const queue = JSON.parse(clientLoggerQueue);
                if (Array.isArray(queue) && queue.length > 0) {
                    clientLoggerNew();
                }
            }
        } catch (e) {
            // Ignore JSON parse errors
        }
    }, [clientLoggerQueue]);

    return accessToken ? (
        <AuthenticatedLayout>
            <AuthenticatedRoutes />
        </AuthenticatedLayout>
    ) : (
        <UnauthenticatedRoutes />
    );
};

export default IndexRouter;
