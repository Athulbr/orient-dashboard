import { lazy } from 'react';
import { Route, Routes } from 'react-router-dom';
import { NotFoundPage } from '../not-found-routes/GlobalNotFoundPage';

const TranscriptionListPage = lazy(() => import('../../modules/transcript/list-record/index'));
const TranscriptionCreatePage = lazy(() => import('../../modules/transcript/create'));

const MedicalCodeRoutes = () => {
    return (
        <Routes>
            <Route path="/list" element={<TranscriptionListPage />} />
            <Route path="/create" element={<TranscriptionCreatePage />} />
            <Route path="/view/:id" element={<TranscriptionCreatePage />} />
            <Route path="*" element={<NotFoundPage />} />
        </Routes>
    );
};

export default MedicalCodeRoutes;
