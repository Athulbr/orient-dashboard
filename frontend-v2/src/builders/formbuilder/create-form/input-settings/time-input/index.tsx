import React from 'react';
import style from '../text-input/text.module.css';
import { FieldConfigKeysIF } from '../../../interface';
import { useFormBuilder } from '../../formbuilder-context/useFormBuilder';

interface TimeInputPropsIF {
    index: number;
    keyName: FieldConfigKeysIF;
}

export const TimeInput: React.FC<TimeInputPropsIF> = ({ index, keyName }) => {
    const { fields, setFields } = useFormBuilder();

    const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFields(prevFields => {
            const uptimedFields = [...prevFields];
            // @ts-ignore
            uptimedFields[index].config[keyName] = e.target.value;
            return uptimedFields;
        });
    };

    return (
        <div className={style.container}>
            <label htmlFor={keyName} className={style.inputLabel}>
                {keyName.replace(/([A-Z])/g, ' $1')}
                <span>(HH:MM AM/PM)</span>
            </label>
            <input className={style.textInput} type="time" id={keyName} value={`${fields[index]?.config?.[keyName]}`} onChange={handleCheckboxChange} />
        </div>
    );
};
