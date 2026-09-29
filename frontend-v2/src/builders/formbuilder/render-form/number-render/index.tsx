import React, { useState } from 'react';
import style from '../plain-text-render/plain-text.module.css';
import { FieldConfigIF, FieldIF, InputFieldRenderPropsIF } from '../../interface';
import { InputWrapper } from '../input-wrapper';

export const NumberRender: React.FC<InputFieldRenderPropsIF> = ({ index, fields, setFields, inputWrapperClassName }) => {
    const field = fields[index];
    const { config, value, errorMessage } = field;
    const [focus, setFocus] = useState(false);

    const handleBlur = () => {
        setFields(prev => {
            const updatedFields = [...prev];

            updatedFields[index] = { ...field, errorMessage: validateNumber(value, config) };
            return updatedFields;
        });
        setFocus(false);
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        let newValue = e.target.value.replace(/[^0-9-]/g, '');

        // Ensure only one leading minus for negative numbers
        if (config.negativeNumbers && newValue.includes('-')) {
            newValue = newValue.replace(/(?!^)-/g, '');
        }

        setFields(prev => {
            const updatedFields = [...prev];
            updatedFields[index] = { ...field, value: newValue, errorMessage: validateNumber(newValue, config) };
            return updatedFields;
        });
    };

    return (
        <InputWrapper className={inputWrapperClassName} focus={focus} field={field} error={errorMessage || ''}>
            <input
                type="number"
                className={style.inputField}
                placeholder={config.placeholder}
                value={value}
                disabled={config.disabled}
                onChange={handleChange}
                onBlur={handleBlur}
                onFocus={() => setFocus(true)}
            />
        </InputWrapper>
    );
};

export const validateNumber = (value: string, config: FieldConfigIF): string => {
    if (config.mandatory && !value) return 'This field is required.';
    if (!/^-?\d*$/.test(value)) return 'Invalid number format.';

    const num = Number(value);
    if (isNaN(num)) return 'Please enter a valid number.';

    if (!config.negativeNumbers && num < 0) return 'Negative numbers are not allowed.';
    if (!config.positiveNumbers && num > 0) return 'Positive numbers are not allowed.';

    if (config.minimum !== undefined && num < config.minimum) {
        return `Minimum value is ${config.minimum}.`;
    }
    if (config.maximum !== undefined && num > config.maximum) {
        return `Maximum value is ${config.maximum}.`;
    }

    return '';
};
