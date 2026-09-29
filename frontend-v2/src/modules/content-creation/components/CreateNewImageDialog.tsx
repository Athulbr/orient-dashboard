import React, { useState, useEffect } from 'react';
import { X, Sparkles, Image as ImageIcon, RefreshCcw, Check } from 'lucide-react';
import { DialogComponent } from '../../../components/DialogComponent';
import httpRequest from '../../../global-utils/httpRequest';
import { config } from '../../../config/default';
import { useToastStore } from '../../../components/toast/ToastStore';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onImagesGenerated?: (urls: string[], titles?: string[]) => void;
    /** Pre-filled from the current document context */
    blogTitle?: string;
    blogContent?: string;
}

export default function CreateNewImageDialog({ isOpen, onClose, onImagesGenerated, blogTitle = '', blogContent = '' }: Props) {
    const [userInstruction, setUserInstruction] = useState('');
    const [aspectRatio, setAspectRatio] = useState('16:9 (Landscape)');
    const [count, setCount] = useState(2);
    const [isGenerating, setIsGenerating] = useState(false);
    const [generatedUrls, setGeneratedUrls] = useState<string[]>([]);
    const [scenarioTitle, setScenarioTitle] = useState('');
    const [suggestChips, setSuggestChips] = useState<string[]>([]);
    const [isFetchingSuggestions, setIsFetchingSuggestions] = useState(false);
    const toast = useToastStore();

    useEffect(() => {
        if (isOpen) {
            setUserInstruction('');
            setAspectRatio('16:9 (Landscape)');
            setCount(2);
            setGeneratedUrls([]);
            setScenarioTitle('');
            setIsGenerating(false);
            setSuggestChips([]);

            // Fetch content-aware suggestions from backend
            if (blogTitle || blogContent) {
                setIsFetchingSuggestions(true);
                httpRequest('POST', `${config.mlServiceNodejs}/content-creation/suggest-image-scenarios`, {
                    blogTitle,
                    blogContent,
                })
                    .then((res: any) => {
                        const suggestions = res?.data?.suggestions;
                        if (Array.isArray(suggestions) && suggestions.length > 0) {
                            setSuggestChips(suggestions);
                        }
                    })
                    .catch(() => { /* suggestions are optional — fail silently */ })
                    .finally(() => setIsFetchingSuggestions(false));
            }
        }
    }, [isOpen]);

    const handleGenerate = async () => {
        setIsGenerating(true);
        setGeneratedUrls([]);
        try {
            const res: any = await httpRequest('POST', `${config.mlServiceNodejs}/content-creation/create-new-images`, {
                blogTitle,
                blogContent,
                userInstruction: userInstruction.trim() || undefined,
                aspectRatio,
                count,
            });
            if (res?.data?.imageUrls && Array.isArray(res.data.imageUrls)) {
                setGeneratedUrls(res.data.imageUrls);
                // Store scenarioTitle for use when the user clicks Done
                setScenarioTitle(res.data.scenarioTitle || '');
                toast.success(`Generated ${res.data.imageUrls.length} image(s) successfully!`);
                // NOTE: images are NOT added to the tab yet — user must click Done
            }
        } catch (e: any) {
            toast.error(e?.response?.data?.message || 'Failed to generate images.');
        } finally {
            setIsGenerating(false);
        }
    };


    const aspectChips = ['16:9 (Landscape)', '1:1 (Square)', '4:3', 'Portrait 9:16'];
    const countChips = [1, 2, 3, 4];


    return (
        <DialogComponent
            isOpen={isOpen}
            closeDialog={onClose}
            className="sm:max-w-6xl w-[90vw] overflow-hidden shadow-2xl rounded-xl"
        >
            <div className="flex flex-col text-gray-900 h-[85vh] max-h-[800px]">
                {/* Header */}
                <div className="flex items-center justify-between p-5 pb-4 border-b border-gray-100 shrink-0">
                    <div className="flex flex-col gap-1">
                        <h2 className="text-xl font-bold tracking-wide text-gray-900">Create Supporting Image</h2>
                        <p className="text-sm text-gray-500">
                            Generate a realistic scene that visually represents the problem or scenario in your article.
                            The AI uses your blog content as context automatically.
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 border rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Body */}
                <div className="flex flex-1 min-h-0 overflow-hidden bg-white">
                    {/* Left Form Panel */}
                    <div className="flex pl-6 pr-8 py-6 flex-col gap-6 w-3/5 overflow-y-auto">

                        {/* Blog context summary (read-only) */}
                        {blogTitle && (
                            <div className="flex flex-col gap-1 bg-blue-50 border border-blue-200 rounded-lg p-3">
                                <span className="text-xs font-semibold text-blue-600 uppercase tracking-wide">Article context (auto-detected)</span>
                                <p className="text-sm text-gray-700 font-medium line-clamp-2">{blogTitle}</p>
                                <p className="text-xs text-gray-500">
                                    The AI will use your full article content to generate a contextually relevant image.
                                </p>
                            </div>
                        )}

                        {/* Optional user instruction */}
                        <div className="flex flex-col gap-2">
                            <label className="text-[15px] font-semibold text-gray-800">
                                Specific scenario <span className="font-normal text-gray-400">(optional)</span>
                            </label>
                            <textarea
                                value={userInstruction}
                                onChange={e => setUserInstruction(e.target.value)}
                                className="w-full bg-white text-gray-800 border-2 border-blue-400 rounded-lg p-3 text-sm focus:outline-none focus:ring-0 min-h-[90px] resize-none"
                                placeholder="e.g. An elderly person lying on the floor after a fall, caregiver rushing to help..."
                            />
                            <div className="flex flex-col gap-1.5 mt-1">
                                <span className="text-xs text-gray-500 font-medium">
                                    Quick suggestions:
                                    {isFetchingSuggestions && (
                                        <span className="ml-1.5 text-gray-400 italic">generating…</span>
                                    )}
                                </span>
                                <div className="flex flex-wrap gap-2">
                                    {isFetchingSuggestions ? (
                                        // Skeleton shimmer chips while loading
                                        [72, 96, 80, 88, 104].map((w, i) => (
                                            <div
                                                key={i}
                                                className="h-7 rounded bg-gray-200 animate-pulse"
                                                style={{ width: `${w}px` }}
                                            />
                                        ))
                                    ) : (
                                        suggestChips.map(s => (
                                            <button
                                                key={s}
                                                onClick={() => setUserInstruction(s)}
                                                className="px-3 py-1.5 text-xs text-gray-600 bg-gray-50 border border-gray-200 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-300 transition-colors rounded"
                                            >
                                                {s}
                                            </button>
                                        ))
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Aspect Ratio */}
                        <div className="flex flex-col gap-2">
                            <label className="text-[15px] font-semibold text-gray-800">Aspect ratio</label>
                            <div className="flex flex-wrap gap-2">
                                {aspectChips.map(s => (
                                    <button
                                        key={s}
                                        onClick={() => setAspectRatio(s)}
                                        className={`px-5 py-2 text-sm font-medium transition-colors border w-36 ${aspectRatio === s ? 'bg-blue-600 text-white border-blue-600' : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'}`}
                                    >
                                        {s}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Quantity */}
                        <div className="flex flex-col gap-2">
                            <label className="text-[15px] font-semibold text-gray-800">How many images?</label>
                            <div className="flex flex-wrap gap-2">
                                {countChips.map(c => (
                                    <button
                                        key={c}
                                        onClick={() => setCount(c)}
                                        className={`w-12 h-10 flex items-center justify-center text-sm font-semibold transition-colors border ${count === c ? 'bg-blue-600 text-white border-blue-600' : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'}`}
                                    >
                                        {c}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Right Preview Panel */}
                    <div className="flex flex-col w-2/5 border-l bg-gray-50 p-6 overflow-y-auto">
                        <div className="flex items-center justify-center mb-4">
                            <span className="text-sm font-medium text-gray-400">Preview</span>
                        </div>
                        <div className="flex flex-col gap-4">
                            {/* Derive preview aspect class from selected ratio */}
                            {(() => {
                                const aspectClass = aspectRatio.includes('9:16')
                                    ? 'aspect-[9/16] max-w-[160px] mx-auto w-full'
                                    : aspectRatio.includes('4:3')
                                        ? 'aspect-[4/3]'
                                        : aspectRatio.includes('1:1')
                                            ? 'aspect-square'
                                            : 'aspect-video'; // default 16:9
                                return (
                                    <>
                                        {isGenerating ? (
                                            Array.from({ length: count }).map((_, i) => (
                                                <div key={`gen-${i}`} className={`${aspectClass} bg-blue-50 border-2 border-blue-200 border-dashed rounded-sm flex flex-col gap-2 items-center justify-center text-blue-500 shadow-inner`}>
                                                    <RefreshCcw size={28} className="animate-spin" />
                                                    <span className="text-sm font-medium">Generating scene...</span>
                                                </div>
                                            ))
                                        ) : generatedUrls.length > 0 ? (
                                            generatedUrls.map((url, i) => (
                                                <div key={`img-${i}`} className={`${aspectClass} bg-gray-100 flex items-center justify-center rounded-sm overflow-hidden shadow-sm border border-gray-200`}>
                                                    <img src={url} alt={`Generated ${i + 1}`} className="w-full h-full object-contain" />
                                                </div>
                                            ))
                                        ) : (
                                            Array.from({ length: count }).map((_, i) => (
                                                <div key={`empty-${i}`} className={`${aspectClass} bg-[#e6dcf3] border border-[#d1c4e9] rounded-sm flex items-center justify-center shadow-inner relative`}>
                                                    <ImageIcon size={32} className="text-[#a890d3]" />
                                                    {i === count - 1 && (
                                                        <span className="absolute bottom-4 text-xs text-gray-400 text-center px-4">
                                                            Generated scene images will appear here
                                                        </span>
                                                    )}
                                                </div>
                                            ))
                                        )}
                                    </>
                                );
                            })()}
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-3 p-4 px-6 border-t border-gray-200 shrink-0">
                    <button
                        onClick={onClose}
                        className="px-6 py-2.5 rounded text-sm font-semibold text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 transition-colors"
                    >
                        Cancel
                    </button>

                    {/* After generation: show Regenerate + Done side by side */}
                    {generatedUrls.length > 0 && !isGenerating && (
                        <button
                            onClick={handleGenerate}
                            className="flex items-center gap-2 px-6 py-2.5 rounded text-sm font-semibold transition-colors shadow-sm bg-white text-blue-600 border border-blue-600 hover:bg-blue-50"
                        >
                            <RefreshCcw size={16} />
                            Regenerate
                        </button>
                    )}

                    <button
                        onClick={() => {
                            if (generatedUrls.length > 0) {
                                // Build per-image titles from the scenario GPT-4o described
                                const baseTitle = scenarioTitle || userInstruction.trim() || blogTitle || 'Supporting Image';
                                const titles = generatedUrls.map((_, idx) =>
                                    generatedUrls.length === 1
                                        ? baseTitle
                                        : `${baseTitle} (${idx + 1})`
                                );
                                if (onImagesGenerated) onImagesGenerated(generatedUrls, titles);
                                onClose();
                            } else {
                                handleGenerate();
                            }
                        }}
                        disabled={isGenerating}
                        className={`flex items-center gap-2 px-6 py-2.5 rounded text-sm font-semibold transition-colors shadow-sm ${
                            isGenerating
                                ? 'bg-blue-300 text-white cursor-not-allowed border outline-none'
                                : generatedUrls.length > 0
                                    ? 'bg-green-600 hover:bg-green-700 text-white border border-green-700'
                                    : 'bg-blue-600 hover:bg-blue-700 text-white border border-blue-700'
                        }`}
                    >
                        {isGenerating ? (
                            <RefreshCcw size={16} className="text-white animate-spin" />
                        ) : generatedUrls.length > 0 ? (
                            <Check size={16} className="text-white" />
                        ) : (
                            <Sparkles size={16} className="text-blue-200" />
                        )}
                        {isGenerating ? 'Generating...' : generatedUrls.length > 0 ? 'Done' : 'Generate Image'}
                    </button>
                </div>
            </div>
        </DialogComponent>
    );
}
