import React, { useState } from 'react';
import style from '../plain-text-render/plain-text.module.css';
import { InputFieldRenderPropsIF } from '../../interface';
import { InputWrapper } from '../input-wrapper';
import { validatePlainText } from '../plain-text-render';

export const MultilineTextRender: React.FC<InputFieldRenderPropsIF> = ({ index, fields, setFields, inputWrapperClassName }) => {
    const field = fields[index];
    const { config, value, errorMessage } = field;
    const [focus, setFocus] = useState(false);

    const handleBlur = () => {
        setFields(prev => {
            const updatedFields = [...prev];
            updatedFields[index] = {
                ...field,
                errorMessage: validatePlainText(value, config)
            };
            return updatedFields;
        });
        setFocus(false);
    };

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
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
            updatedFields[index] = {
                ...field,
                value: newValue,
                errorMessage: validatePlainText(newValue, config)
            };
            return updatedFields;
        });
    };

    return (
        <InputWrapper style={{ marginBottom: 5 }} className={inputWrapperClassName} focus={focus} field={field} error={errorMessage || ''}>
            <textarea
                className={style.inputField}
                placeholder={config.placeholder}
                value={value}
                disabled={config.disabled}
                onChange={handleChange}
                onBlur={handleBlur}
                onFocus={() => setFocus(true)}
                style={{ padding: 10, minHeight: '45px' }}
                rows={config.textRows}
            />
        </InputWrapper>
    );
};
