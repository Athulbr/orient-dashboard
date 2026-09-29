import React, { useEffect, useState } from 'react';
import { Plus, FileSpreadsheet, Filter } from 'lucide-react';
import { Button } from '../../../components/Button';
import { capitalize } from 'lodash';
import PathPickerDialog from './pathPickerDialog';
import JsEditorDialog from './JsEditor';
import SheetSelector from './SheetSelector';
import { useAutoColumns } from './useAutoColumnsHook';
import { cn } from '../../../global-utils/twMerge';
import { FilterItemIF } from './FiltersBuilder';
import ColumnCard from './ColumnCard';
import AutoColumnSelectorDialog from './AutoColumnSelectorDialog';
import FullScreenLoader from '../../../components/FullScreenLoader';
import { DialogComponent } from '../../../components/DialogComponent';
import { useExportbuilderState } from '../../../modules/config/exportbuilder/hooks/exportbuilderContext';

export interface ExcelColumnIF {
    id: string;
    columnName: string;
    jsonPath: string;
    javascript?: string;
}

export interface ExcelSheetConfig {
    id: string;
    sheetName: string;
    columns: ExcelColumnIF[];
}

const generateId = () => Math.random().toString(36).substr(2, 9);

interface ExcelExportBuilderProps {
    sheets: ExcelSheetConfig[];
    setSheets: React.Dispatch<React.SetStateAction<ExcelSheetConfig[]>>;
    inputData: any;
    filters?: FilterItemIF[];
    setFilters?: React.Dispatch<React.SetStateAction<FilterItemIF[]>>;
    showFiltersView?: boolean;
    onToggleFiltersView?: () => void;
}

