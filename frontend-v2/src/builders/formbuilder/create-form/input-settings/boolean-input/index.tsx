import React from 'react';
import style from './boolean.module.css';
import { FieldConfigKeysIF } from '../../../interface';
import { useFormBuilder } from '../../formbuilder-context/useFormBuilder';

interface BooleanInputPropsIF {
    index: number;
    keyName: FieldConfigKeysIF;
}

export const BooleanInput: React.FC<BooleanInputPropsIF> = ({ index, keyName }) => {
    const { fields, setFields } = useFormBuilder();

    const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const isChecked = e.target.checked;

        setFields(prevFields => {
            const updatedFields = [...prevFields];
            // @ts-ignore
            updatedFields[index].config[keyName] = isChecked;
            return updatedFields;
        });
    };

    const isChecked = Boolean(fields[index]?.config?.[keyName]);

    return (
        <div className={style.checkboxContainer}>
            <input className={style.checkboxInput} type="checkbox" id={keyName} checked={isChecked} onChange={handleCheckboxChange} />
            <label htmlFor={keyName} className={style.checkboxLabel}>
                {keyName.replace(/([A-Z])/g, ' $1')}
            </label>
        </div>
    );
};
