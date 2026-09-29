import { useState } from 'react';
import { InputFieldRenderPropsIF, FieldConfigIF } from '../../interface';
import style from '../plain-text-render/plain-text.module.css';
import { InputWrapper } from '../input-wrapper';

export const ImageRender: React.FC<InputFieldRenderPropsIF> = ({ index, fields, setFields, inputWrapperClassName }) => {
    const field = fields[index];
    const { config, value, errorMessage } = field;
    const [focus, setFocus] = useState(false);

    const handleBlur = () => {
        setFields(prev => {
            const updatedFields = [...prev];
            updatedFields[index] = { ...field, errorMessage: validateImage(value, config) };
            return updatedFields;
        });
        setFocus(false);
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setFields(prev => {
                const updatedFields = [...prev];
                updatedFields[index] = { ...field, value: file, errorMessage: validateImage(file, config) };
                return updatedFields;
            });
        }
    };

    return (
        <InputWrapper className={inputWrapperClassName} focus={focus} error={errorMessage || ''} field={field}>
            <label style={{ height: '100%' }} htmlFor="file-upload" className={style.customFileWrapper}>
                <input
                    onFocus={() => setFocus(true)}
                    id="image-upload"
                    type="file"
                    accept={`${config.PNG && 'image/png'}, ${config.JPEG && 'image/jpeg'}`}
                    disabled={config.disabled}
                    onChange={handleChange}
                    onBlur={handleBlur}
                />
            </label>
        </InputWrapper>
    );
};

export const validateImage = (file: File, config: FieldConfigIF): string => {
    const validExtensions = [];
    if (config.PNG) validExtensions.push('image/png');
    if (config.JPEG) validExtensions.push('image/jpeg');

    if (config.mandatory && !file?.name) {
        return `Image is required`;
    }

    if (!validExtensions.includes(file?.type)) {
        return 'Invalid image type. Only PNG and JPEG are allowed.';
    }

    if (config.minimumSize && file.size < parseInt(config.minimumSize)) {
        return `Image size must be at least ${config.minimumSize} bytes.`;
    }

    if (config.maximumSize && file.size > parseInt(config.maximumSize)) {
        return `Image size must not exceed ${config.maximumSize} bytes.`;
    }

    return '';
};
