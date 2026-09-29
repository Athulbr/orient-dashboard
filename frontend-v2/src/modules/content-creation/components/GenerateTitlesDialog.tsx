import React, { useState } from 'react';
import { X, Sparkles } from 'lucide-react';
import { DialogComponent } from '../../../components/DialogComponent';
import DialogTooltip from '../../../components/DialogTooltip';

interface GenerateTitlesDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onGenerate: (data: { instructions: string; tone: string; count: number }) => void;
}

export default function GenerateTitlesDialog({ isOpen, onClose, onGenerate }: GenerateTitlesDialogProps) {
    const [instructions, setInstructions] = useState('');
    const [tone, setTone] = useState('Neutral');
    const [count, setCount] = useState<number>(5);

    const counts = [3, 5, 10];
    const tones = [
        {
            label: 'Authoritative',
            description: 'Write from a place of clinical expertise. The platform is run by occupational and physical therapists, so content should reflect professional knowledge and credibility.',
        },
        {
            label: 'Educational',
            description: 'Informative and instructional in nature, focused on teaching readers how to solve a problem or understand a condition.',
        },
        {
            label: 'Empathetic',
            description: 'Warm and understanding toward readers who may be caregivers, patients, or parents of special needs children dealing with difficult circumstances.',
        },
        {
            label: 'Empowering',
            description: 'Encouraging and uplifting, helping readers feel capable of taking action and improving quality of life.',
        },
        {
            label: 'Conversational',
            description: 'Approachable and easy to read, avoiding heavy medical jargon so content resonates with non-clinical audiences like family caregivers.',
        },
        {
            label: 'Compassionate',
            description: 'Sensitive to the emotional and physical challenges of the audience, never dismissive or clinical to the point of coldness.',
        },
        {
            label: 'Neutral',
            description: 'Objective and balanced when presenting product options or medical information, without bias or overpromising outcomes.',
        },
        {
            label: 'Practical',
            description: 'Grounded and solution-focused, giving readers actionable takeaways they can apply to real-life caregiving or rehabilitation situations.',
        },
        {
            label: 'Trustworthy',
            description: 'Honest and accurate, avoiding sensationalism or exaggerated claims that could mislead vulnerable readers.',
        },
        {
            label: 'Inclusive',
            description: 'Respectful of all audiences — seniors, disabled individuals, special needs children, and caregivers — using person-first, dignity-centered language throughout.',
        },
    ];

    const handleGenerate = () => {
        onGenerate({ instructions, tone, count });
        onClose();
        // optionally reset fields
        setInstructions('');
        setTone('Neutral');
        setCount(5);
    };

    return (
        <DialogComponent 
            isOpen={isOpen} 
            closeDialog={onClose}
            className="sm:max-w-lg overflow-hidden shadow-2xl rounded-xl"
        >
            <div className="flex flex-col text-gray-900">
                {/* Header */}
                <div className="flex items-center justify-between p-5 pb-2">
                    <div className="flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-blue-600" />
                        <h2 className="text-lg font-semibold tracking-wide text-gray-900">
                            Generate more titles with a prompt
                        </h2>
                    </div>
                    {/* The DialogComponent already renders its own header if we pass `name`, but we are doing custom so we include Close */}
                    <button 
                        onClick={onClose}
                        className="p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Body */}
                <div className="flex flex-col gap-5 p-5">
                    {/* Angle Field */}
                    {/* Instructions Field */}
                    <div className="flex flex-col gap-1.5">
                        <label className="text-sm font-medium text-gray-700">Additional instructions (optional)</label>
                        <textarea
                            value={instructions}
                            onChange={(e) => setInstructions(e.target.value)}
                            className="w-full bg-white text-gray-900 border border-gray-300 rounded-lg p-3 text-[14px] focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[80px] resize-none"
                            placeholder="e.g. Keep under 65 chars. Include 'chamber'. Avoid question format."
                        />
                    </div>

                    {/* Tones Selection */}
                    <div className="flex flex-col gap-2 pt-1">
                        <label className="text-sm font-medium text-gray-700">Tone</label>
                        <div className="flex flex-wrap gap-2">
                            {tones.map((toneOption) => (
                                <DialogTooltip key={toneOption.label} content={toneOption.description}>
                                    <button
                                        onClick={() => setTone(tone === toneOption.label ? '' : toneOption.label)}
                                        className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                                            tone === toneOption.label 
                                                ? 'bg-blue-600 text-white border border-blue-500' 
                                                : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                                        }`}
                                    >
                                        {toneOption.label}
                                    </button>
                                </DialogTooltip>
                            ))}
                        </div>
                    </div>

                    {/* Count Selection */}
                    <div className="flex flex-col gap-2 pt-1">
                        <label className="text-sm font-medium text-gray-700">How many?</label>
                        <div className="flex gap-2">
                            {counts.map((c) => (
                                <button
                                    key={c}
                                    onClick={() => setCount(c)}
                                    className={`px-5 py-1.5 rounded-full text-sm font-medium transition-colors ${
                                        count === c 
                                            ? 'bg-blue-600 text-white border border-blue-500' 
                                            : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                                    }`}
                                >
                                    {c}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between p-5 pt-3 border-t border-gray-200 bg-gray-50">
                    <button 
                        onClick={onClose}
                        className="px-4 py-2 rounded-lg text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 transition-colors cursor-pointer shadow-sm"
                    >
                        Cancel
                    </button>
                    <button 
                        onClick={handleGenerate}
                        disabled={!count || (!tone && !instructions.trim())}
                        className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer shadow-sm ${
                            !count || (!tone && !instructions.trim())
                                ? 'bg-gray-300 text-gray-500 cursor-not-allowed' 
                                : 'bg-blue-600 hover:bg-blue-700 text-white'
                        }`}
                    >
                        <Sparkles className="w-4 h-4 text-blue-200" />
                        Generate {count} more titles
                    </button>
                </div>
            </div>
        </DialogComponent>
    );
}
