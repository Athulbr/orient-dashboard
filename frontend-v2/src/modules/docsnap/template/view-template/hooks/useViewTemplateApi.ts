import { useToastStore } from '../../../../../components/toast/ToastStore';
import { config } from '../../../../../config/default';
import httpRequest from '../../../../../global-utils/httpRequest';
import { useViewTemplateState } from './viewTemplateContext';

export const useViewTemplateApi = () => {
    const { state, setState } = useViewTemplateState();
    const toast = useToastStore();

    // ============================= CREATE TEMPLATE ==================================

    const getTemplatesApi = async () => {
        try {
            setState(prev => ({ ...prev, loadingTemplates: true }));
            const res: any = await httpRequest('POST', `${config.nodeApiUrl}/idp/template`, { pageSize: 100 });
            setState(prev => ({ ...prev }));
            return true;
        } catch (error) {
            console.error('error:===========', error);
            toast.error('Failed to fetch template list');
        }
    };
    const getTemplateByIdApi = async (id: string) => {
        try {
            setState(prev => ({ ...prev, loadingTemplate: true }));
            const res: any = await httpRequest('GET', `${config.nodeApiUrl}/idp/template/${id}`);
            setState(prev => ({ ...prev, templateFields: res.data?.fields, template: res.data, loadingTemplate: false }));
            return res.data;
        } catch (error) {
            console.error('error:===========', error);
            toast.error('Failed to fetch template');
        }
    };

    const updateTemplateApi = async (requestBody: any) => {
        try {
            const res = await httpRequest('POST', `${config.nodeApiUrl}/idp/template/update/`, requestBody);
            setState(prev => ({ ...prev, showCreateDialog: false, id: '' }));
            toast.success('Template updated successfully');
            return true;
        } catch (error) {
            console.error('error:===========', error);
            toast.error('Failed to update Template');
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

    return { updateTemplateApi, getTemplateByIdApi, deleteTemplateApi, getTemplatesApi };
};
