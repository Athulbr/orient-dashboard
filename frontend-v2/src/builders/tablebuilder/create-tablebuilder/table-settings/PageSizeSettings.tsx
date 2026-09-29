import { useTablebuilderSettings } from '../hooks/useTablebuilderSettingsContext';
import { CheckboxTB } from '../tablebuilder-components/CheckboxTB';
import { CheckboxGroupTB } from '../tablebuilder-components/CheckboxGroupTB';
import { ArrowDownUp, CalendarRange, Check, ListFilter, PlusCircle, Trash, Trash2 } from 'lucide-react';
import { useState } from 'react';

export const PageSizeSection: React.FC = () => {
    const { settings, setSettings } = useTablebuilderSettings();
    const [editIndex, setEditIndex] = useState<number | null>(null);
    const [inputValue, setInputValue] = useState<string>('');

    const handleAddOption = () => {
        // Add new option without sorting
        const newOptions = [...settings.pageSize.options, 10];
        setSettings(prev => ({
            ...prev,
            pageSize: {
                ...prev.pageSize,
                options: newOptions
            }
        }));
        // Set edit mode on the newly added option
        setEditIndex(newOptions.length - 1);
        setInputValue('10');
    };

    const handleDeleteOption = (index: number) => {
        const newOptions = settings.pageSize.options.filter((_, idx) => idx !== index);
        setSettings(prev => ({ ...prev, pageSize: { ...prev.pageSize, options: newOptions } }));
        setEditIndex(null);
    };

    const handleOptionClick = (index: number) => {
        setEditIndex(index);
        setInputValue(settings.pageSize.options[index].toString());
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setInputValue(e.target.value);
    };

    const handleSaveOption = () => {
        if (editIndex !== null) {
            const newValue = parseInt(inputValue, 10) || 10;
            const newOptions = [...settings.pageSize.options];
            newOptions[editIndex] = newValue;
            // Only sort when explicitly saving a value
            const sortedOptions = newOptions.sort((a, b) => a - b);
            setSettings(prev => ({
                ...prev,
                pageSize: {
                    ...prev.pageSize,
                    options: sortedOptions
                }
            }));
            setEditIndex(null);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleSaveOption();
        } else if (e.key === 'Escape') {
            setEditIndex(null);
        }
    };
    return (
        <div className="flex flex-col gap-6">
            <CheckboxGroupTB name="Page Size Options">
                <CheckboxTB
                    id="pageSizeToggle"
                    label="Show Page Size Selector"
                    checked={settings.pageSize.showPageSizeSelect}
                    onChange={e => setSettings(prev => ({ ...prev, pageSize: { ...prev.pageSize, showPageSizeSelect: e.target.checked } }))}
                    icon={ListFilter}
                />
            </CheckboxGroupTB>
            <div className="space-y-3">
                <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700">
                    <ArrowDownUp size={16} /> Size Options
                </label>
                <div className="flex flex-wrap gap-4">
                    {settings.pageSize.options.map((option, i) => (
                        <div key={i} className="flex items-center gap-1">
                            {editIndex === i ? (
                                <div className="flex items-center">
                                    <input
                                        type="number"
                                        className="w-14 rounded border p-1 text-sm"
                                        value={inputValue}
                                        onChange={handleInputChange}
                                        onKeyDown={handleKeyDown}
                                        min="1"
                                        autoFocus
                                    />
                                    <button className="ml-1 cursor-pointer p-1 text-green-700 hover:bg-green-100" onClick={handleSaveOption}>
                                        <Check size={16} />
                                    </button>
                                </div>
                            ) : (
                                <div
                                    className="w-14 cursor-pointer rounded border bg-gray-50 p-1 text-center text-sm hover:bg-gray-100"
                                    onClick={() => handleOptionClick(i)}
                                >
                                    {option}
                                </div>
                            )}
                            <button className="cursor-pointer rounded p-1 text-red-500 hover:bg-red-100" onClick={() => handleDeleteOption(i)}>
                                <Trash2 size={14} />
                            </button>
                        </div>
                    ))}
                    <button className="flex cursor-pointer items-center gap-1 text-xs text-blue-600" onClick={handleAddOption}>
                        <PlusCircle size={14} /> Add Option
                    </button>
                </div>
            </div>
        </div>
    );
};
