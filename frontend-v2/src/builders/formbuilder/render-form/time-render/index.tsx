import { useState } from 'react';
import { InputFieldRenderPropsIF, FieldConfigIF } from '../../interface';
import { InputWrapper } from '../input-wrapper';
import style from '../plain-text-render/plain-text.module.css';

export const TimeRender: React.FC<InputFieldRenderPropsIF> = ({ index, fields, setFields, inputWrapperClassName }) => {
    const field = fields[index];
    const { config, value, errorMessage } = field;
    const [focus, setFocus] = useState(false);

    const handleBlur = () => {
        setFields(prev => {
            const updatedFields = [...prev];
            updatedFields[index] = { ...field, errorMessage: validateTime(value, config) };
            return updatedFields;
        });
        setFocus(false);
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newValue = e.target.value;
        setFields(prev => {
            const updatedFields = [...prev];
            updatedFields[index] = { ...field, value: newValue, errorMessage: validateTime(newValue, config) };
            return updatedFields;
        });
    };

    return (
        <InputWrapper className={inputWrapperClassName} focus={focus} field={field} error={errorMessage || ''}>
            <input
                type="time"
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

export const validateTime = (value: string, config: FieldConfigIF): string => {
    if (config.mandatory && !value?.trim()) return 'This field is required.';

    if (config.minimumTime && value < config.minimumTime) {
        return `Time must be after ${config.minimumTime}.`;
    }
    if (config.maximumTime && value > config.maximumTime) {
        return `Time must be before ${config.maximumTime}.`;
    }

    return '';
};
