import { useEffect, useState } from 'react';
import { Save, RotateCcw, Copy, Check, Info } from 'lucide-react';
import { DialogComponent } from '../../../../../components/DialogComponent';
import { Button } from '../../../../../components/Button';
import { useUpdateTemplateState } from '../hooks/updateTemplateContext';

interface EditPromptDialogIF {
    isOpen: boolean;
    closeDialog: () => void;
    onSave?: (prompt: string) => void;
}

export const EditPromptDialog: React.FC<EditPromptDialogIF> = ({ isOpen, closeDialog, onSave }) => {
    const { state, setState } = useUpdateTemplateState();

    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setState(prev => ({
                ...prev,
                editingPrompt: state.templateSettings?.extractionPrompt || ''
            }));
        }
    }, [isOpen]);

    const handleSave = () => {
        const updatedSettings = {
            ...state.templateSettings,
            extractionPrompt: state.editingPrompt
        };
        setState(prev => ({
            ...prev,
            templateSettings: updatedSettings
        }));
        onSave?.(state.editingPrompt);
        closeDialog();
    };

    const handleCopy = () => {
        navigator.clipboard.writeText(state.editingPrompt);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleReset = () => {
        setState(prev => ({
            ...prev,
            editingPrompt: state.templateSettings?.extractionPrompt || ''
        }));
    };

    return (
        <DialogComponent name="Edit Prompt" className="h-[90%] w-[90%]" isOpen={isOpen} closeDialog={closeDialog} disableBlurCloseDialog>
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
                                disabled={!state.editingPrompt.trim()}
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
                        value={state.editingPrompt}
                        onChange={e => setState(prev => ({ ...prev, editingPrompt: e.target.value }))}
                        className="flex-1 resize-none p-5 font-mono text-sm leading-relaxed text-gray-800 outline-none placeholder:text-gray-400"
                        placeholder={`Write your extraction prompt here...\n\nUse {{variableName}} to insert dynamic data. For example:\n\nExtract the following fields from the document:\n{{documentText}}\n\nUse this schema for extraction:\n{{schema}}\n\nEnsure all dates are in YYYY-MM-DD format.\nReturn null for missing fields.`}
                        spellCheck={false}
                    />
                </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 border-t bg-gray-50/50 px-6 py-4">
                <Button outlined onClick={closeDialog}>
                    Cancel
                </Button>
                <Button startIcon={<Save size={16} />} onClick={handleSave}>
                    Save Prompt
                </Button>
            </div>
        </DialogComponent>
    );
};
