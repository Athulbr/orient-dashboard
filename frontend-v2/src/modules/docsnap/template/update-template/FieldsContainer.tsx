import {
    ChevronDown,
    ChevronUp,
    Edit,
    Eye,
    EyeOff,
    FileCog,
    GripVertical,
    Play,
    Plus,
    RefreshCw,
    Save,
    Settings,
    Trash2,
    X,
    Code,
    FileText
} from 'lucide-react';
import { DragAndDropContainer } from '../../../../components/DragAndDropContainer';
import { LightIconButton } from './components/ImageViewer';
import { ClassAttributes, InputHTMLAttributes, useEffect, useMemo, useState } from 'react';
import { JSX } from 'react/jsx-runtime';
import { dataTypesOption } from './components/temp';
import { SingleSelect } from '../../../../components/SingleSelect';
import { useUpdateTemplateState } from './hooks/updateTemplateContext';
import { Button } from '../../../../components/Button';
import Tooltip from '../../../../components/Tooltip';
import { UseFormbuilder } from '../../../../builders/formbuilder/use-formbuilder';
import { useParams } from 'react-router-dom';
import { useUpdateTemplatePageApi } from './hooks/useUpdateTemplateApi';
import { capitalizeFirstLetter } from '../../../../builders/formbuilder/utils/functions/capitalizeFirstLetter';
import { fileTypeFromBuffer } from 'file-type';
import { useToastStore } from '../../../../components/toast/ToastStore';
import { convertPdfToImages } from '../../record/view-record/utils';
import { binaryToFile } from '../../record/view-record/hooks/useViewRecordApi';
import FullScreenLoader from '../../../../components/FullScreenLoader';
import { useS3Storage } from '../../../../zustand-store/S3Storage';
import Spinner from '../../../../components/Spinner';
import { convertTemplateFields } from './utils/convertTemplateFields';
import { FieldIF } from '../../../../builders/formbuilder/interface';
import { DataRenderer } from './components/RenderTableOrKeyValuePairs';
import { EditPromptDialog } from './components/EditPromptDialog';
import { usePermissionStore } from '../../../../zustand-store/PermissionStore';

