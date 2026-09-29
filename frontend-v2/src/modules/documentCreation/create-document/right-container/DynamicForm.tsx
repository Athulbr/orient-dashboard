import React, { useEffect, useState, useRef } from 'react';
import { AlertCircle } from 'lucide-react';
import { Button } from '../../../../components/Button';
import { useDocumentCreationEditorState } from '../hooks/DocumentCreationEditorContext';

interface SubField {
    name: string;
    dataType: 'str' | 'int' | 'float' | 'bool';
    jsonKey: string;
    value?: any;
    required?: boolean;
}

interface FormField {
    name: string;
    dataType: 'str' | 'int' | 'float' | 'bool' | 'dict';
    jsonKey: string;
    subFields?: SubField[];
    regenerateFieldValueWithAI?: boolean;
    required?: boolean;
    excludeExtraction?: boolean;
    isHidden?: boolean;
    _id?: string;
    value?: any;
}

interface FormErrors {
    [key: string]: string;
}

export const DynamicForm: React.FC = () => {
    const { state, setState } = useDocumentCreationEditorState();
    const inputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});

    const [errors, setErrors] = useState<FormErrors>({});
    const [touched, setTouched] = useState<{ [key: string]: boolean }>({});

    // Scroll active input into view
    useEffect(() => {
        if (state.activeId && inputRefs.current[state.activeId]) {
            inputRefs.current[state.activeId]?.scrollIntoView({
                behavior: 'smooth',
                block: 'nearest',
                inline: 'nearest'
            });
            inputRefs.current[state.activeId]?.focus();
        }
    }, [state.activeId]);

    const handleFormDataChange = (data: any) => {
        if (!state.template) return;
        const values: any = {};
        state.template?.fields?.forEach((field: any) => {
            field?.subFields?.forEach((subField: any) => {
                values[subField.jsonKey] = data[subField.jsonKey] || '_______________';
            });
        });
        setState(prev => ({ ...prev, documentText: state.template?.description, formValues: values }));
    };

    useEffect(() => {
        handleFormDataChange(state.formData);
    }, [state.formData]);

    const validateField = (field: SubField | FormField, value: any): string => {
        if (field.required && (!value || value === '')) {
            return `${field.name} is required`;
        }

        if (value && value !== '') {
            if (field.dataType === 'int') {
                const numValue = Number(value);
                if (isNaN(numValue) || !Number.isInteger(numValue)) {
                    return 'Please enter a valid integer';
                }
            } else if (field.dataType === 'float') {
                const numValue = Number(value);
                if (isNaN(numValue)) {
                    return 'Please enter a valid number';
                }
            }
        }

        return '';
    };

    const handleChange = (field: SubField | FormField, value: any) => {
        setState(prev => ({ ...prev, formData: { ...prev.formData, [field.jsonKey]: value } }));

        if (touched[field.jsonKey]) {
            const error = validateField(field, value);
            setErrors(prev => ({
                ...prev,
                [field.jsonKey]: error
            }));
        }
    };

    const handleBlur = (field: SubField | FormField) => {
        setTouched(prev => ({ ...prev, [field.jsonKey]: true }));
        setState(prev => ({ ...prev, activeId: '' }));

        const value = state.formData[field.jsonKey];
        const error = validateField(field, value);
        setErrors(prev => ({ ...prev, [field.jsonKey]: error }));
    };

    const handleOnFocus = (field: SubField | FormField) => {
        setState(prev => ({ ...prev, activeId: field.jsonKey }));
    };

    const handleSubmit = () => {
        const newErrors: FormErrors = {};
        const newTouched: { [key: string]: boolean } = {};

        state.formFields.forEach(field => {
            if (!field.isHidden) {
                if (field.dataType === 'dict' && field.subFields) {
                    field.subFields.forEach((subField: any) => {
                        const value = state.formData[subField.jsonKey];
                        const error = validateField(subField, value);
                        if (error) newErrors[subField.jsonKey] = error;
                        newTouched[subField.jsonKey] = true;
                    });
                } else {
                    const error = validateField(field, state.formData[field.jsonKey]);
                    if (error) newErrors[field.jsonKey] = error;
                    newTouched[field.jsonKey] = true;
                }
            }
        });

        setErrors(newErrors);
        setTouched(newTouched);

        if (Object.keys(newErrors).length === 0) {
            alert('Form submitted successfully! Check console for data.');
        }
    };

    const renderSubField = (subField: SubField) => {
        const value = state.formData[subField.jsonKey] || '';
        const error = errors[subField.jsonKey];
        const isTouched = touched[subField.jsonKey];

        switch (subField.dataType) {
            case 'bool':
                return (
                    <div key={subField.jsonKey} className="mb-4">
                        <label className="flex items-center cursor-pointer">
                            <input
                                ref={el => {
                                    inputRefs.current[subField.jsonKey] = el;
                                }}
                                onFocus={() => handleOnFocus(subField)}
                                type="checkbox"
                                checked={value || false}
                                onChange={e => handleChange(subField, e.target.checked)}
                                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
                                id={`input-${subField.jsonKey}`}
                            />
                            <span className="ml-2 text-gray-700 text-sm">
                                {subField.name}
                                {subField.required && <span className="text-red-500 ml-1">*</span>}
                            </span>
                        </label>
                    </div>
                );

            case 'int':
            case 'float':
                return (
                    <div key={subField.jsonKey} className="mb-4">
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">
                            {subField.name}
                            {subField.required && <span className="text-red-500 ml-1">*</span>}
                        </label>
                        <input
                            ref={el => {
                                inputRefs.current[subField.jsonKey] = el;
                            }}
                            onFocus={() => handleOnFocus(subField)}
                            type="number"
                            step={subField.dataType === 'float' ? 'any' : '1'}
                            value={value}
                            onChange={e => handleChange(subField, e.target.value)}
                            onBlur={() => handleBlur(subField)}
                            className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-1 transition-colors ${
                                isTouched && error ? 'border-red-500 focus:ring-red-500 bg-red-50' : 'border-gray-300 focus:ring-blue-500 focus:border-blue-500'
                            }`}
                            id={`input-${subField.jsonKey}`}
                        />
                        {isTouched && error && (
                            <div className="flex items-center mt-1.5 text-red-600 text-sm">
                                <AlertCircle className="w-4 h-4 mr-1 flex-shrink-0" />
                                <span>{error}</span>
                            </div>
                        )}
                    </div>
                );

            default:
                return (
                    <div key={subField.jsonKey} className="mb-4">
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">
                            {subField.name}
                            {subField.required && <span className="text-red-500 ml-1">*</span>}
                        </label>
                        <input
                            ref={el => {
                                inputRefs.current[subField.jsonKey] = el;
                            }}
                            onFocus={() => handleOnFocus(subField)}
                            type="text"
                            value={value}
                            onChange={e => handleChange(subField, e.target.value)}
                            onBlur={() => handleBlur(subField)}
                            className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-1 transition-colors ${
                                isTouched && error ? 'border-red-500 focus:ring-red-500 bg-red-50' : 'border-gray-300 focus:ring-blue-500 focus:border-blue-500'
                            }`}
                            id={`input-${subField.jsonKey}`}
                        />
                        {isTouched && error && (
                            <div className="flex items-center mt-1.5 text-red-600 text-sm">
                                <AlertCircle className="w-4 h-4 mr-1 flex-shrink-0" />
                                <span>{error}</span>
                            </div>
                        )}
                    </div>
                );
        }
    };

    const renderField = (field: FormField) => {
        if (field.isHidden) return null;

        if (field.dataType === 'dict' && field.subFields) {
            return (
                <div key={field._id || field.jsonKey} className="mb-6">
                    <div className="bg-gray-50 rounded-lg border border-gray-200 p-5">
                        <h3 className="text-lg font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-300">{field.name}</h3>
                        <div className="space-y-1">{field.subFields.map(subField => renderSubField(subField))}</div>
                    </div>
                </div>
            );
        }

        const value = state.formData[field.jsonKey] || '';
        const error = errors[field.jsonKey];
        const isTouched = touched[field.jsonKey];

        switch (field.dataType) {
            case 'bool':
                return (
                    <div key={field._id || field.jsonKey} className="mb-5">
                        <label className="flex items-center cursor-pointer">
                            <input
                                ref={el => {
                                    inputRefs.current[field.jsonKey] = el;
                                }}
                                onFocus={() => handleOnFocus(field)}
                                type="checkbox"
                                checked={value || false}
                                onChange={e => handleChange(field, e.target.checked)}
                                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                            />
                            <span className="ml-2 text-gray-700">
                                {field.name}
                                {field.required && <span className="text-red-500 ml-1">*</span>}
                            </span>
                        </label>
                    </div>
                );

            case 'int':
            case 'float':
                return (
                    <div key={field._id || field.jsonKey} className="mb-5">
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">
                            {field.name}
                            {field.required && <span className="text-red-500 ml-1">*</span>}
                        </label>
                        <input
                            ref={el => {
                                inputRefs.current[field.jsonKey] = el;
                            }}
                            onFocus={() => handleOnFocus(field)}
                            tabIndex={0}
                            type="number"
                            step={field.dataType === 'float' ? 'any' : '1'}
                            value={value}
                            onChange={e => handleChange(field, e.target.value)}
                            onBlur={() => handleBlur(field)}
                            className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 transition-colors ${
                                isTouched && error ? 'border-red-500 focus:ring-red-500 bg-red-50' : 'border-gray-300 focus:ring-blue-500 focus:border-blue-500'
                            }`}
                        />
                        {isTouched && error && (
                            <div className="flex items-center mt-1.5 text-red-600 text-sm">
                                <AlertCircle className="w-4 h-4 mr-1 flex-shrink-0" />
                                <span>{error}</span>
                            </div>
                        )}
                    </div>
                );

            default:
                return (
                    <div key={field._id || field.jsonKey} className="mb-5">
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">
                            {field.name}
                            {field.required && <span className="text-red-500 ml-1">*</span>}
                        </label>
                        <input
                            ref={el => {
                                inputRefs.current[field.jsonKey] = el;
                            }}
                            onFocus={() => handleOnFocus(field)}
                            tabIndex={0}
                            type="text"
                            value={value}
                            onChange={e => handleChange(field, e.target.value)}
                            onBlur={() => handleBlur(field)}
                            className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 transition-colors ${
                                isTouched && error ? 'border-red-500 focus:ring-red-500 bg-red-50' : 'border-gray-300 focus:ring-blue-500 focus:border-blue-500'
                            }`}
                        />
                        {isTouched && error && (
                            <div className="flex items-center mt-1.5 text-red-600 text-sm">
                                <AlertCircle className="w-4 h-4 mr-1 flex-shrink-0" />
                                <span>{error}</span>
                            </div>
                        )}
                    </div>
                );
        }
    };

    return (
        <div className="w-full flex flex-col overflow-y-auto relative ">
            <div className="p-2 pb-0 flex flex-col overflow-y-auto flex-1">
                {state.formFields.map(field => renderField(field))}

                {/* <div className="sticky bottom-0 left-0 flex gap-3 p-2 justify-end bg-white">
                    <Button type="button" onClick={handleSubmit}>
                        Submit Form
                    </Button>
                    <Button
                        type="button"
                        onClick={() => {
                            setState(prev => ({ ...prev, formData: {} }));
                            setErrors({});
                            setTouched({});
                        }}
                    >
                        Reset
                    </Button>
                </div> */}
            </div>
        </div>
    );
};
