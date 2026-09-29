import React, { Suspense } from 'react';
import { GlobalAlert } from './components/alert/GlobalAlert';
import { ToastContainer } from './components/toast/ToastContainer';
import IndexRouter from './router';
import FullScreenLoader from './components/FullScreenLoader';

export const App: React.FC = () => {
    return (
        <div className="h-screen w-screen">
            <IndexRouter />
            <Suspense fallback={<FullScreenLoader />}>
                <GlobalAlert />
                <ToastContainer />
            </Suspense>
        </div>
    );
};
