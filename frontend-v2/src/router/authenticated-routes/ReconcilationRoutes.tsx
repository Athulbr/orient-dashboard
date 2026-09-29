import { lazy } from 'react';
import { Route, Routes } from 'react-router-dom';

// Lazy load pages
const ListReconcilationPage = lazy(() => import('../../modules/reconcilation/index'));
const ListReconcillationNewPage = lazy(() => import('../../modules/reconcilation/list-reconcillation/index'));
const ReconciliationDashboardPage = lazy(() => import('../../modules/reconcilation/dashboard/index'));

const ReconcilationRoutes = () => {
    return (
        <Routes>
            <Route path="list" element={<ListReconcilationPage />} />
            <Route path="recent" element={<ListReconcillationNewPage />} />
            <Route path="dashboard" element={<ReconciliationDashboardPage />} />
        </Routes>
    );
};

export default ReconcilationRoutes;
