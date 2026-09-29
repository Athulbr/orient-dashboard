import { Edit, FileText, MoreVertical, Plus, Upload, Save, RotateCcw, Copy, Check, Info, Code2, X, ChevronDown, ChevronRight } from 'lucide-react';
import * as XLSX from 'xlsx';
import { Dropdown } from '../../../../../components/Dropdown';
import { Button } from '../../../../../components/Button';
import httpRequest from '../../../../../global-utils/httpRequest';
import { useToastStore } from '../../../../../components/toast/ToastStore';
import { useNavigate } from 'react-router-dom';
import { AlertDialog } from '../../../../../components/alert/AlertDialog';
import { useAlertStore } from '../../../../../components/alert/AlertStore';
import { usePermissionStore } from '../../../../../zustand-store/PermissionStore';
import { config } from '../../../../../config/default';
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { UseFormbuilder } from '../../../../../builders/formbuilder/use-formbuilder';
import { DialogComponent } from '../../../../../components/DialogComponent';
import { KeywordSelectionDialog, KeywordGroup } from '../../../upload-document-new/KeywordSelectionDialog';
import { useDocumentExtractor } from '../../../upload-document-new/useDocumentExtractor';
interface PropsIF {
    template?: any;
    onClickUpload?: () => void;
    isLoading?: boolean;
    refreshPage?: () => void;
    flexBasis?: string;
    exportTemplate?: (id: string) => void;
    onClickManualButton?: () => void;
    isFirstCard?: boolean;
}

