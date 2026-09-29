import React, { useEffect, useRef } from 'react';
import { useDocumentCreationEditorState } from '../hooks/DocumentCreationEditorContext';

interface DataMap {
    [key: string]: string;
}

export const HighlightedText: React.FC<{ template: string; data: DataMap }> = ({ template, data }) => {
    const { state, setState } = useDocumentCreationEditorState();
    const spanRefs = useRef<{ [key: string]: HTMLSpanElement | null }>({});

    // Scroll active element into view
    useEffect(() => {
        if (state.activeId && spanRefs.current[state.activeId]) {
            spanRefs.current[state.activeId]?.scrollIntoView({
                behavior: 'smooth',
                block: 'center',
                inline: 'nearest'
            });
        }
    }, [state.activeId]);

    if (!template) return null;

    const parts = template.split(/({{.*?}})/g);

    return (
        <div>
            {parts.map((part, index) => {
                const match = part.match(/{{(.*?)}}/);
                if (match) {
                    const key = match[1].trim();
                    const value = data[key];
                    const isFilled = !!value;

                    return (
                        <span
                            key={index}
                            ref={el => {
                                spanRefs.current[key] = el;
                            }}
                            style={{
                                border: key === state.activeId ? '2px solid #3b82f6' : '2px solid white',
                                padding: '2px 4px',
                                borderRadius: '3px',
                                backgroundColor: 'rgb(210 242 198 / 36%)'
                            }}
                            id={`span-${key}`}
                            onClick={() => setState(prev => ({ ...prev, activeId: key }))}
                        >
                            {isFilled ? value : `_______________`}
                        </span>
                    );
                }

                return <React.Fragment key={index}>{part}</React.Fragment>;
            })}
        </div>
    );
};
