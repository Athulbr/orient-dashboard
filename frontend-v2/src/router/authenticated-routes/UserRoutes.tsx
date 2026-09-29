import { lazy } from 'react';
import { Route, Routes } from 'react-router-dom';
import { NotFoundPage } from '../not-found-routes/GlobalNotFoundPage';

// Lazy load if needed
const UserAccountDetailsPage = lazy(() => import('../../modules/config/user/user-account'));

const UserRoutes = () => {
    return (
        <Routes>
            <Route path="account/:id" element={<UserAccountDetailsPage />} />
            <Route path="*" element={<NotFoundPage />} />
        </Routes>
    );
};

export default UserRoutes;
