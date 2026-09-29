import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import styles from './select.module.css';

interface Option {
    value: string;
    label: string;
}

interface CustomSelectProps {
    options: Option[];
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    onBlur: () => void;
}

const CustomSelect: React.FC<CustomSelectProps> = ({ options, value, onChange, onBlur, placeholder = 'Select an option' }) => {
    const [isOpen, setIsOpen] = useState(false);
    const selectRef = useRef<HTMLDivElement>(null);

    const selectedOption = options.find(option => option.value === value);

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
        onChange(optionValue);
        setIsOpen(false);
    };

    const toggleOptionsHandler = () => {
        setIsOpen(!isOpen);
    };

    return (
        <div ref={selectRef} className={styles.selectContainer}>
            <div onClick={toggleOptionsHandler} className={styles.selectButton}>
                <span className={selectedOption ? styles.value : styles.placeholder}>{selectedOption ? selectedOption.label : placeholder}</span>
                <ChevronDown size={20} className={`${styles.chevron} ${isOpen ? styles.chevronOpen : ''}`} />
            </div>

            {isOpen && (
                <div className={styles.optionsContainer}>
                    {options.map(option => (
                        <div
                            key={option.value}
                            onClick={() => handleOptionClick(option.value)}
                            className={`${styles.option} ${option.value === value ? styles.optionSelected : ''}`}
                        >
                            {option.label}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default CustomSelect;
