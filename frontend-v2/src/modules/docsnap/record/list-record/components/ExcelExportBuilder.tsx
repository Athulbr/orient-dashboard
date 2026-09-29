import React, { useState } from 'react';
import { Plus, Trash2, Code, FileSpreadsheet, X, MousePointerClick, Edit2, Check, ChevronRight, Maximize2, Eraser, Save } from 'lucide-react';
import { Button } from '../../../../../components/Button';

// --- Types ---

interface ExcelColumn {
    id: string;
    columnName: string;
    jsonPath: string;
    javascript?: string;
}

export interface ExcelSheetConfig {
    id: string;
    sheetName: string;
    columns: ExcelColumn[];
}

// --- Sample Data ---
const sampleRecord: any[] = [
    {
        name: 'John Doe',
        email: 'john@example.com',
        age: 30,
        address: { street: '123 Main St', city: 'Anytown' },
        games: [
            { name: 'chess', type: 'indoor' },
            { name: 'swimming', type: 'outdoor' }
        ],
        extra: {
            hobbies: [
                { name: { value: 'writing' }, type: { value: 'indoor' } },
                { name: { value: 'basketball' }, type: { value: 'outdoor' } }
            ]
        },
        test: { test1: { test2: [{ test3: 'A1' }, { test3: 'A2' }] } }
    }
];

// --- Helper Functions ---

const generateId = () => Math.random().toString(36).substr(2, 9);

const normalizePath = (path: string) => {
    return path.replace(/\[\d+\]/g, '[*]');
};

// --- Sub-Components ---

/**
 * Visual JSON Path Selector (Box inside Box)
 */
const JsonVisualizer = ({ data, path = '', onSelect }: { data: any; path?: string; onSelect: (p: string) => void }) => {
    const isObject = data !== null && typeof data === 'object';
    const isArray = Array.isArray(data);

    if (data === null || data === undefined) {
        return <span className="text-gray-400 italic text-xs">null</span>;
    }

    if (!isObject) {
        return (
            <button
                onClick={e => {
                    e.stopPropagation();
                    onSelect(normalizePath(path));
                }}
                className="hover:bg-blue-100 hover:text-blue-700 bg-gray-50 px-3 py-1 rounded border border-gray-200 text-sm font-mono text-gray-700 transition-colors cursor-pointer shadow-sm hover:shadow"
            >
                {String(data)}
            </button>
        );
    }

    return (
        <div
            className={`
            flex flex-col gap-2 p-3 rounded border
            ${path === '' ? 'border-none p-0' : 'border-gray-300 bg-white shadow-sm ml-4'}
        `}
        >
            {path && (
                <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-0 select-none">
                    {path
                        .split('.')
                        .pop()
                        ?.replace(/\[.*?\]/, ' []')}
                </div>
            )}

            <div className="flex flex-wrap gap-3 items-start">
                {Object.keys(data).map(key => {
                    if (isArray && parseInt(key) > 1) return null;

                    const currentPath = path ? (isArray ? `${path}[${key}]` : `${path}.${key}`) : key;

                    return (
                        <div key={key} className="flex flex-col">
                            {!isArray && <span className="text-xs font-semibold text-gray-600 mb-1 ml-1 select-none">{key}:</span>}
                            <JsonVisualizer data={data[key]} path={currentPath} onSelect={onSelect} />
                        </div>
                    );
                })}
                {isArray && data.length > 2 && <span className="text-xs text-gray-400 self-center">...more</span>}
            </div>
        </div>
    );
};

// --- Main Component ---

interface ExcelExportBuilderProps {
    sheets: ExcelSheetConfig[];
    setSheets: React.Dispatch<React.SetStateAction<ExcelSheetConfig[]>>;
}