export const FieldsContainer: React.FC<{ create?: boolean }> = ({ create }) => {
    const { state, setState } = useUpdateTemplateState();
    const [showPostScriptDialog, setShowPostScriptDialog] = useState(false);
    const [showEditPromptDialog, setShowEditPromptDialog] = useState(false);
    const [postScriptCode, setPostScriptCode] = useState('  // Write your code here\n  const result = "Hello World";\n  console.log(result);');
    const [postScriptOutput, setPostScriptOutput] = useState('');
    const [testExtractedData, setTestExtractedData] = useState<any>(null);
    const [loadingTestData, setLoadingTestData] = useState(false);
    const { checkPermission } = usePermissionStore();

    const { getTemplateApi, createTemplateApi, updateTemplateApi, generateTemplateFieldsWithAI, updateTemplateFieldsWithAI, getTestExtractedData } =
        useUpdateTemplatePageApi();
    const { id, fileName } = useParams();
    const toast = useToastStore();

    useEffect(() => {
        if (!fileName) return;

        const getFileAndConvertToImages = async () => {
            setState(prev => ({ ...prev, loadingS3File: true }));

            generateTemplateFieldsWithAI({ s3FileName: fileName });

            const s3Response: any = await useS3Storage.getState().getS3File(fileName);
            const imageData = s3Response?.Body?.data;

            if (!imageData) {
                toast.error('S3 document not found');
                setState(prev => ({ ...prev, loadingS3File: false })); // Ensure loading is turned off
                return;
            }

            const uint8Array = new Uint8Array(imageData);
            const fileTypeResult = await fileTypeFromBuffer(uint8Array);

            if (!fileTypeResult) {
                toast.error('Could not determine file type.');
                setState(prev => ({ ...prev, loadingS3File: false }));
                return;
            }
            const { mime, ext } = fileTypeResult;

            // Handle image and PDF conversion logic
            let pdfFile: any;
            let imageUrl: string[];

            if (mime !== 'application/pdf') {
                pdfFile = await binaryToFile(uint8Array, `image.${ext}`, mime);
                imageUrl = [URL.createObjectURL(pdfFile).toString()];
            } else {
                pdfFile = await binaryToFile(uint8Array, `document.${ext}`, mime);
                imageUrl = await convertPdfToImages(pdfFile);
            }

            // Await the upload and state updates

            setState(prev => ({
                ...prev,
                loadingS3File: false,
                images: imageUrl
            }));
        };
        getFileAndConvertToImages();
    }, [fileName]);

    useEffect(() => {
        if (!id) return;
        const getTemplateData = async () => {
            try {
                const templateData = await getTemplateApi(id);
                setState(prev => ({ ...prev, loadingS3File: true, templateData, templateSettings: templateData?.settings }));
                const s3Response: any = await useS3Storage.getState().getS3File(templateData?.s3FileName);
                const imageData = s3Response?.Body?.data;
                if (!imageData) {
                    toast.error('S3 document not found');
                    return;
                }
                const uint8Array = new Uint8Array(imageData);
                const getFileType = await fileTypeFromBuffer(uint8Array);
                let pdfFile: any;
                let imageUrl;
                if (getFileType?.mime && getFileType?.mime !== 'application/pdf') {
                    pdfFile = await binaryToFile(uint8Array, `image.${getFileType.ext}`, getFileType?.mime);
                    imageUrl = [URL.createObjectURL(pdfFile).toString()];
                } else {
                    pdfFile = await binaryToFile(uint8Array, `document.${getFileType?.ext}`, getFileType?.mime);
                    imageUrl = await convertPdfToImages(pdfFile);
                }

                setState(prev => ({ ...prev, loadingS3File: false, images: imageUrl }));
            } catch (error: any) {
                setState(prev => ({ ...prev, loadingS3File: false, noS3File: true }));

                toast.error(error.message);
            }
        };
        getTemplateData();
    }, [id]);

    useEffect(() => {
        if (state.templateSettings?.postScript) {
            const script = state.templateSettings.postScript;
            // Extract inner code from full function if it's wrapped
            if (script.startsWith('function postProcess(extractedData)')) {
                const lines = script.split('\n');
                // Remove first line (function declaration) and last two lines (return + closing brace)
                const innerCode = lines.slice(1, -2).join('\n');
                setPostScriptCode(innerCode);
            } else {
                setPostScriptCode(script);
            }
        }
    }, [state.templateSettings?.postScript]);

    const addNewSection = () => {
        const sectionList = [...state.sectionList];
        sectionList.push({
            name: 'New Section',
            dataType: 'dict',
            jsonKey: 'new_section',
            subFields: [
                {
                    name: '',
                    jsonKey: '',
                    dataType: 'str'
                }
            ]
        });
        setState(prev => ({ ...prev, sectionList }));
    };
    const addNewTable = () => {
        const sectionList = [...state.sectionList];
        sectionList.push({
            name: 'New Table',
            dataType: 'list',
            jsonKey: 'new_table',
            subFields: [
                {
                    name: '',
                    jsonKey: '',
                    dataType: 'str'
                }
            ]
        });
        setState(prev => ({ ...prev, sectionList }));
    };

    const getFinalSettings = (formSettings?: any) => {
        // Base defaults used for any missing fields
        const defaultSettings = {
            primaryLLMProvider: 'azure',
            primaryLLMModel: 'gpt-4o-docsnap',
            secondaryLLMProvider: 'azure_openai',
            secondaryLLMModel: 'gpt-4o-docsnap',
            extractionEngine: 'node',
            ocrEngine: 'googleVisionApi',
            confidenceScore: 'ocr',
            confidenceThresholdInPercentage: '20',
            documentNumberKey: 'basic_details.po_number.value',
            documentDateKey: '',
            dynamicFileNameFirstKey: 'basic_details.po_number.value',
            dynamicFileNameLastKey: '',
            prefixRecordName: '',
            automationId: '1',
            extractionLimit: 0,
            module: sessionStorage.getItem('module') || 'docsnap',
            excludedPageNumbers: '',
            dynamicFileName: true,
            extractSingleDocument: true,
            includeImageForExtraction: true,
            enableInvoiceGenerator: false,
            enableChatWithDocument: true,
            enableOCR: true,
            requestNewField: true,
            reExtraction: true,
            alignmentCorrection: false,
            includeTextForExtraction: false,
            agenticExtraction: false,
            extractMultipleDocuments: false
        };

        const stateSettings = state.templateSettings && Object.keys(state.templateSettings || {}).length ? state.templateSettings : undefined;
        const incoming = stateSettings ?? formSettings;
        return incoming ? { ...defaultSettings, ...incoming } : defaultSettings;
    };

    const handleCreateTemplate = (data: any) => {
        data.description = state.visionOcrText[0];
        if (create) {
            // First prefer any settings the user has entered (from Template Settings Form);
            // if none are provided, the defaults will be used for the API call.
            const finalSettings = getFinalSettings(data?.settings);

            const requestBody = {
                fields: state.sectionList,
                s3FileName: fileName,
                settings: finalSettings,
                ...data
            };
            createTemplateApi(requestBody);
        } else {
            if (!id) return;
            const requestBody = {
                fields: state.sectionList,
                settings: state.templateSettings,
                s3FileName: fileName,
                ...data
            };
            updateTemplateApi(id, requestBody, false);
        }
    };
    const submitSettingsHandler = (data: any) => {
        setState(prev => ({ ...prev, templateSettings: data, showTemplateSettingsForm: false }));
        if (!id) return;
        data.extractionPrompt = state.templateSettings?.extractionPrompt;
        const requestBody = {
            fields: state.sectionList,
            settings: data,
            s3FileName: fileName,
            name: state.templateData.name,
            description: state.templateData.description,
            active: state.templateData.active
        };
        updateTemplateApi(id, requestBody, false);
    };

    const fetchTestData = async () => {
        if (!id) {
            toast.error('Save template first to fetch test data');
            return;
        }
        setLoadingTestData(true);
        const data = await getTestExtractedData(id);
        setTestExtractedData(data?.extractedData);
        setLoadingTestData(false);
    };

    const runPostScript = () => {
        setPostScriptOutput('');
        const logs: string[] = [];
        const originalConsoleLog = console.log;
        const originalConsoleError = console.error;
        const originalConsoleWarn = console.warn;

        console.log = (...args) => {
            logs.push(args.map(arg => (typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg))).join(' '));
            originalConsoleLog.apply(console, args);
        };
        console.error = (...args) => {
            logs.push('[Error] ' + args.map(arg => (typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg))).join(' '));
            originalConsoleError.apply(console, args);
        };
        console.warn = (...args) => {
            logs.push('[Warn] ' + args.map(arg => (typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg))).join(' '));
            originalConsoleWarn.apply(console, args);
        };

        try {
            const inputData = testExtractedData || {};
            const wrappedCode = `
                function postProcess(extractedData) {
                        ${postScriptCode}
                    return extractedData;
                }
                return postProcess(${JSON.stringify(inputData)});
            `;
            const result = new Function(wrappedCode)();
            if (result !== undefined) {
                logs.push('Return: ' + (typeof result === 'object' ? JSON.stringify(result, null, 2) : String(result)));
            }
            setPostScriptOutput(logs.join('\n') || 'Script executed successfully (no output)');
        } catch (error: any) {
            setPostScriptOutput(logs.join('\n') + '\n[Error] ' + error.message);
        } finally {
            console.log = originalConsoleLog;
            console.error = originalConsoleError;
            console.warn = originalConsoleWarn;
        }
    };

    const savePostScript = () => {
        const fullFunction = `function postProcess(extractedData) {
                                    ${postScriptCode}
                                return extractedData;
                            }`;
        setState(prev => ({
            ...prev,
            templateSettings: {
                ...prev.templateSettings,
                postScript: fullFunction
            }
        }));
        toast.success('Post script saved successfully');
        setShowPostScriptDialog(false);
    };

    return (
        <div className="flex h-full flex-col overflow-hidden">
            <div className="flex h-[64px] w-full items-center justify-between border border-l-0 bg-gray-50 px-4 text-lg text-gray-800">
                <div>Template Fields</div>
                <div className="flex items-center gap-2">
                    <Button startIcon={<FileText className="text-gray-500" size={16} />} outlined onClick={() => setShowEditPromptDialog(true)}>
                        Prompt
                    </Button>

                    { checkPermission('enable:postscript') && (
                        <Button startIcon={<Code className="text-gray-500" size={16} />} outlined onClick={() => setShowPostScriptDialog(true)}>
                            Post Script
                        </Button>
                    )}
                    <Button
                        startIcon={<FileCog className="text-gray-500" size={16} />}
                        outlined
                        onClick={() => setState(prev => ({ ...prev, showTemplateSettingsForm: true }))}
                    >
                        Settings
                    </Button>
                    <Button outlined onClick={() => setState(prev => ({ ...prev, showCreateForm: true }))}>
                        {create ? ' Create' : 'Update'} {state.updatingTemplate && <Spinner size={16} />}
                    </Button>
                </div>
            </div>
            {state.loadingTemplate ? (
                <FullScreenLoader text="Loading Template..." />
            ) : (
                <section className="flex h-full flex-col gap-4 overflow-y-auto border-r border-b p-2 pt-3 pb-50">
                    {state.sectionList.map((section, mainIndex) => (
                        <SectionComponent key={mainIndex} section={section} mainIndex={mainIndex} />
                    ))}
                    <div className="flex w-full items-center gap-4 px-2">
                        <Button disableRipple className="min-h-10 w-full" startIcon={<Plus size={16} />} onClick={addNewSection} outlined>
                            Add Section
                        </Button>
                        <Button disableRipple className="min-h-10 w-full" startIcon={<Plus size={16} />} onClick={addNewTable} outlined>
                            Add Table
                        </Button>
                    </div>
                    <div className="w-full">
                        {state.sectionList.length > 0 && (
                            <textarea
                                onChange={e => setState(prev => ({ ...prev, userQuery: e.target.value }))}
                                onKeyDown={e => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        if (!state.generatingTemplateFieldsWithAI && !state.updatingTemplateFieldsWithAI) {
                                            updateTemplateFieldsWithAI({
                                                existingFields: convertTemplateFields(state.sectionList),
                                                userQuery: state.userQuery,
                                                s3FileName: fileName || state.templateData?.s3FileName
                                            });
                                        }
                                    }
                                }}
                                value={state.userQuery}
                                rows={5}
                                className="w-full border p-2"
                                id=""
                            />
                        )}
                        <Button
                            disabled={state.generatingTemplateFieldsWithAI || state.updatingTemplateFieldsWithAI}
                            startIcon={state.generatingTemplateFieldsWithAI || state.updatingTemplateFieldsWithAI ? <Spinner size={16} /> : <Plus size={16} />}
                            onClick={() =>
                                updateTemplateFieldsWithAI({
                                    existingFields: convertTemplateFields(state.sectionList),
                                    userQuery: state.userQuery,
                                    s3FileName: fileName || state.templateData?.s3FileName
                                })
                            }
                            className="w-full "
                            outlined
                        >
                            {state.generatingTemplateFieldsWithAI
                                ? 'Generating Fields With AI'
                                : state.updatingTemplateFieldsWithAI
                                  ? 'Updating Fields With AI'
                                  : 'Update Fields With AI'}
                        </Button>
                    </div>
                </section>
            )}
            <UseFormbuilder
                title={create ? 'Create Template' : 'Update Template'}
                isOpen={state.showCreateForm}
                className="w-[40vw]"
                name="Create Template Form"
                closeDialog={() => setState(prev => ({ ...prev, showCreateForm: false }))}
                onSubmit={handleCreateTemplate}
                existingData={state.templateData}
                loadingPrimaryButton={state.updatingTemplate}
            />
            <UseFormbuilder
                title="Template Settings"
                isOpen={state.showTemplateSettingsForm}
                className="w-[80vw]"
                name="Template Settings Form"
                closeDialog={() => setState(prev => ({ ...prev, showTemplateSettingsForm: false }))}
                onSubmit={submitSettingsHandler}
                existingData={state.templateSettings}
                loadingPrimaryButton={state.updatingTemplate}
                disableBlurCloseDialog
            />
            {showPostScriptDialog && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowPostScriptDialog(false)}>
                    <div className="flex max-h-[80vh] w-[600px] flex-col rounded-lg bg-white shadow-xl" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between border-b px-4 py-3">
                            <h3 className="text-lg font-medium">Post Script Editor</h3>
                            <button onClick={() => setShowPostScriptDialog(false)} className="rounded p-1 hover:bg-gray-100">
                                <X size={20} />
                            </button>
                        </div>
                        <div className="flex flex-1 flex-col gap-3 overflow-auto p-4">
                            <div className="flex items-center justify-between">
                                <span className="text-sm font-medium text-gray-600">Input Data (extractedData):</span>
                                <Button
                                    small
                                    startIcon={loadingTestData ? <Spinner size={14} /> : <RefreshCw size={14} />}
                                    onClick={fetchTestData}
                                    outlined
                                    disabled={loadingTestData}
                                >
                                    {loadingTestData ? 'Fetching...' : 'Fetch Test Data'}
                                </Button>
                            </div>
                            {testExtractedData && (
                                <pre className="max-h-[100px] overflow-auto rounded border bg-gray-100 p-2 font-mono text-xs text-gray-700">
                                    {JSON.stringify(testExtractedData, null, 2)}
                                </pre>
                            )}
                            <div className="rounded border bg-gray-50 font-mono text-sm">
                                <div className="select-none border-b bg-gray-100 px-3 py-2 text-gray-500">{'function postProcess(extractedData) {'}</div>
                                <textarea
                                    value={postScriptCode}
                                    onChange={e => setPostScriptCode(e.target.value)}
                                    className="h-[180px] w-full resize-none bg-transparent p-3 outline-none"
                                    placeholder="  // Write your code here..."
                                    spellCheck={false}
                                />
                                <div className="select-none border-t bg-gray-100 px-3 py-2 text-gray-500">
                                    {'  return extractedData;'}
                                    <br />
                                    {'}'}
                                </div>
                            </div>
                            <div className="flex justify-center gap-4">
                                <Button startIcon={<Play size={16} />} onClick={runPostScript} outlined>
                                    Run Script
                                </Button>
                                <Button startIcon={<Save size={16} />} onClick={savePostScript}>
                                    Save
                                </Button>
                            </div>
                            {postScriptOutput && (
                                <div className="flex flex-col gap-1">
                                    <span className="text-sm font-medium text-gray-600">Output:</span>
                                    <pre className="max-h-[150px] overflow-auto rounded border bg-gray-900 p-3 font-mono text-sm text-green-400">
                                        {postScriptOutput}
                                    </pre>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
            <EditPromptDialog
                isOpen={showEditPromptDialog}
                closeDialog={() => setShowEditPromptDialog(false)}
                onSave={promptText => {
                    if (!id) return;
                    const updatedSettings = { ...state.templateSettings, extractionPrompt: promptText };
                    const requestBody = {
                        fields: state.sectionList,
                        settings: updatedSettings,
                        s3FileName: fileName,
                        name: state.templateData?.name,
                        description: state.templateData?.description,
                        active: state.templateData?.active
                    };
                    updateTemplateApi(id, requestBody, false);
                }}
            />
        </div>
    );
};

