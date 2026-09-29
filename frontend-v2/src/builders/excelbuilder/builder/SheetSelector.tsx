import React from 'react';
import { ChevronDown, ChevronUp, Plus, Trash2, Filter } from 'lucide-react';
import type { ExcelSheetConfig } from './index';

interface SheetSelectorProps {
    sheets: ExcelSheetConfig[];
    activeSheetIndex: number;
    setActiveSheetIndex: (index: number) => void;
    setSheets: React.Dispatch<React.SetStateAction<ExcelSheetConfig[]>>;
    addSheet: () => void;
    deleteSheet: (e: React.MouseEvent, index: number) => void;
    showColumns: boolean;
    setShowColumns: React.Dispatch<React.SetStateAction<boolean>>;
    showFiltersView?: boolean;
    onToggleFiltersView?: () => void;
}

const SheetSelector: React.FC<SheetSelectorProps> = ({
    sheets,
    activeSheetIndex,
    setActiveSheetIndex,
    setSheets,
    addSheet,
    deleteSheet,
    showColumns,
    setShowColumns,
    showFiltersView,
    onToggleFiltersView
}) => {
    return (
        <div className="flex justify-between items-center pr-4 border-b">
            <div className="flex items-center bg-gray-50  overflow-x-auto no-scrollbar">
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
            <div className="flex items-center gap-2">
                {onToggleFiltersView && (
                    <button
                        onClick={onToggleFiltersView}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded transition-colors bg-gray-100 text-gray-700 hover:bg-gray-200"
                        title={showFiltersView ? 'Switch to Columns Builder' : 'Switch to Filters Builder'}
                    >
                        <Filter size={14} />
                        {showFiltersView ? 'Columns' : 'Filters'}
                    </button>
                )}
            {showColumns ? (
                <ChevronDown
                    onClick={e => {
                        e.stopPropagation();
                        setShowColumns(false);
                    }}
                    size={18}
                    className="text-gray-500 border h-6 w-6 rounded cursor-pointer pt-0.5 hover:bg-gray-100 transition-colors"
                />
            ) : (
                <ChevronUp
                    onClick={e => {
                        e.stopPropagation();
                        setShowColumns(true);
                    }}
                    size={18}
                    className="text-gray-500 border h-6 w-6 rounded cursor-pointer pt-0.5 hover:bg-gray-100 transition-colors"
                />
            )}
            </div>
        </div>
    );
};

export default SheetSelector;
