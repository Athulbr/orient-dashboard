import { useTablebuilderSettings } from '../hooks/useTablebuilderSettingsContext';
import { CheckboxTB } from '../tablebuilder-components/CheckboxTB';
import { CheckboxGroupTB } from '../tablebuilder-components/CheckboxGroupTB';
import { CalendarRange } from 'lucide-react';
import { TextFieldTB } from '../tablebuilder-components/TextFieldTB';

export const DateRangeSection: React.FC = () => {
    const { settings, setSettings } = useTablebuilderSettings();
    return (
        <div className="flex flex-col gap-6">
            <CheckboxGroupTB name="Date Range Filter">
                <CheckboxTB
                    id="dateRangeToggle"
                    label="Enable Date Range Picker"
                    checked={settings.dateRange.showDateRangeInput}
                    onChange={e => setSettings(prev => ({ ...prev, dateRange: { ...prev.dateRange, showDateRangeInput: e.target.checked } }))}
                    icon={CalendarRange}
                />
            </CheckboxGroupTB>
            <TextFieldTB
                label="Date Field Key"
                type="text"
                value={settings.dateRange.dateFieldKey}
                onChange={e => setSettings(prev => ({ ...prev, dateRange: { ...prev.dateRange, dateFieldKey: e.target.value } }))}
                placeholder="Enter search placeholder..."
            />
        </div>
    );
};
