import { useToastStore } from '../../../../../components/toast/ToastStore';
import { config } from '../../../../../config/default';
import httpRequest from '../../../../../global-utils/httpRequest';
import { useTemplateState } from './templateContext';

export const useListTemplatePageApi = () => {
    const { state, setState } = useTemplateState();
    const toast = useToastStore();

    const filterTemplatesByTenant = (templates: any) => {
        const selectedTenantFromSessionStorage = window?.sessionStorage?.getItem('selectedTenant') || 'all';
        return templates.filter((template: any) =>
            selectedTenantFromSessionStorage === 'all' ? true : template.tenantId === selectedTenantFromSessionStorage
        );
    };

    const filterTemplatesByModule = (templates: any) => {
        const debug = window?.sessionStorage?.getItem('debug');
        const selectedModuleFromSessionStorage = window?.sessionStorage?.getItem('module') || 'docsnap';
        return templates.filter((template: any) => template?.settings?.module === selectedModuleFromSessionStorage);
    };

    const filterTemplatesBySearchText = (templates: any) => {
        return templates.filter((template: any) => template?.name?.toLowerCase().includes(state.searchText.toLowerCase()));
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

    const getTemplatesApi = async () => {
        try {
            setState(prev => ({ ...prev, loadingTemplates: true }));
            const parsedTemplates = JSON.parse(sessionStorage.getItem('templates') || '[]');
            const filteredTemplatesByTenant = filterTemplatesByTenant(parsedTemplates);
            const filteredTemplatesByModule = filterTemplatesByModule(filteredTemplatesByTenant);
            const filteredTemplatesBySearchText = sessionStorage.getItem('debug') === 'true' ? filterTemplatesBySearchText(filteredTemplatesByTenant) : filterTemplatesBySearchText(filteredTemplatesByModule);
            const sortedTemplates = sortTemplatesByRecentlyUsed(filteredTemplatesBySearchText);
            setState(prev => ({ ...prev, loadingTemplates: false, templates: sortedTemplates }));
            return true;
        } catch (error) {
            console.error('error:===========', error);
            toast.error('Failed to fetch template list');
        }
    };
    const getPredefinedTemplatesApi = async () => {
        try {
            setState(prev => ({ ...prev, loadingPredefinedTemplates: true }));
            const predefinedTemplates = sessionStorage.getItem('predefinedTemplates');
            setState(prev => ({ ...prev, loadingPredefinedTemplates: false, predefinedTemplates: JSON.parse(predefinedTemplates || '[]') }));
            return true;
        } catch (error) {
            console.error('error:===========', error);
            toast.error('Failed to fetch predefined template list');
        }
    };
    const getTemplateApi = async (id: string) => {
        try {
            setState(prev => ({ ...prev, loadingTemplate: true }));
            const res: any = await httpRequest('GET', `${config.nodeApiUrl}/idp/template/${id}`);
            setState(prev => ({ ...prev, loadingTemplate: false }));
            toast.success('Template fetched successfully');
            return res.data;
        } catch (error) {
            console.error('error:===========', error);
            toast.error('Failed to fetch template');
        }
    };
    const updateTemplateApi = async (requestBody: any) => {
        try {
            const res = await httpRequest('POST', `${config.nodeApiUrl}/idp/template/update/${state.id}`, requestBody);
            setState(prev => ({ ...prev, id: '' }));
            toast.success('Template updated successfully');
            return true;
        } catch (error) {
            console.error('error:===========', error);
            toast.error('Failed to update Template');
        } finally {
            setState(prev => ({ ...prev, loadingCreateTemplate: false, showCreateDialog: false }));
        }
    };
    const deleteTemplateApi = async (id: string) => {
        try {
            const res = await httpRequest('DELETE', `${config.nodeApiUrl}/idp/template/delete/${id}`);
            setState(prev => ({ ...prev, showCreateDialog: false, id: '' }));
            toast.success('Template deleted successfully');
            return true;
        } catch (error) {
            console.error('error:===========', error);
            toast.error('Failed to delete Template');
        }
    };
    const importTemplateApi = async (requestBody: any) => {
        // Store current tenant to restore later
        const currentTenant = window?.sessionStorage?.getItem('selectedTenant');
        try {
            setState(prev => ({ ...prev, importingTemplate: true }));
            const res = await httpRequest('POST', `${config.nodeApiUrl}/idp/template/create`, requestBody);
            setState(prev => ({ ...prev, showImportTemplateDialog: false, importingTemplate: false }));

            // Bypass: Temporarily remove selectedTenant to fetch ALL templates
            window?.sessionStorage?.removeItem('selectedTenant');

            const resp = await httpRequest('POST', `${config.nodeApiUrl}/idp/template`, {
                pageSize: 1000,
                custom: true,
                filters: { deleted: false }
            });

            // Restore selectedTenant after fetching
            if (currentTenant) {
                window?.sessionStorage?.setItem('selectedTenant', currentTenant);
            }

            window?.sessionStorage?.setItem('templates', JSON.stringify(resp?.data));
            toast.success('Template created successfully');
            window.location.reload();
            return true;
        } catch (error) {
            console.error('error:===========', error);
            toast.error('Failed to create template');

            // Restore selectedTenant in case of error
            if (currentTenant) {
                window?.sessionStorage?.setItem('selectedTenant', currentTenant);
            }
        }
    };

    return { updateTemplateApi, getTemplateApi, deleteTemplateApi, getTemplatesApi, getPredefinedTemplatesApi, importTemplateApi };
};
