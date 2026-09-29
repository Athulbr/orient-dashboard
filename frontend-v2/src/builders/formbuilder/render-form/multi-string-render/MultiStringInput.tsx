import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Plus } from 'lucide-react';
import styles from './multi-string.module.css';

interface Option {
    value: string;
    label: string;
}

interface CustomSelectProps {
    value: string[];
    onChange: (value: string[]) => void;
    onFocus: () => void;
    onBlur: () => void;
    focus: boolean;
    placeholder?: string;
}

export const CustomMultiString: React.FC<CustomSelectProps> = ({ value, focus, onChange, onFocus, onBlur, placeholder = '' }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [input, setInput] = useState('');
    const selectRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (selectRef.current && !selectRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleClickAdd = () => {
        if (!input?.trim()) return;
        setIsOpen(true);
        onChange([...value, input]);
        setInput('');
        inputRef.current?.focus();
    };
    const handleClickRemove = (index: number) => {
        onChange([...value.slice(0, index), ...value.slice(index + 1)]);
    };

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleClickAdd();
        }
    };

    return (
        <div ref={selectRef} className={styles.selectContainer}>
            <div className={styles.selectButton}>
                <input
                    ref={inputRef}
                    placeholder={placeholder}
                    onChange={e => setInput(e.target.value)}
                    value={input}
                    className={styles.inputField}
                    onFocus={onFocus}
                    onBlur={onBlur}
                    type="text"
                    onKeyDown={handleKeyPress}
                />
                <span onClick={handleClickAdd} className={`${styles.addButton} ${!input?.trim() ? styles.disabledButton : ''}`}>
                    Add
                </span>
            </div>

            {(isOpen || focus) && Boolean(value.length) && (
                <div className={styles.optionsContainer}>
                    {value.map((val, i) => (
                        <div key={`${val + i}`} className={`${styles.option}`}>
                            {val}{' '}
                            <span onClick={() => handleClickRemove(i)} className={styles.removeButton}>
                                Remove
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
