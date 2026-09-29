import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import { Button } from '../../../../components/Button';

export interface SelectOption {
    value: string;
    label: string;
}

interface SelectProps {
    value: string;
    options: SelectOption[];
    onValueChange: (value: string) => void;
    placeholder?: string;
    className?: string;
    disabled?: boolean;
    hidden?: boolean;
}

export const SingleSelect: React.FC<SelectProps> = ({
    value,
    options,
    onValueChange,
    placeholder = 'Select an option',
    className = '',
    disabled = false,
    hidden = false
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const selectRef = useRef<HTMLDivElement>(null);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (selectRef.current && !selectRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const selectedOption = options.find(option => option.value === value);

    if (hidden) return null;

    return (
        <div ref={selectRef} className={`relative ${className}`}>
            <Button onClick={() => !disabled && setIsOpen(!isOpen)} aria-haspopup="listbox" aria-expanded={isOpen} disabled={disabled} outlined>
                <span className="truncate">{selectedOption?.label || placeholder}</span>
                <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
            </Button>

            {isOpen && (
                <div className="border-input absolute z-50 mt-1 min-w-full overflow-hidden rounded-md border bg-white shadow-lg">
                    <ul className="max-h-60 overflow-auto py-1" role="listbox">
                        {options.map(option => (
                            <li
                                key={option.value}
                                className={`cursor-pointer px-3 py-2 text-sm hover:bg-gray-100 ${option.value === value ? 'bg-gray-200 font-medium' : ''} `}
                                onClick={() => {
                                    onValueChange(option.value);
                                    setIsOpen(false);
                                }}
                                role="option"
                                aria-selected={option.value === value}
                            >
                                {option.label}
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
};
