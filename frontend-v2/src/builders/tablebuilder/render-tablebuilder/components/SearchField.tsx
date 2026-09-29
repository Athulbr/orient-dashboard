import React, { InputHTMLAttributes } from 'react';

interface SearchFieldPropsIF extends InputHTMLAttributes<HTMLInputElement> {
    leftIcon?: React.ReactNode;
    rightIcon?: React.ReactNode;
    onRightIconClick?: () => void;
}

export const SearchField: React.FC<SearchFieldPropsIF> = ({ className = '', leftIcon, rightIcon, onRightIconClick, ...props }) => {
    return (
        <div className="relative max-w-90 min-w-60 flex-1">
            <input
                className={`border-input bg-background h-10 w-full rounded-md border border-gray-300 px-3 py-2 text-sm ${leftIcon ? 'pl-10' : ''} ${rightIcon ? 'pr-10' : ''} transition-colors duration-200 focus:ring-2 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
                {...props}
            />

            {leftIcon && <div className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 -translate-y-1/2">{leftIcon}</div>}

            {rightIcon && (
                <button
                    type="button"
                    className="text-muted-foreground absolute top-1/2 right-3 -translate-y-1/2 cursor-pointer hover:text-gray-400"
                    onClick={onRightIconClick}
                    tabIndex={-1}
                >
                    {rightIcon}
                </button>
            )}
        </div>
    );
};
