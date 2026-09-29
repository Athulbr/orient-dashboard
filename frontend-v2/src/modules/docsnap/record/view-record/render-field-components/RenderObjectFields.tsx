import { FC, useState } from 'react';
import { InputField } from '../components/InputField';
import { useViewRecordState } from '../hooks/viewRecordContext';
import { formatFieldLabel } from '../utils';

interface RenderObjectFieldsIF {
    updateWire: (fieldId: string, bbox: any) => void;
    refs: {
        fieldRefs: any;
        isScrollingRef: any;
    };
}

export const RenderObjectFields: FC<RenderObjectFieldsIF> = ({ updateWire, refs }) => {
    const { state, setState } = useViewRecordState();
    const { fieldRefs, isScrollingRef } = refs;

    // State to track field errors
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

    // Track if we've already rendered the first input field
    let isFirstField = true;

    return (
        <>
            {Object.entries(state.objectFields).map(([key, valueMain]) => {
                return (
                    <div key={key} className="flex flex-col rounded-lg border bg-white p-1 hover:border-blue-400">
                        <label className="p-3 text-lg font-bold capitalize">{formatFieldLabel(key)}</label>
                        <div className="flex flex-wrap gap-y-4">
                            {Object.entries(valueMain).map(([subKey, value]) => {
                                const fieldId = `objectFields:${key}:${subKey}`;
                                if (key === 'extracted_by' && typeof value === 'string') {
                                    value = {
                                        value: value
                                    };
                                }

                                const fields = state.record?.templateId?.fields;
                                const field = fields?.find((item: any) => item.jsonKey === key);
                                const subField = field?.subFields?.find((item: any) => item.jsonKey === subKey);

                                const label = subField?.name ? formatFieldLabel(subField.name) : formatFieldLabel(subKey);
                                const showRegenButton = subField?.regenerateFieldValueWithAI || false;
                                const validationUrl = subField?.validationUrl || '';
                                const showTextarea = subField?.showTextarea || false;
                                const isRequired = subField?.required || false;

                                const onChange = (e: any) => {
                                    const newValue = e.target.value;

                                    // Check if this field is required and log if it's being altered
                                    if (isRequired) {
                                        console.log('caught');

                                        // Check if required field is empty and set error
                                        if (!newValue || newValue.trim() === '') {
                                            setFieldErrors(prev => ({
                                                ...prev,
                                                [fieldId]: 'This field is required and cannot be empty'
                                            }));
                                        } else {
                                            // Clear error if field has value
                                            setFieldErrors(prev => {
                                                const updated = { ...prev };
                                                delete updated[fieldId];
                                                return updated;
                                            });
                                        }
                                    }

                                    setState(prev => {
                                        const updated = prev.objectFields;
                                        updated[key][subKey] = { ...updated[key][subKey], value: newValue };
                                        return { ...prev, objectFields: updated };
                                    });
                                };

                                // console.log('state.templateFields:===========', state.templateFields);

                                // Check if this is the first field to render
                                const currentIsFirstField = isFirstField;
                                if (isFirstField) {
                                    isFirstField = false;
                                }

                                return (
                                    <InputField
                                        key={fieldId}
                                        label={label === 'Price Method' ? 'Price Method (MAP/CALC/CSFP)' : label}
                                        showRegenButton={showRegenButton}
                                        validationUrl={validationUrl || (label === "Manufacturer's URL" ? value?.value : '')}
                                        showTextarea={showTextarea}
                                        jsonKey={subKey}
                                        value={`${value?.value}`}
                                        confidence={`${value?.confidence * 100}`}
                                        checked={value?.checked}
                                        disabled={state.loadingS3File || state.reExtracting}
                                        errorMessage={fieldErrors[fieldId] || ''}
                                        dataTourId={currentIsFirstField ? 'first-input-field' : undefined}
                                        checkClickHandler={(checked: boolean) => {
                                            setState(prev => ({
                                                ...prev,
                                                objectFields: {
                                                    ...prev.objectFields,
                                                    [key]: {
                                                        ...prev.objectFields[key],
                                                        [subKey]: { ...prev.objectFields[key][subKey], checked: checked }
                                                    }
                                                }
                                            }));
                                        }}
                                        // @ts-ignore
                                        ref={el => (fieldRefs.current[fieldId] = el)}
                                        onMouseAction={() => {
                                            if (value?.bbox) {
                                                if (!isScrollingRef.current) {
                                                    setState(prev => ({
                                                        ...prev,
                                                        hoveredFieldId: fieldId,
                                                        pageNumber: value?.page ? value?.page : prev.pageNumber,
                                                        hoveredOnArrayField: false,
                                                        showDataEntryImages: false,
                                                        selectedTableName: ''
                                                    }));
                                                    updateWire(fieldId, value?.bbox);
                                                }
                                            } else {
                                                setState(prev => ({
                                                    ...prev,
                                                    hoveredFieldId: null,
                                                    hoveredOnArrayField: false,
                                                    showDataEntryImages: false,
                                                    bbox: null,
                                                    wire: null,
                                                    objectFields: {
                                                        ...prev.objectFields,
                                                        [key]: {
                                                            ...prev.objectFields[key],
                                                            [subKey]: { ...prev.objectFields[key][subKey], checked: true }
                                                        }
                                                    }
                                                }));
                                            }
                                        }}
                                        onchange={onChange}
                                        handleRegenerateField={() =>
                                            setState(prev => ({
                                                ...prev,
                                                showRegenerateFieldDialog: {
                                                    key,
                                                    subKey,
                                                    value: value?.value,
                                                    fieldLabel: label
                                                }
                                            }))
                                        }
                                    />
                                );
                            })}
                        </div>
                    </div>
                );
            })}
        </>
    );
};