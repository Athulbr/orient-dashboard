import { Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import { NotFoundPage } from '../../not-found-routes/GlobalNotFoundPage';
import FullScreenLoader from '../../../components/FullScreenLoader';
import ListTablebuilderPage from '../../../modules/config/tablebuilder';
import CreateTablebuilderPage from '../../../modules/config/tablebuilder/CreateTablebuilderPage';

const TablebuilderRoutes = () => {
    return (
        <Suspense fallback={<FullScreenLoader />}>
            <Routes>
                <Route path="/list" element={<ListTablebuilderPage />} />
                <Route path="/create" element={<CreateTablebuilderPage />} />
                <Route path="/update/:id" element={<CreateTablebuilderPage update />} />
                <Route path="/*" element={<NotFoundPage />} />
            </Routes>
        </Suspense>
    );
};

export default TablebuilderRoutes;
