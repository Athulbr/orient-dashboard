import React from 'react';
import { cn } from '../global-utils/twMerge';

export const ButtonBox: React.FC<ButtonBoxPropsIF> = ({ start = false, end = true, center = false, className = '', children }) => {
    const getAlignment = () => {
        if (start) return 'justify-start';
        if (center) return 'justify-center';
        return 'justify-end'; // Default or when end=true
    };

    return (
        <div role="group" className={cn(`flex flex-wrap items-center gap-3 ${getAlignment()} ${className}`)}>
            {children}
        </div>
    );
};

import { ReactNode } from 'react';

interface ButtonBoxPropsIF {
    start?: boolean;

    end?: boolean;

    center?: boolean;

    className?: string;

    children: ReactNode;
}
