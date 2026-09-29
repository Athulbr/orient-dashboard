import React, { useState, useRef, useEffect } from 'react';
import { X, CheckCircle, AlertCircle, GripHorizontal } from 'lucide-react';

export type ResultMessage = {
    type: 'success' | 'error';
    messages: string[];
};

interface DraggableResultCardProps {
    result: ResultMessage;
    onClose: () => void;
}

export const DraggableResultCard: React.FC<DraggableResultCardProps> = ({ result, onClose }) => {
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const dragStartPos = useRef({ x: 0, y: 0 });

    const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
        setIsDragging(true);
        dragStartPos.current = {
            x: e.clientX - position.x,
            y: e.clientY - position.y
        };
    };

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isDragging) return;
            setPosition({
                x: e.clientX - dragStartPos.current.x,
                y: e.clientY - dragStartPos.current.y
            });
        };

        const handleMouseUp = () => {
            setIsDragging(false);
        };

        if (isDragging) {
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
        } else {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        }

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging]);

    const isSuccess = result.type === 'success';

    return (
        <div
            className={`absolute bottom-[calc(100%+1rem)] right-0 z-50 flex w-120 flex-col overflow-hidden rounded-xl border bg-white shadow-2xl transition-shadow ${
                isSuccess ? 'border-green-200' : 'border-red-200'
            } ${isDragging ? 'cursor-grabbing shadow-[0_20px_50px_rgba(0,0,0,0.2)]' : 'shadow-lg'}`}
            style={{
                transform: `translate(${position.x}px, ${position.y}px)`
            }}
        >
            {/* Header (Draggable handle) */}
            <div
                className={`flex cursor-grab items-center justify-between px-4 py-3 active:cursor-grabbing ${isSuccess ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}
                onMouseDown={handleMouseDown}
            >
                <div className="flex items-center gap-2 font-semibold">
                    <GripHorizontal size={18} className={isSuccess ? 'text-green-500/50' : 'text-red-500/50'} />
                    {isSuccess ? <CheckCircle size={18} className="text-green-600" /> : <AlertCircle size={18} className="text-red-600" />}
                    <span>{isSuccess ? 'Success' : 'Submission Failed'}</span>
                </div>
                <button
                    onClick={e => {
                        e.stopPropagation();
                        onClose();
                    }}
                    className={`rounded-md p-1 transition-colors ${isSuccess ? 'hover:bg-green-200/50' : 'hover:bg-red-200/50'}`}
                >
                    <X size={18} />
                </button>
            </div>

            {/* Content */}
            <div className="max-h-100 overflow-y-auto bg-white p-4 text-sm text-gray-700">
                <ul className="flex flex-col gap-3">
                    {result.messages.map((msg, idx) => (
                        <li key={idx} className="flex items-start gap-2">
                            <span className={`mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full ${isSuccess ? 'bg-green-500' : 'bg-red-500'}`} />
                            <span className="leading-snug">{msg}</span>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
};
