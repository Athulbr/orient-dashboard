import { lazy } from 'react';
import { Route, Routes, useNavigate } from 'react-router-dom';
import PageContainer from '../../../components/PageContainer';
import PageNameComponent from '../../../components/PageName';
import { NotFoundPage } from '../../not-found-routes/GlobalNotFoundPage';
import { cn } from '../../../global-utils/twMerge';
import { usePermissionStore } from '../../../zustand-store/PermissionStore';
import {
    ChevronDown,
    ChevronRight,
    Users,
    ShieldCheck,
    Package,
    Star,
    UserRoundCheck,
    Receipt,
    CalendarCheck,
    Component as ComponentIcon,
    BookText,
    Sheet,
    Book,
    MessageSquareText,
    SquareTerminal,
    Upload
} from 'lucide-react';

// Lazy imports for all pages
const UpdatedFieldsListPage = lazy(() => import('../../../modules/docsnap/prompt-tuning'));
const FormbuilderRoutes = lazy(() => import('./FormbuilderRoutes'));
const ListRolePage = lazy(() => import('../../../modules/config/role'));
const ListModulePage = lazy(() => import('../../../modules/config/module'));
const ListFeaturePage = lazy(() => import('../../../modules/config/feature'));
const ListSubscriptionModelPage = lazy(() => import('../../../modules/config/subscriptionModel'));
const ListTablebuilderPage = lazy(() => import('../../../modules/config/tablebuilder'));
const ListTenantPage = lazy(() => import('../../../modules/config/tenant'));
const ListCommentPage = lazy(() => import('../../../modules/docsnap/comment/ListCommentPage'));
const ListUserPage = lazy(() => import('../../../modules/config/user/list-user'));

const ConfigRoutes = () => {
    const navigate = useNavigate();

    return (
        <PageContainer className="py-4">
            <PageNameComponent className="p-4 pt-0" customGoBackFunction={() => navigate('/')} name="Settings" showBackButton />
            <div className="flex w-full flex-1 overflow-hidden">
                <NavigationComponent />
                <div className="flex flex-1 flex-col gap-4 overflow-y-auto border-t pt-2 pr-6 pl-4">
                    <Routes>
                        <Route path="role/list" element={<ListRolePage />} />
                        <Route path="subscription-model/list" element={<ListSubscriptionModelPage />} />
                        <Route path="feature/list" element={<ListFeaturePage />} />
                        <Route path="tenant/list" element={<ListTenantPage />} />
                        <Route path="module/list" element={<ListModulePage />} />
                        <Route path="formbuilder/*" element={<FormbuilderRoutes />} />
                        <Route path="tablebuilder/list" element={<ListTablebuilderPage />} />
                        <Route path="exportbuilder/list" element={<ListExportbuilderPage />} />
                        <Route path="exportbuilder/quick-report" element={<ExportQuickReportPage />} />
                        <Route path="prompt-tuning" element={<UpdatedFieldsListPage />} />
                        <Route path="user/list" element={<ListUserPage />} />
                        <Route path="comment/*" element={<ListCommentPage />} />
                        <Route path="makez-agent/list" element={<ListMakezAgentPage />} />
                        {/* <Route path="transcript" element={<TranscriptionPage />} /> */}
                        <Route path="*" element={<NotFoundPage />} />
                    </Routes>
                </div>
            </div>
        </PageContainer>
    );
};

export default ConfigRoutes;

import { FC, useState } from 'react';
import { useLocation } from 'react-router-dom';
import FullScreenLoader from '../../../components/FullScreenLoader';
import ListExportbuilderPage from '../../../modules/config/exportbuilder';
import ExportQuickReportPage from '../../../modules/config/exportbuilder/quick-report';
import ListMakezAgentPage from '../../../modules/config/makez-agent';

const NavigationComponent: FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
    const { settings } = usePermissionStore();

    const toggleGroup = (groupName: string) => {
        setCollapsedGroups(prev => ({
            ...prev,
            [groupName]: !prev[groupName]
        }));
    };

    if (settings.length === 0) return <FullScreenLoader />;

    return (
        <div className="w-64 overflow-y-auto border">
            {settings.map(group => (
                <div key={group.name}>
                    <div
                        className="flex cursor-pointer items-center justify-between border-b bg-gray-100 py-5 pr-4 pl-6 text-sm font-medium text-gray-700 transition-colors duration-200 hover:bg-gray-100"
                        onClick={() => toggleGroup(group.name)}
                    >
                        <div className="flex items-center gap-3">
                            {getIcon(group.iconName)}
                            {group.name}
                        </div>
                        {collapsedGroups[group.name] ? <ChevronRight strokeWidth={1.5} size={16} /> : <ChevronDown strokeWidth={1.5} size={16} />}
                    </div>
                    {!collapsedGroups[group.name] &&
                        group.items.map(item => {
                            const isActive = location.pathname.includes(item.key);
                            return (
                                <div
                                    key={item.key}
                                    className={cn(
                                        'flex cursor-pointer items-center gap-3 border-b py-5 pl-12 text-sm text-gray-600 transition-colors duration-200 hover:bg-sky-50 hover:text-sky-500',
                                        isActive ? 'bg-sky-50 text-sky-500' : ''
                                    )}
                                    onClick={() => navigate(item.path)}
                                >
                                    {getIcon(item.iconName)}
                                    {item.name}
                                </div>
                            );
                        })}
                </div>
            ))}
        </div>
    );
};

const getIcon = (iconName: string) => {
    switch (iconName) {
        case 'Users':
            return <Users strokeWidth={1.5} size={18} />;
        case 'ShieldCheck':
            return <ShieldCheck strokeWidth={1.5} size={18} />;
        case 'Package':
            return <Package strokeWidth={1.5} size={18} />;
        case 'Star':
            return <Star strokeWidth={1.5} size={18} />;
        case 'UserRoundCheck':
            return <UserRoundCheck strokeWidth={1.5} size={18} />;
        case 'Receipt':
            return <Receipt strokeWidth={1.5} size={18} />;
        case 'CalendarCheck':
            return <CalendarCheck strokeWidth={1.5} size={18} />;
        case 'Component':
            return <ComponentIcon strokeWidth={1.5} size={18} />;
        case 'BookText':
            return <BookText strokeWidth={1.5} size={18} />;
        case 'Sheet':
            return <Sheet strokeWidth={1.5} size={18} />;
        case 'Book':
            return <Book strokeWidth={1.5} size={18} />;
        case 'MessageSquareText':
            return <MessageSquareText strokeWidth={1.5} size={18} />;
        case 'SquareTerminal':
            return <SquareTerminal strokeWidth={1.5} size={18} />;
        case 'Upload':
            return <Upload strokeWidth={1.5} size={18} />;
        default:
            return null;
    }
};