const ExcelExportBuilder: React.FC<ExcelExportBuilderProps> = ({ sheets, setSheets }) => {
    // const [sheets, setSheets] = useState<ExcelSheetConfig[]>([{ id: generateId(), sheetName: 'Sheet 1', columns: [] }]);
    const [activeSheetIndex, setActiveSheetIndex] = useState(0);

    // Modal States
    const [pathPickerOpen, setPathPickerOpen] = useState(false);
    const [jsEditorOpen, setJsEditorOpen] = useState(false);
    const [editingColId, setEditingColId] = useState<string | null>(null);
    const [tempJsCode, setTempJsCode] = useState('');

    // --- Actions ---

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
        const newCol: ExcelColumn = {
            id: generateId(),
            columnName: 'New Column',
            jsonPath: ''
        };
        const updatedSheets = [...sheets];
        updatedSheets[activeSheetIndex].columns.push(newCol);
        setSheets(updatedSheets);
    };

    const updateColumn = (colId: string, field: keyof ExcelColumn, value: string) => {
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

    // --- Modal Handlers ---

    const openPathPicker = (colId: string) => {
        setEditingColId(colId);
        setPathPickerOpen(true);
    };

    const handlePathSelect = (path: string) => {
        if (editingColId) {
            updateColumn(editingColId, 'jsonPath', path);
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

    return (
        <>
            <div className="flex flex-col w-full h-full max-h-[400px] border rounded-lg bg-white shadow-lg font-sans overflow-hidden relative">
                {/* Header / Tabs */}
                <div className="flex items-center bg-gray-50 border-b overflow-x-auto no-scrollbar">
                    {sheets.map((sheet, idx) => (
                        <div
                            key={sheet.id}
                            onClick={() => setActiveSheetIndex(idx)}
                            className={`
                                group flex items-center px-4 py-2 cursor-pointer text-sm font-medium border-r transition-all min-w-[120px] justify-between
                                ${activeSheetIndex === idx ? 'bg-white text-blue-600 border-b-2 border-b-blue-600' : 'text-gray-500 hover:bg-gray-100'}
                            `}
                        >
                            <input
                                className="bg-transparent focus:outline-none w-full cursor-pointer"
                                value={sheet.sheetName}
                                onChange={e => {
                                    const newSheets = [...sheets];
                                    newSheets[idx].sheetName = e.target.value;
                                    setSheets(newSheets);
                                }}
                            />
                            {sheets.length > 1 && (
                                <Trash2
                                    size={14}
                                    className="ml-2 text-gray-300 group-hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                                    onClick={e => deleteSheet(e, idx)}
                                />
                            )}
                        </div>
                    ))}
                    <button onClick={addSheet} className="p-3 text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors" title="Add Sheet">
                        <Plus size={18} />
                    </button>
                </div>

                {/* Main Content Area */}
                <div className="flex-1 overflow-hidden flex flex-col p-2 bg-gray-50/50">
                    <div className="flex justify-between items-center mb-4">
                        <div>
                            <h2 className="text-lg font-semibold text-gray-800">{activeSheet.sheetName} Configuration</h2>
                            <p className="text-xs text-gray-500">Define columns for this Excel sheet.</p>
                        </div>
                        <button
                            onClick={addColumn}
                            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 shadow-sm text-sm"
                        >
                            <Plus size={16} /> Add Column
                        </button>
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
                                    <div
                                        key={col.id}
                                        className="flex flex-col flex-shrink-0 w-72 bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-md transition-shadow h-full max-h-[320px]"
                                    >
                                        <div className="p-3 border-b border-gray-100 flex justify-between items-start bg-gray-50/50 rounded-t-xl">
                                            <div className="flex-1">
                                                <label className="text-[10px] font-bold text-gray-400 uppercase">Column Header</label>
                                                <input
                                                    value={col.columnName}
                                                    onChange={e => updateColumn(col.id, 'columnName', e.target.value)}
                                                    className="w-full font-medium text-gray-800 bg-transparent border-b border-transparent focus:border-blue-500 focus:outline-none text-sm pb-1"
                                                    placeholder="e.g. Full Name"
                                                />
                                            </div>
                                            <button onClick={() => deleteColumn(col.id)} className="text-gray-300 hover:text-red-500 p-1 cursor-pointer">
                                                <X size={14} />
                                            </button>
                                        </div>

                                        <div className="p-4 flex flex-col gap-4 overflow-y-auto">
                                            <div className="flex flex-col gap-1">
                                                <div className="flex justify-between items-center">
                                                    <label className="text-xs font-semibold text-gray-600 flex items-center gap-1">
                                                        <ChevronRight size={12} /> JSON Path
                                                    </label>
                                                </div>
                                                <div className="flex gap-2">
                                                    <input
                                                        value={col.jsonPath}
                                                        onChange={e => updateColumn(col.id, 'jsonPath', e.target.value)}
                                                        className="flex-1 text-xs bg-gray-50 border border-gray-200 rounded px-2 py-2 font-mono text-gray-700 focus:ring-1 focus:ring-blue-500 outline-none"
                                                        placeholder="path.to.value"
                                                    />
                                                    <button
                                                        onClick={() => openPathPicker(col.id)}
                                                        className="p-2 bg-blue-100 text-blue-600 rounded hover:bg-blue-200 transition-colors cursor-pointer"
                                                        title="Pick from Data"
                                                    >
                                                        <Maximize2 size={16} />
                                                    </button>
                                                </div>
                                            </div>

                                            <div className="flex flex-col gap-1 mt-auto">
                                                <label className="text-xs font-semibold text-gray-600 flex items-center gap-1">
                                                    <Code size={12} /> Transformation
                                                </label>
                                                {col.javascript ? (
                                                    <div className="relative group">
                                                        <div className=" max-h-25 bg-gray-900 rounded p-2 text-[10px] font-mono text-green-400 overflow-hidden opacity-90">
                                                            <pre>{col.javascript}</pre>
                                                        </div>
                                                        <button
                                                            onClick={() => openJsEditor(col.id, col.javascript)}
                                                            className="absolute top-1 right-1 bg-white/20 hover:bg-white/40 text-white p-1 rounded backdrop-blur-sm"
                                                        >
                                                            <Edit2 size={10} />
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <button
                                                        onClick={() => openJsEditor(col.id)}
                                                        className="w-full py-2 border border-dashed border-gray-300 rounded text-xs text-gray-500 hover:bg-gray-50 hover:text-blue-600 hover:border-blue-300 transition-all flex items-center justify-center gap-2"
                                                    >
                                                        <Plus size={12} /> Add JS Function
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* --- Dialog: JSON Path Picker (FULL SCREEN) --- */}
            {pathPickerOpen && (
                // Changed from absolute to fixed inset-0 z-[100] for full screen overlay
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-6">
                    <div className="bg-white w-full h-full rounded-xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
                        {/* Header */}
                        <div className="p-4 border-b flex justify-between items-center bg-gray-50">
                            <div>
                                <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                                    <MousePointerClick size={24} className="text-blue-500" />
                                    Select JSON Path
                                </h3>
                                <p className="text-sm text-gray-500 mt-1">Navigate the schema below. Click a value to auto-generate its path.</p>
                            </div>

                            <button
                                onClick={() => setPathPickerOpen(false)}
                                className="p-2 cursor-pointer bg-gray-200 rounded-full transition-colors mr-2 hover:bg-red-200"
                            >
                                <X size={16} />
                            </button>
                        </div>

                        {/* Helper Bar */}
                        <div className="bg-blue-50 p-3 text-sm text-blue-800 border-b border-blue-100 flex items-center justify-between px-6">
                            <span>
                                <strong>Tip:</strong> Array indices (e.g., <code>[0]</code>) are automatically converted to wildcards (<code>[*]</code>).
                            </span>
                            <span className="text-xs uppercase font-bold tracking-wider bg-blue-200 px-2 py-1 rounded text-blue-800">Visual Mode</span>
                        </div>

                        {/* Content Area */}
                        <div className="flex-1 overflow-auto p-10 bg-slate-50">
                            <div className="inline-block min-w-full">
                                <JsonVisualizer data={sampleRecord[0]} onSelect={handlePathSelect} />
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* --- Dialog: JS Editor (FULL SCREEN) --- */}
            {jsEditorOpen && (
                // Changed from absolute to fixed inset-0 z-[100] for full screen overlay
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-6">
                    <div className="bg-white w-full h-full rounded-xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
                        <div className="p-4 border-b flex justify-between items-center bg-gray-50">
                            <div>
                                <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                                    <Code size={24} className="text-blue-600" />
                                    JavaScript Transformer
                                </h3>
                                <p className="text-sm text-gray-500 mt-1">Write a function to transform the raw data before export.</p>
                            </div>
                            <button
                                onClick={() => setJsEditorOpen(false)}
                                className="p-2 cursor-pointer bg-gray-200 rounded-full transition-colors mr-2 hover:bg-red-200"
                            >
                                <X size={16} />
                            </button>
                        </div>

                        <div className="flex-1 flex relative">
                            {/* Editor Area */}
                            <div className="flex-1 flex flex-col border-r border-gray-200 p-6 rounded-b-lg">
                                <textarea
                                    value={tempJsCode}
                                    onChange={e => setTempJsCode(e.target.value)}
                                    className="flex-1 w-full p-6 font-mono text-base bg-[#1e1e1e] text-[#d4d4d4] resize-none rounded outline-none focus:ring-0 leading-relaxed"
                                    spellCheck={false}
                                />
                            </div>

                            {/* Sidebar / Documentation */}
                            <div className="w-80 bg-gray-50 p-6 flex flex-col gap-4 border-l">
                                <h4 className="font-bold text-gray-700">Arguments</h4>
                                <div className="bg-white border rounded p-3 shadow-sm">
                                    <code className="text-blue-600 font-bold">data</code>
                                    <p className="text-xs text-gray-500 mt-1">The value found at the JSON path for the current record.</p>
                                </div>

                                <h4 className="font-bold text-gray-700 mt-4">Example</h4>
                                <div className="bg-gray-900 text-gray-300 text-xs p-3 rounded font-mono overflow-x-auto">
                                    <pre>{`function(data) {\n  if (!data) return "N/A";\n  return data.toUpperCase();\n}`}</pre>
                                </div>
                            </div>
                        </div>

                        <div className="p-4 border-t bg-gray-50 flex justify-end gap-3">
                            <Button
                                outlined
                                startIcon={<Eraser size={16} />}
                                onClick={() => {
                                    setJsEditorOpen(false);
                                    updateColumn(editingColId!, 'javascript', '');
                                }}
                            >
                                Remove Script
                            </Button>
                            <Button startIcon={<Save size={16} />} onClick={saveJsCode}>
                                Save Function
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default ExcelExportBuilder;
