import React, { useState } from 'react';
import style from '../plain-text-render/plain-text.module.css';
import { FieldConfigIF, FieldIF, InputFieldRenderPropsIF } from '../../interface';
import { InputWrapper } from '../input-wrapper';
import { SignaturePad } from './SignaturePad';
import { Dialog } from '../../components/dialog';

export const SignatureRender: React.FC<InputFieldRenderPropsIF> = ({ index, fields, setFields, inputWrapperClassName }) => {
    const field = fields[index];
    const { config, value, errorMessage } = field;
    const [focus, setFocus] = useState(false);
    const [isOpen, setIsOpen] = useState(false);

    const handleBlur = () => {
        setFields(prev => {
            const updatedFields = [...prev];
            updatedFields[index] = {
                ...field,
                errorMessage: validateSignature(value, config)
            };
            return updatedFields;
        });
        setFocus(false);
    };

    const handleChange = (e: any) => {
        setFields(prev => {
            const updatedFields = [...prev];
            updatedFields[index] = {
                ...field,
                value: e,
                errorMessage: validateSignature(e, config)
            };
            return updatedFields;
        });
    };

    return (
        <InputWrapper className={'w-1/3'} focus={focus} field={field} error={errorMessage || ''}>
            <div onClick={() => setIsOpen(true)} className={style.signatureLabel}>
                <span className={style.signatureLabelButton}>{value ? 'Update Signarure' : 'Add Signarure'}</span>{' '}
                {value && <img height={40} width={80} src={value} />}
            </div>
            <Dialog isOpen={isOpen} onClose={() => setIsOpen(false)}>
                <SignaturePad value={value} onChange={handleChange} onBlur={handleBlur} onClose={() => setIsOpen(false)} />
            </Dialog>
        </InputWrapper>
    );
};

export const validateSignature = (value: string, config: FieldConfigIF): string => {
    if (config.mandatory && !value) return 'Signature is required.';
    return '';
};
