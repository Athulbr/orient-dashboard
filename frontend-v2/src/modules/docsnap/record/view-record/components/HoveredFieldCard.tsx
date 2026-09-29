import { CircleCheck, Eye, XCircle } from 'lucide-react';
import { formatFieldLabel } from '../utils';
import { useEffect, useRef, useState } from 'react';
import { useViewRecordState } from '../hooks/viewRecordContext';
import { ConfidenceScore } from './ConfidenceScore';

interface BoundingBox {
    x_min: number;
    y_max: number;
}

interface HoveredField {
    value: string;
    confidence: number;
}

interface HoveredFieldCardProps {
    hoveredField: HoveredField;
    hoveredFieldId: string;
    bbox: BoundingBox;
    onValueChange: (value: string) => void;
    onCheckToggle: (checked?: boolean) => void;
    isChecked: boolean;
    arrayLength?: number;
}

export const HoveredFieldCard: React.FC<HoveredFieldCardProps> = ({
    hoveredField,
    hoveredFieldId,
    bbox,
    onValueChange,
    onCheckToggle,
    isChecked,
    arrayLength = 2
}) => {
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const { state, setState } = useViewRecordState();
    useEffect(() => {
        onCheckToggle(true);
    }, [state.hoveredFieldId]);

    const adjustTextareaHeight = () => {
        const textarea = textareaRef.current;
        if (!textarea) return;

        textarea.style.height = 'auto';
        textarea.style.height = `${textarea.scrollHeight}px`;
    };

    useEffect(() => {
        adjustTextareaHeight();
    }, [hoveredField.value]);

    const getFieldLabel = () => {
        const parts = hoveredFieldId.split(':');
        const index = arrayLength === 4 ? 3 : arrayLength === 3 ? 2 : 1;
        return formatFieldLabel(parts[index] || '');
    };

    return (
        <div
            className={`${state.hoveredOnArrayField ? 'bottom-[210%] shadow-none' : 'top-[130%] shadow-lg'} absolute left-[-10px] z-11 flex ${getFieldLabel().toLowerCase().includes('description') || getFieldLabel().toLowerCase().includes('benefits') ? 'min-w-180' : 'min-w-70'} flex-col gap-2 rounded-lg border border-gray-300 bg-gray-50 p-3 shadow-lg shadow-gray-400`}
        >
            <div className="flex items-center justify-between gap-2 pl-1 font-semibold">
                <div className="flex items-center gap-2">
                    {getFieldLabel()}
                    <span className="flex items-center font-light">
                        (&nbsp;
                        <ConfidenceScore confidence={`${hoveredField.confidence * 100}`} />)
                    </span>
                </div>
                <XCircle
                    onClick={() => setState(prev => ({ ...prev, hoveredFieldId: null }))}
                    className="cursor-pointer text-gray-400 hover:text-red-500"
                    size={22}
                />
            </div>
            <div className="flex items-center justify-between gap-2 text-lg">
                <textarea
                    disabled={state.reExtracting}
                    data-gramm="false"
                    ref={textareaRef}
                    onChange={e => {
                        onValueChange(e.target.value);
                        adjustTextareaHeight();
                    }}
                    value={hoveredField.value}
                    className="w-full resize-none overflow-hidden rounded-md border border-gray-300 bg-white p-2 text-xl outline-none focus:ring-1 focus:ring-gray-400 focus:ring-offset-1 focus:outline-none"
                    style={{ minHeight: '24px' }}
                    rows={1}
                />
                <div className="w-6">
                    {isChecked ? (
                        <CircleCheck onClick={() => onCheckToggle()} className="cursor-pointer text-green-500 hover:text-green-600" size={24} />
                    ) : (
                        <Eye onClick={() => onCheckToggle(true)} className="cursor-pointer text-orange-400 hover:text-orange-500" size={24} />
                    )}
                </div>
            </div>
        </div>
    );
};
