import { useParams } from 'react-router-dom';
import httpRequest from '../../render-tablebuilder/utils/HttpRequest';
import { useTablebuilderSettings } from './useTablebuilderSettingsContext';
import { useToastStore } from '../../../../components/toast/ToastStore';
import { config } from '../../../../config/default';

export const useFetchCreateTB = () => {
    const { settings, setSettings, builder, setBuilder } = useTablebuilderSettings();
    const toast = useToastStore();

    // ============================= CREATE ==================================

    const createTablebuilderApi = async () => {
        setBuilder(prev => ({ ...prev, loading: true }));
        const tableName = prompt('Please enter table name', '');
        try {
            const res = await httpRequest('POST', `${config.nodeApiUrl}/builder/tablebuilder`, {
                name: tableName,
                settings,
                description: 'tablebuilder description'
            });
            toast.success('Tablebuilder Created Successfully');
        } catch (error) {
            console.error('error:===========', error);
            toast.error('Failed to Create Tablebuilder');
        } finally {
            setBuilder(prev => ({ ...prev, loading: false }));
        }
    };

    // ============================== UPDATE =================================

    const updateTablebuilderApi = async (id: string) => {
        setBuilder(prev => ({ ...prev, loading: true }));
        try {
            const res = await httpRequest('PUT', `${config.nodeApiUrl}/builder/tablebuilder/${id}`, {
                name: builder.name,
                settings,
                description: 'tablebuilder description'
            });
            const tablebuilderesponse = await httpRequest('POST', `${config.nodeApiUrl}/builder/tablebuilder/query`, { pageSize: 1000 });
            window?.sessionStorage?.setItem('tablebuilder', JSON.stringify(tablebuilderesponse?.data));
            toast.success('Tablebuilder Updated Successfully');
        } catch (error) {
            console.error('error:===========', error);
            toast.error('Failed to Update Tablebuilder');
        } finally {
            setBuilder(prev => ({ ...prev, loading: false }));
        }
    };

    // ============================= GET ==================================

    const getTablebuilderByIdApi = async (id: string) => {
        try {
            const res = await httpRequest('GET', `${config.nodeApiUrl}/builder/tablebuilder/${id}`);
            setSettings(res.data.settings);
            setBuilder(prev => ({ ...prev, name: res.data.name }));
            toast.success('Fetched Tablebuilder List Successfully');
        } catch (error) {
            toast.error('Failed to Fetch Tablebuilder List');
            console.error('error:===========', error);
        }
    };

    // ===============================================================

    //   const generateTablebuilderWithAiApi = async () => {
    //     if (!input) return;
    //     setLoading(true);
    //     try {
    //       const response = await httpRequest('POST', '${config.nodeApiUrl}/generate-table-settings', { prompt });
    //       const parsedJson: any = safeJsonParse(response.data);

    //       if (!parsedJson) {
    //         throw new Error('Failed to parse AI response');
    //       }
    //       const finalData: TablebuilderSettingsIF = parsedJson;
    //       setSettings(finalData);
    //     } catch (error) {
    //       console.error('Error in sendPrompt:', error);
    //     } finally {
    //       setLoading(false);
    //     }
    //   };
    return { createTablebuilderApi, getTablebuilderByIdApi, updateTablebuilderApi };
};
