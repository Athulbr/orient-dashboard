import React, { useState, useEffect, useRef } from 'react';
import style from './select.module.css';
import { FieldConfigKeysIF } from '../../../interface';
import { useFormBuilder } from '../../formbuilder-context/useFormBuilder';
import { ChevronDown } from 'lucide-react';

interface SingleSelectPropsIF {
    index: number;
    keyName: FieldConfigKeysIF; // This should match the keys of the config object
}

export const SingleSelectInput: React.FC<SingleSelectPropsIF> = ({ index, keyName }) => {
    const { fields, setFields } = useFormBuilder();
    const [isOpen, setIsOpen] = useState(false); // Control dropdown visibility
    const dropdownRef = useRef<HTMLDivElement>(null); // Ref to detect clicks outside

    const options: Map<FieldConfigKeysIF, string[]> = new Map<FieldConfigKeysIF, string[]>([
        ['textTransform', ['uppercase', 'lowercase', 'capitalize', 'none']],
        ['gradientType', ['to bottom', 'to right', 'to bottom right', 'to bottom left']],
        ['optionSourceType', ['static', 'from code', 'from API']]
    ]);

    const field = fields[index];

    const selectedValue = field?.config?.[keyName]; // Safely access the selected value

    const handleOptionClick = (option: string) => {
        setFields(prevFields => {
            const updatedFields = [...prevFields];
            const currentField = updatedFields[index];

            if (currentField && typeof currentField.config) {
                // @ts-ignore
                currentField.config[keyName] = option;
            }

            return updatedFields;
        });
        setIsOpen(false);
    };

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false); // Close the dropdown
            }
        };

        document.addEventListener('mousedown', handleClickOutside);

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    // Render only if field and config exist
    if (!field || !field.config) {
        return null;
    }

    return (
        <div className={style.selectContainer} ref={dropdownRef}>
            <label htmlFor={keyName} className={style.inputLabel}>
                {keyName.replace(/([A-Z])/g, ' $1')}
            </label>
            <div
                className={style.selectInput} // Add an active class if dropdown is open
                onClick={() => setIsOpen(prev => !prev)} // Toggle dropdown
            >
                {options.get(keyName)?.length ? String(selectedValue) || 'Select an option' : 'No Option'}
                <span>
                    <ChevronDown size={16} />
                </span>
            </div>
            {isOpen && options.get(keyName) && (
                <ul className={style.optionsList}>
                    {options.get(keyName)?.map(option => (
                        <li
                            key={option}
                            className={`${style.optionItem} ${selectedValue === option ? style.selectedOption : ''}`} // Highlight selected option
                            onClick={() => handleOptionClick(option)}
                        >
                            {option.charAt(0).toUpperCase() + option.slice(1)}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};
