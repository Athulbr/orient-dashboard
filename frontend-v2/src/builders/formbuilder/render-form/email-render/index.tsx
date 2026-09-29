import { useState } from 'react';
import { InputFieldRenderPropsIF, FieldConfigIF } from '../../interface';
import { InputWrapper } from '../input-wrapper';
import style from '../plain-text-render/plain-text.module.css';

export const EmailRender: React.FC<InputFieldRenderPropsIF> = ({ index, fields, setFields, inputWrapperClassName }) => {
    const field = fields[index];
    const { config, value, errorMessage } = field;
    const [focus, setFocus] = useState(false);

    const handleBlur = () => {
        setFields(prev => {
            const updatedFields = [...prev];
            updatedFields[index] = { ...field, errorMessage: validateEmail(value, config) };
            return updatedFields;
        });
        setFocus(false);
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newValue = e.target.value;

        setFields(prev => {
            const updatedFields = [...prev];
            updatedFields[index] = { ...field, value: newValue, errorMessage: validateEmail(newValue, config) };
            return updatedFields;
        });
    };

    return (
        <InputWrapper className={inputWrapperClassName} focus={focus} field={field} error={errorMessage || ''}>
            <input
                type="email"
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

export const validateEmail = (value: string, config: FieldConfigIF): string => {
    if (config.mandatory && !value?.trim()) return 'This field is required.';

    const emailRegex = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
    if (!emailRegex.test(value)) return 'Invalid email format.';

    if (config.minimumLength && value.length < config.minimumLength) {
        return `Minimum length is ${config.minimumLength} characters.`;
    }

    if (config.maximumLength && value?.length > config.maximumLength) {
        return `Maximum length is ${config.maximumLength} characters.`;
    }

    if (config.exceptDomains) {
        const restrictedDomains = config.exceptDomains.split(',').map(domain => domain?.trim().toLowerCase());
        const emailDomain = value.split('@')[1]?.toLowerCase();
        if (restrictedDomains.includes(emailDomain)) {
            return `Emails from ${emailDomain} are not allowed.`;
        }
    }

    if (config.onlyDomains) {
        const allowedDomains = config.onlyDomains.split(',').map(domain => domain?.trim().toLowerCase());
        const emailDomain = value.split('@')[1]?.toLowerCase();
        if (!allowedDomains.includes(emailDomain)) {
            return `Only emails from ${allowedDomains.join(', ')} are allowed.`;
        }
    }

    return '';
};