export const TemplateCardComponent: React.FC<PropsIF> = ({
    template,
    onClickUpload,
    isLoading = false,
    refreshPage,
    flexBasis,
    exportTemplate,
    onClickManualButton,
    isFirstCard = false
}) => {
    const toast = useToastStore();
    const navigate = useNavigate();
    const { showAlert } = useAlertStore();
    const { checkPermission } = usePermissionStore();
    const { addToDocumentExtractor } = useDocumentExtractor();
    const [showCreateDialog, setShowCreateDialog] = useState(false);
    const [creatingRecord, setCreatingRecord] = useState(false);
    const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);
    const [duplicateTemplateName, setDuplicateTemplateName] = useState('');
    const [isDuplicating, setIsDuplicating] = useState(false);
    const [showEditDialog, setShowEditDialog] = useState(false);

    // Keyword selection state (content-creation manual form flow)
    const [keywordGroups, setKeywordGroups] = useState<KeywordGroup[]>([]);
    const [isFetchingKeywords, setIsFetchingKeywords] = useState(false);
    const [showKeywordDialog, setShowKeywordDialog] = useState(false);
    const [pendingFormData, setPendingFormData] = useState<any>(null);
    const [isSubmittingKeywords, setIsSubmittingKeywords] = useState(false);

    const module = sessionStorage.getItem('module');
    const userStr = sessionStorage.getItem('user');
    let currentUser: any = null;
    if (userStr) {
        try {
            currentUser = JSON.parse(userStr);
        } catch (e) {
            console.error('Failed to parse user from session storage', e);
        }
    }

    const handleDropdownOptionChange = async (option: string) => {
        const deleteTemplateApi = async (id: string) => {
            try {
                const res = await httpRequest('DELETE', `${config.nodeApiUrl}/idp/template/delete/${id}`);

                const prevSelectedTenant = window?.sessionStorage?.getItem('selectedTenant');
                window?.sessionStorage?.removeItem('selectedTenant');

                const resp = await httpRequest('POST', `${config.nodeApiUrl}/idp/template`, {
                    pageSize: 1000,
                    custom: true,
                    filters: { deleted: false }
                });
                window?.sessionStorage?.setItem('templates', JSON.stringify(resp?.data));

                if (prevSelectedTenant) {
                    window?.sessionStorage?.setItem('selectedTenant', prevSelectedTenant);
                }

                toast.success(`Template deleted successfully`);
                if (refreshPage) {
                    refreshPage();
                } else {
                    window.location.reload();
                }
                return true;
            } catch (error) {
                console.error('error:===========', error);
                toast.error('Failed to delete Template');
            }
        };
        if (option === 'Delete') {
            showAlert({
                alertText: 'Are you sure you want to delete this template?',
                primaryButtonText: 'Delete',
                onPrimaryAction: () => deleteTemplateApi(template._id)
            });
        }
        if (option === 'Export') {
            exportTemplate && exportTemplate(template._id);
        }
        if (option === 'Duplicate') {
            setDuplicateTemplateName(`${template.name}-copy`);
            setShowDuplicateDialog(true);
        }
    };

    const duplicateTemplateApi = async () => {
        if (!duplicateTemplateName.trim()) {
            toast.error('Template name is required');
            return;
        }

        const currentTenant = window?.sessionStorage?.getItem('selectedTenant');
        try {
            setIsDuplicating(true);

            // First fetch the full template details since the list item might not have fields
            let fullTemplate = template;
            try {
                const fullTemplateRes: any = await httpRequest('GET', `${config.nodeApiUrl}/idp/template/${template._id}`);
                if (fullTemplateRes?.data) {
                    fullTemplate = fullTemplateRes.data;
                }
            } catch (err) {
                console.error('Failed to fetch full template details structure', err);
            }

            const requestBody = {
                name: duplicateTemplateName,
                templateId: fullTemplate._id,
                ...(fullTemplate.settings && { settings: fullTemplate.settings }),
                ...(fullTemplate.fields && { fields: fullTemplate.fields }),
                ...(fullTemplate.s3FileName && { s3FileName: fullTemplate.s3FileName })
            };
            const res = await httpRequest('POST', `${config.nodeApiUrl}/idp/template/create`, requestBody);

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

            toast.success('Template duplicated successfully');
            setShowDuplicateDialog(false);

            if (refreshPage) {
                refreshPage();
            } else {
                window.location.reload();
            }
        } catch (error: any) {
            console.error('error:===========', error);
            toast.error(error?.message || 'Failed to duplicate Template');

            // Restore selectedTenant in case of error
            if (currentTenant) {
                window?.sessionStorage?.setItem('selectedTenant', currentTenant);
            }
        } finally {
            setIsDuplicating(false);
        }
    };



    const cardStyle = flexBasis ? { flexBasis, minWidth: 0 } : {};

    if (isLoading) {
        return (
            <div
                className="relative flex h-45 max-w-100 min-w-75 flex-1 flex-col justify-between rounded-2xl border border-gray-200 bg-gradient-to-br from-gray-50 to-white px-3 py-4 transition"
                style={cardStyle}
            >
                {/* Title and Menu Row */}
                <div className="mb-2 flex w-full items-start justify-between">
                    <div className="h-4 w-24 animate-pulse rounded bg-gray-200" />
                    <div className="h-8 w-8 animate-pulse rounded bg-gray-200" />
                </div>
                {/* Stats Row */}
                <div className="mb-2 flex w-full justify-between">
                    <div className="flex flex-col items-center">
                        <div className="h-3 w-12 animate-pulse rounded bg-gray-200" />
                        <div className="mt-0.5 h-4 w-8 animate-pulse rounded bg-gray-200" />
                    </div>
                    <div className="flex flex-col items-center">
                        <div className="h-3 w-12 animate-pulse rounded bg-gray-200" />
                        <div className="mt-0.5 h-4 w-8 animate-pulse rounded bg-gray-200" />
                    </div>
                    <div className="flex flex-col items-center">
                        <div className="h-3 w-12 animate-pulse rounded bg-gray-200" />
                        <div className="mt-0.5 h-4 w-8 animate-pulse rounded bg-gray-200" />
                    </div>
                </div>
                {/* Upload Button Row */}
                <div className="mt-auto flex w-full justify-between">
                    <div className="h-7 w-24 animate-pulse rounded bg-gray-200" />
                    <div className="h-7 w-24 animate-pulse rounded bg-gray-200" />
                </div>
            </div>
        );
    }

    const handleCreateRecord = async (data: any) => {
        if (module === 'content-creation') {
            // For content-creation: fetch keywords before proceeding
            setPendingFormData(data);
            setShowCreateDialog(false);
            setIsFetchingKeywords(true);
            setShowKeywordDialog(true);
            setKeywordGroups([]);
            try {
                const res = await httpRequest('POST', `${config.mlServiceNodejs}/content-creation/get-keywords`, {
                    rows: [data]
                });
                const fetched: KeywordGroup[] = (res.data || []).map((group: any) => ({
                    name: group?.name,
                    primary_keyword: group?.primary_keyword,
                    keywords: (group?.keywords || []).map((item: any) => ({
                        keyword: item?.keyword,
                        source: item?.source,
                        selected: true
                    }))
                }));
                setKeywordGroups(fetched);
            } catch (e) {
                toast.error('Failed to fetch SEO keywords, proceeding without keywords');
                // Proceed without keywords
                addToDocumentExtractor(template, [], data);
                setShowKeywordDialog(false);
            } finally {
                setIsFetchingKeywords(false);
            }
            return;
        }

        // Original flow for non-content-creation modules
        setCreatingRecord(true);
        const res: any = await httpRequest('GET', `${config.nodeApiUrl}/idp/template/${template._id}`);
        const values: any = {};
        res.data?.fields?.forEach((field: any) => {
            field?.subFields?.forEach((subField: any) => {
                values[subField.jsonKey] = '_______________';
            });
        });

        const createReqObject = {
            status: 'extracted',
            extractedData: null,
            pdfFileName: '',
            name: data.name,
            templateId: template._id,
            description: data.description,
            module: 'document-generation'
        };

        await httpRequest('POST', `${config.nodeApiUrl}/idp/history/create`, createReqObject);
        toast.success('Record created successfully');
        setShowCreateDialog(false);
        setCreatingRecord(false);
        navigate('/docsnap/record/list');
    };

    const handleProceedWithKeywords = async (groups: KeywordGroup[], comment?: string) => {
        setIsSubmittingKeywords(true);
        try {
            const matchingGroup = groups.find(
                g => g.name === pendingFormData?.name || g.primary_keyword === pendingFormData?.primary_keyword
            );
            const selectedKeywords = matchingGroup
                ? matchingGroup.keywords.filter(k => k.selected)
                : groups.flatMap(g => g.keywords.filter(k => k.selected));
            addToDocumentExtractor(template, [], { ...pendingFormData, selectedKeywords, userComment: comment });
            setShowKeywordDialog(false);
            setPendingFormData(null);
        } finally {
            setIsSubmittingKeywords(false);
        }
    };

    /** Per-group proceed — does NOT close the dialog */
    const handleProceedGroupKeywords = (group: KeywordGroup, comment?: string) => {
        const selectedKeywords = group.keywords.filter(k => k.selected);
        addToDocumentExtractor(template, [], { ...pendingFormData, selectedKeywords, userComment: comment }, undefined, true);
    };

    if (!template) return null;
    const { total, submitted, extracted } = template.count;

    const onClickUploadHandler = () => {
        const user = JSON.parse(sessionStorage.getItem('user') || '');
        if (user?.role?.name === 'superadmin') {
            const selectedTenant = sessionStorage.getItem('selectedTenant');
            if (!selectedTenant) {
                toast.error('Please select a tenant');
                return;
            }
            onClickUpload && onClickUpload();
        } else {
            onClickUpload && onClickUpload();
        }
    };
    const onClickManualButtonHandler = () => {
        const user = JSON.parse(sessionStorage.getItem('user') || '');
        if (user?.role?.name === 'superadmin') {
            const selectedTenant = sessionStorage.getItem('selectedTenant');
            if (!selectedTenant) {
                toast.error('Please select a tenant');
                return;
            }
            onClickManualButton && onClickManualButton();
        } else {
            onClickManualButton && onClickManualButton();
        }
    };

    return (
        <div
            // onClick={() => navigate(`/docsnap/template/view/${template._id}`)} // Uncomment to enable navigation on click based on tenant settings
            className="relative flex h-45 max-w-100 min-w-85 flex-1 flex-col justify-between rounded-2xl border border-gray-200 bg-gradient-to-br from-gray-50 to-white px-3 py-4 transition"
            style={cardStyle}
            data-tour-id={isFirstCard ? 'first-template-card' : undefined}
        >
            {/* Title and Menu Row */}
            <div className="mb-2.5 flex w-full items-start justify-between">
                <div className="text truncate pr-2 font-semibold text-gray-800">{template?.name}</div>
                {(checkPermission('delete:template') || checkPermission('export:template') || checkPermission('duplicate:template')) && (
                    <Dropdown
                        options={[
                            ...(exportTemplate && checkPermission('export:template') ? ['Export'] : []),
                            ...(checkPermission('duplicate:template') ? ['Duplicate'] : []),
                            ...(checkPermission('delete:template') ? ['Delete'] : [])
                        ]}
                        onChange={handleDropdownOptionChange}
                    >
                        <button className="flex-shrink-0 cursor-pointer rounded-md border border-gray-200 bg-white p-1.5 text-gray-500 hover:bg-gray-100">
                            <MoreVertical size={18} />
                        </button>
                    </Dropdown>
                )}
            </div>
            {/* Stats Row */}
            <div className="mb-2 flex w-full justify-between">
                <div className="flex flex-col items-end">
                    <span className="text-xs text-gray-500">Submitted</span>
                    <span className="mt-0.5 font-semibold text-gray-600">{submitted || 0}</span>
                </div>
                <div className="flex flex-col items-end">
                    <span className="text-xs text-gray-500">Extracted</span>
                    <span className="mt-0.5 font-semibold text-gray-600">{extracted || 0}</span>
                </div>
                <div className="flex flex-col items-end">
                    <span className="text-xs text-gray-500">Total</span>
                    <span className="mt-0.5 font-semibold text-gray-600">{total || 0}</span>
                </div>
            </div>
            {/* Upload Button Row */}
            <div className="flex w-full justify-between gap-2">
                {(module === 'content-creation' && currentUser?.role?.name !== 'superadmin') ? (
                    <div className="flex gap-1.5">
                        <Button
                            permission="edit:prompt"
                            outlined
                            startIcon={<Edit size={14} className="text-gray-500" />}
                            onClick={() => setShowEditDialog(true)}
                            small
                        >
                            Edit
                        </Button>
                    </div>
                ) : (
                    <Button
                        permission="update:template"
                        outlined
                        startIcon={<Edit size={14} className="text-gray-500" />}
                        onClick={() => navigate(`/docsnap/template/update/${template._id}`)}
                        small
                        data-tour-id="edit-fields-button"
                    >
                        Edit Fields
                    </Button>
                )}
                <Button
                    permission="create:blog"
                    outlined
                    startIcon={<FileText size={14} className="text-gray-500" />}
                    onClick={onClickManualButtonHandler}
                    small
                    hidden={module !== 'content-creation'}
                >
                    Create
                </Button>
                <Button
                    permission="extract:document"
                    startIcon={module === 'document-generation' ? <Plus size={14} /> : <Upload size={14} />}
                    onClick={module === 'document-generation' ? () => setShowCreateDialog(true) : onClickUploadHandler}
                    small
                    data-tour-id="upload-button"
                >
                    {module === 'document-generation' ? 'Create' : 'Upload'}
                </Button>
            </div>
            {showCreateDialog && (
                <UseFormbuilder
                    name="Create Record Form"
                    closeDialog={() => setShowCreateDialog(false)}
                    onSubmit={handleCreateRecord}
                    loadingPrimaryButton={creatingRecord}
                />
            )}

            <DialogComponent
                isOpen={showDuplicateDialog}
                closeDialog={() => setShowDuplicateDialog(false)}
                name="Duplicate Template"
                primaryButtonText={isDuplicating ? 'Creating...' : 'Create'}
                onPrimaryAction={duplicateTemplateApi}
                className="w-[450px]"
            >
                <div className="flex flex-col gap-1.5 p-6">
                    <label className="pl-1 text-sm font-light text-gray-600" htmlFor="duplicateTemplateName">
                        New Template Name
                    </label>
                    <input
                        name="duplicateTemplateName"
                        className="min-h-10 flex-1 rounded-md border border-gray-300 px-4 text-sm outline-none outline-0 focus:border-sky-500"
                        value={duplicateTemplateName}
                        onChange={e => setDuplicateTemplateName(e.target.value)}
                        placeholder="Enter new template name"
                        autoFocus
                    />
                </div>
            </DialogComponent>

            <EditTemplateDialog isOpen={showEditDialog} closeDialog={() => setShowEditDialog(false)} template={template} refreshPage={refreshPage} />

            {/* Keyword Selection Dialog — shown after Create form submit in content-creation */}
            <KeywordSelectionDialog
                isOpen={showKeywordDialog}
                keywordGroups={keywordGroups}
                isFetching={isFetchingKeywords}
                onClose={() => {
                    setShowKeywordDialog(false);
                    setPendingFormData(null);
                }}
                onProceed={handleProceedWithKeywords}
                onProceedGroup={handleProceedGroupKeywords}
                isSubmitting={isSubmittingKeywords}
            />
        </div>
    );
};

