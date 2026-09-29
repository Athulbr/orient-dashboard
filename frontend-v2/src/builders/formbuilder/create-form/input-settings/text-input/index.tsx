import React from 'react';
import style from './text.module.css';
import { FieldConfigKeysIF } from '../../../interface';
import { useFormBuilder } from '../../formbuilder-context/useFormBuilder';

interface textInputPropsIF {
    index: number;
    keyName: FieldConfigKeysIF;
}

export const TextInput: React.FC<textInputPropsIF> = ({ index, keyName }) => {
    const { fields, setFields } = useFormBuilder();

    const commaSeperatedInputs = ['exceptDomains', 'onlyDomains', 'allowedSpecialCharacters', 'options', 'rows', 'colums', 'minimumSize'];

    const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFields(prevFields => {
            const updatedFields = [...prevFields];
            // @ts-ignore
            updatedFields[index].config[keyName] = e.target.value;
            return updatedFields;
        });
    };

    return (
        <div className={style.container}>
            <label htmlFor={keyName} className={style.inputLabel}>
                {keyName.replace(/([A-Z])/g, ' $1')}
                {commaSeperatedInputs.includes(keyName) && <span>(Comma Seperated)</span>}
            </label>
            <input className={style.textInput} type="text" id={keyName} value={`${fields[index]?.config?.[keyName]}`} onChange={handleCheckboxChange} />
        </div>
    );
};
