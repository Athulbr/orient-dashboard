import { Code, Eraser, Save, X } from 'lucide-react';
import { Button } from '../../../components/Button';
import { ExcelColumnIF } from '.';

interface JsEditorDialogIF {
    isOpen: boolean;
    closeDialog: () => void;
    setTempJsCode: (code: string) => void;
    tempJsCode: string;
    updateColumn: (colId: string, field: keyof ExcelColumnIF, value: string) => void;
    editingColId: string | null;
    saveJsCode: () => void;
}

const JsEditorDialog: React.FC<JsEditorDialogIF> = ({ closeDialog, isOpen, setTempJsCode, tempJsCode, updateColumn, editingColId, saveJsCode }) => {
    if (!isOpen) return null;
    return (
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
                    <button onClick={closeDialog} className="p-2 cursor-pointer bg-gray-200 rounded-full transition-colors mr-2 hover:bg-red-200">
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
                            closeDialog();
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
    );
};

export default JsEditorDialog;
