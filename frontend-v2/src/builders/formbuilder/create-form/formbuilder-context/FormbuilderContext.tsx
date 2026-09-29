// FormBuilderProvider.tsx
import React, { createContext, useState, ReactNode } from 'react';
import { FieldIF, FormBuilderContextType, FormSettingsIF } from '../../interface';
import { httpAiRequest } from '../../utils/functions/httpAiRequest';
import { useNavigate, useParams } from 'react-router-dom';
import { useToastStore } from '../../../../components/toast/ToastStore';
import httpRequest from '../../../../global-utils/httpRequest';
import { config } from '../../../../config/default';

const FormBuilderContext = createContext<FormBuilderContextType | undefined>(undefined);

export const FormBuilderProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [showInputType, setShowInputType] = useState(false);
    const [showChatbot, setShowChatbot] = useState(false);
    const [showFieldInputError, setShowFieldInputError] = useState(false);
    const [showSettings, setShowSettings] = useState(-1);
    const [fields, setFields] = useState<FieldIF[]>([]);
    const [formSettings, setFormSettings] = useState<FormSettingsIF>({
        columns: 1
    });
    const toast = useToastStore();

    const createForm = async (name: string) => {
        try {
            setLoading(true);
            if (!name) {
                toast.error('Form name is required');
                return;
            }
            await httpAiRequest('POST', `${config.nodeApiUrl}/builder/formbuilder`, {
                name,
                fields,
                settings: formSettings
            });
            toast.success('Formbuilder updated successfully');
            navigate('/config/formbuilder/list');
            return true;
        } catch (error) {
            console.error(error);
            toast.error('Formbuilder update failed');
            return false;
        } finally {
            setLoading(false);
        }
    };
    const updateForm = async (name: string) => {
        try {
            setLoading(true);

            await httpAiRequest('PUT', `${config.nodeApiUrl}/builder/formbuilder/${id}`, {
                name,
                fields,
                settings: formSettings
            });

            const formbuilderesponse = await httpRequest('POST', `${config.nodeApiUrl}/builder/formbuilder/query`, { pageSize: 1000 });
            window?.sessionStorage?.setItem('formbuilder', JSON.stringify(formbuilderesponse?.data));
            toast.success('Formbuilder updated successfully');
            navigate('/config/formbuilder/list');
            return true;
        } catch (error) {
            console.error(error);
            toast.error('Formbuilder update failed');
            return false;
        } finally {
            setLoading(false);
        }
    };
    const getFormbuilderByIdApi = async () => {
        try {
            setLoading(true);
            const res = await httpAiRequest('GET', `${config.nodeApiUrl}/builder/formbuilder/${id}`);
            setFields(res?.data.fields);
            setFormSettings(res?.data.settings);
            return res?.data?.name;
        } catch (error) {
            console.error(error);
            toast.error('Formbuilder update failed');
            return '';
        } finally {
            setLoading(false);
        }
    };

    const contextValue: FormBuilderContextType = {
        loading,
        showInputType,
        setShowInputType,
        showSettings,
        setShowSettings,
        fields,
        setFields,
        showChatbot,
        setShowChatbot,
        showFieldInputError,
        setShowFieldInputError,
        formSettings,
        setFormSettings,
        createForm,
        updateForm,
        getFormbuilderByIdApi
    };

    return <FormBuilderContext.Provider value={contextValue}>{children}</FormBuilderContext.Provider>;
};

export { FormBuilderContext };