export const ExcelExportBuilder: React.FC<ExcelExportBuilderProps> = ({
    sheets,
    setSheets,
    inputData,
    filters: externalFilters,
    setFilters: externalSetFilters,
    showFiltersView,
    onToggleFiltersView
}) => {
    const [activeSheetIndex, setActiveSheetIndex] = useState(0);

    const [pathPickerOpen, setPathPickerOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [jsEditorOpen, setJsEditorOpen] = useState(false);
    const [showColumns, setShowColumns] = useState(true);
    const [editingColId, setEditingColId] = useState<string | null>(null);
    const [tempJsCode, setTempJsCode] = useState('');
    const [autoDialogOpen, setAutoDialogOpen] = useState(false);
    const [showTemplateSelector, setShowTemplateSelector] = useState(true);
    const [templateOptions, setTemplateOptions] = useState<{ id: string; name: string }[]>([]);
    const { state: exportState, setState: setExportState } = useExportbuilderState();

    const detectedColumns = useAutoColumns({ inputData, sheets, setSheets, activeSheetIndex });

    // useEffect(() => {
    //     // Stop blocking UI regardless of detected columns; dialog will open via Populate button
    //     setLoading(false);
    //     // eslint-disable-next-line react-hooks/exhaustive-deps
    // }, [inputData, activeSheetIndex]);

    // useEffect(() => {
    //     setShowTemplateSelector(true);
    // }, []);

    // const templateOptions: { id: string; name: string }[] = (() => {
    //     try {
    //         const templateList = JSON.parse(sessionStorage.getItem('templates') || '[]');
    //         const selectedTenant = sessionStorage.getItem('selectedTenant');
    //         const moduleFilter = sessionStorage.getItem('module');
    //         return (templateList || [])
    //             .filter((t: any) => {
    //                 const tenantOk = !selectedTenant || selectedTenant === 'all' || t?.tenantId === selectedTenant;
    //                 const templateType = t?.settings?.templateType ?? t?.templateType;
    //                 const moduleOk = !moduleFilter || moduleFilter === 'all' || templateType === moduleFilter;
    //                 return tenantOk && moduleOk;
    //             })
    //             .map((t: any) => ({ id: t?._id, name: t?.name }));
    //     } catch (_e) {
    //         return [] as { id: string; name: string }[];
    //     }
    // })();

    const filterByTenantId = (templateList: any[]) => {
        const selectedTenant = sessionStorage.getItem('selectedTenant') || JSON.parse(sessionStorage.getItem('user') || '{}').tenant?._id;
        if (!selectedTenant || selectedTenant === 'all') return templateList;
        return templateList.filter((template: any) => template.tenantId === selectedTenant);
    };

    const filterByModule = (templateList: any[]) => {
        const selectedModule = sessionStorage.getItem('module');
        return templateList.filter((template: any) => template.settings?.module === selectedModule);
    };

    useEffect(() => {
        const templateList = JSON.parse(sessionStorage.getItem('templates') || '[]');
        const filteredTemplates = filterByTenantId(templateList);
        const finalTemplates = filterByModule(filteredTemplates);
        setTemplateOptions(finalTemplates.map((template: any) => ({ id: template?._id, name: template?.name })));
    }, []);

    const addSheet = () => {
        setSheets([...sheets, { id: generateId(), sheetName: `Sheet ${sheets.length + 1}`, columns: [] }]);
        setActiveSheetIndex(sheets.length);
    };

    const deleteSheet = (e: React.MouseEvent, index: number) => {
        e.stopPropagation();
        if (sheets.length === 1) return;
        const newSheets = sheets.filter((_, i) => i !== index);
        setSheets(newSheets);
        if (activeSheetIndex >= index && activeSheetIndex > 0) setActiveSheetIndex(activeSheetIndex - 1);
    };

    const addColumn = () => {
        const newCol: ExcelColumnIF = {
            id: generateId(),
            columnName: 'New Column',
            jsonPath: ''
        };
        const updatedSheets = [...sheets];
        updatedSheets[activeSheetIndex].columns.push(newCol);
        setSheets(updatedSheets);
    };

    const updateColumn = (colId: string, field: keyof ExcelColumnIF, value: string) => {
        const updatedSheets = [...sheets];
        const col = updatedSheets[activeSheetIndex].columns.find(c => c.id === colId);
        if (col) {
            (col as any)[field] = value;
            setSheets(updatedSheets);
        }
    };

    const deleteColumn = (colId: string) => {
        const updatedSheets = [...sheets];
        updatedSheets[activeSheetIndex].columns = updatedSheets[activeSheetIndex].columns.filter(c => c.id !== colId);
        setSheets(updatedSheets);
    };

    const moveColumn = (fromIndex: number, toIndex: number) => {
        const updatedSheets = [...sheets];
        const cols = [...updatedSheets[activeSheetIndex].columns];
        if (toIndex < 0 || toIndex >= cols.length || fromIndex === toIndex) return;
        const [moved] = cols.splice(fromIndex, 1);
        cols.splice(toIndex, 0, moved);
        updatedSheets[activeSheetIndex].columns = cols;
        setSheets(updatedSheets);
    };

    const moveColumnLeft = (index: number) => moveColumn(index, index - 1);
    const moveColumnRight = (index: number) => moveColumn(index, index + 1);

    // --- Modal Handlers ---

    const openPathPicker = (colId: string) => {
        setEditingColId(colId);
        setPathPickerOpen(true);
    };

    const handlePathSelect = (path: string) => {
        const columnName = path.split('.')[path.split('.').length - 2]?.replace('_', ' ') || 'New Column';
        if (editingColId) {
            updateColumn(editingColId, 'jsonPath', path);
            updateColumn(editingColId, 'columnName', capitalize(columnName));
            setPathPickerOpen(false);
            setEditingColId(null);
        }
    };

    const openJsEditor = (colId: string, currentJs: string = '') => {
        setEditingColId(colId);
        setTempJsCode(currentJs || `function(data) {\n  // return modified value\n  return data;\n}`);
        setJsEditorOpen(true);
    };

    const saveJsCode = () => {
        if (editingColId) {
            updateColumn(editingColId, 'javascript', tempJsCode);
            setJsEditorOpen(false);
            setEditingColId(null);
        }
    };

    const activeSheet = sheets[activeSheetIndex];

    if (loading) {
        return <FullScreenLoader />;
    }

    return (
        <>
            <div
                className={cn(
                    'flex flex-col w-full border rounded-lg bg-white shadow-lg font-sans overflow-hidden relative transition-discrete',
                    showColumns ? 'h-full max-h-[400px]' : ''
                )}
            >
                {/* Header / Tabs */}
                <SheetSelector
                    sheets={sheets}
                    activeSheetIndex={activeSheetIndex}
                    setActiveSheetIndex={setActiveSheetIndex}
                    setSheets={setSheets}
                    addSheet={addSheet}
                    deleteSheet={deleteSheet}
                    showColumns={showColumns}
                    setShowColumns={setShowColumns}
                    showFiltersView={showFiltersView}
                    onToggleFiltersView={onToggleFiltersView}
                />

                {/* Main Content Area */}
                {showColumns && (
                    <div className="flex-1 overflow-hidden flex flex-col p-2 bg-gray-50/50">
                        <div className="flex justify-between items-center mb-4">
                            <div>
                                <h2 className="text-lg font-semibold text-gray-800">{activeSheet.sheetName} Configuration</h2>
                                <p className="text-xs text-gray-500">Define columns for this Excel sheet.</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <Button onClick={() => setAutoDialogOpen(true)} outlined>
                                    Select Columns
                                </Button>
                                <Button onClick={addColumn} outlined>
                                    <Plus size={16} /> Add Column
                                </Button>
                            </div>
                        </div>

                        {/* Horizontal Column List */}
                        <div className="flex-1 overflow-x-auto overflow-y-hidden pb-2">
                            <div className="flex gap-4 h-full items-start">
                                {activeSheet.columns.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center w-full h-40  text-gray-400">
                                        <FileSpreadsheet size={32} className="mb-2" />
                                        <p>No columns added yet.</p>
                                    </div>
                                ) : (
                                    activeSheet.columns.map((col, idx) => (
                                        <ColumnCard
                                            key={col.id}
                                            col={col}
                                            idx={idx}
                                            updateColumn={updateColumn}
                                            deleteColumn={deleteColumn}
                                            openPathPicker={openPathPicker}
                                            openJsEditor={openJsEditor}
                                            moveColumnLeft={moveColumnLeft}
                                            moveColumnRight={moveColumnRight}
                                        />
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* --- Dialog: JSON Path Picker (FULL SCREEN) --- */}
            <PathPickerDialog isOpen={pathPickerOpen} closeDialog={() => setPathPickerOpen(false)} inputData={inputData} handlePathSelect={handlePathSelect} />

            {/* --- Dialog: JS Editor (FULL SCREEN) --- */}
            <JsEditorDialog
                isOpen={jsEditorOpen}
                closeDialog={() => setJsEditorOpen(false)}
                setTempJsCode={setTempJsCode}
                tempJsCode={tempJsCode}
                updateColumn={updateColumn}
                editingColId={editingColId}
                saveJsCode={saveJsCode}
            />

            {/* --- Dialog: Auto Column Selector --- */}
            <AutoColumnSelectorDialog
                isOpen={autoDialogOpen}
                onClose={() => setAutoDialogOpen(false)}
                columns={detectedColumns}
                onConfirm={selected => {
                    const updatedSheets = [...sheets];
                    const existing = new Set(updatedSheets[activeSheetIndex].columns.map(c => c.jsonPath));
                    const toAdd = selected.filter(c => !existing.has(c.jsonPath));
                    if (toAdd.length > 0) {
                        updatedSheets[activeSheetIndex] = {
                            ...updatedSheets[activeSheetIndex],
                            columns: [...updatedSheets[activeSheetIndex].columns, ...toAdd]
                        };
                        setSheets(updatedSheets);
                    }
                    setAutoDialogOpen(false);
                }}
            />

            {/* --- Dialog: Initial Template Selector --- */}
            <DialogComponent
                name="Select a Template"
                isOpen={showTemplateSelector}
                closeDialog={() => setShowTemplateSelector(false)}
                secondaryButtonText="Close"
                className="w-[640px]"
            >
                <div className="p-6 space-y-4">
                    {templateOptions.length === 0 ? (
                        <div className="text-sm text-gray-500">No templates found for the selected tenant.</div>
                    ) : (
                        <div className="grid grid-cols-1 gap-2">
                            {templateOptions.map((t: any) => (
                                <button
                                    key={t.id}
                                    onClick={() => {
                                        const newState = { ...exportState, selectedTemplateId: [t.id] };
                                        setExportState(newState);
                                        setShowTemplateSelector(false);
                                    }}
                                    className={cn(
                                        'w-full cursor-pointer text-left px-4 py-3 rounded border hover:bg-gray-50 transition-colors',
                                        exportState?.selectedTemplateId?.includes(t.id) ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                                    )}
                                >
                                    <div className="font-medium text-gray-800">{t.name}</div>
                                    <div className="text-xs text-gray-500">{t.id}</div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </DialogComponent>
        </>
    );
};
