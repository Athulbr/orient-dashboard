import { template } from 'lodash';
import { useToastStore } from '../../../../components/toast/ToastStore';
import httpRequest from '../../../../global-utils/httpRequest';
import { useDocumentCreationEditorState } from './DocumentCreationEditorContext';
import { config } from '../../../../config/default';

export const useDocumentCreationEditorApi = () => {
    const { state, setState } = useDocumentCreationEditorState();
    const toast = useToastStore();

    const getRecordByIdApi = async (id: string) => {
        try {
            setState(prev => ({ ...prev, loadingTemplate: true }));
            const response: any = await httpRequest('GET', `${config.nodeApiUrl}/idp/history/${id}`);
            const res: any = await httpRequest('GET', `${config.nodeApiUrl}/idp/template/${response.data?.templateId?._id}`);

            const values: any = {};
            res.data?.fields?.forEach((field: any) => {
                field?.subFields?.forEach((subField: any) => {
                    values[subField.jsonKey] = '_______________';
                });
            });
            setState(prev => ({
                ...prev,
                template: res.data,
                loadingTemplate: false,
                formFields: res.data?.fields,
                formValues: values,
                documentText: res.data?.documentText,
                record: response.data
            }));
            return res.data;
        } catch (error) {
            console.error('error:===========', error);
            toast.error('Failed to fetch template');
        }
    };
    const sendMessageToNode = async (query: string) => {
        try {
            const knowledgeBaseString = state.knowledgeBase
                .map((document, index) => {
                    const fileName = document.fileName || document.name || 'Unknown';
                    const text = document.documentText?.join(' ') || '';
                    return `Document ${index + 1}:\nFile Name: ${fileName}\nContent:\n${text}`;
                })
                .join('\n\n---\n\n');
            const requestBody = { query, visionOcrText: [knowledgeBaseString], chatList: state.messages };
            const response: any = await httpRequest('POST', `${config.mlServiceNodejs}/docsnap/chat-with-document`, requestBody);
            setState(prev => ({
                ...prev,
                chatLoading: false,
                messages: [...prev.messages, { text: response.data.answer, userMessage: false }]
            }));
        } catch (error) {
            setState(prev => ({
                ...prev,
                chatLoading: false,
                messages: [...prev.messages, { text: 'Something went wrong, Please try again later', userMessage: false }]
            }));
        }
    };
    const fillFormFieldsWithAI = async () => {
        try {
            const requestBody = { knowledgeBase: state.knowledgeBase, formFields: state.formFields };
            const response: any = await httpRequest('POST', `${config.mlServiceNodejs}/document-generation/fill-form-fields`, requestBody);
            setState(prev => ({ ...prev, formData: { ...prev.formData, ...response.data } }));
        } catch (error) {
            console.error('error:===========', error);
        } finally {
            setState(prev => ({ ...prev, applyingKnowledgeBase: false }));
        }
    };

    return { getRecordByIdApi, sendMessageToNode, fillFormFieldsWithAI };
};
