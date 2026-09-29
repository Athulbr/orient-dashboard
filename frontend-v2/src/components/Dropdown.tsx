import React, { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '../global-utils/twMerge';

interface DropdownMenuPropsIF {
    children: ReactNode;
    options: string[];
    onChange: (option: string) => void;
    className?: string;
}

export const Dropdown: React.FC<DropdownMenuPropsIF> = ({ children, options, onChange, className }) => {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const toggleDropdown = (e: any) => {
        e.stopPropagation();
        setIsOpen(!isOpen);
    };

    const handleOptionClick = (option: string) => {
        onChange(option);
        setIsOpen(false);
    };

    const handleClickOutside = useCallback((event: MouseEvent) => {
        if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
            setIsOpen(false);
        }
    }, []);

    const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
            setIsOpen(false);
        }
    };

    useEffect(() => {
        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
            document.addEventListener('keydown', handleKeyDown);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [isOpen, handleClickOutside]);

    return (
        <div ref={dropdownRef} className={cn('relative inline-block text-left', className)}>
            <div
                onClick={toggleDropdown}
                className="cursor-pointer"
                role="button"
                tabIndex={0}
                onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.stopPropagation();
                        toggleDropdown(e);
                    }
                }}
                aria-expanded={isOpen}
                aria-haspopup="true"
            >
                {children}
            </div>
            {isOpen && (
                <div
                    className="absolute right-0 z-50 mt-2 origin-top-right divide-y divide-gray-100 rounded-md border border-gray-300 bg-white shadow-lg"
                    role="menu"
                >
                    <div className="py-1">
                        {options.map((option, index) => (
                            <button
                                key={`${option}-${index}`}
                                className="block w-full cursor-pointer px-4 py-2 text-left text-sm text-nowrap text-gray-700 hover:bg-gray-100 hover:text-gray-900 focus:bg-gray-100 focus:outline-none"
                                onClick={(e: any) => {
                                    e.stopPropagation();
                                    handleOptionClick(option);
                                }}
                                role="menuitem"
                                type="button"
                            >
                                {option}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};