const EditTemplateDialog = ({ isOpen, closeDialog, template, refreshPage }: { isOpen: boolean, closeDialog: () => void, template: any, refreshPage?: () => void }) => {
    const [activeTab, setActiveTab] = useState<'prompt' | 'css'>('prompt');
    return (
        <DialogComponent name="Template Settings" className="h-[90%] w-[95%]" isOpen={isOpen} closeDialog={closeDialog} disableBlurCloseDialog>
            <div className="flex px-6 pt-2 border-b border-gray-200 shrink-0">
                <button
                    onClick={() => setActiveTab('prompt')}
                    className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${activeTab === 'prompt' ? 'border-sky-500 text-sky-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                >
                    Prompt Editor
                </button>
                <button
                    onClick={() => setActiveTab('css')}
                    className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${activeTab === 'css' ? 'border-sky-500 text-sky-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                >
                    Blog CSS Editor
                </button>
            </div>
            <div className="flex flex-1 overflow-hidden min-h-0 bg-white relative">
                {activeTab === 'prompt' && <PromptTabContent template={template} refreshPage={refreshPage} closeDialog={closeDialog} />}
                {activeTab === 'css' && <CssTabContent template={template} refreshPage={refreshPage} closeDialog={closeDialog} />}
            </div>
        </DialogComponent>
    );
};

const PromptTabContent = ({ closeDialog, template, refreshPage }: { closeDialog: () => void, template: any, refreshPage?: () => void }) => {
    const [editingPrompt, setEditingPrompt] = useState('');
    const [copied, setCopied] = useState(false);
    const toast = useToastStore();

    useEffect(() => {
        setEditingPrompt(template?.settings?.extractionPrompt || '');
    }, [template]);

    const handleSave = async () => {
        const updatedSettings = {
            ...template.settings,
            extractionPrompt: editingPrompt
        };
        const requestBody = {
            fields: template.fields,
            settings: updatedSettings,
            s3FileName: template.s3FileName,
            name: template.name,
            description: template.description,
            active: template.active
        };
        try {
            await httpRequest('PATCH', `${config.nodeApiUrl}/idp/template/update/${template._id}`, requestBody);

            const prevSelectedTenant = window?.sessionStorage?.getItem('selectedTenant');
            window?.sessionStorage?.removeItem('selectedTenant');

            const resp: any = await httpRequest('POST', `${config.nodeApiUrl}/idp/template`, {
                pageSize: 1000,
                custom: true,
                filters: { deleted: false }
            });
            window?.sessionStorage?.setItem('templates', JSON.stringify(resp?.data));

            if (prevSelectedTenant) {
                window?.sessionStorage?.setItem('selectedTenant', prevSelectedTenant);
            }

            toast.success('Prompt updated successfully');
            closeDialog();
            if (refreshPage) {
                refreshPage();
            } else {
                window.location.reload();
            }
        } catch (error) {
            toast.error('Failed to update Prompt');
        }
    };

    const handleCopy = () => {
        navigator.clipboard.writeText(editingPrompt);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleReset = () => {
        setEditingPrompt(template?.settings?.extractionPrompt || '');
    };

    return (
        <div className="flex flex-col flex-1 h-full w-full">

            <div className="flex h-full flex-1 gap-0 overflow-hidden p-4">
                <div className="flex flex-1 flex-col">
                    <div className="flex items-center justify-between border-b px-5 py-3">
                        <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-gray-800">Prompt Editor</span>
                            <span className="rounded bg-gray-100 px-2 py-0.5 text-[10px] font-medium tracking-wide text-gray-500">MANUAL</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <Button
                                small
                                outlined
                                startIcon={copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
                                onClick={handleCopy}
                                disabled={!editingPrompt.trim()}
                            >
                                {copied ? 'Copied' : 'Copy'}
                            </Button>
                            <Button small outlined startIcon={<RotateCcw size={14} />} onClick={handleReset}>
                                Reset
                            </Button>
                        </div>
                    </div>
                    <div className="flex items-start gap-2 border-b bg-blue-50/60 px-5 py-2.5">
                        <Info size={14} className="mt-0.5 shrink-0 text-blue-500" />
                        <p className="text-xs leading-relaxed text-blue-700">
                            Use <code className="rounded bg-blue-100 px-1 py-0.5 font-mono text-[11px] font-medium text-blue-800">{'{{variableName}}'}</code> to
                            insert dynamic data at runtime —{' '}
                            <code className="rounded bg-blue-100 px-1 py-0.5 font-mono text-[11px] text-blue-800">{'{{documentText}}'}</code>,{' '}
                            <code className="rounded bg-blue-100 px-1 py-0.5 font-mono text-[11px] text-blue-800">{'{{schema}}'}</code>,{' '}
                            <code className="rounded bg-blue-100 px-1 py-0.5 font-mono text-[11px] text-blue-800">{'{{previousOutput}}'}</code>
                        </p>
                    </div>
                    <textarea
                        value={editingPrompt}
                        onChange={e => setEditingPrompt(e.target.value)}
                        className="flex-1 resize-none p-5 font-mono text-sm leading-relaxed text-gray-800 outline-none placeholder:text-gray-400"
                        placeholder={`Write your extraction prompt here...\n\nUse {{variableName}} to insert dynamic data. For example:\n\nExtract the following fields from the document:\n{{documentText}}\n\nUse this schema for extraction:\n{{schema}}\n\nEnsure all dates are in YYYY-MM-DD format.\nReturn null for missing fields.`}
                        spellCheck={false}
                    />
                </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 border-t bg-gray-50/50 px-6 py-4 shrink-0">
                <Button outlined onClick={closeDialog}>
                    Cancel
                </Button>
                <Button startIcon={<Save size={16} />} onClick={handleSave}>
                    Save Prompt
                </Button>
            </div>
        </div>
    );
};

// ─── CSS parse / serialize helpers ───────────────────────────────────────────

type ParsedCss = Record<string, Record<string, string>>;

/** Very lightweight CSS parser — handles flat rule sets (no nested/at-rules).
 *  Comma-grouped selectors (e.g. ".foo p, .foo ul") are split into individual
 *  entries so each gets its own accurate accordion row and highlight. */
const parseCss = (css: string): ParsedCss => {
    const result: ParsedCss = {};
    const ruleRe = /([^{]+)\{([^}]*)\}/g;
    let m;
    while ((m = ruleRe.exec(css)) !== null) {
        const selectorGroup = m[1].trim();
        // Skip @-rules (media queries, keyframes, etc.) — they contain nested blocks
        // which this simple regex doesn't handle correctly
        if (selectorGroup.startsWith('@')) continue;
        const props: Record<string, string> = {};
        m[2].split(';').forEach(decl => {
            const idx = decl.indexOf(':');
            if (idx === -1) return;
            const p = decl.slice(0, idx).trim();
            const v = decl.slice(idx + 1).trim();
            if (p && v) props[p] = v;
        });
        if (Object.keys(props).length === 0) continue;
        // Split comma-grouped selectors into individual entries so clicking an
        // element highlights the precise rule (not a sibling selector's label)
        const selectors = selectorGroup.split(',').map(s => s.trim()).filter(Boolean);
        for (const selector of selectors) {
            if (result[selector]) {
                // Merge if the same selector appears in multiple rules
                Object.assign(result[selector], props);
            } else {
                result[selector] = { ...props };
            }
        }
    }
    return result;
};

const serializeCss = (parsed: ParsedCss): string =>
    Object.entries(parsed)
        .map(([sel, props]) => {
            const decls = Object.entries(props)
                .map(([p, v]) => `  ${p}: ${v};`)
                .join('\n');
            return `${sel} {\n${decls}\n}`;
        })
        .join('\n\n');

const SELECTOR_LABELS: Record<string, string> = {
    h1: 'Heading 1', h2: 'Heading 2', h3: 'Heading 3',
    h4: 'Heading 4', h5: 'Heading 5', h6: 'Heading 6',
    p: 'Paragraph', ul: 'Unordered List', ol: 'Ordered List',
    li: 'List Item', a: 'Link', strong: 'Bold', em: 'Italic',
    blockquote: 'Blockquote', table: 'Table', td: 'Table Cell',
    th: 'Table Header', img: 'Image', hr: 'Divider', span: 'Span',
};

const getSelectorLabel = (selector: string): string => {
    const trimmed = selector.trim();
    // Get the last combinator-separated simple selector (handles " h2", "> li", etc.)
    const last = trimmed.split(/[\s>+~]+/).pop() || trimmed;
    // Strip pseudo-classes / pseudo-elements
    const base = last.replace(/[:[(].*/, '');
    // Known HTML tag → friendly name
    if (SELECTOR_LABELS[base]) return SELECTOR_LABELS[base];
    // Class selector → convert .kebab-case to "Kebab Case"
    if (base.startsWith('.')) {
        return base.slice(1).split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    }
    // ID selector
    if (base.startsWith('#')) return base;
    // Fallback: truncate long selectors
    return trimmed.length > 42 ? trimmed.slice(0, 39) + '…' : trimmed;
};

// ─── Color utilities ─────────────────────────────────────────────────────────

const COLOR_PROPS = new Set([
    'color', 'background-color', 'background', 'border-color',
    'border-top-color', 'border-bottom-color', 'border-left-color',
    'border-right-color', 'outline-color', 'text-decoration-color',
    'fill', 'stroke', 'caret-color', 'column-rule-color',
]);

const isColorProp = (prop: string) => COLOR_PROPS.has(prop.toLowerCase());

/** Convert any valid CSS color string to #rrggbb for the native color picker. */
const cssColorToHex = (cssColor: string): string => {
    if (!cssColor?.trim()) return '#000000';
    try {
        const el = document.createElement('div');
        el.style.color = cssColor;
        document.body.appendChild(el);
        const rgb = window.getComputedStyle(el).color;
        document.body.removeChild(el);
        const nums = rgb.match(/\d+/g);
        if (!nums || nums.length < 3) return '#000000';
        return '#' + nums.slice(0, 3).map(n => parseInt(n).toString(16).padStart(2, '0')).join('');
    } catch {
        return '#000000';
    }
};

// ─── CSS visual editor (accordion, mirrors StyleEditor UI) ───────────────────

interface CssVisualEditorProps {
    parsed: ParsedCss;
    onChange: (next: ParsedCss) => void;
    /** Selector to auto-expand + highlight (set when user clicks inside the preview) */
    highlightedSelector?: string | null;
}

const CssVisualEditor: React.FC<CssVisualEditorProps> = ({ parsed, onChange, highlightedSelector }) => {
    const [expanded, setExpanded] = useState<Record<string, boolean>>({});
    const [newPropInputs, setNewPropInputs] = useState<Record<string, { prop: string; val: string }>>({});
    // Refs per selector for scroll-into-view
    const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});

    const toggle = (sel: string) => setExpanded(prev => ({ ...prev, [sel]: !prev[sel] }));

    const updateProp = (sel: string, prop: string, value: string) => {
        onChange({ ...parsed, [sel]: { ...parsed[sel], [prop]: value } });
    };

    const deleteProp = (sel: string, prop: string) => {
        const next = { ...parsed, [sel]: { ...parsed[sel] } };
        delete next[sel][prop];
        onChange(next);
    };

    const addProp = (sel: string) => {
        const { prop, val } = newPropInputs[sel] || { prop: '', val: '' };
        if (!prop.trim()) return;
        onChange({ ...parsed, [sel]: { ...parsed[sel], [prop.trim()]: val.trim() } });
        setNewPropInputs(prev => ({ ...prev, [sel]: { prop: '', val: '' } }));
    };

    // Auto-expand and scroll to the highlighted selector when it changes
    useEffect(() => {
        if (!highlightedSelector) return;
        setExpanded(prev => ({ ...prev, [highlightedSelector]: true }));
        // Scroll after render
        const timer = setTimeout(() => {
            rowRefs.current[highlightedSelector]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 60);
        return () => clearTimeout(timer);
    }, [highlightedSelector]);

    const selectors = Object.keys(parsed);

    if (selectors.length === 0) {
        return (
            <p className="text-xs text-gray-400 italic p-4">
                No CSS rules yet. Switch to Raw tab to paste your stylesheet.
            </p>
        );
    }

    return (
        <div className="flex flex-col gap-1 p-3">
            {selectors.map(sel => {
                const props = parsed[sel] || {};
                const propCount = Object.keys(props).length;
                const isOpen = !!expanded[sel];
                const label = getSelectorLabel(sel);
                const newInput = newPropInputs[sel] || { prop: '', val: '' };
                const isNewPropColor = isColorProp(newInput.prop);
                const isHighlighted = sel === highlightedSelector;

                return (
                    <div
                        key={sel}
                        ref={el => { rowRefs.current[sel] = el; }}
                        className={`border rounded-md overflow-hidden transition-all ${isHighlighted
                                ? 'border-blue-400 ring-2 ring-blue-200'
                                : 'border-gray-200'
                            }`}
                    >
                        {/* Accordion header */}
                        <button
                            onClick={() => toggle(sel)}
                            className={`w-full flex items-center justify-between px-3 py-2 transition-colors ${isHighlighted ? 'bg-blue-50 hover:bg-blue-100' : 'bg-gray-50 hover:bg-gray-100'
                                }`}
                        >
                            <div className="flex items-center gap-2 min-w-0">
                                {isOpen
                                    ? <ChevronDown size={14} className="text-gray-500 shrink-0" />
                                    : <ChevronRight size={14} className="text-gray-500 shrink-0" />}
                                <span className={`font-medium text-sm truncate ${isHighlighted ? 'text-blue-700' : 'text-gray-700'}`}>
                                    {label}
                                </span>
                                {isHighlighted && (
                                    <span className="text-[10px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full shrink-0 font-medium">
                                        selected
                                    </span>
                                )}
                                <span className="text-[10px] bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded-full shrink-0">
                                    {propCount}
                                </span>
                            </div>
                            <span className="text-[10px] text-gray-400 font-mono ml-2 shrink-0 truncate max-w-[45%]">{sel}</span>
                        </button>

                        {/* Accordion body */}
                        {isOpen && (
                            <div className="px-3 py-2 bg-white flex flex-col gap-1.5">
                                {Object.entries(props).map(([prop, val]) => {
                                    const showSwatch = isColorProp(prop);
                                    return (
                                        <div key={prop} className="flex items-center gap-2">
                                            <span className="text-xs font-mono text-gray-500 w-36 shrink-0 truncate" title={prop}>{prop}</span>

                                            {/* Color swatch picker */}
                                            {showSwatch && (
                                                <div
                                                    className="shrink-0 rounded overflow-hidden border border-gray-300 relative cursor-pointer"
                                                    style={{ width: 22, height: 22 }}
                                                    title="Pick color"
                                                >
                                                    <div style={{ background: val || '#ffffff', width: '100%', height: '100%' }} />
                                                    <input
                                                        type="color"
                                                        value={cssColorToHex(val)}
                                                        onChange={e => updateProp(sel, prop, e.target.value)}
                                                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                                        style={{ padding: 0, border: 'none' }}
                                                    />
                                                </div>
                                            )}

                                            <input
                                                type="text"
                                                value={val}
                                                onChange={e => updateProp(sel, prop, e.target.value)}
                                                className="flex-1 text-xs px-2 py-1 border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400 font-mono min-w-0"
                                            />
                                            <button
                                                onClick={() => deleteProp(sel, prop)}
                                                className="text-gray-300 hover:text-red-400 transition-colors shrink-0"
                                                title="Remove property"
                                            >
                                                <X size={12} />
                                            </button>
                                        </div>
                                    );
                                })}

                                {/* Add new property row */}
                                <div className="flex items-center gap-2 mt-1 pt-1 border-t border-dashed border-gray-200">
                                    <input
                                        type="text"
                                        value={newInput.prop}
                                        onChange={e => setNewPropInputs(prev => ({ ...prev, [sel]: { ...newInput, prop: e.target.value } }))}
                                        onKeyDown={e => e.key === 'Enter' && addProp(sel)}
                                        placeholder="property"
                                        className="text-xs px-2 py-1 border border-dashed border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-300 font-mono w-32 shrink-0"
                                    />
                                    {isNewPropColor && (
                                        <div
                                            className="shrink-0 rounded overflow-hidden border border-gray-300 relative cursor-pointer"
                                            style={{ width: 22, height: 22 }}
                                            title="Pick color"
                                        >
                                            <div style={{ background: newInput.val || '#ffffff', width: '100%', height: '100%' }} />
                                            <input
                                                type="color"
                                                value={cssColorToHex(newInput.val)}
                                                onChange={e => setNewPropInputs(prev => ({ ...prev, [sel]: { ...newInput, val: e.target.value } }))}
                                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                                style={{ padding: 0, border: 'none' }}
                                            />
                                        </div>
                                    )}
                                    <input
                                        type="text"
                                        value={newInput.val}
                                        onChange={e => setNewPropInputs(prev => ({ ...prev, [sel]: { ...newInput, val: e.target.value } }))}
                                        onKeyDown={e => e.key === 'Enter' && addProp(sel)}
                                        placeholder="value"
                                        className="flex-1 text-xs px-2 py-1 border border-dashed border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-300 font-mono min-w-0"
                                    />
                                    <button
                                        onClick={() => addProp(sel)}
                                        className="text-gray-400 hover:text-blue-500 transition-colors shrink-0"
                                        title="Add property"
                                    >
                                        <Plus size={13} />
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Strip inline styles from semantic text elements so that the CSS cascade takes over.
 * Layout-critical elements (a, table, td, th, img) are intentionally left untouched.
 * The result is wrapped in <div class="{wrapperClass}"> ready for CSS-class rendering.
 */
const convertHtmlToCssClasses = (rawHtml: string, wrapperClass: string): string => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(rawHtml, 'text/html');
    const cls = wrapperClass || 'contentbody';

    // If the entire body is already a single wrapper div with the target class,
    // unwrap it first so repeated clicks don't keep stacking nested divs.
    const bodyChildren = doc.body.children;
    if (
        bodyChildren.length === 1 &&
        bodyChildren[0].tagName === 'DIV' &&
        bodyChildren[0].classList.contains(cls)
    ) {
        // Replace body content with the wrapper's inner content
        doc.body.innerHTML = bodyChildren[0].innerHTML;
    }

    const STRIP_TAGS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'ul', 'ol', 'li', 'blockquote', 'strong', 'em', 'span'];
    STRIP_TAGS.forEach(tag => {
        doc.querySelectorAll(tag).forEach(el => el.removeAttribute('style'));
    });

    // Strip inline style from any outermost wrapper div (max-width container, etc.)
    const firstChild = doc.body.firstElementChild;
    if (firstChild && firstChild.tagName === 'DIV') {
        firstChild.removeAttribute('style');
    }

    return `<div class="${cls}">${doc.body.innerHTML}</div>`;
};

/**
 * Build the initial iframe srcdoc — HTML only, no user CSS.
 * CSS is injected separately via the iframe ref so edits don't cause full reloads.
 */
const buildIframeSrcdoc = (htmlBody: string) => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>* { box-sizing: border-box; } body { margin: 0; padding: 20px; background: #fff; }</style>
<style id="live-css"></style>
</head>
<body>${htmlBody}</body>
</html>`;

/**
 * Infer the HTML tag name from a CSS class name.
 * e.g. "blog-h2" → "h2", "blog-p" → "p", "content-blockquote" → "blockquote"
 */
const KNOWN_TAGS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'ul', 'ol', 'li', 'blockquote', 'a', 'strong', 'em', 'table', 'tr', 'td', 'th', 'img', 'span', 'div'];
const CLASS_ALIASES: Record<string, string> = {
    'para': 'p', 'paragraph': 'p', 'quote': 'blockquote', 'link': 'a',
    'image': 'img', 'list': 'ul', 'listitem': 'li', 'list-item': 'li',
    'heading': 'h2', 'title': 'h1', 'subtitle': 'h2',
};

const inferTagFromClassName = (cls: string): string | null => {
    if (KNOWN_TAGS.includes(cls)) return cls;
    // Suffix match: "blog-h2" → "h2", "content-strong" → "strong"
    for (const tag of KNOWN_TAGS) {
        if (cls.endsWith('-' + tag)) return tag;
    }
    // Alias match on full class or any trailing segment
    const parts = cls.split('-');
    for (let i = 0; i < parts.length; i++) {
        const suffix = parts.slice(i).join('-');
        if (CLASS_ALIASES[suffix]) return CLASS_ALIASES[suffix];
    }
    return null;
};

/**
 * Build a tag → [classNames] map from CSS selectors so the preview HTML can
 * add the right class attributes to each element, enabling el.matches(selector)
 * to work for class-based selectors like ".blog-h2".
 */
const buildTagClassMap = (selectors: string[], wrapperClass: string): Record<string, string[]> => {
    const map: Record<string, string[]> = {};
    const wc = wrapperClass || 'contentbody';
    for (const selector of selectors) {
        const classTokens = selector.match(/\.([a-zA-Z0-9_-]+)/g);
        if (!classTokens) continue;
        for (const token of classTokens) {
            const cls = token.slice(1); // strip leading dot
            if (cls === wc) continue;
            const tag = inferTagFromClassName(cls);
            if (!tag) continue;
            if (!map[tag]) map[tag] = [];
            if (!map[tag].includes(cls)) map[tag].push(cls);
        }
    }
    return map;
};

/**
 * Comprehensive default preview HTML.
 *
 * Covers every selector pattern commonly found in blog stylesheets:
 *   .blog-wrap, .blog-heading, .articlebody, .continuelink,
 *   .contentbody (= wrapperClass), .tableborder, .list-group,
 *   .list-group-item, .list-group-item2, and all their descendant rules.
 *
 * Every element carries explicit class names so el.matches(selector) works
 * for both class selectors (.articlebody) and descendant selectors (.blog-wrap h2).
 */
const buildDefaultPreviewHtml = (wrapperClass: string, _tagClassMap: Record<string, string[]> = {}) => {
    const cls = wrapperClass || 'contentbody';
    return `<div class="blog-wrap">

  <!-- ── .blog-wrap h2 + .blog-wrap h2 a ──────────── -->
  <h2><a href="#">Featured Post: The Art of Web Typography</a></h2>
  <h2><a href="#">Second Post: Understanding Modern CSS Layouts</a></h2>

  <!-- ── .blog-wrap .articlebody + .continuelink ───── -->
  <div class="articlebody">
    <h2>Article Body — H2 Inside articlebody</h2>
    <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco.</p>
    <p>Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa.</p>
    <a class="continuelink" href="#">Continue Reading →</a>
  </div>

  <!-- ── .contentbody (wrapperClass) ─────────────────
       Targets: p, ul, ol, li, a, hr, h3, h4           -->
  <div class="${cls}">

    <p>Body text inside <strong>${cls}</strong>. Lorem ipsum dolor sit amet,
    <a href="#">consectetur adipiscing elit</a>, sed do eiusmod tempor incididunt ut
    labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation.</p>

    <h3>H3 Section Heading — contentbody h3 style</h3>
    <p>Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu
    fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa
    qui officia deserunt mollit anim id est laborum.</p>

    <h4>H4 Sub-section Heading — contentbody h4 style</h4>
    <p>Sunt in culpa qui officia deserunt mollit anim id est laborum. Lorem ipsum dolor
    sit amet, consectetur adipiscing elit, sed do eiusmod tempor.</p>

    <ul>
      <li>Unordered list item — font size and line spacing</li>
      <li>Second item — color contrast and accessibility</li>
      <li>Third item — margin, padding, and white space</li>
      <li>Fourth item — typeface selection and pairing</li>
    </ul>

    <ol>
      <li>Step one — define your base font size (16px)</li>
      <li>Step two — set a modular heading scale</li>
      <li>Step three — choose complementary typefaces</li>
      <li>Step four — test across device widths</li>
    </ol>

    <hr>

    <!-- ── .tableborder + td + img ───────────────── -->
    <table class="tableborder">
      <tbody>
        <tr>
          <td>
            <img src="https://placehold.co/120x90?text=Image+1" alt="Product 1" style="display:block;">
          </td>
          <td>
            <strong>Product Title One</strong>
            <p>Short description showing table cell paragraph and anchor styling.</p>
            <a href="#">View Details</a>
          </td>
        </tr>
        <tr>
          <td>
            <img src="https://placehold.co/120x90?text=Image+2" alt="Product 2" style="display:block;">
          </td>
          <td>
            <strong>Product Title Two</strong>
            <p>Another row showing how multiple table rows appear with this stylesheet.</p>
            <a href="#">View Details</a>
          </td>
        </tr>
      </tbody>
    </table>

    <p>Closing paragraph after the table. Lorem ipsum dolor sit amet, consectetur
    adipiscing elit. See our <a href="#">complete guide</a> for more best practices
    on typography and layout design.</p>

  </div><!-- /.${cls} -->

  <!-- ── .list-group + .list-group-item ─────────────── -->
  <div class="list-group">
    <a class="list-group-item" href="#">Standard List Group Item</a>
    <a class="list-group-item active" href="#">Active List Group Item</a>
    <a class="list-group-item" href="#">Third List Group Item</a>
  </div>

  <!-- ── .list-group-item2 + a.list-group-item2 ─────── -->
  <div class="list-group-item2">
    <a class="list-group-item2" href="#">Featured Category — Large Link Style</a>
  </div>
  <div class="list-group-item2">
    <a class="list-group-item2" href="#">Second Category — Large Link Style</a>
  </div>

</div><!-- /.blog-wrap -->`
};

type RightTab = 'visual' | 'raw';

const CssTabContent = ({ closeDialog, template, refreshPage }: { closeDialog: () => void, template: any, refreshPage?: () => void }) => {
    const [editingCss, setEditingCss] = useState('');
    const [editingWrapperClass, setEditingWrapperClass] = useState('contentbody');
    const [copied, setCopied] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const iframeRef = useRef<HTMLIFrameElement>(null);
    // Right panel state
    const [rightTab, setRightTab] = useState<RightTab>('visual');
    const [parsedCss, setParsedCss] = useState<ParsedCss>({});
    const toast = useToastStore();

    // Refs so iframe callbacks always see fresh values without stale closures
    const editingCssRef = useRef(editingCss);
    editingCssRef.current = editingCss;
    const parsedCssRef = useRef(parsedCss);
    parsedCssRef.current = parsedCss;

    const [highlightedSelector, setHighlightedSelector] = useState<string | null>(null);

    // ── Real-time CSS injection: push editingCss into the live-css style tag ───
    // Runs on every editingCss change while the iframe is already loaded.
    useEffect(() => {
        try {
            const doc = iframeRef.current?.contentDocument;
            if (!doc || doc.readyState !== 'complete') return;
            const styleEl = doc.getElementById('live-css') as HTMLStyleElement | null;
            if (styleEl) styleEl.textContent = editingCss;
        } catch { /* cross-origin guard */ }
    }, [editingCss]);

    // ── onLoad handler: inject CSS, disable links, tooltip on hover, highlight on click
    const handleIframeLoad = () => {
        try {
            const doc = iframeRef.current?.contentDocument;
            if (!doc) return;

            // 1. Inject current CSS
            const styleEl = doc.getElementById('live-css') as HTMLStyleElement | null;
            if (styleEl) styleEl.textContent = editingCssRef.current;

            // 2. Inject hover tooltip element
            const prevTooltip = doc.getElementById('css-hover-tooltip');
            if (prevTooltip) prevTooltip.remove();
            const tooltip = doc.createElement('div');
            tooltip.id = 'css-hover-tooltip';
            tooltip.style.cssText = [
                'position:fixed',
                'background:#1e293b',
                'color:#e2e8f0',
                'font-size:11px',
                'font-family:monospace',
                'padding:3px 10px',
                'border-radius:4px',
                'pointer-events:none',
                'z-index:99999',
                'display:none',
                'max-width:360px',
                'white-space:nowrap',
                'box-shadow:0 2px 8px rgba(0,0,0,0.45)',
                'line-height:1.8',
            ].join(';');
            doc.body.appendChild(tooltip);

            doc.addEventListener('mouseover', (e: MouseEvent) => {
                const target = e.target as Element;
                if (!target || target === doc.body || target === doc.documentElement || target.id === 'css-hover-tooltip') {
                    tooltip.style.display = 'none';
                    return;
                }
                const tag = target.tagName.toLowerCase();
                const classes = typeof target.className === 'string' ? target.className.trim() : '';
                const classStr = classes ? classes.split(/\s+/).map(c => `.${c}`).join('') : '';
                tooltip.textContent = classStr ? `${tag}${classStr}` : tag;
                tooltip.style.display = 'block';
            });

            doc.addEventListener('mousemove', (e: MouseEvent) => {
                tooltip.style.left = `${e.clientX + 12}px`;
                tooltip.style.top = `${e.clientY - 34}px`;
            });

            doc.addEventListener('mouseleave', () => {
                tooltip.style.display = 'none';
            });

            // 3. Click: prevent link/button navigation + highlight matching CSS rule
            doc.addEventListener('click', (e: MouseEvent) => {
                e.preventDefault(); // stop <a> href and <button> submit from firing

                const selectors = Object.keys(parsedCssRef.current);
                if (selectors.length === 0) return;

                let matched: string | null = null;
                let el: Element | null = e.target as Element;

                while (el && el.tagName !== 'BODY') {
                    for (const sel of selectors) {
                        try {
                            if (el.matches(sel)) { matched = sel; break; }
                        } catch { /* invalid selector */ }
                    }
                    if (matched) break;
                    el = el.parentElement;
                }

                setHighlightedSelector(matched);
            });
        } catch { /* cross-origin guard */ }
    };

    useEffect(() => {
        const css = template?.settings?.blogCss || '';
        setEditingCss(css);
        setParsedCss(parseCss(css));
        setEditingWrapperClass(template?.settings?.blogCssWrapperClass || 'contentbody');
        setRightTab('visual');
        setHighlightedSelector(null);
    }, [template]);

    // Derive tag→class map only from selector keys (not property values) so the
    // iframe HTML is rebuilt when new CSS rules are added/removed, but NOT on every
    // property value edit (which would cause the iframe to flicker/reload constantly).
    const selectorKeys = Object.keys(parsedCss).join('|');
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const htmlTagClassMap = useMemo(
        () => buildTagClassMap(Object.keys(parsedCss), editingWrapperClass),
        // Intentionally depend on the stable key string + wrapper class, not parsedCss object
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [selectorKeys, editingWrapperClass]
    );

    // Rebuild preview when wrapper class or CSS selector set changes
    const iframeSrcdoc = useMemo(
        () => buildIframeSrcdoc(buildDefaultPreviewHtml(editingWrapperClass, htmlTagClassMap)),
        [editingWrapperClass, htmlTagClassMap]
    );

    const handleSave = async () => {
        const updatedSettings = {
            ...template.settings,
            blogCss: editingCss,
            blogCssWrapperClass: editingWrapperClass || 'contentbody'
        };
        const requestBody = {
            fields: template.fields,
            settings: updatedSettings,
            s3FileName: template.s3FileName,
            name: template.name,
            description: template.description,
            active: template.active
        };
        try {
            setIsSaving(true);
            await httpRequest('PATCH', `${config.nodeApiUrl}/idp/template/update/${template._id}`, requestBody);

            const prevSelectedTenant = window?.sessionStorage?.getItem('selectedTenant');
            window?.sessionStorage?.removeItem('selectedTenant');
            const resp: any = await httpRequest('POST', `${config.nodeApiUrl}/idp/template`, {
                pageSize: 1000,
                custom: true,
                filters: { deleted: false }
            });
            window?.sessionStorage?.setItem('templates', JSON.stringify(resp?.data));
            if (prevSelectedTenant) window?.sessionStorage?.setItem('selectedTenant', prevSelectedTenant);

            toast.success('Blog CSS updated successfully');
            closeDialog();
            if (refreshPage) refreshPage();
            else window.location.reload();
        } catch (error) {
            toast.error('Failed to update Blog CSS');
        } finally {
            setIsSaving(false);
        }
    };

    const handleCopyCss = () => {
        navigator.clipboard.writeText(editingCss);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleReset = () => {
        const css = template?.settings?.blogCss || '';
        setEditingCss(css);
        setParsedCss(parseCss(css));
        setEditingWrapperClass(template?.settings?.blogCssWrapperClass || 'contentbody');
    };

    return (
        <div className="flex flex-col flex-1 h-full w-full relative bg-white">
            {/* Toolbar */}
            <div className="flex items-center gap-3 border-b px-5 py-2.5 shrink-0">
                <span className="text-sm font-medium text-gray-700 shrink-0">Wrapper Class</span>
                <input
                    type="text"
                    value={editingWrapperClass}
                    onChange={e => setEditingWrapperClass(e.target.value)}
                    className="rounded-md border border-gray-300 px-3 py-1 text-sm font-mono outline-none focus:border-sky-500"
                    placeholder="contentbody"
                    style={{ width: 180 }}
                />
                <div className="flex items-center gap-2 ml-auto">
                    <Button small outlined startIcon={<RotateCcw size={14} />} onClick={handleReset}>Reset CSS</Button>
                    <Button
                        small
                        outlined
                        startIcon={copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
                        onClick={handleCopyCss}
                        disabled={!editingCss.trim()}
                    >
                        {copied ? 'Copied' : 'Copy CSS'}
                    </Button>
                </div>
            </div>

            {/* Split panel */}
            <div className="flex flex-1 min-h-0 overflow-hidden">

                {/* ── LEFT: live preview ── */}
                <div className="flex flex-1 flex-col border-r min-w-0">
                    <div className="flex items-center gap-2 border-b bg-gray-50 px-4 py-2 shrink-0">
                        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Preview</span>
                        <span className="rounded bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-400">hover to see class · click to highlight CSS rule</span>
                    </div>
                    <iframe
                        ref={iframeRef}
                        srcDoc={iframeSrcdoc}
                        title="CSS Preview"
                        className="flex-1 w-full border-none"
                        sandbox="allow-same-origin"
                        onLoad={handleIframeLoad}
                    />
                </div>

                {/* ── RIGHT: CSS editor (Visual / Raw) ── */}
                <div className="flex w-[42%] shrink-0 flex-col min-w-0">
                    {/* Right sub-toolbar with tabs */}
                    <div className="flex items-center gap-1 border-b bg-gray-50 px-3 py-1.5 shrink-0">
                        <button
                            onClick={() => {
                                // Switching to Visual: re-parse from current raw text
                                setParsedCss(parseCss(editingCss));
                                setRightTab('visual');
                            }}
                            className={`px-3 py-1.5 text-xs font-semibold rounded transition-colors ${rightTab === 'visual' ? 'bg-white border border-gray-200 text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            Visual
                        </button>
                        <button
                            onClick={() => {
                                // Switching to Raw: serialize parsedCss so edits from visual are reflected
                                setEditingCss(serializeCss(parsedCss));
                                setRightTab('raw');
                            }}
                            className={`px-3 py-1.5 text-xs font-semibold rounded transition-colors ${rightTab === 'raw' ? 'bg-white border border-gray-200 text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            Raw
                        </button>
                    </div>

                    {/* Visual — accordion editor */}
                    {rightTab === 'visual' ? (
                        <div className="flex-1 overflow-y-auto">
                            <CssVisualEditor
                                parsed={parsedCss}
                                onChange={next => {
                                    setParsedCss(next);
                                    setEditingCss(serializeCss(next));
                                }}
                                highlightedSelector={highlightedSelector}
                            />
                        </div>
                    ) : (
                        /* Raw — plain textarea */
                        <textarea
                            value={editingCss}
                            onChange={e => setEditingCss(e.target.value)}
                            className="flex-1 resize-none p-4 font-mono text-sm leading-relaxed text-gray-800 outline-none placeholder:text-gray-400"
                            placeholder={`.contentbody {\n  font-family: Arial, sans-serif;\n  font-size: 16px;\n  line-height: 1.6;\n}\n\n.contentbody h2 {\n  font-size: 1.5rem;\n  font-weight: 700;\n}\n\n/* Add your full stylesheet here */`}
                            spellCheck={false}
                        />
                    )}
                </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 border-t bg-gray-50/50 px-6 py-3 shrink-0">
                <Button outlined onClick={closeDialog}>Cancel</Button>
                <Button startIcon={<Save size={16} />} onClick={handleSave} disabled={isSaving}>
                    {isSaving ? 'Saving...' : 'Save CSS'}
                </Button>
            </div>
        </div>
    );
};
