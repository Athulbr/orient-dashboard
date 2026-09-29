import React from 'react';
import { cn } from '../global-utils/twMerge';

interface TooltipProps {
    children: React.ReactNode;
    text: string;
    position?: 'top' | 'bottom' | 'left' | 'right';
    containerClassName?: string;
}

const Tooltip: React.FC<TooltipProps> = ({ children, text, position = 'top', containerClassName }) => {
    const positionClasses = {
        top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
        bottom: 'top-[calc(100%+12px)] left-1/2 -translate-x-1/2 mt-2',
        left: 'right-full top-1/2 -translate-y-1/2 mr-2',
        right: 'left-full top-1/2 -translate-y-1/2 ml-2'
    };

    return (
        <div className={cn('group relative inline-block', containerClassName)}>
            {children}
            <div
                className={`pointer-events-none absolute z-100 scale-90 transform rounded-sm bg-gray-400 px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap text-white opacity-0 transition-all duration-400 ease-in-out group-hover:scale-100 group-hover:opacity-100 ${positionClasses[position]}`}
                role="tooltip"
            >
                {text}
                {/* <div
          className={`absolute h-1.5 w-1.5 rotate-45 transform bg-gray-400 ${
            position === 'top'
              ? 'bottom-[-3px] left-1/2 -translate-x-1/2'
              : position === 'bottom'
                ? 'top-[-3px] left-1/2 -translate-x-1/2'
                : position === 'left'
                  ? 'top-1/2 right-[-3px] -translate-y-1/2'
                  : 'top-1/2 left-[-3px] -translate-y-1/2'
          }`}
        /> */}
            </div>
        </div>
    );
};

export default Tooltip;
