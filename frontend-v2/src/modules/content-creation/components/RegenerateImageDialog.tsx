import React, { useState, useEffect } from 'react';
import { X, RefreshCcw, ArrowRight, Check } from 'lucide-react';
import { DialogComponent } from '../../../components/DialogComponent';
import httpRequest from '../../../global-utils/httpRequest';
import { config } from '../../../config/default';
import { useToastStore } from '../../../components/toast/ToastStore';

export default function RegenerateImageDialog({ isOpen, onClose, image, onRegenerate }: { isOpen: boolean; onClose: () => void, image: any, onRegenerate: (url?: string) => void }) {
    const [describe, setDescribe] = useState('');
    const [style, setStyle] = useState('Photorealistic');
    const [isGenerating, setIsGenerating] = useState(false);
    const [generatedUrl, setGeneratedUrl] = useState('');
    const toast = useToastStore();

    useEffect(() => {
        if (isOpen) {
            setGeneratedUrl('');
            setDescribe('');
            setIsGenerating(false);
            setStyle('Photorealistic');
        }
    }, [isOpen, image]);

    const styleChips = [
        'Photorealistic', 'Infographic', 'Illustration', 'Diagram', 'Minimalist', 'Dark mode'
    ];

    const handleRegen = async () => {
        if (!describe.trim()) {
            toast.error('Please describe how you want to change the image.');
            return;
        }
        setIsGenerating(true);
        try {
            const res: any = await httpRequest('POST', `${config.mlServiceNodejs}/content-creation/regenerate-image`, {
                instruction: describe,
                style: style,
                currentImage: image?.src
            });
            if (res?.data?.imageUrl) {
                setGeneratedUrl(res.data.imageUrl);
                toast.success('Image regenerated successfully.');
            }
        } catch (e: any) {
            toast.error(e?.response?.data?.message || 'Failed to regenerate image.');
        } finally {
            setIsGenerating(false);
        }
    }

    return (
        <DialogComponent 
            isOpen={isOpen} 
            closeDialog={onClose}
            className="sm:max-w-5xl w-[90vw] overflow-hidden shadow-xl rounded-xl"
        >
            <div className="flex flex-col text-gray-900 border-t-8 border-red-50/0"> 
                {/* Header */}
                <div className="flex items-center justify-between p-5 pb-3 border-b shrink-0">
                    <h2 className="text-xl font-bold tracking-wide text-gray-900">
                        Regenerate Image
                    </h2>
                    <button 
                        onClick={onClose}
                        className="p-1 border rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Body */}
                <div className="flex flex-col gap-6 p-6 pb-8">
                    {/* Top: Image comparison row */}
                    <div className="flex items-center justify-center gap-6">
                        <div className="flex flex-col items-center gap-2 w-2/5">
                            <span className="text-sm font-medium text-gray-500 self-start">Current image</span>
                            <div className="aspect-video w-full bg-blue-100/50 border border-blue-200 flex items-center justify-center p-2 rounded-sm shadow-inner">
                                <img src={image?.src} alt={image?.title} className="max-w-full max-h-full object-cover" />
                            </div>
                            <span className="text-xs text-gray-500">{image?.title || 'Unknown image'}</span>
                        </div>

                        <div className="text-gray-300">
                            <ArrowRight size={24} strokeWidth={3} />
                        </div>

                        <div className="flex flex-col items-center gap-2 w-2/5">
                            <span className="text-sm font-medium text-gray-500 self-start">New image preview</span>
                            <div className={`aspect-video w-full border-2 border-dashed rounded-sm flex flex-col items-center justify-center gap-3 ${isGenerating ? 'border-blue-400 bg-blue-50 text-blue-500' : 'border-blue-200 bg-gray-50 text-gray-400'}`}>
                                {isGenerating ? (
                                    <>
                                        <RefreshCcw size={28} className="animate-spin" />
                                        <span className="text-sm font-medium">Generating...</span>
                                    </>
                                ) : generatedUrl ? (
                                    <img src={generatedUrl} alt="Generated preview" className="max-w-full max-h-full object-cover" />
                                ) : (
                                    <>
                                        <span className="text-sm">Preview will appear here</span>
                                    </>
                                )}
                            </div>
                            <span className="text-xs text-transparent">Placeholder</span> {/* For alignment */}
                        </div>
                    </div>

                    {/* Bottom: Prompt & Styles */}
                    <div className="flex flex-col gap-3">
                        <label className="text-[15px] font-bold text-gray-800">Describe how you want to change this image:</label>
                        <textarea
                            value={describe}
                            onChange={e => setDescribe(e.target.value)}
                            className="w-full bg-white text-gray-900 border-2 border-blue-400 rounded-sm p-3 text-sm focus:outline-none min-h-[80px] resize-none"
                            placeholder="e.g. Show the chamber from the outside, with a person stepping in, clinical setting, bright lighting"
                        />
                        
                        <div className="flex items-center gap-3 mt-1">
                            <span className="text-sm font-medium text-gray-600">Style:</span>
                            <div className="flex flex-wrap gap-2">
                                {styleChips.map(s => (
                                    <button 
                                        key={s}
                                        onClick={() => setStyle(s)}
                                        className={`px-4 py-1.5 text-sm transition-colors border ${style === s ? 'bg-blue-600 text-white border-blue-600' : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'}`}
                                    >
                                        {s}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between p-4 px-6 border-t border-gray-200 bg-gray-50/50 shrink-0">
                    <button 
                        onClick={() => onRegenerate(generatedUrl)}
                        disabled={!generatedUrl}
                        className={`flex items-center gap-2 px-6 py-2.5 rounded text-sm font-semibold text-white transition-colors shadow-sm ${!generatedUrl ? 'bg-green-700/50 cursor-not-allowed' : 'bg-green-700 hover:bg-green-800'}`}
                    >
                        <Check size={18} strokeWidth={3} />
                        Use This Image
                    </button>
                    
                    <div className="flex items-center gap-3">
                        <button 
                            onClick={onClose}
                            className="px-8 py-2.5 rounded text-sm font-semibold text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 transition-colors"
                        >
                            Cancel
                        </button>
                        <button 
                            onClick={handleRegen}
                            disabled={isGenerating}
                            className={`flex items-center gap-2 px-8 py-2.5 rounded text-sm font-semibold transition-colors shadow-sm ${
                                isGenerating
                                    ? 'bg-blue-400 text-white cursor-not-allowed border-blue-400' 
                                    : 'bg-blue-600 hover:bg-blue-700 text-white border border-blue-700'
                            }`}
                        >
                            <RefreshCcw size={16} className={isGenerating ? 'animate-spin' : ''} />
                            Regenerate Image
                        </button>
                    </div>
                </div>
            </div>
        </DialogComponent>
    );
}
