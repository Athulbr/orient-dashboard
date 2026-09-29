import React, { useState } from 'react';
import { FieldConfigIF, InputFieldRenderPropsIF } from '../../interface';
import { InputWrapper } from '../input-wrapper';
import { CustomMultiString } from './MultiStringInput';

export const MultiStringRender: React.FC<InputFieldRenderPropsIF> = ({ index, fields, setFields, inputWrapperClassName }) => {
    const field = fields[index];
    const { config, value, errorMessage } = field;
    const [focus, setFocus] = useState(false);

    const handleBlur = () => {
        setFields(prev => {
            const updatedFields = [...prev];
            updatedFields[index] = {
                ...field,
                errorMessage: validateMultiString(value, config)
            };
            return updatedFields;
        });
        setFocus(false);
    };

    const handleChange = (newValue: string[]) => {
        setFields(prev => {
            const updatedFields = [...prev];
            updatedFields[index] = {
                ...field,
                value: newValue,
                errorMessage: validateMultiString(newValue, config)
            };
            return updatedFields;
        });
    };

    return (
        <InputWrapper className={inputWrapperClassName} focus={focus} field={field} error={errorMessage || ''}>
            <CustomMultiString
                placeholder={config.placeholder}
                focus={focus}
                onBlur={handleBlur}
                onFocus={() => setFocus(true)}
                onChange={handleChange}
                value={value}
            />
        </InputWrapper>
    );
};

export const validateMultiString = (value: string[], config: FieldConfigIF): string => {
    if (config.mandatory && !value.length) return 'This field is required.';
    if ((config.minimum || 0) > value.length) return `Minimum input is ${value.length}`;
    if ((config.maximum || 10000) < value.length) return `Maximum input is ${value.length}`;

    return '';
};
