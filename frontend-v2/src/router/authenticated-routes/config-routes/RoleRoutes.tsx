import { Suspense, lazy } from 'react';
import { Route, Routes } from 'react-router-dom';
import { NotFoundPage } from '../../not-found-routes/GlobalNotFoundPage';
import FullScreenLoader from '../../../components/FullScreenLoader';
import ListRolePage from '../../../modules/config/role';

const RoleRoutes = () => {
    return (
        <Suspense fallback={<FullScreenLoader />}>
            <Routes>
                <Route path="/list" element={<ListRolePage />} />
                {/* <Route path="/create" element={<CreateRolePage />} /> */}
                <Route path="/*" element={<NotFoundPage />} />
            </Routes>
        </Suspense>
    );
};

export default RoleRoutes;
