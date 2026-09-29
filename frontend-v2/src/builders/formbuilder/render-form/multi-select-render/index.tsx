import React, { useEffect, useState } from 'react';
import { FieldConfigIF, InputFieldRenderPropsIF } from '../../interface';
import { InputWrapper } from '../input-wrapper';
import CustomMultiSelect from './MultiSelectInput';
import { Loader } from 'lucide-react';
import { httpRequest } from '../../utils/functions/httpRequest';
import { config as defaultConfig } from '../../../../config/default';

export const MultiSelectRender: React.FC<InputFieldRenderPropsIF> = ({ index, fields, setFields, inputWrapperClassName }) => {
    const field = fields[index];
    const { config, value, errorMessage } = field;
    const [focus, setFocus] = useState(false);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const callApi = async () => {
            setLoading(true);
            const res = await httpRequest('POST', `${defaultConfig.nodeApiUrl}/${config.apiEndpoint}`, {});
            setFields(prev => {
                const updatedFields = [...prev];
                updatedFields[index].config.options = res.data;
                return updatedFields;
            });
            setLoading(false);
        };

        if (config.optionSourceType === 'from API' && !config.disabled && !config.hidden) callApi();
    }, []);

    const handleBlur = () => {
        setFocus(false);
        setFields(prev => {
            const updatedFields = [...prev];
            updatedFields[index] = {
                ...field,
                errorMessage: validateMultiSelect(value, config)
            };
            return updatedFields;
        });
    };

    const handleChange = (newValue: string[]) => {
        setFields(prev => {
            const updatedFields = [...prev];
            updatedFields[index] = {
                ...field,
                value: newValue,
                errorMessage: validateMultiSelect(newValue, config)
            };
            return updatedFields;
        });
    };

    const getOptions = {
        static: config.options,
        'from code': dynamicOptions,
        'from API': config.options
    };
    const finalOptions = (config.optionSourceType && getOptions[config.optionSourceType]) || [];

    return (
        <InputWrapper className={inputWrapperClassName} focus={focus} field={field} error={errorMessage || ''}>
            {loading ? (
                <span
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        marginLeft: 20,
                        fontSize: 12
                    }}
                >
                    <Loader /> Loading Data
                </span>
            ) : (
                <CustomMultiSelect onBlur={handleBlur} onChange={handleChange} selectedValues={value} options={finalOptions} />
            )}
        </InputWrapper>
    );
};

export const validateMultiSelect = (value: string[], config: FieldConfigIF): string => {
    if (config.mandatory && value.length < 1) return 'This field is required.';
    if (config.minimum && value.length < config.minimum) return `Minimum selection is ${config.minimum}`;
    if (config.maximum && value.length > config.maximum) return `Maximum selection is ${config.maximum}`;
    return '';
};

const dynamicOptions = [
    { value: 'apple', label: 'Apple' },
    { value: 'banana', label: 'Banana' },
    { value: 'orange', label: 'Orange' },
    { value: 'grape', label: 'Grape' },
    { value: 'mango', label: 'Mango' },
    { value: 'pineapple', label: 'Pineapple' },
    { value: 'strawberry', label: 'Strawberry' },
    { value: 'blueberry', label: 'Blueberry' },
    { value: 'raspberry', label: 'Raspberry' },
    { value: 'blackberry', label: 'Blackberry' },
    { value: 'kiwi', label: 'Kiwi' },
    { value: 'peach', label: 'Peach' },
    { value: 'plum', label: 'Plum' },
    { value: 'cherry', label: 'Cherry' },
    { value: 'lemon', label: 'Lemon' },
    { value: 'lime', label: 'Lime' },
    { value: 'coconut', label: 'Coconut' },
    { value: 'papaya', label: 'Papaya' },
    { value: 'guava', label: 'Guava' },
    { value: 'dragonfruit', label: 'Dragon Fruit' }
];
