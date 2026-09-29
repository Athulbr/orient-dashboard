import { lazy } from 'react';
import { Route, Routes } from 'react-router-dom';

// Lazy load pages
const ViewRecordPage = lazy(() => import('../../modules/docsnap/record/view-record'));
const ListRecordPage = lazy(() => import('../../modules/docsnap/record/list-record'));
const ListTemplatePage = lazy(() => import('../../modules/docsnap/template/list-template'));
const UpdateTemplatePage = lazy(() => import('../../modules/docsnap/template/update-template'));
const ViewTemplatePage = lazy(() => import('../../modules/docsnap/template/view-template'));

const DocSnapRoutes = () => {
    return (
        <Routes>
            <Route path="template/list" element={<ListTemplatePage />} />
            <Route path="template/view/:id" element={<ViewTemplatePage />} />
            <Route path="template/update/:id" element={<UpdateTemplatePage />} />
            <Route path="template/settings/:id" element={<UpdateTemplatePage settings={true} />} />
            <Route path="template/create/:fileName" element={<UpdateTemplatePage create={true} />} />
            <Route path="record/list" element={<ListRecordPage />} />
            <Route path="record/view/:id" element={<ViewRecordPage />} />
        </Routes>
    );
};

export default DocSnapRoutes;
