import { useState } from 'react';
import { InputFieldRenderPropsIF, FieldConfigIF } from '../../interface';
import { InputWrapper } from '../input-wrapper';
import style from '../plain-text-render/plain-text.module.css';
import { Eye, EyeOff } from 'lucide-react';

export const PasswordRender: React.FC<InputFieldRenderPropsIF> = ({ index, fields, setFields, inputWrapperClassName }) => {
    const field = fields[index];
    const { config, value, errorMessage } = field;
    const [focus, setFocus] = useState(false);
    const [eyeVisible, setEyeVisible] = useState(false);

    const handleBlur = () => {
        setFields(prev => {
            const updatedFields = [...prev];
            updatedFields[index] = {
                ...field,
                errorMessage: validatePassword(value, config)
            };
            return updatedFields;
        });
        setFocus(false);
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newValue = e.target.value;

        setFields(prev => {
            const updatedFields = [...prev];
            updatedFields[index] = {
                ...field,
                value: newValue,
                errorMessage: validatePassword(newValue, config)
            };
            return updatedFields;
        });
    };

    return (
        <InputWrapper className={inputWrapperClassName} focus={focus} field={field} error={errorMessage || ''}>
            <input
                type={eyeVisible ? 'text' : 'password'}
                className={style.inputField}
                placeholder={config.placeholder}
                value={value}
                disabled={config.disabled}
                onChange={handleChange}
                onBlur={handleBlur}
                onFocus={() => setFocus(true)}
            />
            {eyeVisible ? (
                <Eye onClick={() => setEyeVisible(!eyeVisible)} style={{ marginRight: 12, cursor: 'pointer' }} color="gray" />
            ) : (
                <EyeOff onClick={() => setEyeVisible(!eyeVisible)} style={{ marginRight: 12, cursor: 'pointer' }} color="gray" />
            )}
        </InputWrapper>
    );
};

export const validatePassword = (value: string, config: FieldConfigIF): string => {
    if (config.mandatory && !value?.trim()) return 'This field is required.';

    if (config.minimumLength && value.length < config.minimumLength) {
        return `Minimum length is ${config.minimumLength} characters.`;
    }

    if (config.maximumLength && value?.length > config.maximumLength) {
        return `Maximum length is ${config.maximumLength} characters.`;
    }

    if (config.letters && !/[a-zA-Z]/.test(value)) {
        return 'Password must contain at least one letter.';
    }

    if (config.numbers && !/[0-9]/.test(value)) {
        return 'Password must contain at least one number.';
    }

    if (config.capitalLetter && !/[A-Z]/.test(value)) {
        return 'Password must contain at least one uppercase letter.';
    }

    if (config.specialCharacters && !/[!@#$%^&*(),.?":{}|<>]/.test(value)) {
        return 'Password must contain at least one special character.';
    }

    return '';
};
