import { useState } from 'react';
import { InputWrapper } from '../input-wrapper';
import style from '../plain-text-render/plain-text.module.css';
import { InputFieldRenderPropsIF, FieldConfigIF } from '../../interface';

export const UrlRender: React.FC<InputFieldRenderPropsIF> = ({ index, fields, setFields, inputWrapperClassName }) => {
    const field = fields[index];
    const { config, value, errorMessage } = field;
    const [focus, setFocus] = useState(false);

    const handleBlur = () => {
        setFields(prev => {
            const updatedFields = [...prev];
            updatedFields[index] = { ...field, errorMessage: validateUrl(value, config) };
            return updatedFields;
        });
        setFocus(false);
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newValue = e.target.value?.trim();
        setFields(prev => {
            const updatedFields = [...prev];
            updatedFields[index] = { ...field, value: newValue, errorMessage: validateUrl(newValue, config) };
            return updatedFields;
        });
    };

    return (
        <InputWrapper className={inputWrapperClassName} focus={focus} field={field} error={errorMessage || ''}>
            <input
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

export const validateUrl = (value: string, config: FieldConfigIF): string => {
    if (config.mandatory && !value?.trim()) return 'This field is required.';

    const urlRegex = /^(https?:\/\/)?([\w-]+\.)+[\w-]+(\/[\w-]*)*$/;
    if (!urlRegex.test(value)) return 'Invalid URL format.';

    try {
        const url = new URL(value);
        const domain = url.hostname.replace(/^www\./, '');

        if (config.onlyDomains) {
            const allowedDomains = config.onlyDomains.split(',').map(d => d?.trim());
            if (!allowedDomains.includes(domain)) {
                return `Only URLs from ${config.onlyDomains} are allowed.`;
            }
        }

        if (config.exceptDomains) {
            const blockedDomains = config.exceptDomains.split(',').map(d => d?.trim());
            if (blockedDomains.includes(domain)) {
                return `URLs from ${config.exceptDomains} are not allowed.`;
            }
        }
    } catch {
        return 'Invalid URL format.';
    }

    return '';
};
