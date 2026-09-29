import { useToastStore } from '../../../components/toast/ToastStore';
import httpRequest from '../../../global-utils/httpRequest';
import { useDashboardState } from './dashboardContext';
import { config } from '../../../config/default';

export const useDashboardApi = () => {
    const { setState } = useDashboardState();
    const toast = useToastStore();

    // ============================= CREATE DASHBOARD ==================================

    const getRecordsApi = async () => {
        try {
            const module = sessionStorage.getItem('module');
            setState(prev => ({ ...prev, loadingRecords: true }));
            const res: any = await httpRequest('POST', `${config.nodeApiUrl}/idp/history`, { pageSize: 10, filters: { deleted: false }, module });
            setState(prev => ({ ...prev, loadingRecords: false, records: res.data }));
            window?.sessionStorage?.setItem('recordIdList', JSON.stringify(res.data.map((item: any) => item._id)));
            return true;
        } catch (error) {
            toast.error('Failed to fetch record');
        }
    };
    const getStatusCountApi = async () => {
        try {
            // if (!checkPermission('read:record')) return;
            setState(prev => ({ ...prev, loadingStatusCounts: true }));
            const res: any = await httpRequest('GET', `${config.nodeApiUrl}/idp/history/status/count`);
            setState(prev => ({ ...prev, loadingStatusCounts: false, statusCounts: { ...res.data[0], total: res.total } }));
        } catch (error) {
            toast.error('Failed to fetch record');
        }
    };
    const getPredefinedTemplatesApi = async () => {
        try {
            // if (!checkPermission('read:template')) return;
            setState(prev => ({ ...prev, loadingPredefinedTemplates: true }));
            const predefinedTemplates = sessionStorage.getItem('predefinedTemplates');
            setState(prev => ({ ...prev, loadingPredefinedTemplates: false, predefinedTemplates: JSON.parse(predefinedTemplates || '[]') }));
            return true;
        } catch (error) {
            toast.error('Failed to fetch predefined template list');
        }
    };
    const filterTemplatesByTenant = (templates: any) => {
        const selectedTenantFromSessionStorage = window?.sessionStorage?.getItem('selectedTenant') || 'all';
        return templates.filter((template: any) =>
            selectedTenantFromSessionStorage === 'all' ? true : template.tenantId === selectedTenantFromSessionStorage
        );
    };
    const filterTemplatesByModule = (templates: any, module?: string) => {
        const selectedModule = module || 'docsnap';
        return templates.filter((template: any) => template.settings?.module === selectedModule);
    };
    const sortTemplatesByRecentlyUsed = (templates: any) => {
        const arrayOfRecentlyUsedTemplates = JSON.parse(localStorage.getItem('recentlyUsedTemplates') || '[]');
        const templatesCopy = [...templates];
        const finalTemplates: any = [];
        arrayOfRecentlyUsedTemplates.forEach((id: any) => {
            const template = templatesCopy.find((template: any) => template._id === id);
            if (template) {
                finalTemplates.push(template);
            }
        });
        const remainingTemplates = templatesCopy.filter((template: any) => !arrayOfRecentlyUsedTemplates.includes(template._id));
        return [...finalTemplates, ...remainingTemplates];
    };
    const getTemplatesApi = async (module?: string) => {
        try {
            setState(prev => ({ ...prev, loadingTemplates: true }));
            const parsedTemplates = JSON.parse(sessionStorage.getItem('templates') || '[]');
            const filteredTemplatesByTenant = filterTemplatesByTenant(parsedTemplates);
            const filteredTemplatesByModule = filterTemplatesByModule(filteredTemplatesByTenant, module);
            const sortedTemplates = sortTemplatesByRecentlyUsed(filteredTemplatesByModule);

            setState(prev => ({
                ...prev,
                loadingTemplates: false,
                templates: sortedTemplates,
                totalTemplates: sortedTemplates.length
            }));
            return true;
        } catch (error) {
            toast.error('Failed to fetch template list');
        }
    };

    return { getRecordsApi, getStatusCountApi, getPredefinedTemplatesApi, getTemplatesApi };
};
