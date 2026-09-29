import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../global-utils/twMerge';

export interface SelectOption {
    value: string;
    label: string;
    color?: string;
}

interface SelectProps {
    label?: string;
    value: string;
    options: SelectOption[];
    onValueChange: (value: string) => void;
    placeholder?: string;
    className?: string;
    disabled?: boolean;
    position?: 'top' | 'bottom';
    size?: 'sm' | 'md' | 'lg';
}

export const SingleSelect: React.FC<SelectProps> = ({ value, label, options, onValueChange, placeholder = 'Select an option', className = '', disabled = false, position = 'bottom', size = 'md' }) => {
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

    const buttonSizeClasses = {
        sm: 'h-8 px-2 py-1 text-xs',
        md: 'h-10 px-3 py-2 text-sm',
        lg: 'h-12 px-4 py-3 text-base'
    };

    const iconSizeClasses = {
        sm: 'h-3 w-3',
        md: 'h-4 w-4',
        lg: 'h-5 w-5'
    };

    const optionSizeClasses = {
        sm: 'px-2 py-1 text-xs',
        md: 'px-3 py-2 text-sm',
        lg: 'px-4 py-3 text-base'
    };

    return (
        <div ref={selectRef} className={cn('relative w-fit', className)}>
            {label && <label className="pl-1 text-sm text-gray-500">{label}</label>}
            <button
                onClick={() => !disabled && setIsOpen(!isOpen)}
                className={`flex w-full items-center justify-between gap-2 rounded-md border bg-white transition-all duration-200 ${buttonSizeClasses[size]} ${isOpen ? 'border-blue-400' : 'border-gray-300'} ${value && value !== 'all' ? 'bg-blue-50' : ''} ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:border-gray-400 focus:border-blue-400'}`}
                aria-haspopup="listbox"
                aria-expanded={isOpen}
                disabled={disabled}
                type="button"
                role="button"
            >
                <span 
                    className="truncate text-gray-700"
                    style={selectedOption?.color ? { color: selectedOption.color } : undefined}
                >
                    {selectedOption?.label || placeholder}
                </span>
                <ChevronDown className={`transition-transform duration-200 ${iconSizeClasses[size]} ${isOpen ? 'rotate-180' : ''}`} />
            </button>
            {isOpen && (
                <div className={cn('absolute z-50 w-full overflow-hidden rounded-md border border-gray-300 bg-white shadow-lg', position === 'top' ? 'bottom-full mb-1' : 'top-full mt-1')}>
                    <ul className="max-h-70 overflow-auto py-1" role="listbox">
                        {options.map(option => (
                            <li
                                key={option.value}
                                className={`cursor-pointer hover:bg-gray-100 ${optionSizeClasses[size]} ${option.value === value ? 'bg-gray-200 font-medium' : ''}`}
                                style={option.color ? { color: option.color } : undefined}
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
