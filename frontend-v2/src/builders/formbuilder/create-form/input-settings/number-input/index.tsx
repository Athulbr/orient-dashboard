import React from 'react';
import style from '../text-input/text.module.css';
import { FieldConfigKeysIF } from '../../../interface';
import { useFormBuilder } from '../../formbuilder-context/useFormBuilder';

interface NumberInputPropsIF {
    index: number;
    keyName: FieldConfigKeysIF;
}

export const NumberInput: React.FC<NumberInputPropsIF> = ({ index, keyName }) => {
    const { fields, setFields } = useFormBuilder();

    const inKbInputs = ['minimumSize', 'maximumSize'];

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
                {inKbInputs.includes(keyName) && <span>(in KB)</span>}
            </label>
            <input className={style.textInput} type="number" id={keyName} value={`${fields[index]?.config?.[keyName]}`} onChange={handleCheckboxChange} />
        </div>
    );
};
