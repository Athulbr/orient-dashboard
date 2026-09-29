import { useEffect } from 'react';
import style from '../plain-text-render/plain-text.module.css';
import { InputWrapper } from '../input-wrapper';
import { InputFieldRenderPropsIF, FieldConfigIF } from '../../interface';

export const CheckboxRender: React.FC<InputFieldRenderPropsIF> = ({ index, fields, setFields, inputWrapperClassName }) => {
    const field = fields[index];
    const { config, value, errorMessage } = field;

    useEffect(() => {
        if (!config.defaultChecked) return;
        setFields(prev => {
            const updatedFields = [...prev];
            updatedFields[index] = { ...field, value: true };
            return updatedFields;
        });
    }, []);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newValue = e.target.checked;
        setFields(prev => {
            const updatedFields = [...prev];
            updatedFields[index] = {
                ...field,
                value: newValue,
                errorMessage: validateCheckbox(newValue, config)
            };
            return updatedFields;
        });
    };

    return (
        <InputWrapper
            className={inputWrapperClassName}
            error={errorMessage || ''}
            focus={false}
            field={field}
            style={{ border: 'none', backgroundColor: 'transparent' }}
            invisibleLabel
            hideLabel={config.shrink}
        >
            <input id={`check_${index}`} type="checkbox" className={style.checkboxInput} checked={value} disabled={config.disabled} onChange={handleChange} />
            <label htmlFor={`check_${index}`} className={`${style.checkboxLabel} ${config.disabled ? style.disabled : ''}`}>
                {field.label}
            </label>
        </InputWrapper>
    );
};

export const validateCheckbox = (value: boolean, config: FieldConfigIF): string => {
    if (config.expectUnchecked && value) {
        return 'This checkbox must be unchecked.';
    }
    if (config.mandatory && !value) {
        return 'This checkbox must be checked.';
    }
    return '';
};
