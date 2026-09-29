import style from './input-type-select.module.css';
import iconTypes from '../mapped-data/IconTypes';
import { FieldIF } from '../../interface';
import { useFormBuilder } from '../formbuilder-context/useFormBuilder';
import { Plus } from 'lucide-react';
import { inputTypes } from '../../static-data/inputTypes';
import { Button } from '../../../../components/Button';

interface PropsIF {
    test?: string;
}

const InputTypeSelectComponent: React.FC<PropsIF> = () => {
    const { showInputType, setShowInputType, fields, setFields, setShowSettings } = useFormBuilder();

    const addInputType = (inputType: FieldIF) => {
        setFields([...fields, inputType]);
        setShowSettings(fields.length);
    };

    const inputTypesCopy = JSON.parse(JSON.stringify(inputTypes));

    return (
        <div className={style.container}>
            <Button outlined className="w-fit" onClick={() => setShowInputType(!showInputType)} startIcon={<Plus size={20} />}>
                Add New Field
            </Button>
            {showInputType && (
                <div className={style.inputTypesContainer} onMouseLeave={() => setShowInputType(false)}>
                    {inputTypesCopy.map((inputType: FieldIF, index: number) => {
                        const IconComponent = iconTypes.get(inputType.type) || iconTypes.get('plain_text');
                        return (
                            <Button
                                key={index}
                                large
                                outlined
                                className="w-fit text-lg text-gray-700 capitalize"
                                onClick={() => addInputType(inputType)}
                                startIcon={IconComponent}
                            >
                                {inputType.type.replace(/_/g, ' ')}
                            </Button>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default InputTypeSelectComponent;
