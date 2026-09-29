import { lazy } from 'react';
import { Route, Routes } from 'react-router-dom';

const ArdexReconcillationPage = lazy(() => import('../../modules/ardex/reconcillation/index'));

const ArdexRoutes = () => {
    return (
        <Routes>
            <Route path="reconcillation" element={<ArdexReconcillationPage />} />
        </Routes>
    );
};

export default ArdexRoutes;
