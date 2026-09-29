import { useState } from 'react';
import { Sparkles, Check, X } from 'lucide-react';
import { diffWords } from 'diff';
import { Button } from '../../../components/Button';
import Spinner from '../../../components/Spinner';
import { DialogComponent } from '../../../components/DialogComponent';
import { useToastStore } from '../../../components/toast/ToastStore';
import { useContentCreationApi } from '../hooks/useContentCreationApi';
import { useContentCreationEditorState } from '../hooks/DocumentCreationEditorContext';

interface BlogRegenerateDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onAccept: (newHtml: string) => void;
}

export default function BlogRegenerateDialog({ isOpen, onClose, onAccept }: BlogRegenerateDialogProps) {
    const toast = useToastStore();
    const { regenerateBlog } = useContentCreationApi();
    const { state } = useContentCreationEditorState();

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
        setLoading(true);
        try {
            const filteredKeywords = state.keywords?.filter((keyword: any) => keyword.selected);
            const res = await regenerateBlog({
                keywords: filteredKeywords,
                extractedData: state.extractedData,
                extractionPrompt: state.extractionPrompt,
                userComment: instruction.trim() || undefined
            });
            if (res.data?.htmlContent) {
                setSuggestedText(res.data.htmlContent);
                setIsReviewing(true);
                toast.success('Blog regenerated successfully. Review the changes.');
            } else {
                toast.error('Failed to regenerate blog content');
            }
        } catch {
            toast.error('Failed to regenerate blog content');
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
            name="Blog Regenerate"
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
                        {isReviewing ? 'Diff Preview' : 'Current Content'}
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 text-sm leading-relaxed">
                        {isReviewing ? (
                            <div className="whitespace-pre-wrap break-words font-mono">
                                {diffWords(state.content || '', suggestedText).map((part, i) => (
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
                            <div 
                                className="text-gray-800 prose max-w-none"
                                dangerouslySetInnerHTML={{ __html: state.content || '' }}
                            />
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
                                Describe how you want to regenerate the blog post. Leave blank to regenerate using only keywords and templates, or add specific instructions to guide the AI.
                            </p>
                            <textarea
                                value={instruction}
                                onChange={e => setInstruction(e.target.value)}
                                onKeyDown={e => {
                                    if (e.key === 'Enter' && !e.shiftKey && !loading && !isReviewing) {
                                        e.preventDefault();
                                        handleGenerate();
                                    }
                                }}
                                className="min-h-[140px] resize-none rounded-lg border border-gray-200 bg-white p-3.5 text-sm leading-relaxed text-gray-800 shadow-sm outline-none transition-all placeholder:text-gray-400 focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                                placeholder='e.g. "Add a section on troubleshooting", "Make the tone more professional", "Rewrite the introduction"'
                                disabled={loading || isReviewing}
                            />
                            <Button
                                startIcon={loading ? <Spinner size={16} /> : <Sparkles size={16} />}
                                onClick={handleGenerate}
                                disabled={loading || isReviewing}
                                className="w-full"
                            >
                                {loading ? 'Regenerating...' : 'Regenerate Blog'}
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        </DialogComponent>
    );
}