const InputField = (props: JSX.IntrinsicAttributes & ClassAttributes<HTMLInputElement> & InputHTMLAttributes<HTMLInputElement> & { className?: string }) => {
    const { className = '', ...rest } = props;
    return <input {...rest} className={`h-10 w-full rounded border pr-2 pl-3 text-sm outline-none hover:border-gray-400 focus:border-blue-400 ${className}`} />;
};

const SectionComponent = ({ section, mainIndex }: { section: any; mainIndex: number }) => {
    const { fileName } = useParams();
    const { state, setState } = useUpdateTemplateState();
    const { extractSectionFields } = useUpdateTemplatePageApi();
    const [opened, setOpened] = useState(true);
    const [editSectionDialog, setEditSectionDialog] = useState(false);
    const [editFieldDialog, setEditFieldDialog] = useState(-1);
    const [extractedData, setExtractedData] = useState<any>(null);
    const [updatingSection, setUpdatingSection] = useState(false);

    const moveUpSection = (e: any) => {
        e.stopPropagation();
        if (mainIndex === 0) return;
        const sectionList = [...state.sectionList];
        const section = sectionList[mainIndex];
        sectionList[mainIndex] = sectionList[mainIndex - 1];
        sectionList[mainIndex - 1] = section;
        setState(prev => ({ ...prev, sectionList }));
    };

    const moveDownSection = (e: any) => {
        e.stopPropagation();
        if (mainIndex === state.sectionList.length - 1) return;
        const sectionList = [...state.sectionList];
        const section = sectionList[mainIndex];
        sectionList[mainIndex] = sectionList[mainIndex + 1];
        sectionList[mainIndex + 1] = section;
        setState(prev => ({ ...prev, sectionList }));
    };

    const addNewField = () => {
        const sectionList = [...state.sectionList];
        sectionList[mainIndex].subFields.push({
            name: '',
            jsonKey: '',
            dataType: 'str'
        });
        setState(prev => ({ ...prev, sectionList }));
    };

    const editSectionDialogHandler = (e: any) => {
        e.stopPropagation();
        setEditSectionDialog(true);
    };

    const handleUpdateSection = (data: any) => {
        setUpdatingSection(true);
        // const sampleData={name: 'test', jsonKey: 'test', description: 'aa', instruction: 'aa', excludeExtraction: false, …}
        const templateData = [...state.sectionList];
        // Merge incoming section data with existing to avoid losing properties like subFields
        templateData[mainIndex] = { ...templateData[mainIndex], ...data };
        setState(prev => ({ ...prev, sectionList: templateData }));
        setEditSectionDialog(false);
        setUpdatingSection(false);
    };

    const handleExtractSectionFields = async () => {
        const sectionFields = {
            sectionName: section.jsonKey,
            sectionInstruction: section.instruction,
            sectionFields: section.subFields.map((field: any) => {
                return {
                    jsonKey: field.jsonKey,
                    instruction: field.instruction
                };
            })
        };
        const isTable = section?.dataType === 'list';
        const response = await extractSectionFields({ schema: sectionFields, s3FileName: fileName || state.templateData?.s3FileName, isTable }, mainIndex);
        setExtractedData(response);
    };

    const deleteSection = (index: number) => {
        const sectionList = [...state.sectionList];
        sectionList.splice(index, 1);
        setState(prev => ({ ...prev, sectionList }));
    };

    return (
        <div className="flex w-full cursor-pointer flex-col gap-0.5 rounded border p-1">
            <div onClick={() => setOpened(!opened)} className={`flex w-full items-center justify-between rounded bg-gray-50 p-3`}>
                <div className="flex items-center gap-3 pl-2">
                    {opened ? <ChevronDown size={16} /> : <ChevronUp size={16} />}

                    <span className="flex items-center gap-2">
                        {section?.dataType === 'list' && <span className="text-xs border px-2 py-1 text-gray-500">Table</span>}
                        {section?.name}
                        <LightIconButton Icon={Edit} onClick={editSectionDialogHandler} title="Edit Section" />
                        <Button
                            startIcon={state.extractingSection !== -1 && mainIndex === state.extractingSection ? <Spinner size={14} /> : null}
                            className="text-nowrap overflow-hidden"
                            small
                            onClick={handleExtractSectionFields}
                            outlined
                        >
                            {state.extractingSection !== -1 && mainIndex === state.extractingSection ? 'Extracting...' : 'Extract Fields'}
                        </Button>
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    <LightIconButton Icon={ChevronUp} onClick={moveUpSection} title="Move Up" />
                    <LightIconButton Icon={ChevronDown} onClick={moveDownSection} title="Move Down" />

                    <LightIconButton Icon={Trash2} onClick={() => deleteSection(mainIndex)} title="Delete" className="hover:text-red-500" />
                </div>
            </div>
            {opened && (
                <div className="flex flex-col gap-4 p-2">
                    <DataRenderer data={extractedData} />
                    <DragAndDropContainer
                        items={section?.subFields || []}
                        onDragEnd={reorderedFields => {
                            const sectionList = [...state.sectionList];
                            sectionList[mainIndex].subFields = reorderedFields;
                            setState(prev => ({ ...prev, sectionList }));
                        }}
                        className="flex flex-col gap-4 p-2"
                        disableDrag={editFieldDialog !== -1}
                    >
                        {(field: any, index: number) => (
                            <FieldComponent
                                editFieldDialog={editFieldDialog}
                                setEditFieldDialog={setEditFieldDialog}
                                key={index}
                                field={field}
                                index={index}
                                mainIndex={mainIndex}
                            />
                        )}
                    </DragAndDropContainer>
                    <Button disableRipple className="ml-4 w-fit border-none" startIcon={<Plus size={16} />} onClick={addNewField} outlined>
                        New Field
                    </Button>
                </div>
            )}
            <UseFormbuilder
                isOpen={editSectionDialog}
                className="w-[60vw]"
                title="Section Configuration"
                name="Template Section Config Form"
                closeDialog={() => setEditSectionDialog(false)}
                existingData={{
                    name: section?.name,
                    jsonKey: section?.jsonKey,
                    description: section?.description,
                    instruction: section?.instruction,
                    excludeExtraction: section?.excludeExtraction,
                    isHidden: section?.isHidden,
                    required: section?.required
                }}
                onSubmit={handleUpdateSection}
                loadingPrimaryButton={updatingSection}
            />
        </div>
    );
};

