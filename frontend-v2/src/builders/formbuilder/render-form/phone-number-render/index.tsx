import { useState } from 'react';
import { InputFieldRenderPropsIF, FieldConfigIF } from '../../interface';
import { InputWrapper } from '../input-wrapper';
import style from '../plain-text-render/plain-text.module.css';

export const PhoneNumberRender: React.FC<InputFieldRenderPropsIF> = ({ index, fields, setFields, inputWrapperClassName }) => {
    const field = fields[index];
    const { config, value, errorMessage } = field;
    const [focus, setFocus] = useState(false);

    const handleBlur = () => {
        setFields(prev => {
            const updatedFields = [...prev];
            updatedFields[index] = { ...field, errorMessage: validatePhoneNumber(value, config) };
            return updatedFields;
        });
        setFocus(false);
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newValue = e.target.value.replace(/[^0-9+]/g, '');

        setFields(prev => {
            const updatedFields = [...prev];
            updatedFields[index] = { ...field, value: newValue, errorMessage: validatePhoneNumber(newValue, config) };
            return updatedFields;
        });
    };

    return (
        <InputWrapper className={inputWrapperClassName} focus={focus} field={field} error={errorMessage || ''}>
            <input
                type="tel"
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

export const validatePhoneNumber = (value: string, config: FieldConfigIF): string => {
    if (config.mandatory && !value?.trim()) return 'This field is required.';

    if (config.minimumLength && value.length < config.minimumLength) {
        return `Phone number must be at least ${config.minimumLength} digits.`;
    }
    if (config.maximumLength && value?.length > config.maximumLength) {
        return `Phone number must not exceed ${config.maximumLength} digits.`;
    }
    return '';
};
