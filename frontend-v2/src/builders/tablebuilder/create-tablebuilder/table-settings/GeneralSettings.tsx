import { CheckSquare, Download, Hash, Info, ListOrdered, Paintbrush, Settings } from 'lucide-react';
import { useTablebuilderSettings } from '../hooks/useTablebuilderSettingsContext';
import { CheckboxTB } from '../tablebuilder-components/CheckboxTB';
import { CheckboxGroupTB } from '../tablebuilder-components/CheckboxGroupTB';

export const GeneralSettingsSection: React.FC = () => {
    const { settings, setSettings } = useTablebuilderSettings();
    return (
        <div className="flex flex-col gap-6">
            <CheckboxGroupTB name="Pagination">
                <CheckboxTB
                    id="paginationToggle"
                    label="Enable Pagination"
                    checked={settings.pagination.showPaginaion}
                    onChange={e => setSettings(prev => ({ ...prev, pagination: { ...prev.pagination, showPaginaion: e.target.checked } }))}
                    icon={ListOrdered}
                />
                <CheckboxTB
                    id="paginationDetailsToggle"
                    label="Show Pagination Details"
                    checked={settings.pagination.showPaginaionDetails}
                    onChange={e => setSettings(prev => ({ ...prev, pagination: { ...prev.pagination, showPaginaionDetails: e.target.checked } }))}
                    icon={Info}
                />
            </CheckboxGroupTB>
            <CheckboxGroupTB name="Row Selection">
                <CheckboxTB
                    id="rowSelectionToggle"
                    label="Enable Row Selection"
                    checked={settings.rowSelection.showRowSelection}
                    onChange={e => setSettings(prev => ({ ...prev, rowSelection: { ...prev.rowSelection, showRowSelection: e.target.checked } }))}
                    icon={CheckSquare}
                />
                <CheckboxTB
                    id="rowCountToggle"
                    label="Show Selected Row Count"
                    checked={settings.rowSelection.showSelectedRowCount}
                    onChange={e => setSettings(prev => ({ ...prev, rowSelection: { ...prev.rowSelection, showSelectedRowCount: e.target.checked } }))}
                    icon={Hash}
                />
                <CheckboxTB
                    id="rowHighlightToggle"
                    label="Highlight Selected Rows"
                    checked={settings.rowSelection.enableRowHighlight}
                    onChange={e => setSettings(prev => ({ ...prev, rowSelection: { ...prev.rowSelection, enableRowHighlight: e.target.checked } }))}
                    icon={Paintbrush}
                />
            </CheckboxGroupTB>
            <CheckboxGroupTB name="Export Table Data">
                <CheckboxTB
                    id="exportToggle"
                    label="Show Export Button"
                    checked={settings.exportTableData.showExportButton}
                    onChange={e => setSettings(prev => ({ ...prev, exportTableData: { ...prev.exportTableData, showExportButton: e.target.checked } }))}
                    icon={Download}
                />
            </CheckboxGroupTB>
            <CheckboxGroupTB name="Clear Filters">
                <CheckboxTB
                    id="clearFiltersToggle"
                    label="Enable Clear Filters Button"
                    checked={settings.clearFilters.showClearFiltersButton}
                    onChange={e => setSettings(prev => ({ ...prev, clearFilters: { ...prev.clearFilters, showClearFiltersButton: e.target.checked } }))}
                    icon={Settings}
                />
            </CheckboxGroupTB>
        </div>
    );
};
