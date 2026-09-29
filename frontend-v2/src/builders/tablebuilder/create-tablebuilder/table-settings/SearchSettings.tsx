import { Columns, Search, Timer } from 'lucide-react';
import { useTablebuilderSettings } from '../hooks/useTablebuilderSettingsContext';
import { CheckboxTB } from '../tablebuilder-components/CheckboxTB';
import { CheckboxGroupTB } from '../tablebuilder-components/CheckboxGroupTB';
import { TextFieldTB } from '../tablebuilder-components/TextFieldTB';

export const SearchSection: React.FC = () => {
    const { settings, setSettings } = useTablebuilderSettings();
    const columnKeys = settings.columns.map(col => col.key).filter(k => k);
    return (
        <div className="flex flex-col gap-6">
            <CheckboxGroupTB name="Search Options">
                <CheckboxTB
                    id="searchToggle"
                    label="Show Search Input"
                    checked={settings.search.showSearchInput}
                    onChange={e => setSettings(prev => ({ ...prev, search: { ...prev.search, showSearchInput: e.target.checked } }))}
                    icon={Search}
                />
            </CheckboxGroupTB>
            <div className="space-y-3">
                <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700">
                    <Columns size={16} /> Searchable Columns
                </label>
                <div className="flex cursor-pointer flex-wrap gap-2">
                    {columnKeys.length > 0 ? (
                        columnKeys.map(column => (
                            <div key={column} className="flex cursor-pointer items-center gap-1.5">
                                <input
                                    type="checkbox"
                                    id={`search-${column}`}
                                    className="h-3.5 w-3.5 cursor-pointer"
                                    checked={settings.search.searchableColumns.includes(column)}
                                    onChange={e => {
                                        const updatedColumns = e.target.checked
                                            ? [...settings.search.searchableColumns, column]
                                            : settings.search.searchableColumns.filter(c => c !== column);
                                        setSettings(prev => ({ ...prev, search: { ...prev.search, searchableColumns: updatedColumns } }));
                                    }}
                                />
                                <label htmlFor={`search-${column}`} className="cursor-pointer text-sm text-gray-700">
                                    {column}
                                </label>
                            </div>
                        ))
                    ) : (
                        <p className="text-sm text-gray-500 italic">Add columns first</p>
                    )}
                </div>
            </div>
            <TextFieldTB
                label="Placeholder Text"
                type="text"
                value={settings.search.placeholder}
                onChange={e => setSettings(prev => ({ ...prev, search: { ...prev.search, placeholder: e.target.value } }))}
                placeholder="Enter search placeholder..."
            />
            <div className="space-y-3">
                <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700">
                    <Timer size={16} /> Search Rate Control
                </label>
                <div className="flex cursor-pointer items-center gap-4 text-sm text-gray-700">
                    <div className="flex cursor-pointer items-center gap-1.5">
                        <input
                            type="radio"
                            id="debouncing"
                            name="rateControl"
                            className="h-3.5 w-3.5 cursor-pointer"
                            checked={settings.search.searchRateControl === 'debouncing'}
                            onChange={() => setSettings(prev => ({ ...prev, search: { ...prev.search, searchRateControl: 'debouncing' } }))}
                        />
                        <label className="cursor-pointer" htmlFor="debouncing">
                            Debouncing
                        </label>
                    </div>
                    <div className="flex cursor-pointer items-center gap-1.5">
                        <input
                            type="radio"
                            id="throttling"
                            name="rateControl"
                            className="h-3.5 w-3.5 cursor-pointer"
                            checked={settings.search.searchRateControl === 'throttling'}
                            onChange={() => setSettings(prev => ({ ...prev, search: { ...prev.search, searchRateControl: 'throttling' } }))}
                        />
                        <label className="cursor-pointer" htmlFor="throttling">
                            Throttling
                        </label>
                    </div>
                </div>
            </div>
        </div>
    );
};
