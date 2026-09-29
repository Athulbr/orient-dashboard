import React, { useState } from 'react';
import { InputFieldRenderPropsIF, FieldConfigIF } from '../../interface';
import { InputWrapper } from '../input-wrapper';
import style from '../plain-text-render/plain-text.module.css';

export const ColorRender: React.FC<InputFieldRenderPropsIF> = ({ index, fields, setFields, inputWrapperClassName }) => {
    const field = fields[index];
    const { config, value, errorMessage } = field;
    const [focus, setFocus] = useState(false);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>, i: number) => {
        const newValue = e.target.value;
        const updatedColorArray = [...value];
        updatedColorArray[i] = newValue;

        setFields(prev => {
            const updatedFields = [...prev];
            updatedFields[index] = { ...field, value: updatedColorArray };
            return updatedFields;
        });
        // setError(validateColor(newValue, config));
    };

    const addOneMoreColor = () => {
        if (value.length > 6) return;
        const updatedColorArray = [...value, '#0000ff']; // Default new color
        setFields(prev => {
            const updatedFields = [...prev];
            updatedFields[index] = { ...field, value: updatedColorArray };
            return updatedFields;
        });
    };

    const removeLastColor = () => {
        if (value.length > 1) {
            const updatedColorArray = value.slice(0, -1);
            setFields(prev => {
                const updatedFields = [...prev];
                updatedFields[index] = { ...field, value: updatedColorArray };
                return updatedFields;
            });
        }
    };

    const gradientBackground = value.length > 1 ? `linear-gradient(${config.gradientType}, ${value.join(', ')})` : value;

    return (
        <InputWrapper className={inputWrapperClassName} focus={focus} field={field} error={errorMessage || ''}>
            <div className={style.colorInputContainer}>
                {focus && (
                    <div className={`${style.previewContainer} ${focus ? style.show : ''}`} style={{ background: gradientBackground }}>
                        Color Preview
                    </div>
                )}
                <div className={style.inputsContainer}>
                    {value.map((col: string, i: number) => (
                        <input
                            key={i}
                            type="color"
                            className={style.inputField}
                            value={col}
                            disabled={config.disabled}
                            onChange={e => handleChange(e, i)}
                            onBlur={() => setFocus(false)}
                            onFocus={() => setFocus(true)}
                            style={{ padding: 5 }}
                        />
                    ))}
                </div>
            </div>
            <div className={style.buttonContainer}>
                <span className={style.colorIconButton} onClick={removeLastColor}>
                    -
                </span>
                <span className={style.colorIconButton} onClick={addOneMoreColor}>
                    +
                </span>
            </div>
        </InputWrapper>
    );
};

export const validateColor = (value: string, config: FieldConfigIF): string => {
    // if (config.mandatory && !value?.trim()) return 'Color selection is required.';

    // const colorRegex = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;
    // if (!colorRegex.test(value)) return 'Invalid color format.';

    return '';
};
