import { useNavigate, useParams } from 'react-router-dom';
import { useViewRecordState } from './viewRecordContext';
import { useToastStore } from '../../../../../components/toast/ToastStore';
import httpRequest from '../../../../../global-utils/httpRequest';
import { fileTypeFromBuffer } from 'file-type';
import { convertPdfToImages, filterExtractedDataForInvoiceGeneration } from '../utils';
import { useS3Storage } from '../../../../../zustand-store/S3Storage';
import { config } from '../../../../../config/default';

export const useViewRecordApi = () => {
    const { state, setState } = useViewRecordState();
    const { id } = useParams();
    const navigate = useNavigate();
    const toast = useToastStore();
    const { getS3File } = useS3Storage();

    // ============================= Get Record By Id ==================================

    const getAndConvertDocumentToImage = async (pdfFileName: string) => {
        setState(prev => ({ ...prev, loadingS3File: true }));
        const s3Response: any = await getS3File(pdfFileName);
        const imageData = s3Response?.Body?.data;
        if (!imageData) {
            toast.error('S3 document not found');
            return;
        }
        const uint8Array = new Uint8Array(imageData);
        const getFileType = await fileTypeFromBuffer(uint8Array);
        let pdfFile: any;
        let imageUrlArray;
        if (getFileType?.mime && getFileType?.mime !== 'application/pdf') {
            pdfFile = await binaryToFile(uint8Array, `image.${getFileType.ext}`, getFileType?.mime);
            imageUrlArray = [URL.createObjectURL(pdfFile).toString()];
        } else {
            pdfFile = await binaryToFile(uint8Array, `document.${getFileType?.ext}`, getFileType?.mime);
            imageUrlArray = await convertPdfToImages(pdfFile);
        }

        setState(prev => ({
            ...prev,
            loadingS3File: false,
            images: imageUrlArray
        }));
    };

    const getRecordApiById = async (id: string) => {
        try {
            setState(prev => ({ ...prev, loadingData: true, loadingS3File: true }));
            const res: any = await httpRequest('GET', `${config.nodeApiUrl}/idp/history/${id}`);
            const objectFields: Record<string, any> = {};
            const arrayFields: Record<string, any>[] = [];
            const tableNames: string[] = [];
            if (res.data.extractedData) {
                const extractedData = JSON.parse(JSON.stringify(res.data.extractedData));
                Object.entries(extractedData).forEach(([key, value]: any) => {
                    if (Array.isArray(value)) {
                        // its array
                        arrayFields.push(value);
                        tableNames.push(key);
                    } else if (typeof value === 'object' && value !== null && value?.value === undefined) {
                        // its object
                        objectFields[key] = value;
                    }
                });
            }
            function removeDuplicates(arr: string[]) {
                return [...new Set(arr)];
            }
            const dataEntryWebImages = removeDuplicates(res.data?.dataEntryWebImages);
            const templateId = res.data?.templateId?._id;
            const templates = sessionStorage.getItem('templates');
            let templateSettings;
            // if (templates) {
            //     const templateData = JSON.parse(templates || '');
            //     const template = templateData?.find((template: any) => template?._id === templateId);
            //     templateSettings = template?.settings;
            // } else {
            const resp = await httpRequest('GET', `${config.nodeApiUrl}/idp/template/${templateId}`);
            templateSettings = resp.data?.settings;
            const templateFields = resp.data?.fields;
            const primaryImage = res.data?.dataEntryImages?.primaryImage;
            const additionalImages = res.data?.dataEntryImages?.additionalImages || [];
            const inputText = res.data?.inputText;
            // }
            setState(prev => ({
                ...prev,
                record: res.data,
                objectFields,
                arrayFields,
                tableNames,
                loadingData: false,
                dataEntryWebImages,
                templateSettings,
                templateFields,
                primaryImage,
                additionalImages,
                inputText
            }));
            if (res.data?.imageFileNames?.length > 0 && sessionStorage.getItem('module') !== 'content-creation') {
                const images = await Promise.all(res.data?.imageFileNames?.map((fileName: string) => getS3File(fileName)));
                setState(prev => ({
                    ...prev,
                    loadingS3File: false,
                    images: images.map((image: any) => URL.createObjectURL(new Blob([new Uint8Array(image.Body.data)], { type: 'image/jpeg' })))
                }));
            } else {
                getAndConvertDocumentToImage(res.data.pdfFileName);
            }
        } catch (error) {
            console.error('error:===========', error);
            toast.error('Failed to get Record');
        } finally {
            setState(prev => ({ ...prev, loadingData: false }));
        }
    };

    const sendMessage = async (message: string) => {
        try {
            const requestBody = { query: message, botName: state.record?.pdfFileName };
            const response: any = await httpRequest('POST', `${config.chatbotServicePython}/v2/query`, requestBody);
            setState(prev => ({
                ...prev,
                chatLoading: false,
                messages: [...prev.messages, { text: response.answer, source: response.source_documents, userMessage: false }]
            }));
        } catch (error) {
            setState(prev => ({
                ...prev,
                chatLoading: false,
                messages: [...prev.messages, { text: 'Something went wrong, Please try again later', userMessage: false }]
            }));
        }
    };
    const sendMessageToNode = async (query: string) => {
        try {
            const requestBody = { query, visionOcrText: state.record?.visionOcrText, chatList: state.messages };
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

    const getFileAsBase64 = async (fileKey: string): Promise<string | null> => {
        try {
            const s3Response: any = await getS3File(fileKey);

            if (!s3Response?.Body?.data) {
                console.error("File not found or invalid response");
                return null;
            }

            // Convert number array to Uint8Array
            const fileDataArray = s3Response.Body.data;
            const fileData = new Uint8Array(fileDataArray);

            // Encode to Base64
            const base64String = btoa(
                fileData.reduce((data, byte) => data + String.fromCharCode(byte), "")
            );

            return base64String; // 👉 returns clean base64 string (no prefix)
        } catch (error) {
            console.error("Error fetching/encoding file:", error);
            return null;
        }
    };

    const getFileAsBase64WithMime = async (fileKey: string): Promise<{ base64: string; mimeType: string } | null> => {
        try {
            const s3Response: any = await getS3File(fileKey);

            if (!s3Response?.Body?.data) {
                console.error("File not found or invalid response");
                return null;
            }

            // Convert number array to Uint8Array
            const fileDataArray = s3Response.Body.data;
            const fileData = new Uint8Array(fileDataArray);

            // Encode to Base64
            const base64String = btoa(
                fileData.reduce((data, byte) => data + String.fromCharCode(byte), "")
            );

            // Guess MIME type from file extension
            const fileName = fileKey.split("/").pop()?.toLowerCase() || "";
            let mimeType = "application/octet-stream";

            if (fileName.endsWith(".pdf")) mimeType = "application/pdf";
            else if (fileName.endsWith(".png")) mimeType = "image/png";
            else if (fileName.endsWith(".jpg") || fileName.endsWith(".jpeg")) mimeType = "image/jpeg";
            else if (fileName.endsWith(".txt")) mimeType = "text/plain";
            else if (fileName.endsWith(".csv")) mimeType = "text/csv";

            return { base64: base64String, mimeType };
        } catch (error) {
            console.error("Error fetching/encoding file:", error);
            return null;
        }
    };



    const submitRecordApi = async () => {
        try {
            const loginUser = JSON.parse(window?.sessionStorage?.getItem('user') || '');
            const selectedTenantName = window?.sessionStorage?.getItem('selectedTenantName') || '';
            const selectedModule = window?.sessionStorage?.getItem('module') || '';

            const payload: any = {
                tenantName: loginUser?.tenant?.name ? loginUser?.tenant?.name : selectedTenantName,
                apiResponse: state?.record?.extractedData,
                recordId: state?.record?._id,
                module: selectedModule,
                extractedData: processArrayFields(),
                name: state?.record?.name
            };

            if (selectedModule !== 'data-entry' && selectedModule !== 'invoice-tracking') {
                const fileData = await getFileAsBase64WithMime(state.record?.pdfFileName);
                payload['fileBase64'] = fileData?.base64;
                payload['fileMimeType'] = fileData?.mimeType;
            }

            if (selectedModule === 'data-entry') {
                payload['arrayFields'] = state.tableNames;
                payload['dataEntryImages'] = {
                    primaryImage: state.primaryImage,
                    additionalImages: state.additionalImages
                };
            }
            setState(prev => ({ ...prev, loadingData: true }));
            const res: any = await httpRequest('POST', `${config.nodeApiUrl}/idp/history/rehab/create`, payload);
            toast.success('Record submitted successfully');
            if (selectedModule === 'data-entry') return;
            navigate('/docsnap/record/list');
        } catch (error: any) {
            console.error('error:===========', error?.message);
            toast.error(error?.message);
            // navigate('/docsnap/record/list');
        } finally {
            setState(prev => ({ ...prev, loadingData: false }));
        }
    };

    const processArrayFields = () => {
        const updatedData = { ...state?.objectFields };


        // Get table names (could be ['line_items', 'specifications'] or other combinations)
        const tableNames = state?.tableNames || [];

        // Process each array field dynamically
        tableNames.forEach((tableName, index) => {
            // Get the corresponding array field by index
            const arrayFieldRecord = state?.arrayFields[index] || {};

            // Convert Record<string, Record<string, { value: string }>> to array of row objects
            const arrayData = Object.values(arrayFieldRecord).map(rowObj => {
                const flatRow = {};
                Object.entries(rowObj).forEach(([col, valObj]: any) => {
                    // Copy all properties (value, page, bbox, confidence, etc.)
                    // @ts-ignore
                    flatRow[col] = { ...valObj };
                });
                return flatRow;
            });

            // Add to updatedData using the dynamic table name
            updatedData[tableName] = arrayData;
        });

        return updatedData;
    };

    const updateRecordApiById = async () => {
        try {
            // Usage in your payload
            const payload = {
                template: state?.record?.templateId,
                extractedData: state?.record?.extractedData,
                metadata: state?.record?.metadata,
                fileName: state?.record?.name,
                dataEntryImages: {
                    primaryImage: state.primaryImage,
                    additionalImages: state.additionalImages
                },
                updatedData: processArrayFields()
            };
            setState(prev => ({ ...prev, loadingData: true, loadingS3File: true }));
            const res: any = await httpRequest('PATCH', `${config.nodeApiUrl}/idp/history/update/${id}`, payload);
            toast.success('Record updated successfully');
            // navigate('/');
        } catch (error) {
            console.error('error:===========', error);
            toast.error('Failed to update Record');
        } finally {
            setState(prev => ({ ...prev, loadingData: false, loadingS3File: false }));
        }
    };
    const updateExtractedData = async (extractedData: any) => {
        try {
            setState(prev => ({ ...prev, loadingData: true, loadingS3File: true }));
            const res: any = await httpRequest('PATCH', `${config.nodeApiUrl}/idp/history/update/${id}`, { extractedData });
            toast.success('Record updated successfully');
        } catch (error) {
            console.error('error:===========', error);
            toast.error('Failed to update Record');
        } finally {
            setState(prev => ({ ...prev, loadingData: false }));
        }
    };
    const generateInvoiceWithAI = async () => {
        try {
            const filteredData = filterExtractedDataForInvoiceGeneration(state.record?.extractedData);
            setState(prev => ({ ...prev, generatingInvoice: true }));
            // test
            const res: any = await httpRequest('POST', `${config.nodeApiUrl}/idp/history/generate-invoice`, {
                purchaseOrder: filteredData
            });
            setState(prev => ({
                ...prev,
                invoiceContent: res.invoice || 'Error generating invoice'
            }));
            toast.success('Invoice generated successfully');
        } catch (error) {
            console.error('error:===========', error);
            toast.error('Failed to generate Invoice');
        } finally {
            setState(prev => ({ ...prev, generatingInvoice: false }));
        }
    };
    const createRequestedNewField = async (description: string) => {
        try {
            const requestBody = {
                description,
                requestType: 'field',
                document: state.record?.templateId._id // TODO: update this
            };
            setState(prev => ({ ...prev, creatingRequest: true }));
            const res: any = await httpRequest('POST', `${config.nodeApiUrl}/idp/request/create`, requestBody);
            toast.success('Request created successfully');
        } catch (error) {
            console.error('error:===========', error);
            toast.error('Failed to create Request');
        } finally {
            setState(prev => ({
                ...prev,
                creatingRequest: false,
                requestNewFieldDialog: false
            }));
        }
    };
    const createComment = async (comment: string, jsonKey: string) => {
        try {
            const requestBody = {
                jsonKey,
                comment,
                templateId: state.record?.templateId._id
            };
            setState(prev => ({ ...prev, creatingRequest: true }));
            const res: any = await httpRequest('POST', `${config.nodeApiUrl}/idp/comment/create`, requestBody);

            toast.success('Comment created successfully');
        } catch (error) {
            console.error('error:===========', error);
            toast.error('Failed to create Comment');
        } finally {
            setState(prev => ({ ...prev, creatingRequest: false }));
            return true;
        }
    };
    const sendRegenerateMessage = async (data: any) => {
        try {
            const res = await httpRequest('POST', `${config.mlServiceNodejs}/data-entry/regenerate-description`, data);
            return res;
        } catch (error) {
            console.error('error:===========', error);
            toast.error('Failed to regenerate description');
            return null;
        } finally {
            setState(prev => ({ ...prev }));
        }
    };
    const sendContentCreationContext = async (data: any) => {
        try {
            const res = httpRequest('POST', `${config.mlServiceNodejs}/docsnap/content-creation`, data);
            return res;
        } catch (error) {
            console.error('error:===========', error);
            toast.error('Failed to create Comment');
        } finally {
            setState(prev => ({ ...prev }));
        }
    };
    const reExtractDocument = async (formData: FormData) => {
        try {
            setState(prev => ({ ...prev, reExtracting: true }));

            const sessionStorageAccessToken = window?.sessionStorage?.getItem('accessToken') || '';
            const selectedTenant = window?.sessionStorage?.getItem('selectedTenant') || '';
            const selectedModule = window?.sessionStorage?.getItem('module') || '';
            const selectedRole = window?.sessionStorage?.getItem('selectedRole') || '';
            const user: any = JSON.parse(window?.sessionStorage?.getItem('user') || '{}');

            const headers: HeadersInit = {
                tenantid: selectedTenant ? selectedTenant : user?.tenant?._id,
                roleid: selectedRole ? selectedRole : user?.role?._id,
                module: selectedModule
            };

            if (sessionStorageAccessToken) {
                headers.authorization = `Bearer ${JSON.parse(sessionStorageAccessToken)}`;
            }

            const response = await fetch(`${config.mlServiceNodejs}/docsnap/extract-document`, {
                method: 'POST',
                headers,
                body: formData
            });

            if (!response.body) {
                throw new Error('No response body');
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder('utf-8');
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (!line.trim() || !line.startsWith('data: ')) continue;

                    try {
                        const jsonString = line.substring(6);
                        if (!jsonString.trim()) continue;

                        const parsed = JSON.parse(jsonString);

                        switch (parsed.status) {
                            case 'completed':
                                setState(prev => ({ ...prev, reExtracting: false }));
                                await getRecordApiById(id!);
                                return;

                            case 'failed':
                            case 'error':
                                toast.error(parsed.message || 'Document re-extraction failed');
                                setState(prev => ({ ...prev, reExtracting: false }));
                                return;
                        }
                    } catch (parseError) {
                        console.warn('Failed to parse SSE message:', parseError, 'Line:', line);
                        continue;
                    }
                }
            }

            setState(prev => ({ ...prev, reExtracting: false }));
        } catch (error) {
            console.error('error:===========', error);
            toast.error('Failed to re-extract document');
            setState(prev => ({ ...prev, reExtracting: false }));
        }
    };

    return {
        getRecordApiById,
        sendMessage,
        updateRecordApiById,
        submitRecordApi,
        updateExtractedData,
        generateInvoiceWithAI,
        createRequestedNewField,
        createComment,
        sendMessageToNode,
        sendRegenerateMessage,
        sendContentCreationContext,
        reExtractDocument,
        processArrayFields,
    };
};

export const binaryToFile = async (binaryData: Uint8Array, fileName: string, mimeType: string = 'application/pdf'): Promise<File> => {
    // @ts-ignore
    const blob = new Blob([binaryData], { type: mimeType });
    return new File([blob], fileName, { type: mimeType });
};
