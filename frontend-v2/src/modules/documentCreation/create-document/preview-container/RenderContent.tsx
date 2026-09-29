import React from 'react';
import { cn } from '../../../../global-utils/twMerge';
import { HighlightedText } from './HighlightedText';

interface DataMap {
    [key: string]: string;
}

export const RenderContent: React.FC<{ template: string; data: DataMap }> = ({ template, data }) => {
    if (!template) return null;
    return (
        <div>
            {template.split('\n').map((item: string, index: number) => (
                <div className={cn('leading-12', index % 2 === 0 ? 'bg-green-5000' : 'bg-red-5000')} key={index}>
                    <HighlightedText template={item} data={data} />
                </div>
            ))}
        </div>
    );
};
