import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, X } from 'lucide-react';

// Utility function for merging classNames
const cn = (...classes: (string | boolean | undefined)[]) => {
    return classes.filter(Boolean).join(' ');
};

export interface SelectOption {
    value: string;
    label: string;
}

interface MultiSelectProps {
    label?: string;
    values: string[];
    options: SelectOption[];
    onValuesChange: (values: string[]) => void;
    placeholder?: string;
    className?: string;
    disabled?: boolean;
    maxDisplay?: number;
}

export const MultiSelect: React.FC<MultiSelectProps> = ({
    values,
    label,
    options,
    onValuesChange,
    placeholder = 'Select options',
    className = '',
    disabled = false,
    maxDisplay = 2
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

    const toggleOption = (optionValue: string) => {
        if (values.includes(optionValue)) {
            onValuesChange(values.filter(v => v !== optionValue));
        } else {
            onValuesChange([...values, optionValue]);
        }
    };

    const removeOption = (optionValue: string, e: React.MouseEvent) => {
        e.stopPropagation();
        onValuesChange(values.filter(v => v !== optionValue));
    };

    const selectedOptions = options.filter(option => values.includes(option.value));
    const displayedOptions = selectedOptions.slice(0, maxDisplay);
    const remainingCount = selectedOptions.length - maxDisplay;

    return (
        <div ref={selectRef} className={cn('relative min-w-10 max-w-200', className)}>
            {label && <label className="pl-1 text-sm text-gray-500">{label}</label>}
            <button
                onClick={() => !disabled && setIsOpen(!isOpen)}
                className={`flex min-h-10 w-full overflow-x-auto items-center justify-between gap-2 rounded-md border bg-white px-3 py-2 text-sm transition-all duration-200 ${isOpen ? 'border-blue-400' : 'border-gray-300'} ${values.length > 0 ? 'bg-blue-50' : ''} ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:border-gray-400 focus:border-blue-400'}`}
                aria-haspopup="listbox"
                aria-expanded={isOpen}
                disabled={disabled}
                type="button"
                role="button"
            >
                <div className="flex flex-1  items-center gap-1">
                    {values.length === 0 ? (
                        <span className="text-gray-700">{placeholder}</span>
                    ) : (
                        <>
                            {displayedOptions.map(option => (
                                <span
                                    key={option.value}
                                    className="text-nowrap flex  items-center gap-1 rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700"
                                >
                                    <span className="overflow-hidden max-w-30 text-ellipsis">{option.label}</span>
                                    <X className="h-3 w-3 min-w-3 cursor-pointer hover:text-gray-900" onClick={e => removeOption(option.value, e)} />
                                </span>
                            ))}
                            {remainingCount > 0 && (
                                <span className="text-nowrap items-center rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                                    +{remainingCount} more
                                </span>
                            )}
                        </>
                    )}
                </div>
                <ChevronDown className={`h-4 w-4 flex-shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
            </button>
            {isOpen && (
                <div className="absolute z-50 mt-1 min-w-full w-max max-w-md overflow-hidden rounded-md border border-gray-300 bg-white shadow-lg">
                    <ul className="max-h-60 overflow-auto py-1" role="listbox">
                        {options.map(option => {
                            const isSelected = values.includes(option.value);
                            return (
                                <li
                                    key={option.value}
                                    className={`cursor-pointer px-3 py-2 text-sm hover:bg-gray-100 ${isSelected ? 'bg-gray-200 border-b border-gray-300' : ''}`}
                                    onClick={() => toggleOption(option.value)}
                                    role="option"
                                    aria-selected={isSelected}
                                >
                                    <label className="flex cursor-pointer items-center gap-2">
                                        <span className={isSelected ? 'font-medium' : ''}>{option.label}</span>
                                    </label>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            )}
        </div>
    );
};

// Demo component
const Demo = () => {
    const [selectedValues, setSelectedValues] = useState<string[]>(['option2']);

    const options: SelectOption[] = [
        { value: 'option1', label: 'Option 1' },
        { value: 'option2', label: 'Option 2' },
        { value: 'option3', label: 'Option 3' },
        { value: 'option4', label: 'Option 4' },
        { value: 'option5', label: 'Option 5' }
    ];

    return (
        <div className="flex min-h-screen items-center justify-center bg-gray-50 p-8">
            <div className="w-full max-w-md space-y-6">
                <div>
                    <h2 className="mb-4 text-2xl font-bold text-gray-800">Multi-Select Component</h2>

                    <MultiSelect
                        label="Select Multiple Options"
                        values={selectedValues}
                        options={options}
                        onValuesChange={setSelectedValues}
                        placeholder="Choose options..."
                        className="w-full"
                    />

                    <div className="mt-4 rounded-md bg-white p-4 shadow">
                        <h3 className="mb-2 text-sm font-semibold text-gray-700">Selected Values:</h3>
                        <pre className="text-xs text-gray-600">{JSON.stringify(selectedValues, null, 2)}</pre>
                    </div>
                </div>

                <div>
                    <MultiSelect label="Disabled State" values={['option1']} options={options} onValuesChange={() => {}} disabled={true} className="w-full" />
                </div>
            </div>
        </div>
    );
};

export default Demo;
