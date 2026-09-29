import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { NotFoundPage } from '../not-found-routes/GlobalNotFoundPage';
import FullScreenLoader from '../../components/FullScreenLoader';
import DocumentCreationEditor from '../../modules/documentCreation/create-document';
import ContentCreationEditor from '../../modules/content-creation';
import AgentRoutes from './AgentRoutes';
import ReconcilationRoutes from './ReconcilationRoutes';
import ArdexRoutes from './ArdexRoutes';

const ConfigRoutes = lazy(() => import('./config-routes'));
const DashboardPage = lazy(() => import('../../modules/dashboard'));
const DocSnapRoutes = lazy(() => import('./DocSnapRoutes'));
const UserRoutes = lazy(() => import('./UserRoutes'));
const MedicalCodeRoutes = lazy(() => import('./medicalCodeRoutes'));

const AuthenticatedRoutes = () => {
    const permissions = sessionStorage.getItem('permissions');
    const orient = JSON.parse(permissions || '[]')?.some((permission: any) => permission.key === 'view:report');
    const docsnapModule = JSON.parse(permissions || '[]')?.some((permission: any) => permission.key === 'docsnap:module');
    const dataEntryModule = JSON.parse(permissions || '[]')?.some((permission: any) => permission.key === 'dataentry:module');
    const transcriptModule = JSON.parse(permissions || '[]')?.some((permission: any) => permission.key === 'transcript:module');
    const sldModule = JSON.parse(permissions || '[]')?.some((permission: any) => permission.key === 'sld:module');
    const documentCreationModule = JSON.parse(permissions || '[]')?.some((permission: any) => permission.key === 'documentGeneration:module');
    const ppeDetectionModule = JSON.parse(permissions || '[]')?.some((permission: any) => permission.key === 'ppeDetection:module');
    const invoiceTracking = JSON.parse(permissions || '[]')?.some((permission: any) => permission.key === 'invoiceTracking:module');
    const contentCreation = JSON.parse(permissions || '[]')?.some((permission: any) => permission.key === 'contentCreation:module');
    const tallyModule = JSON.parse(permissions || '[]')?.some((permission: any) => permission.key === 'tally:module');

    const module = orient
        ? 'orient'
        : docsnapModule
          ? 'docsnap'
          : dataEntryModule
            ? 'data-entry'
            : transcriptModule
              ? 'transcription'
              : sldModule
                ? 'sld'
                : documentCreationModule
                  ? 'document-generation'
                  : ppeDetectionModule
                    ? 'ppe-detection'
                    : invoiceTracking
                      ? 'invoice-tracking'
                      : contentCreation
                        ? 'content-creation'
                        : tallyModule
                          ? 'tally'
                          : 'none';
    module !== 'none' && sessionStorage.setItem('module', module);
    const role = JSON.parse(sessionStorage.getItem('role') || '{}');
    const selectedModule = sessionStorage.getItem('module') || 'docsnap';
    if (role.name === 'superadmin') sessionStorage.setItem('module', selectedModule);
    const paths = {
        orient: '/agent/run/Document Extractor',
        docsnap: '/docsnap',
        'data-entry': '/data-entry',
        transcription: '/transcription',
        sld: '/sld',
        'document-generation': '/document-generation',
        'ppe-detection': '/ppe-detection',
        'invoice-tracking': '/invoice-tracking',
        'content-creation': '/content-creation',
        tally: '/tally',
        none: '/docsnap'
    };
    return (
        <Suspense fallback={<FullScreenLoader />}>
            <Routes>
                <Route path="agent/*" element={<AgentRoutes />} />
                <Route path="ardex/*" element={<ArdexRoutes />} />
                <Route path="reconcilation/*" element={<ReconcilationRoutes />} />
                <Route path="docsnap/*" element={<DocSnapRoutes />} />
                <Route path="data-entry/*" element={<DocSnapRoutes />} />
                <Route path="sld/*" element={<DocSnapRoutes />} />
                <Route path="invoice-tracking/*" element={<DocSnapRoutes />} />
                <Route path="content-creation/*" element={<DocSnapRoutes />} />
                <Route path="tally/*" element={<DocSnapRoutes />} />
                <Route path="document-generation/*" element={<DocSnapRoutes />} />
                <Route path="user/*" element={<UserRoutes />} />
                <Route path="config/*" element={<ConfigRoutes />} />
                <Route path="/transcription/record/*" element={<MedicalCodeRoutes />} />
                <Route path="/docsnap" element={<DashboardPage module="docsnap" />} />
                <Route path="/invoice-tracking" element={<DashboardPage module="invoice-tracking" />} />
                <Route path="/transcription" element={<DashboardPage module="transcription" />} />
                <Route path="/data-entry" element={<DashboardPage module="data-entry" />} />
                <Route path="/sld" element={<DashboardPage module="sld" />} />
                <Route path="/document-generation/view/:id" element={<DocumentCreationEditor />} />
                <Route path="/document-generation" element={<DashboardPage module="document-generation" />} />
                <Route path="/ppe-detection" element={<DashboardPage module="ppe-detection" />} />
                <Route path="/content-creation/view/:id" element={<ContentCreationEditor />} />
                <Route path="/content-creation" element={<DashboardPage module="content-creation" />} />
                <Route path="/tally" element={<DashboardPage module="tally" />} />
                <Route path="/" element={<Navigate to={paths[module]} replace />} />
                <Route path="*" element={<NotFoundPage />} />
            </Routes>
        </Suspense>
    );
};

export default AuthenticatedRoutes;
