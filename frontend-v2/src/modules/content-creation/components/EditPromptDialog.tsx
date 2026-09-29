import { useState, useEffect } from 'react';
import { Sparkles, Check, X } from 'lucide-react';
import { diffWords } from 'diff';
import { Button } from '../../../components/Button';
import Spinner from '../../../components/Spinner';
import { DialogComponent } from '../../../components/DialogComponent';
import { useToastStore } from '../../../components/toast/ToastStore';
import { useContentCreationEditorState } from '../hooks/DocumentCreationEditorContext';
import { useContentCreationApi } from '../hooks/useContentCreationApi';

interface EditPromptDialogProps {
    isOpen: boolean;
    onClose: () => void;
    record: Record<string, any> | null;
}

export default function EditPromptDialog({ isOpen, onClose, record }: EditPromptDialogProps) {
    const toast = useToastStore();
    const { updateContentCreationPrompt } = useContentCreationApi();
    const { state, setState } = useContentCreationEditorState();
    const extractionPrompt = state.extractionPrompt || '';

    const [promptText, setPromptText] = useState('');
    const [copied, setCopied] = useState(false);
    const [aiInstruction, setAiInstruction] = useState('');
    const [generatingPrompt, setGeneratingPrompt] = useState(false);

    // States for reviewing AI generated content
    const [isReviewing, setIsReviewing] = useState(false);
    const [suggestedPrompt, setSuggestedPrompt] = useState('');

    useEffect(() => {
        if (isOpen) {
            setPromptText(extractionPrompt);
        }
    }, [isOpen]);

    const handlePromptChange = (text: string) => {
        setPromptText(text);
        setState((prev) => ({ ...prev, extractionPrompt: text }));
    };

    const handleCopyPrompt = () => {
        navigator.clipboard.writeText(promptText);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleAcceptChanges = () => {
        handlePromptChange(suggestedPrompt);
        setIsReviewing(false);
        setSuggestedPrompt('');
        setAiInstruction('');
    };

    const handleDiscardChanges = () => {
        setIsReviewing(false);
        setSuggestedPrompt('');
    };

    const handleGeneratePrompt = async () => {
        if (!aiInstruction.trim()) {
            toast.error('Please describe what you want the prompt to do');
            return;
        }
        setGeneratingPrompt(true);
        try {
            const result = await updateContentCreationPrompt({
                userInstruction: aiInstruction,
                currentPrompt: promptText
            });
            if (result) {
                setSuggestedPrompt(result);
                setIsReviewing(true);
                toast.success('Prompt generated successfully. Please review the changes.');
            } else {
                toast.error('Failed to generate prompt');
            }
        } catch (error) {
            toast.error('Failed to generate prompt');
        } finally {
            setGeneratingPrompt(false);
        }
    };

    return (
        <DialogComponent
            name="Edit Prompt"
            className="h-[90%] w-[90%]"
            isOpen={isOpen}
            closeDialog={onClose}
            disableBlurCloseDialog
            secondaryButtonText={copied ? '✓ Copied!' : 'Copy Prompt to Clipboard'}
            primaryButtonText="Close"
            onSecondaryAction={handleCopyPrompt}
            onPrimaryAction={onClose}
        >
            <div className="flex h-full flex-1 gap-0 overflow-hidden p-4">
                <div className="relative flex flex-1 flex-col bg-white">
                    {isReviewing ? (
                        <div className="flex-1 overflow-y-auto p-5 font-mono text-sm leading-relaxed whitespace-pre-wrap break-words">
                            {diffWords(promptText, suggestedPrompt).map((part, index) => {
                                const color = part.added
                                    ? 'bg-green-100 text-green-800'
                                    : part.removed
                                      ? 'bg-red-100 text-red-800 line-through'
                                      : 'text-gray-800';
                                return (
                                    <span key={index} className={`rounded-sm ${color}`}>
                                        {part.value}
                                    </span>
                                );
                            })}
                        </div>
                    ) : (
                        <textarea
                            value={promptText}
                            onChange={e => handlePromptChange(e.target.value)}
                            className="flex-1 resize-none p-5 font-mono text-sm leading-relaxed text-gray-800 outline-none placeholder:text-gray-400"
                            placeholder="Write your extraction prompt here..."
                            spellCheck={false}
                        />
                    )}

                    {isReviewing && (
                        <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-full border border-gray-200 bg-white px-4 py-2 shadow-lg">
                            <span className="mr-2 text-sm font-medium text-gray-700">Review AI Changes</span>
                            <Button
                                outlined
                                small
                                onClick={handleDiscardChanges}
                                startIcon={<X size={14} />}
                            >
                                Discard
                            </Button>
                            <Button
                                small
                                onClick={handleAcceptChanges}
                                startIcon={<Check size={14} />}
                            >
                                Accept
                            </Button>
                        </div>
                    )}
                </div>

                <div className="flex w-[30%] flex-col border-l bg-gray-50/50">
                    <div className="flex items-center gap-2 border-b px-5 py-3">
                        <Sparkles size={15} className="text-amber-500" />
                        <span className="text-sm font-medium text-gray-800">AI Assistant</span>
                    </div>
                    <div className="flex flex-1 flex-col justify-between overflow-y-auto p-5">
                        <div className="flex flex-col gap-4">
                            <p className="text-xs leading-relaxed text-gray-500">
                                Describe what you need and the AI will generate or update your prompt. If a prompt already exists, it will be refined based
                                on your instructions.
                            </p>
                            <textarea
                                value={aiInstruction}
                                onChange={e => setAiInstruction(e.target.value)}
                                onKeyDown={e => {
                                    if (e.key === 'Enter' && !e.shiftKey && aiInstruction.trim() && !generatingPrompt && !isReviewing) {
                                        e.preventDefault();
                                        handleGeneratePrompt();
                                    }
                                }}
                                className="min-h-[160px] resize-none rounded-lg border border-gray-200 bg-white p-3.5 text-sm leading-relaxed text-gray-800 shadow-sm outline-none transition-all placeholder:text-gray-400 focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                                placeholder="User Query..."
                                disabled={generatingPrompt || isReviewing}
                            />
                            <Button
                                startIcon={generatingPrompt ? <Spinner size={16} /> : <Sparkles size={16} />}
                                onClick={handleGeneratePrompt}
                                disabled={generatingPrompt || !aiInstruction.trim() || isReviewing}
                                className="w-full"
                            >
                                {generatingPrompt ? 'Generating...' : promptText.trim() ? 'Update Prompt with AI' : 'Generate Prompt'}
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        </DialogComponent>
    );
}
