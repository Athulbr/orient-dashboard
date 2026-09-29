import { Edit, Pencil, Trash2, X, XCircle } from 'lucide-react';
import { FC, useEffect, useMemo, useState } from 'react';
import { useViewRecordState } from '../hooks/viewRecordContext';
import { formatFieldLabel } from '../utils';
import { Button } from '../../../../../components/Button';
import { CommentDialog } from '../components/CommentDialog';
import { TextField } from '../../../../../components/TextField';
import style from '../viewRecord.module.css';

export const RenderArrayFields: FC<any> = ({ refs }) => {
    const { state, setState } = useViewRecordState();
    const { fieldRefs, containerRef } = refs;
    const [commentDialog, setCommentDialog] = useState(false);
    const [showEditTableName, setShowEditTableName] = useState(false);
    const [newTableName, setNewTableName] = useState('');
    const updateWire = (fieldId: string, bbox: any) => {
        if (!fieldId || !bbox) return;
        const fieldEl = fieldRefs.current[fieldId];
        const containerBox = containerRef.current?.getBoundingClientRect();
        if (!fieldEl || !containerBox) return;

        const fieldBox = fieldEl.getBoundingClientRect();
        const x2 = fieldBox.left - containerBox.left + fieldBox.width / 2;
        const y2 = fieldBox.top;

        setState(prev => ({
            ...prev,
            bbox,
            wire: {
                x1: prev?.wire?.x1 || 0,
                y1: prev?.wire?.y1 || 0,
                x2,
                y2
            }
        }));
    };

    const addLineItem = (mainIndex: number) => {
        // Get the column names from the first row to create the same structure

        const firstRow = Object.values(state.arrayFields[mainIndex])[0] || {};

        let columnNames = Object.keys(firstRow);
        if (columnNames.length === 0) {
            const lineItems = state.record?.templateId?.fields?.find((item: any) => {
                return item.jsonKey === state.tableNames[mainIndex];
            });
            if (lineItems?.subFields) {
                columnNames = lineItems.subFields.map((item: any) => item.jsonKey);
            }
        }
        // Create a new row object with the same column structure
        const newRow: { [key: string]: { value: string } } = {};
        columnNames.forEach(columnName => {
            newRow[columnName] = { value: '' };
        });

        const newArrayFields = [...state.arrayFields];
        // Calculate the next index by getting the current number of entries
        const currentEntries = Object.keys(newArrayFields[mainIndex]);
        const nextIndex = currentEntries.length;
        newArrayFields[mainIndex] = { ...newArrayFields[mainIndex], [`${nextIndex}`]: newRow };

        setState(prev => {
            return { ...prev, arrayFields: newArrayFields };
        });
    };

    const deleteLineItem = (mainIndex: number, rowIndex: number) => {
        const newArrayFields = [...state.arrayFields];
        const currentItem = newArrayFields[mainIndex];

        // Convert the object to entries, filter out the row to delete
        const entries = Object.entries(currentItem).filter((_, index) => index !== rowIndex);
        // Re-index keys so they are sequential ("0", "1", ...)
        const newItem: Record<string, (typeof entries)[0][1]> = {};
        entries.forEach(([_, value], idx) => {
            newItem[String(idx)] = value;
        });

        newArrayFields[mainIndex] = newItem;

        setState(prev => ({
            ...prev,
            hoveredFieldId: null,
            arrayFields: newArrayFields,
            bbox: null,
            wire: null
        }));
    };

    const mainIndex = state.tableNames.findIndex(name => name === state.selectedTableName);
    const firstRow = state.arrayFields[mainIndex][0] || {};
    const labels = Object.keys(firstRow);

    const updateTableName = () => {
        const updatedTableNames = state.tableNames.map((name, index) => {
            if (index === mainIndex) {
                return newTableName;
            }
            return name;
        });

        setState(prev => ({
            ...prev,
            tableNames: updatedTableNames,
            selectedTableName: newTableName
        }));

        setShowEditTableName(false);
    };

    return (
        <div key={mainIndex} className="mb-1 flex flex-1 flex-col overflow-hidden rounded-lg border bg-white p-4 pt-2 hover:border-blue-400">
            <section className="mb-2 flex justify-between text-lg font-bold capitalize">
                <div className="flex items-center gap-2">
                    {showEditTableName ? (
                        <>
                            <TextField className="border" onChange={e => setNewTableName(e.target.value)} value={newTableName} />
                            <Button outlined onClick={updateTableName}>
                                Update
                            </Button>
                            <Button startIcon={<X size={20} />} outlined onClick={() => setShowEditTableName(false)}></Button>
                        </>
                    ) : (
                        <>
                            <span>{formatFieldLabel(state.tableNames[mainIndex])}</span>
                            <Edit
                                size={20}
                                className="cursor-pointer text-blue-500"
                                onClick={() => {
                                    setShowEditTableName(true);
                                    setNewTableName(state.tableNames[mainIndex]);
                                }}
                            />
                        </>
                    )}
                </div>
                <div className="flex items-center gap-10">
                    <div className="flex gap-2">
                        <Button tabIndex={-1} outlined onClick={() => setCommentDialog(true)}>
                            Add Comment
                        </Button>
                        <Button tabIndex={-1} outlined onClick={() => addLineItem(mainIndex)}>
                            Add New Row
                        </Button>
                    </div>
                    <XCircle
                        tabIndex={-1}
                        onClick={() => setState(prev => ({ ...prev, selectedTableName: '', hoveredOnArrayField: false, hoveredFieldId: null, bbox: null }))}
                        className="cursor-pointer text-gray-500 hover:text-red-500"
                    />
                </div>
            </section>
            <div className={style.container}>
                <table className="min-w-full border-collapse">
                    <thead>
                        <tr className="sticky top-0 left-0 border ">
                            {labels.map((label, i) => (
                                <th key={i} className="border bg-gray-50 px-4 py-3 text-left font-semibold whitespace-nowrap text-nowrap">
                                    {formatFieldLabel(label)}
                                </th>
                            ))}
                            <th className="border bg-gray-50 px-4 py-2 text-left font-semibold">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {Object.entries(state.arrayFields[mainIndex]).map(([key, lineItem], rowIndex) => (
                            <tr key={rowIndex} className="bg-white">
                                {labels.map((label, i) => {
                                    const value = lineItem[label];

                                    const hoveredFieldId = `arrayFields:${mainIndex}:${key}:${label}`;
                                    return (
                                        <ArrayFieldTextarea
                                            mainIndex={mainIndex}
                                            keyName={key}
                                            key={i}
                                            value={value}
                                            fieldId={hoveredFieldId}
                                            label={label}
                                            fieldRefs={fieldRefs}
                                            disabled={state.loadingS3File || state.reExtracting}
                                            onChange={(e: any) => {
                                                setState(prev => {
                                                    const updated = [...prev.arrayFields];
                                                    updated[mainIndex][key][label] = {
                                                        ...updated[mainIndex][key][label],
                                                        value: e.target.value
                                                    };
                                                    return { ...prev, arrayFields: updated };
                                                });
                                            }}
                                            onMouseEnter={() => {
                                                const bbox = value?.bbox;
                                                if (bbox) {
                                                    setState(prev => ({
                                                        ...prev,
                                                        hoveredFieldId: hoveredFieldId,
                                                        pageNumber: value.page ? value.page : prev.pageNumber,
                                                        hoveredOnArrayField: true
                                                    }));
                                                    updateWire(hoveredFieldId, value.bbox);
                                                } else {
                                                    setState(prev => ({
                                                        ...prev,
                                                        hoveredFieldId: null,
                                                        hoveredOnArrayField: false,
                                                        bbox: null,
                                                        wire: null
                                                    }));
                                                }
                                            }}
                                        />
                                    );
                                })}
                                <td className="h-full border py-2 pl-9">
                                    <Trash2
                                        tabIndex={-1}
                                        onClick={() => deleteLineItem(mainIndex, rowIndex)}
                                        onKeyDown={e => {
                                            if (e.key === 'Enter') {
                                                deleteLineItem(mainIndex, rowIndex);
                                            }
                                        }}
                                        size={20}
                                        className="cursor-pointer text-gray-500 hover:text-red-500 focus:text-red-500"
                                    />
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <CommentDialog
                commentList={[]}
                setCommentList={() => {}}
                jsonKey={'line_item'}
                isOpen={commentDialog}
                closeDialog={() => setCommentDialog(false)}
            />
        </div>
    );
};

interface PropsIF {
    value: any;
    fieldId: string;
    label: string;
    onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
    onMouseEnter: () => void;
    fieldRefs: any;
    disabled?: boolean;
    mainIndex: number;
    keyName: string;
}
const ArrayFieldTextarea: FC<PropsIF> = ({ value, fieldId, label, onChange, onMouseEnter, fieldRefs, disabled, mainIndex, keyName }) => {
    const { state, setState } = useViewRecordState();
    const adjustTextareaHeight = () => {
        const textarea = fieldRefs.current[fieldId];
        if (!textarea) return;

        textarea.style.height = 'auto';
        textarea.style.height = `${textarea.scrollHeight + 4}px`;
    };

    const handleFocus = (event: any) => {
        // Select all text inside the textarea when it receives focus
        event.target.select();
        onMouseEnter();
    };

    useEffect(() => {
        adjustTextareaHeight();
    }, [value?.value]);
    const renderTemplate = (template: string, data: Record<string, string>) => {
        return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => encodeURIComponent(data[key] ?? ''));
    };

    const validateLink = (validationUrl: string, value: string) => {
        if (!validationUrl.trim() || !value.trim()) return;
        const finalUrl = renderTemplate(validationUrl, { value });
        window.open(finalUrl, '_blank');
    };

    const { fieldLabel, validationUrl } = useMemo(() => {
        const fields = state.record?.templateId?.fields;
        const field = fields?.find((item: any) => item.jsonKey === state.tableNames[mainIndex]);
        const subField = field?.subFields?.find((item: any) => item.jsonKey === label);
        return {
            fieldLabel: subField?.name ? formatFieldLabel(subField.name) : 'formatFieldLabel(label)',
            validationUrl: subField?.validationUrl || ''
        };
    }, [keyName, label]);

    if (label === 'Variation Image') {
        const onUpdate = () => {
            setState(prev => ({ ...prev, showSelectVariationImagesDialog: { index: mainIndex, key: keyName } }));
        };
        const onDelete = () => {
            setState(prev => {
                const updated = [...prev.arrayFields];
                updated[mainIndex][keyName] = {
                    ...updated[mainIndex][keyName],
                    ['Variation Image']: {
                        value: 'Not Available'
                    }
                };
                return { ...prev, arrayFields: updated };
            });
        };
        return (
            <td className="border p-2">
                {value?.value === 'Not Available' ? (
                    <Button
                        onClick={() => setState(prev => ({ ...prev, showSelectVariationImagesDialog: { index: mainIndex, key: keyName } }))}
                        className="w-full"
                        outlined
                    >
                        Add Image
                    </Button>
                ) : (
                    <div className="relative group w-max">
                        <img src={value?.value} alt="" className="w-32 h-32 object-cover rounded-md" />

                        {/* Hover overlay */}
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center gap-4 rounded-md">
                            <button type="button" className="p-2 bg-white rounded-full shadow cursor-pointer" onClick={onUpdate}>
                                <Pencil size={18} />
                            </button>

                            <button type="button" className="p-2 bg-white rounded-full shadow cursor-pointer" onClick={onDelete}>
                                <Trash2 size={18} />
                            </button>
                        </div>
                    </div>
                )}
            </td>
        );
    }
    return (
        <td className="border p-1">
            {/* <ValidateSkuButton label={label} value={value?.value} /> */}
            {validationUrl && value?.value && (
                <div className="mb-0.5 w-full flex justify-end">
                    <span
                        onClick={() => validateLink(validationUrl, value?.value)}
                        className="text-xs text-gray-600 cursor-pointer border  px-2 py-0.5 rounded-md hover:bg-sky-50 hover:border-gray-500"
                    >
                        Validate
                    </span>
                </div>
            )}
            <textarea
                data-gramm="false"
                id={fieldId}
                aria-label={fieldId}
                rows={1}
                className={` ${label === 'Description' ? 'min-w-90' : 'min-w-35'} rounded-md border p-2 px-4 outline-none ${value?.checked ? 'border-[#438f20]' : ''} hover:border-blue-500 focus:border-blue-500 ${label === 'description' ? 'w-full min-w-100' : 'w-full'}`}
                value={value?.value || ''}
                // @ts-ignore
                ref={el => (fieldRefs.current[fieldId] = el)}
                onChange={onChange}
                // onClick={onMouseEnter}
                onFocus={handleFocus}
                disabled={disabled}
            />
        </td>
    );
};
