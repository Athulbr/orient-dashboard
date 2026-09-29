import { MousePointerClick, X } from 'lucide-react';
import { JsonVisualizerComponent } from './JsonVisualizer';

interface PathPickerDialogIF {
    test?: string;
    closeDialog: () => void;
    inputData: any;
    handlePathSelect: (path: string) => void;
    isOpen: boolean;
}

const PathPickerDialog: React.FC<PathPickerDialogIF> = ({ closeDialog, inputData, handlePathSelect, isOpen }) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-6">
            <div className="bg-white w-full h-full rounded-xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
                <div className="p-4 border-b flex justify-between items-center bg-gray-50">
                    <div>
                        <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                            <MousePointerClick size={24} className="text-blue-500" />
                            Select JSON Path
                        </h3>
                        <p className="text-sm text-gray-500 mt-1">Navigate the schema below. Click a value to auto-generate its path.</p>
                    </div>

                    <button onClick={closeDialog} className="p-2 cursor-pointer bg-gray-200 rounded-full transition-colors mr-2 hover:bg-red-200">
                        <X size={16} />
                    </button>
                </div>
                <div className="flex-1 overflow-auto p-10 bg-slate-50">
                    <div className="inline-block min-w-full">
                        <JsonVisualizerComponent data={inputData[0]} onSelect={handlePathSelect} />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PathPickerDialog;
