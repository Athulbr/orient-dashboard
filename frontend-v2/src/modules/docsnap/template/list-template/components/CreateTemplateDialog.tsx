import { Search, CircleChevronRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import httpRequest from '../../../../../global-utils/httpRequest';
import { DialogComponent } from '../../../../../components/DialogComponent';
import { useNavigate } from 'react-router-dom';
import DragAndDropFileInput from '../../../../../components/DragAndDropFileInput';
import httpUploadRequest from '../../../../../global-utils/httpUploadRequest';
import FullScreenLoader from '../../../../../components/FullScreenLoader';
import { config } from '../../../../../config/default';
import { useToastStore } from '../../../../../components/toast/ToastStore';

export const CreateTemplateComponent = ({ state, setState }: any) => {
    const [selectedTemplateName, setSelectedTemplateName] = useState('');
    const navigate = useNavigate();
    const [selectedTemplate, setSelectedTemplate] = useState<any>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [error, setError] = useState('');
    const [showFileUploadUI, setShowFileUploadUI] = useState(false);
    const selectedModule = sessionStorage.getItem('module');
    const toast = useToastStore();

    useEffect(() => {
        const module = sessionStorage.getItem('module');
        if (module === 'document-generation') {
            setShowFileUploadUI(true);
            setSelectedTemplateName('');
        }
    }, [state.showCreateTemplateDialog]);

    const handleSubmit = async () => {
        if (showFileUploadUI) return;

        const templatesSearchList = state.templates || [];
        const template = templatesSearchList.find((template: any) => template?.name?.toLowerCase() === selectedTemplateName.toLowerCase());
        if (template) {
            setError('Template name already exists, Please choose any other name');
            return;
        }
        if (!selectedTemplateName.trim()) {
            setError('Template name is required');
            return;
        }

        const templateIdPayload = selectedModule === 'content-creation' ? {} : { templateId: selectedTemplate?._id };

        const contentCreationFields = selectedModule === 'content-creation' ? {
            fields: [
                {
                    name: 'Article Information',
                    dataType: 'dict',
                    jsonKey: 'article_information',
                    excludeExtraction: false,
                    description: 'article information',
                    instruction: 'Extract bibliographic and publication metadata typically found in the article header or information panel. Look for structured publication details, author information, and article identifiers.',
                    isHidden: false,
                    subFields: [
                        {
                            name: 'Title',
                            dataType: 'str',
                            jsonKey: 'title',
                            regenerateFieldValueWithAI: false,
                            required: false,
                            excludeExtraction: false,
                            description: 'title',
                            instruction: "Extract the main article title, usually displayed prominently at the top of the document. Look for the largest text element in the header section that describes the article's subject matter.",
                            showTextarea: false,
                            isHidden: false,
                            _id: '696466e51b56e80591979ff7'
                        }
                    ],
                    _id: '696466e51b56e80591979ff6'
                }
            ]
        } : {};

        const requestBody = {
            name: selectedTemplateName,
            ...templateIdPayload,
            ...contentCreationFields,
            settings: {
                module: selectedModule || 'docsnap',
                primaryLLMProvider: 'azure',
                secondaryLLMProvider: 'claude',
                primaryLLMModel: 'gpt-4o-docsnap',
                secondaryLLMModel: 'claude-sonnet-4-20250514',
                extractionEngine: 'node',
                ocrEngine: 'googleVisionApi',
                confidenceScore: 'ocr',
                confidenceThresholdInPercentage: 0,
                documentNumberKey: '',
                documentDateKey: '',
                dynamicFileNameFirstKey: '',
                dynamicFileNameLastKey: '',
                prefixRecordName: '',
                automationId: '',
                extractionLimit: 0,
                dynamicFileName: false,
                extractSingleDocument: true,
                includeImageForExtraction: false,
                enableInvoiceGenerator: false,
                enableChatWithDocument: true,
                enableContentCreation: false,
                enableOCR: true,
                requestNewField: false,
                reExtraction: false,
                alignmentCorrection: false
            }
        };
        setState({ ...state, loadingCreateTemplate: true });
        try {
            const res = await httpRequest('POST', `${config.nodeApiUrl}/idp/template/create`, requestBody);
            const resp = await httpRequest('POST', `${config.nodeApiUrl}/idp/template`, {
                pageSize: 1000,
                custom: true,
                filters: { deleted: false }
            });
            window?.sessionStorage?.setItem('templates', JSON.stringify(resp?.data));
            toast.success(res?.message || 'Template created successfully');
            if (state.isDashboard) {
                setState({ ...state, loadingCreateTemplate: false, showCreateTemplateDialog: false, refresh: state.refresh + 1 });
                if (selectedModule !== 'content-creation') {
                    navigate('/docsnap/template/list');
                }
                return;
            }
            setState({ ...state, showCreateTemplateDialog: false, refresh: state.refresh + 1, loadingCreateTemplate: false });
        } catch (err: any) {
            toast.error(err?.message || 'Failed to create template. Please try again.');
            setState({ ...state, loadingCreateTemplate: false });
        }
    };

    const onChangeTemplateName = (e: any) => {
        const val = e.target.value;
        let templateExists;
        if (selectedModule === 'content-creation') {
            const templatesSearchList = state.templates || [];
            templateExists = templatesSearchList.find((template: any) => template?.name?.toLowerCase() === val.toLowerCase());
        } else {
            templateExists = state.predefinedTemplates?.find((template: any) => template.name === val);
        }

        if (templateExists) {
            setError('Template name already exists, Please choose any other name');
        } else {
            setError('');
        }
        setSelectedTemplateName(val);
    };

    const closeDialog = () => {
        setState({ ...state, showCreateTemplateDialog: false });
        setError('');
        setSelectedTemplateName('');
        setShowFileUploadUI(false);
    };

    if (!state.showCreateTemplateDialog) return null;
    return (
        <DialogComponent
            className='max-h-[calc(100vh-100px)] w-[calc(100vw-400px)]'
            name={showFileUploadUI ? 'Upload Document' : 'Create Template'}
            isOpen={state.showCreateTemplateDialog}
            closeDialog={closeDialog}
            primaryButtonText={showFileUploadUI ? '' : state.loadingCreateTemplate ? 'Saving...' : 'Save'}
            onPrimaryAction={handleSubmit}
            primaryButtonDataTourId="dialog-create-template-button"
        >
            <div className='h-full p-6'>
                {showFileUploadUI ? (
                    <FileUploadUIComponent closeDialog={closeDialog} />
                ) : (
                    <div className="flex h-full flex-col gap-8">
                        <div className="flex w-full items-center rounded-md border pl-3">
                            <Search className="text-gray-500" size={20} />
                            <input
                                className="h-10 flex-1 px-4 text-sm outline-none"
                                placeholder="Search templates..."
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                data-tour-id="template-search"
                            />
                        </div>

                        <div className="flex h-full w-full flex-wrap gap-4" data-tour-id="template-list">
                            {state.predefinedTemplates
                                .filter((template: any) => template.name.toLowerCase().includes(searchQuery.toLowerCase()))
                                .map((template: any, idx: number) => (
                                    <div
                                        key={idx}
                                        onClick={() => {
                                            setSelectedTemplateName(template.name);
                                            setSelectedTemplate(template);
                                        }}
                                        className={`flex h-14 w-60 cursor-pointer items-center justify-between rounded-lg border p-3 text-sm ${selectedTemplateName === template.name ? 'border border-sky-500 bg-sky-50' : 'bg-white'}`}
                                        data-tour-id={idx === 0 ? 'predefined-template-first' : undefined}
                                    >
                                        {template.name}
                                        <CircleChevronRight size={14} className="text-gray-500" />
                                    </div>
                                ))}
                            <div
                                onClick={() => {
                                    setShowFileUploadUI(true);
                                    setSelectedTemplateName('');
                                }}
                                className={`flex h-14 w-60 cursor-pointer items-center justify-between rounded-lg border p-3 text-sm ${selectedTemplateName === 'Custom' ? 'border border-sky-500 bg-sky-50' : 'bg-white'}`}
                                data-tour-id="custom-template"
                            >
                                Custom <CircleChevronRight size={14} className="text-gray-500" />
                            </div>
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <label className="pl-1 text-sm font-light text-gray-600" htmlFor="templateName">
                                Template Name
                            </label>
                            <input
                                name="templateName"
                                className={`min-h-10 flex-1 rounded-md border px-4 text-sm outline-none ${error ? 'border-red-500' : ''}`}
                                value={selectedTemplateName}
                                onChange={onChangeTemplateName}
                                data-tour-id="template-name-input"
                            />
                            {error && <p className="pl-1 text-sm text-red-500">{error}</p>}
                        </div>
                    </div>
                )}
            </div>
        </DialogComponent>
    );
};

const FileUploadUIComponent = ({ closeDialog }: { closeDialog: () => void }) => {
    const navigate = useNavigate();
    const [uploading, setUploading] = useState(false);
    const onFileDrop = async (files: File[]) => {
        setUploading(true);
        const s3Response = await httpUploadRequest(`${config.nodeApiUrl}/idp/document/upload`, files[0] as File);
        navigate(`/docsnap/template/create/${s3Response.data?.fileName}`);
        closeDialog();
        setUploading(false);
    };
    return (
        <div className="flex h-[50vh] w-full flex-col items-center justify-center">
            {uploading ? <FullScreenLoader text="Uploading Document" /> : <DragAndDropFileInput accept="application/pdf,image/*" onFilesChange={onFileDrop} />}
        </div>
    );
};
