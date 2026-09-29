import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import styles from './multi-select.module.css';

interface Option {
    value: string;
    label: string;
}

interface CustomMultiSelectProps {
    options: Option[];
    selectedValues: string[];
    onChange: (values: string[]) => void;
    placeholder?: string;
    onBlur: () => void;
}

const CustomMultiSelect: React.FC<CustomMultiSelectProps> = ({ options, onBlur, selectedValues, onChange, placeholder = 'Select options' }) => {
    const [isOpen, setIsOpen] = useState(false);
    const selectRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (selectRef.current && !selectRef.current.contains(event.target as Node)) {
                setIsOpen(false);
                // onBlur();
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleOptionClick = (optionValue: string) => {
        if (selectedValues.includes(optionValue)) {
            onChange(selectedValues.filter(val => val !== optionValue));
        } else {
            onChange([...selectedValues, optionValue]);
        }
    };

    return (
        <div ref={selectRef} className={styles.selectContainer}>
            <div onClick={() => setIsOpen(!isOpen)} className={styles.selectButton}>
                <span className={selectedValues.length > 0 ? styles.value : styles.placeholder}>
                    {selectedValues.length > 0
                        ? options
                              .filter(opt => selectedValues.includes(opt.value))
                              .map(opt => opt.label)
                              .join(', ')
                        : placeholder}
                </span>
                <ChevronDown size={20} className={`${styles.chevron} ${isOpen ? styles.chevronOpen : ''}`} />
            </div>

            {isOpen && (
                <div className={styles.optionsContainer}>
                    {options.map(option => (
                        <div
                            key={option.value}
                            onClick={() => handleOptionClick(option.value)}
                            className={`${styles.option} ${selectedValues.includes(option.value) ? styles.optionSelected : ''}`}
                        >
                            <input type="checkbox" checked={selectedValues.includes(option.value)} />
                            {option.label}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default CustomMultiSelect;
