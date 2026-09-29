import React, { useState } from 'react';
import style from './plain-text.module.css';
import { InputWrapper } from '../input-wrapper';
import { InputFieldRenderPropsIF, FieldConfigIF } from '../../interface';

export const PlainTextRender: React.FC<InputFieldRenderPropsIF> = ({ index, fields, setFields, inputWrapperClassName }) => {
    const field = fields[index];
    const { config, value, errorMessage } = field;

    const [focus, setFocus] = useState(false);

    const handleBlur = () => {
        setFields(prev => {
            const updatedFields = [...prev];
            updatedFields[index] = { ...field, errorMessage: validatePlainText(value, config) };
            return updatedFields;
        });
        setFocus(false);
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        let newValue = e.target.value;

        // Apply text transformation if defined
        const textTransformMap: Record<string, (text: string) => string> = {
            uppercase: text => text.toUpperCase(),
            lowercase: text => text.toLowerCase(),
            capitalize: text => text.replace(/\b\w/g, char => char.toUpperCase())
        };
        newValue = textTransformMap[config.textTransform as keyof typeof textTransformMap]?.(newValue) || newValue;

        // Update field value in state
        setFields(prev => {
            const updatedFields = [...prev];
            updatedFields[index] = { ...field, value: newValue, errorMessage: validatePlainText(newValue, config) };
            return updatedFields;
        });
    };
    if (!value) {
        field.value = config.defaultValue;
    }

    return (
        <InputWrapper className={inputWrapperClassName} focus={focus} field={field} error={errorMessage || ''}>
            <input
                type="text"
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

export const validatePlainText = (value: string, config: FieldConfigIF): string => {
    if (config.mandatory && !value?.trim()) return 'This field is required.';

    // Construct allowed character set
    let allowedChars = '';
    if (config.letters) allowedChars += 'A-Za-z';
    if (config.numbers) allowedChars += '0-9';
    if (config.emptySpace) allowedChars += ' ';
    if (config.comma) allowedChars += ',';
    allowedChars += '\\n\\r–”“';
    if (config.allowedSpecialCharacters) {
        // Remove commas and escape other regex special characters
        const safeSpecials = config.allowedSpecialCharacters.replace(/,/g, '').replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
        allowedChars += safeSpecials;
    }

    // Validate only allowed characters if any rules were set
    if (allowedChars && config.allowedSpecialCharacters !== 'all') {
        const specialCharsRegex = new RegExp(`^[${allowedChars}]*$`);
        if (!specialCharsRegex.test(value)) {
            return 'Invalid characters entered.';
        }
    }

    if (config.minimumLength && value.length < config.minimumLength) {
        return `Minimum length is ${config.minimumLength} characters.`;
    }

    if (config.maximumLength && value?.length > config.maximumLength) {
        return `Maximum length is ${config.maximumLength} characters.`;
    }

    return '';
};
