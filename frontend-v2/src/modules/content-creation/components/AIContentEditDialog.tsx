import { useState } from 'react';
import { Sparkles, Check, X } from 'lucide-react';
import { diffWords } from 'diff';
import { Button } from '../../../components/Button';
import Spinner from '../../../components/Spinner';
import { DialogComponent } from '../../../components/DialogComponent';
import { useToastStore } from '../../../components/toast/ToastStore';
import { useContentCreationApi } from '../hooks/useContentCreationApi';

interface AIContentEditDialogProps {
    isOpen: boolean;
    onClose: () => void;
    selectedText: string;
    onAccept: (newHtml: string) => void;
}

export default function AIContentEditDialog({ isOpen, onClose, selectedText, onAccept }: AIContentEditDialogProps) {
    const toast = useToastStore();
    const { editSelectedContent } = useContentCreationApi();

    const [instruction, setInstruction] = useState('');
    const [loading, setLoading] = useState(false);
    const [suggestedText, setSuggestedText] = useState('');
    const [isReviewing, setIsReviewing] = useState(false);

    const handleClose = () => {
        setInstruction('');
        setSuggestedText('');
        setIsReviewing(false);
        onClose();
    };

    const handleGenerate = async () => {
        if (!instruction.trim()) {
            toast.error('Please describe what you want to change');
            return;
        }
        setLoading(true);
        try {
            const result = await editSelectedContent({ selectedText, userInstruction: instruction });
            if (result) {
                setSuggestedText(result);
                setIsReviewing(true);
            } else {
                toast.error('Failed to generate edited content');
            }
        } catch {
            toast.error('Failed to generate edited content');
        } finally {
            setLoading(false);
        }
    };

    const handleAccept = () => {
        onAccept(suggestedText);
        handleClose();
    };

    const handleDiscard = () => {
        setSuggestedText('');
        setIsReviewing(false);
    };

    return (
        <DialogComponent
            name="Edit with AI"
            className="h-[80%] w-[70%]"
            isOpen={isOpen}
            closeDialog={handleClose}
            disableBlurCloseDialog
            primaryButtonText="Cancel"
            onPrimaryAction={handleClose}
        >
            <div className="flex h-full flex-1 gap-0 overflow-hidden p-4">
                {/* Left: original vs suggested */}
                <div className="relative flex flex-1 flex-col bg-white overflow-hidden rounded-lg border border-gray-200">
                    <div className="border-b px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        {isReviewing ? 'Diff Preview' : 'Selected Content'}
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 text-sm leading-relaxed">
                        {isReviewing ? (
                            <div className="whitespace-pre-wrap break-words font-mono">
                                {diffWords(selectedText, suggestedText).map((part, i) => (
                                    <span
                                        key={i}
                                        className={
                                            part.added
                                                ? 'bg-green-100 text-green-800 rounded-sm'
                                                : part.removed
                                                  ? 'bg-red-100 text-red-800 line-through rounded-sm'
                                                  : 'text-gray-800'
                                        }
                                    >
                                        {part.value}
                                    </span>
                                ))}
                            </div>
                        ) : (
                            <p className="text-gray-700 whitespace-pre-wrap">{selectedText}</p>
                        )}
                    </div>

                    {isReviewing && (
                        <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-full border border-gray-200 bg-white px-4 py-2 shadow-lg">
                            <span className="mr-2 text-sm font-medium text-gray-700">Accept changes?</span>
                            <Button outlined small onClick={handleDiscard} startIcon={<X size={14} />}>
                                Discard
                            </Button>
                            <Button small onClick={handleAccept} startIcon={<Check size={14} />}>
                                Accept
                            </Button>
                        </div>
                    )}
                </div>

                {/* Right: AI instruction panel */}
                <div className="flex w-[35%] flex-col border-l bg-gray-50/50">
                    <div className="flex items-center gap-2 border-b px-5 py-3">
                        <Sparkles size={15} className="text-amber-500" />
                        <span className="text-sm font-medium text-gray-800">AI Assistant</span>
                    </div>
                    <div className="flex flex-1 flex-col justify-between overflow-y-auto p-5">
                        <div className="flex flex-col gap-4">
                            <p className="text-xs leading-relaxed text-gray-500">
                                Describe how you want to rewrite the selected text. The AI will apply your instruction only to the selected portion.
                            </p>
                            <textarea
                                value={instruction}
                                onChange={e => setInstruction(e.target.value)}
                                onKeyDown={e => {
                                    if (e.key === 'Enter' && !e.shiftKey && instruction.trim() && !loading && !isReviewing) {
                                        e.preventDefault();
                                        handleGenerate();
                                    }
                                }}
                                className="min-h-[140px] resize-none rounded-lg border border-gray-200 bg-white p-3.5 text-sm leading-relaxed text-gray-800 shadow-sm outline-none transition-all placeholder:text-gray-400 focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                                placeholder='e.g. "Make this more concise", "Use a friendlier tone", "Add more detail about the benefits"'
                                disabled={loading || isReviewing}
                            />
                            <Button
                                startIcon={loading ? <Spinner size={16} /> : <Sparkles size={16} />}
                                onClick={handleGenerate}
                                disabled={loading || !instruction.trim() || isReviewing}
                                className="w-full"
                            >
                                {loading ? 'Editing...' : 'Edit with AI'}
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        </DialogComponent>
    );
}
