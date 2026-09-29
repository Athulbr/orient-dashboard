import { useRef } from 'react';
import style from './field-list.module.css';
import DraggableFieldContainer from './draggable-field-container';
import FieldSettingsComponent from '../input-settings';
import { useFormBuilder } from '../formbuilder-context/useFormBuilder';
import { FieldIF } from '../../interface';
import iconTypes from '../mapped-data/IconTypes';
import { capitalizeFirstLetter } from '../../utils/functions/capitalizeFirstLetter';
import { lowerCaseFirstLetter } from '../../utils/functions/lowerCaseFirstLetter';
import { Cog, Copy, Grip, GripVertical, LetterText, Settings, Trash, Trash2 } from 'lucide-react';

const FieldListComponent: React.FC = () => {
    const { fields, setFields, setShowSettings, showSettings, showFieldInputError } = useFormBuilder();
    const dragItem = useRef<number>(0);
    const dragOverItem = useRef<number>(0);

    const duplicateField = (field: FieldIF, index: number) => {
        const updatedFields = [...fields];
        updatedFields.splice(index + 1, 0, { ...field });
        setFields(updatedFields);
        setShowSettings(index + 1);
    };

    const removeField = (index: number) => {
        setFields(fields.filter((_, i) => i !== index));
    };

    const updateFieldLabel = (e: React.ChangeEvent<HTMLInputElement>, index: number) => {
        const newLabel = capitalizeFirstLetter(e.target.value);
        const updatedFields = structuredClone(fields);
        updatedFields[index] = {
            ...updatedFields[index],
            label: newLabel,
            key: lowerCaseFirstLetter(newLabel).replace(/\s+/g, '')
        };
        setFields(updatedFields);
    };

    const updateFieldKey = (e: React.ChangeEvent<HTMLInputElement>, index: number) => {
        const updatedFields = structuredClone(fields);
        updatedFields[index] = {
            ...updatedFields[index],
            key: lowerCaseFirstLetter(e.target.value).replace(/\s+/g, '')
        };
        setFields(updatedFields);
    };

    if (!fields.length) return null;

    return (
        <div className={style.container}>
            {fields.map((field, index) => {
                const IconComponent = iconTypes.get(field.type) || 'icn';

                return (
                    <DraggableFieldContainer key={`${field.type}_${index}`} dragItem={dragItem} dragOverItem={dragOverItem} index={index}>
                        <div className={`${style.fieldMainContainer} ${field.type === 'section_header' ? style.sectionHeader : ''}`}>
                            <GripVertical size={20} className={style.icon} />
                            <div className={style.field}>
                                <div className={style.inputType}>
                                    {IconComponent}
                                    {field.type.replace(/_/g, ' ')}
                                </div>
                                <input
                                    className={`${style.fieldInput} ${showFieldInputError && !field.label?.trim() ? style.inputRequiredError : ''}`}
                                    type="text"
                                    placeholder="Label"
                                    value={field.label}
                                    onChange={e => updateFieldLabel(e, index)}
                                />
                                <input
                                    className={`${style.fieldInput} ${showFieldInputError && !field.key?.trim() ? style.inputRequiredError : ''}`}
                                    type="text"
                                    placeholder="Key"
                                    value={field.key}
                                    onChange={e => updateFieldKey(e, index)}
                                />
                                <div className={style.fieldAction}>
                                    <Settings size={20} className={style.icon} onClick={() => setShowSettings(showSettings === index ? -1 : index)} />
                                    {/* <Copy size={20} className={style.icon} onClick={() => duplicateField(field, index)} /> */}
                                    <Trash2 size={20} className={style.icon} onClick={() => removeField(index)} />
                                </div>
                            </div>
                        </div>
                        {showSettings === index && <FieldSettingsComponent index={index} />}
                    </DraggableFieldContainer>
                );
            })}
        </div>
    );
};

export default FieldListComponent;
