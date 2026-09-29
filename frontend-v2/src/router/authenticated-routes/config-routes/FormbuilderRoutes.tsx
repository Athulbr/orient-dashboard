import { Suspense, lazy } from 'react';
import { Route, Routes } from 'react-router-dom';
import { NotFoundPage } from '../../not-found-routes/GlobalNotFoundPage';
import FullScreenLoader from '../../../components/FullScreenLoader';

const ListFormbuilderPage = lazy(() => import('../../../modules/config/formbuilder/ListFormbuilderPage'));
const CreateFormbuilderPage = lazy(() => import('../../../modules/config/formbuilder/CreateFormbuilderPage'));

const FormbuilderRoutes = () => {
    return (
        <Suspense fallback={<FullScreenLoader />}>
            <Routes>
                <Route path="/list" element={<ListFormbuilderPage />} />
                <Route path="/create" element={<CreateFormbuilderPage />} />
                <Route path="/update/:id" element={<CreateFormbuilderPage />} />
                <Route path="/*" element={<NotFoundPage />} />
            </Routes>
        </Suspense>
    );
};

export default FormbuilderRoutes;
