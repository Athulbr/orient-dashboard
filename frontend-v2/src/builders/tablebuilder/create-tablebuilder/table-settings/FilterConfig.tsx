import { XCircle, Key, Trash, PlusCircle, Filter, ChevronUp, ChevronDown, Trash2 } from 'lucide-react';
import { useTablebuilderSettings } from '../hooks/useTablebuilderSettingsContext';

export const FilterConfigSection: React.FC = () => {
    const { settings, setSettings } = useTablebuilderSettings();

    const updateFilters = (updater: (filters: FilterType[]) => FilterType[]) => {
        setSettings(prev => ({ ...prev, filters: updater(prev.filters) }));
    };

    const moveFilter = (fromIndex: number, toIndex: number) => {
        updateFilters(filters => {
            const newFilters = [...filters];
            const [movedFilter] = newFilters.splice(fromIndex, 1);
            newFilters.splice(toIndex, 0, movedFilter);
            return newFilters;
        });
    };

    return (
        <div className="flex flex-col gap-3">
            <div className="space-y-3 text-sm">
                {settings.filters.map((filter, filterIndex) => (
                    <FilterItem
                        key={filterIndex}
                        filter={filter}
                        filterIndex={filterIndex}
                        totalFilters={settings.filters.length}
                        onMoveUp={() => moveFilter(filterIndex, filterIndex - 1)}
                        onMoveDown={() => moveFilter(filterIndex, filterIndex + 1)}
                        onRemoveFilter={() => updateFilters(filters => filters.filter((_, index) => index !== filterIndex))}
                        onFilterKeyChange={newKey => updateFilters(filters => filters.map((f, index) => (index === filterIndex ? { ...f, key: newKey } : f)))}
                        onAddOption={() =>
                            updateFilters(filters => filters.map((f, index) => (index === filterIndex ? { ...f, options: [...f.options, ''] } : f)))
                        }
                        onUpdateOption={(optionIndex, value) =>
                            updateFilters(filters =>
                                filters.map((f, index) =>
                                    index === filterIndex
                                        ? {
                                              ...f,
                                              options: f.options.map((o, i) => (i === optionIndex ? value : o))
                                          }
                                        : f
                                )
                            )
                        }
                        onRemoveOption={optionIndex =>
                            updateFilters(filters =>
                                filters.map((f, index) =>
                                    index === filterIndex
                                        ? {
                                              ...f,
                                              options: f.options.filter((_, i) => i !== optionIndex)
                                          }
                                        : f
                                )
                            )
                        }
                    />
                ))}

                <AddFilterButton onClick={() => updateFilters(filters => [...filters, { key: '', options: [''] }])} />
            </div>
        </div>
    );
};

interface FilterType {
    key: string;
    options: string[];
}

interface FilterItemProps {
    filter: FilterType;
    filterIndex: number;
    totalFilters: number;
    onMoveUp: () => void;
    onMoveDown: () => void;
    onRemoveFilter: () => void;
    onFilterKeyChange: (newKey: string) => void;
    onAddOption: () => void;
    onUpdateOption: (optionIndex: number, value: string) => void;
    onRemoveOption: (optionIndex: number) => void;
}

const FilterItem: React.FC<FilterItemProps> = ({
    filter,
    filterIndex,
    totalFilters,
    onMoveUp,
    onMoveDown,
    onRemoveFilter,
    onFilterKeyChange,
    onAddOption,
    onUpdateOption,
    onRemoveOption
}) => {
    return (
        <div className="relative rounded-lg border p-4">
            <div className="absolute top-2 right-2 flex items-center gap-1">
                <div className="mr-2 flex items-center gap-1">
                    <button
                        className="rounded p-1 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
                        onClick={onMoveUp}
                        disabled={filterIndex === 0}
                        aria-label="Move up"
                    >
                        <ChevronUp size={16} className="text-gray-600" />
                    </button>
                    <button
                        className="rounded p-1 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
                        onClick={onMoveDown}
                        disabled={filterIndex === totalFilters - 1}
                        aria-label="Move down"
                    >
                        <ChevronDown size={16} className="text-gray-600" />
                    </button>
                </div>
                <button className="cursor-pointer rounded-3xl text-red-500 hover:bg-red-100" onClick={onRemoveFilter} aria-label="Remove filter">
                    <XCircle size={18} />
                </button>
            </div>

            <div className="space-y-5">
                <FilterKeyInput value={filter.key} onChange={onFilterKeyChange} />
                <FilterOptions options={filter.options} onAddOption={onAddOption} onUpdateOption={onUpdateOption} onRemoveOption={onRemoveOption} />
            </div>
        </div>
    );
};

interface FilterKeyInputProps {
    value: string;
    onChange: (value: string) => void;
}

const FilterKeyInput: React.FC<FilterKeyInputProps> = ({ value, onChange }) => {
    return (
        <div className="space-y-1.5">
            <label className="block flex items-center gap-1.5 text-sm font-medium text-gray-700">
                <Key size={16} /> Filter Key
            </label>
            <input
                type="text"
                className="w-full rounded border p-1.5 text-sm"
                value={value}
                onChange={e => onChange(e.target.value)}
                placeholder="e.g., status, role"
            />
        </div>
    );
};

interface FilterOptionsProps {
    options: string[];
    onAddOption: () => void;
    onUpdateOption: (optionIndex: number, value: string) => void;
    onRemoveOption: (optionIndex: number) => void;
}

const FilterOptions: React.FC<FilterOptionsProps> = ({ options, onAddOption, onUpdateOption, onRemoveOption }) => {
    return (
        <div className="space-y-3">
            <label className="block text-sm font-medium text-gray-700">Options</label>
            <div className="space-y-3">
                {options.map((option, optionIndex) => (
                    <div key={optionIndex} className="flex gap-1.5">
                        <input
                            type="text"
                            className="flex-1 rounded border p-1.5 text-sm"
                            value={option}
                            onChange={e => onUpdateOption(optionIndex, e.target.value)}
                            placeholder="Option value"
                        />
                        <button
                            className="cursor-pointer rounded p-1 text-red-500 hover:bg-red-100"
                            onClick={() => onRemoveOption(optionIndex)}
                            aria-label="Remove option"
                        >
                            <Trash2 size={16} />
                        </button>
                    </div>
                ))}
                <button className="flex items-center gap-1.5 text-xs text-blue-600" onClick={onAddOption}>
                    <PlusCircle size={14} /> Add Option
                </button>
            </div>
        </div>
    );
};

interface AddFilterButtonProps {
    onClick: () => void;
}

const AddFilterButton: React.FC<AddFilterButtonProps> = ({ onClick }) => {
    return (
        <button
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-blue-300 py-1.5 text-sm text-blue-600 transition hover:bg-blue-50"
            onClick={onClick}
        >
            <Filter size={16} /> Add Filter
        </button>
    );
};
