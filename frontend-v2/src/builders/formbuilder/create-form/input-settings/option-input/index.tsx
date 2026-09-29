import React, { useEffect, useRef, useState, useCallback } from 'react';
import style from './option-input.module.css';
import { useFormBuilder } from '../../formbuilder-context/useFormBuilder';
import { TextInput } from '../text-input';
import { Button } from '../../../components/button';
import { TextField } from '../../../components/textfield';

interface OptionInputPropsIF {
    index: number;
    keyName: string;
}

export const OptionInput: React.FC<OptionInputPropsIF> = ({ index, keyName }) => {
    const { fields, setFields } = useFormBuilder();
    const [showDialog, setShowDialog] = useState(false);
    const [key, setKey] = useState('');
    const [value, setValue] = useState('');
    const [optionIndex, setOptionIndex] = useState<number | null>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const clickHandlerRef = useRef<(event: MouseEvent) => void>(null);

    const resetFields = useCallback(() => {
        setKey('');
        setValue('');
        setOptionIndex(null);
    }, []);

    const handleClickOutside = useCallback(
        (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setShowDialog(false);
                resetFields();
            }
        },
        [resetFields]
    );

    useEffect(() => {
        clickHandlerRef.current = handleClickOutside;
    }, [handleClickOutside]);

    useEffect(() => {
        const handler = (event: MouseEvent) => clickHandlerRef.current?.(event);
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const handleOptionAdd = () => {
        setFields(prevFields => {
            if (!prevFields[index]) return prevFields;

            const updatedFields = [...prevFields];
            const field = { ...updatedFields[index] };
            const config = { ...field.config };
            // @ts-ignore
            const options = Array.isArray(config[keyName]) ? config[keyName] : [];
            // @ts-ignore
            config[keyName] = [...options, { label: key, value }];

            updatedFields[index] = { ...field, config };
            return updatedFields;
        });
        resetFields();
    };

    const optionClickHandler = (i: number) => {
        setOptionIndex(i);
        // @ts-ignore
        setKey(fields[index].config[keyName]?.[i]?.label || '');
        // @ts-ignore
        setValue(fields[index].config[keyName]?.[i]?.value || '');
        setShowDialog(true);
    };

    const deleteClickHandler = () => {
        setFields(prevFields => {
            const updatedFields = [...prevFields];
            // @ts-ignore
            updatedFields[index].config[keyName] = prevFields[index].config[keyName]?.filter((_: any, i: any) => i !== optionIndex);
            return updatedFields;
        });
        resetFields();
    };

    const saveClickHandler = () => {
        setFields(prevFields => {
            const updatedFields = [...prevFields];
            // @ts-ignore
            updatedFields[index].config[keyName][optionIndex!] = {
                label: key,
                value
            };
            return updatedFields;
        });
        resetFields();
    };

    const fieldConfig = fields[index]?.config;

    if (fieldConfig.optionSourceType === 'from code') {
        return <TextInput index={index} keyName="dynamicKey" />;
    }

    if (fieldConfig.optionSourceType === 'from API') {
        return <TextInput index={index} keyName="apiEndpoint" />;
    }

    return (
        <div className={style.container}>
            <div className={style.optionsContainer}>
                <label>Options</label>
                <div className={style.optionBox}>
                    <div className={style.options}>
                        {fieldConfig.options?.map((item, i) => (
                            <span key={i} onClick={() => optionClickHandler(i)}>
                                {item.label}
                            </span>
                        ))}
                    </div>
                    {!showDialog && <span onClick={() => setShowDialog(true)}>Add Option</span>}
                </div>
                {showDialog && (
                    <div className={style.popupContainer} ref={dropdownRef}>
                        <TextField
                            value={key}
                            onChange={e => {
                                setKey(e.target.value);
                                setValue(`${e.target.value}`.toLowerCase().trim());
                            }}
                            label="Label"
                        />
                        <TextField value={value} onChange={e => setValue(`${e.target.value}`.toLowerCase().trim())} label="Value" />

                        {optionIndex !== null && optionIndex >= 0 ? (
                            <div className={style.buttonBox}>
                                <Button variant="secondary" onClick={deleteClickHandler} label="Delete" />
                                <Button onClick={saveClickHandler} disabled={!key || !value} label="Save" />
                            </div>
                        ) : (
                            <Button onClick={handleOptionAdd} disabled={!key || !value} label="Add Option" />
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};
