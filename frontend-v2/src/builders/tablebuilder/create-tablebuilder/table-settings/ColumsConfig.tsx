import { XCircle, Key, ArrowUpDown, Component, EyeOff, PlusSquare, Type, Text, ChevronUp, ChevronDown } from 'lucide-react';
import { useTablebuilderSettings } from '../hooks/useTablebuilderSettingsContext';
import { CheckboxTB } from '../tablebuilder-components/CheckboxTB';
import { TextFieldTB } from '../tablebuilder-components/TextFieldTB';

interface ColumnConfigProps {
    column: any;
    columnIndex: number;
    onUpdate: (index: number, updates: Partial<any>) => void;
    onRemove: (index: number) => void;
    onMove: (index: number, direction: 'up' | 'down') => void;
    isFirst: boolean;
    isLast: boolean;
}

const ColumnConfig: React.FC<ColumnConfigProps> = ({ column, columnIndex, onUpdate, onRemove, onMove, isFirst, isLast }) => {
    const handleChange = (field: string, value: any) => {
        onUpdate(columnIndex, { [field]: value });
    };

    return (
        <div className="relative rounded-lg border p-3">
            <div className="absolute top-2 right-2 flex gap-1">
                <button
                    className="cursor-pointer rounded-3xl text-gray-500 hover:bg-gray-100 disabled:opacity-50"
                    onClick={() => onMove(columnIndex, 'up')}
                    disabled={isFirst}
                    aria-label="Move column up"
                >
                    <ChevronUp size={18} />
                </button>
                <button
                    className="cursor-pointer rounded-3xl text-gray-500 hover:bg-gray-100 disabled:opacity-50"
                    onClick={() => onMove(columnIndex, 'down')}
                    disabled={isLast}
                    aria-label="Move column down"
                >
                    <ChevronDown size={18} />
                </button>
                <button className="cursor-pointer rounded-3xl text-red-500 hover:bg-red-100" onClick={() => onRemove(columnIndex)} aria-label="Remove column">
                    <XCircle size={18} />
                </button>
            </div>

            <div className="grid grid-cols-1 gap-5 text-sm md:grid-cols-2">
                <TextFieldTB
                    labelIcon={Type}
                    label="Header Label"
                    type="text"
                    value={column.header}
                    onChange={e => handleChange('header', e.target.value)}
                    placeholder="e.g., Name, Email"
                />
                <TextFieldTB
                    labelIcon={Key}
                    label="Column Key"
                    type="text"
                    value={column.key}
                    onChange={e => handleChange('key', e.target.value)}
                    placeholder="e.g., Name, Email"
                />

                <CheckboxTB
                    id={`sortable-${columnIndex}`}
                    label="Sortable"
                    icon={ArrowUpDown}
                    checked={column.sortable}
                    onChange={e => handleChange('sortable', e.target.checked)}
                />
                <CheckboxTB
                    id={`capitalize-${columnIndex}`}
                    label="Capitalize Text"
                    icon={Text}
                    checked={column.capitalize}
                    onChange={e => handleChange('capitalize', e.target.checked)}
                />
                <CheckboxTB
                    id={`hidden-${columnIndex}`}
                    label="Hidden Column"
                    icon={EyeOff}
                    checked={column.hidden}
                    onChange={e => handleChange('hidden', e.target.checked)}
                />
                <CheckboxTB
                    id={`customUI-${columnIndex}`}
                    label="Use Custom UI"
                    icon={Component}
                    checked={column.customUI}
                    onChange={e => handleChange('customUI', e.target.checked)}
                />

                {!column.customUI && (
                    <>
                        <CheckboxTB
                            id={`dateUI-${columnIndex}`}
                            label="Date UI"
                            icon={Component}
                            checked={column.dateUI}
                            onChange={e => handleChange('dateUI', e.target.checked)}
                        />
                        <CheckboxTB
                            id={`editButton-${columnIndex}`}
                            label="Edit Button"
                            icon={Component}
                            checked={column.editButton}
                            onChange={e => handleChange('editButton', e.target.checked)}
                        />
                        <CheckboxTB
                            id={`deleteButton-${columnIndex}`}
                            label="Delete Button"
                            icon={Component}
                            checked={column.deleteButton}
                            onChange={e => handleChange('deleteButton', e.target.checked)}
                        />
                    </>
                )}

                {column.customUI && (
                    <TextFieldTB label="Custom UI Key" type="text" value={column.customUiKey} onChange={e => handleChange('customUiKey', e.target.value)} />
                )}
                {column.editButton && column.customUI && (
                    <TextFieldTB label="Edit Url" type="text" value={column.editUrl} onChange={e => handleChange('editUrl', e.target.value)} />
                )}
                {column.deleteButton && column.customUI && (
                    <TextFieldTB label="Delete Url" type="text" value={column.deleteUrl} onChange={e => handleChange('deleteUrl', e.target.value)} />
                )}

                <div className="flex justify-center md:col-span-2">
                    <div
                        className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs ${
                            column.hidden
                                ? 'bg-gray-200 text-gray-600'
                                : column.customUI
                                  ? 'bg-purple-100 text-purple-800'
                                  : column.sortable
                                    ? 'bg-blue-100 text-blue-800'
                                    : 'bg-green-100 text-green-800'
                        }`}
                    >
                        {column.hidden && <EyeOff size={14} />}
                        {column.customUI && <Component size={14} />}
                        {!column.hidden && !column.customUI && column.sortable && <ArrowUpDown size={14} />}
                        <span>{column.header || column.key || 'Column'}</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export const ColumnConfigSection: React.FC = () => {
    const { settings, setSettings } = useTablebuilderSettings();

    const addColumn = () => {
        setSettings(prev => ({
            ...prev,
            columns: [
                ...prev.columns,
                {
                    key: '',
                    header: '',
                    sortable: false,
                    customUI: false,
                    customUiKey: '',
                    capitalize: true,
                    hidden: false,
                    dateUI: false,
                    editButton: false,
                    deleteButton: false,
                    editUrl: '',
                    deleteUrl: ''
                }
            ]
        }));
    };

    const updateColumn = (index: number, updates: Partial<any>) => {
        setSettings(prev => ({
            ...prev,
            columns: prev.columns.map((col, i) => (i === index ? { ...col, ...updates } : col))
        }));
    };

    const removeColumn = (index: number) => {
        setSettings(prev => ({
            ...prev,
            columns: prev.columns.filter((_, i) => i !== index)
        }));
    };

    const moveColumn = (index: number, direction: 'up' | 'down') => {
        setSettings(prev => {
            const newColumns = [...prev.columns];
            const newIndex = direction === 'up' ? index - 1 : index + 1;
            [newColumns[index], newColumns[newIndex]] = [newColumns[newIndex], newColumns[index]];
            return { ...prev, columns: newColumns };
        });
    };

    return (
        <div className="mt-3 space-y-6 text-sm">
            {settings.columns.map((column, index) => (
                <ColumnConfig
                    key={index}
                    column={column}
                    columnIndex={index}
                    onUpdate={updateColumn}
                    onRemove={removeColumn}
                    onMove={moveColumn}
                    isFirst={index === 0}
                    isLast={index === settings.columns.length - 1}
                />
            ))}

            <button
                className="flex w-full items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-blue-300 py-1.5 text-sm text-blue-600 transition hover:bg-blue-50"
                onClick={addColumn}
            >
                <PlusSquare size={16} /> Add Column
            </button>
        </div>
    );
};
