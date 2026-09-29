import { useParams } from 'react-router-dom';
import { useListRecordPageState } from './listRecordPageContext';
import { useToastStore } from '../../../../components/toast/ToastStore';
import httpRequest from '../../../../global-utils/httpRequest';
import httpUploadRequest from '../../../../global-utils/httpUploadRequest';
import { config } from '../../../../config/default';

export const useListRecordApi = () => {
    const { id } = useParams();
    const toast = useToastStore();
    const { state, setState } = useListRecordPageState();

    // ============================= CREATE ==================================

    const createRecordApi = async (requestBody: any) => {
        try {
            const res = await httpRequest('POST', `${config.nodeApiUrl}/idp/transcript/create`, requestBody);
            toast.success('Record created successfully');
            return res;
        } catch (error) {
            toast.error('Failed to Create record');
        }
    };
    const updateRecordApi = async (requestBody: any, id: string) => {
        try {
            const res = await httpRequest('PATCH', `${config.nodeApiUrl}/idp/transcript/update/${id}`, requestBody);
            toast.success('Record updated successfully');
        } catch (error) {
            toast.error('Failed to update record');
        }
    };
    const deleteRecordApi = async (id: string) => {
        try {
            const res = await httpRequest('DELETE', `${config.nodeApiUrl}/idp/transcript/delete/${id}`);
            setState(prev => ({ ...prev, refresh: prev.refresh + 1 }));
            toast.success('Record deleted successfully');
        } catch (error) {
            toast.error('Failed to delete record');
        }
    };

    const uploadFilesToAwsS3 = async (file: File) => {
        try {
            setState(prev => ({ ...prev, processing: true, uploading: true }));

            const res = await httpUploadRequest(`${config.nodeApiUrl}/idp/document/upload`, file);
            setState(prev => ({ ...prev, uploading: false, uploadDone: true, analyzing: true }));

            return { s3FileName: res.data.fileName, s3FileType: res.data.fileType, url: res.data.url };
        } catch (error) {
            setState(prev => ({ ...prev, processing: false }));
            return null;
        }
    };

    const trainChatWithDocumentEngine = async (s3fileName: string, s3Url: string) => {
        try {
            const response = await fetch(`${config.chatbotServicePython}/upload`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    source: [
                        {
                            name: s3fileName,
                            fileType: 'application/pdf',
                            url: s3Url,
                            active: true
                        }
                    ],
                    botName: s3fileName || 'Testbot'
                })
            });

            // Check if the response is ok
            if (!response.ok) {
                toast.error(`HTTP error! status: ${response.status}`);
                return null;
            }

            const reader = response.body?.getReader();
            if (!reader) {
                toast.error('Error in training the bot - no response body');
                return null;
            }

            const decoder = new TextDecoder();
            let hasError = false;

            try {
                while (true) {
                    const { value, done } = await reader.read();

                    if (done) {
                        if (!hasError) {
                            toast.success('Document Bot trained successfully');
                        }
                        break;
                    }
                }
            } catch (streamError) {
                console.error('Stream reading error:', streamError);
                hasError = true;
            } finally {
                reader.releaseLock();
            }
        } catch (error) {
            console.error('Training error:', error);
            return null;
        }
    };

    return { createRecordApi, updateRecordApi, deleteRecordApi, uploadFilesToAwsS3, trainChatWithDocumentEngine };
};