const FieldComponent = ({
    field,
    index,
    mainIndex,
    editFieldDialog,
    setEditFieldDialog
}: {
    field: any;
    index: number;
    mainIndex: number;
    editFieldDialog: number;
    setEditFieldDialog: (index: number) => void;
}) => {
    const { state, setState } = useUpdateTemplateState();
    const [updatingField, setUpdatingField] = useState(false);
    // const [showConfigForm, setShowConfigForm] = useState(false);
    const { regenerateInstructionWithAI } = useUpdateTemplatePageApi();

    const module = useMemo(() => sessionStorage.getItem('module'), []);

    const updateName = (e: any) => {
        setState(prev => {
            const sectionList = [...prev.sectionList];
            sectionList[mainIndex].subFields[index].name = capitalizeFirstLetter(e.target.value as string);
            if (module !== 'document-generation') {
                sectionList[mainIndex].subFields[index].jsonKey = (e.target.value as string).toLowerCase().replace(/\s/g, '_');
            }
            return { ...prev, sectionList };
        });
    };
    const updateJsonKey = (e: any) => {
        if (module === 'document-generation') return;
        setState(prev => {
            const sectionList = [...prev.sectionList];
            sectionList[mainIndex].subFields[index].jsonKey = e.target.value;
            return { ...prev, sectionList };
        });
    };
    const updateDataType = (value: string) => {
        setState(prev => {
            const sectionList = [...prev.sectionList];
            sectionList[mainIndex].subFields[index].dataType = value;
            return { ...prev, sectionList };
        });
    };
    const deleteField = () => {
        setState(prev => {
            const sectionList = [...prev.sectionList];
            sectionList[mainIndex].subFields.splice(index, 1);
            return { ...prev, sectionList };
        });
    };
    const updateHidden = (value: boolean) => {
        const templateData = [...state.sectionList];
        const subFields = [...templateData[mainIndex].subFields];
        subFields[index].hidden = value;
        if (value) {
            const [movedField] = subFields.splice(index, 1);
            subFields.push(movedField);
        }
        templateData[mainIndex].subFields = subFields;
        setState(prev => ({ ...prev, sectionList: templateData }));
    };
    const handleUpdateField = (data: any) => {
        setUpdatingField(true);
        const templateData = [...state.sectionList];
        const subFields = [...templateData[mainIndex].subFields];
        subFields[index] = { ...subFields[index], ...data };
        templateData[mainIndex].subFields = subFields;
        setState(prev => ({ ...prev, sectionList: templateData }));
        setEditFieldDialog(-1);
        setUpdatingField(false);
    };

    const updateInstructionApi = async (fields: FieldIF[]) => {
        const guidelinesField = fields.find((field: FieldIF) => field.key === 'guidelines');
        const instructionField = fields.find((field: FieldIF) => field.key === 'instruction');
        const updatedInstruction = await regenerateInstructionWithAI({
            visionOcrText: state.visionOcrText,
            currentInstruction: instructionField?.value,
            userQuery: guidelinesField?.value
        });
        if (updatedInstruction) {
            setState(prev => {
                const sectionList = [...prev.sectionList];
                sectionList[mainIndex].subFields[index].instruction = updatedInstruction;
                return { ...prev, sectionList };
            });
            // setShowConfigForm(false);
        }
    };

    return (
        <div className="mt-1 flex items-center gap-2 rounded border bg-white p-2">
            <LightIconButton Icon={GripVertical} onClick={() => {}} title="Drag" />
            <Tooltip text="Field Name" containerClassName="w-full">
                <InputField placeholder="Field Name" value={field?.name} onChange={updateName} />
            </Tooltip>
            <Tooltip text="Json Key" containerClassName="w-full">
                <InputField disabled={module === 'document-generation'} placeholder="Json Key" value={field?.jsonKey} onChange={updateJsonKey} />
            </Tooltip>
            <Tooltip text="Data Type" containerClassName="w-fit">
                <SingleSelect options={dataTypesOption} value={field?.dataType} onValueChange={updateDataType} />
            </Tooltip>
            {field?.hidden ? (
                <LightIconButton Icon={EyeOff} onClick={() => updateHidden(false)} title="Hidden" />
            ) : (
                <LightIconButton Icon={Eye} onClick={() => updateHidden(true)} title="Visible" />
            )}
            <LightIconButton Icon={Settings} onClick={() => setEditFieldDialog(index)} title="Config" />
            <LightIconButton Icon={Trash2} onClick={deleteField} title="Delete" className="hover:border-red-400 hover:text-red-500" />
            <UseFormbuilder
                isOpen={editFieldDialog === index}
                className="w-[60vw]"
                title="Field Configuration"
                name="Template Field Config Form"
                closeDialog={() => setEditFieldDialog(-1)}
                existingData={{
                    hidden: field?.hidden,
                    description: field?.description,
                    instruction: field?.instruction,
                    excludeExtraction: field?.excludeExtraction,
                    isHidden: field?.isHidden,
                    required: field?.required,
                    validationUrl: field?.validationUrl,
                    postProcessingScript: field?.postProcessingScript,
                    regenerateFieldValueWithAI: field?.regenerateFieldValueWithAI,
                    showTextarea: field?.showTextarea
                }}
                onSubmit={handleUpdateField}
                actionButtonText="Regenerate Instruction"
                actionButtonClickHandler={(fields: FieldIF[]) => updateInstructionApi(fields)}
                loadingPrimaryButton={updatingField}
            />
        </div>
    );
};
