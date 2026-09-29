import React from 'react';
import { ChevronRight, MousePointerClick, Edit2, Plus, Code, ChevronLeft, Trash2 } from 'lucide-react';
import type { ExcelColumnIF } from './index';

interface ColumnCardProps {
    col: ExcelColumnIF;
    idx: number;
    updateColumn: (colId: string, field: keyof ExcelColumnIF, value: string) => void;
    deleteColumn: (colId: string) => void;
    openPathPicker: (colId: string) => void;
    openJsEditor: (colId: string, currentJs?: string) => void;
    moveColumnLeft: (index: number) => void;
    moveColumnRight: (index: number) => void;
}

const ColumnCard: React.FC<ColumnCardProps> = ({ col, idx, updateColumn, deleteColumn, openPathPicker, openJsEditor, moveColumnLeft, moveColumnRight }) => {
    return (
        <div className="flex flex-col flex-shrink-0 w-72 bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-md transition-shadow h-full max-h-[320px]">
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
                <button onClick={() => deleteColumn(col.id)} className="text-gray-400 hover:text-red-500 p-1 cursor-pointer">
                    <Trash2 size={14} />
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
                            <MousePointerClick size={16} className="text-blue-500" />
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
                <div className="flex justify-between">
                    <ChevronLeft onClick={() => moveColumnLeft(idx)} size={16} className="text-gray-500 cursor-pointer hover:bg-gray-200 rounded" />
                    <ChevronRight onClick={() => moveColumnRight(idx)} size={16} className="text-gray-500 cursor-pointer hover:bg-gray-200 rounded" />
                </div>
            </div>
        </div>
    );
};

export default ColumnCard;
