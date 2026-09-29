import React from 'react';
import style from '../radio-input/radio-input.module.css';
import { useFormBuilder } from '../../formbuilder-context/useFormBuilder';
import { FieldConfigKeysIF } from '../../../interface';

interface RadioInputPropsIF {
    index: number;
    keyName: FieldConfigKeysIF;
}

const RadioInput: React.FC<RadioInputPropsIF> = ({ index, keyName }) => {
    const { fields, setFields } = useFormBuilder();

    // Handle potential undefined value in fields[index].config[keyName]
    const initialValue = fields[index]?.config?.[keyName];

    const handleRadioChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFields(prevFields => {
            const updatedFields = [...prevFields];
            // @ts-ignore
            updatedFields[index].config[keyName] = e.target.value;
            return updatedFields;
        });
    };

    return (
        <div className={style.radioMainContainer}>
            <div>Text Transform</div>
            <div className={style.radioContainer}>
                {['uppercase', 'lowercase', 'capitalize', 'none'].map((option: string, optionIndex: number) => {
                    const radioId = `RadioInput_${index}_${keyName}_${optionIndex}`;
                    return (
                        <div key={optionIndex} className={style.radioOption}>
                            <input
                                className={style.radioInput}
                                type="radio"
                                id={radioId}
                                name={`RadioInput_${index}_${keyName}`}
                                value={option}
                                checked={initialValue === option}
                                onChange={handleRadioChange}
                            />
                            <label htmlFor={radioId} className={style.radioLabel}>
                                {option}
                            </label>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default RadioInput;
