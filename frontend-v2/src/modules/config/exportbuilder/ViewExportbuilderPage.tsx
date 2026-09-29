import BackButton from '../../../components/BackButton';
import { useExportbuilderState } from './hooks/exportbuilderContext';
import { ExcelExportDialogNew } from '../../../builders/excelbuilder/preview';
import { useExportbuilderApi } from './hooks/useExportbuilderApi';
import { useEffect, useMemo, useState } from 'react';
import { useToastStore } from '../../../components/toast/ToastStore';
import Spinner from '../../../components/Spinner';
import DateTimePicker, { DateRangeIF } from '../../../components/DateTimePicker';
import { SingleSelect } from '../../../components/SingleSelect';
import { Button } from '../../../components/Button';

interface ViewExportbuilderPageIF {
    test?: string;
}

const ViewExportbuilderPage: React.FC<ViewExportbuilderPageIF> = () => {
    const { getExportbuilderByIdApi, getRecordsApi, exportBuilderApi } = useExportbuilderApi();
    const { state, setState } = useExportbuilderState();
    const [startDate, setStartDate] = useState<string | null>(null);
    const [endDate, setEndDate] = useState<string | null>(null);
    const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
    const [selectedStatus, setSelectedStatus] = useState<string>('');
    const [selectedFilterValues, setSelectedFilterValues] = useState<Record<string, string>>({});
    const [initialFilterOptions, setInitialFilterOptions] = useState<Record<string, string[]>>({});
    const [dynamicFilterOptions, setDynamicFilterOptions] = useState<Record<string, string[]>>({});
    const [exporting, setExporting] = useState(false);
    const toast = useToastStore();
    const tenant = useMemo(() => {
        const allTemplates = JSON.parse(sessionStorage.getItem('templates') || '');
        const tenantId = sessionStorage.getItem('selectedTenant') ?? JSON.parse(sessionStorage.getItem('user') || '').tenant?._id;
        const templates = allTemplates
            .filter((item: any) => item.tenantId === tenantId)
            .map((item: any) => ({
                value: item._id,
                label: item.name
            }));
        return {
            tenantId,
            templates
        };
    }, []);
    const getValueByPath = (obj: any, path?: string) => {
        if (!obj || !path) return undefined;
        return path.split('.').reduce((acc: any, seg: string) => (acc && acc[seg] !== undefined ? acc[seg] : undefined), obj);
    };

    // Convert saved filters to API format
    const getFiltersFromConfig = () => {
        const baseFilters: any = { deleted: false };

        // Apply user-selected filter values
        Object.keys(selectedFilterValues).forEach(key => {
            if (selectedFilterValues[key]) {
                baseFilters[key] = selectedFilterValues[key];
            }
        });

        return baseFilters;
    };

    useEffect(() => {
        const fetchRecords = async () => {
            const payload: any = {
                pageSize: 100,
                filters: getFiltersFromConfig(),
                startDate: startDate,
                endDate: endDate,
                tenantId: tenant.tenantId || '',
                ...(state.selectedTemplateId && state.selectedTemplateId.length ? { templateId: state.selectedTemplateId } : {})
            };
            if (selectedTemplateId) payload.filters.templateId = selectedTemplateId;
            if (selectedStatus) payload.filters.status = selectedStatus;

            let recordsFromApi: any[] = [];
            try {
                setState(prev => ({ ...prev, loading: true }));
                const res = await getRecordsApi(payload);
                recordsFromApi = res?.data ?? [];
            } catch (err) {
                console.error('fetchRecords error:', err);
            } finally {
                setState(prev => ({ ...prev, loading: false }));
            }

            // Build dynamic options map from current records (always update so options appear as records arrive)
            const dynamicMap: Record<string, string[]> = {};
            const recordsToUse = Array.isArray(recordsFromApi) && recordsFromApi.length > 0 ? recordsFromApi : (Array.isArray(state.records) ? state.records : []);
            if (state.exportbuilder?.filters && Array.isArray(state.exportbuilder.filters) && recordsToUse.length > 0) {
                state.exportbuilder.filters.forEach((filter: { jsonPath: string }) => {
                    const path = filter.jsonPath || '';
                    if (!path) return;
                    const uniqueValues = Array.from(
                        new Set(
                            recordsToUse
                                .map((record: any) => getValueByPath(record, path))
                                .filter((val: any) => val !== undefined && val !== null)
                        )
                    )
                        .slice(0, 50)
                        .map(String);
                    dynamicMap[path] = uniqueValues;
                });
            }
            setDynamicFilterOptions(dynamicMap);

            // Seed initialFilterOptions only if there are no selected filters and we have dynamic options.
            // Use functional updater to avoid closure race where `initialFilterOptions` might be updated concurrently.
            if (Object.keys(dynamicMap).length > 0 && Object.keys(selectedFilterValues).length === 0) {
                setInitialFilterOptions(prev => (Object.keys(prev || {}).length === 0 ? dynamicMap : prev));
            }
        };

        fetchRecords();
    }, [startDate, endDate, selectedTemplateId, selectedStatus, selectedFilterValues, state.exportbuilder]);

    useEffect(() => {
        if (state.id) {
            getExportbuilderByIdApi(state.id);
        }
    }, [state.id]);

    const buildHistoryPayload = () => {
        const payload: any = {
            pageSize: 1000,
            filters: getFiltersFromConfig(),
            startDate: startDate,
            endDate: endDate,
            tenantId: tenant.tenantId || '',
            ...(state.selectedTemplateId && state.selectedTemplateId.length ? { templateId: state.selectedTemplateId } : {})
        };
        if (selectedTemplateId) payload.filters.templateId = selectedTemplateId;
        if (selectedStatus) payload.filters.status = selectedStatus;
        return payload;
    };

    const handleServerExport = async (format: 'json' | 'xlsx', activeSheetIndex = 0) => {
        try {
            setExporting(true);
            const payload = {
                ...buildHistoryPayload(),
                format,
                exportbuilder: state.exportbuilder,
                activeSheetIndex
            };

            const result = await exportBuilderApi(payload);

            if (result?.blob) {
                const url = window.URL.createObjectURL(result.blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = result.fileName || 'Record_Export.xlsx';
                document.body.appendChild(link);
                link.click();
                link.remove();
                window.URL.revokeObjectURL(url);
            } else if (result?.jsonData) {
                const jsonString = JSON.stringify(result.jsonData, null, 2);
                const blob = new Blob([jsonString], { type: 'application/json' });
                const url = window.URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = result.fileName || 'Record_Export.json';
                document.body.appendChild(link);
                link.click();
                link.remove();
                window.URL.revokeObjectURL(url);
            }
        } catch (error) {
            toast.error('Failed to export records');
        } finally {
            setExporting(false);
        }
    };

    return (
        <div className="absolute top-0 left-0 w-screen h-screen bg-white max-h-screen flex flex-col">
            <header className="flex items-center gap-4 p-3 justify-between border-b">
                <div className="flex items-center gap-2">
                    <BackButton onClick={() => setState(prev => ({ ...prev, id: '', exportbuilder: null, viewDialog: false, loading: false }))} />
                    <div className=" w-full text-xl font-semibold text-gray-800">{state.exportbuilder?.name}</div>
                </div>
                <div className="flex items-center">
                    <p className="text-green-600 text-sm pr-1">Total Records:</p>
                    {state.loading ? (
                        <Spinner size={16} className="text-green-600 ml-1" />
                    ) : (
                        <p className="text-green-600 text-sm pr-4 ml-1">{(state.totalRecords ?? 0).toLocaleString()}</p>
                    )}
                    {/* <Button outlined disabled={state.loading} startIcon={state.loading ? <Spinner className="h-4 w-4 animate-spin" /> : <Upload size={14} />}>
                        Export JSON
                    </Button>
                    <Button outlined disabled={state.loading} startIcon={state.loading ? <Spinner className="h-4 w-4 animate-spin" /> : <Upload size={14} />}>
                        Export .XLSX
                    </Button> */}
                </div>
            </header>
            <div className="w-full p-4 flex gap-4 flex-wrap items-center">
                {/* <SingleSelect
                    // label="Templates"
                    options={[{ label: 'All Templates', value: '' }, ...tenant.templates]}
                    value={selectedTemplateId}
                    placeholder="Select Template"
                    className="min-w-60"
                    onValueChange={(value: string) => setSelectedTemplateId(value)}
                /> */}

                <SingleSelect
                    // label="Status"
                    options={[
                        { label: 'All Status', value: '' },
                        { label: 'Processing', value: 'processing' },
                        { label: 'Extracted', value: 'extracted' },
                        { label: 'Viewed', value: 'viewed' },
                        { label: 'Submitted', value: 'submitted' },
                        { label: 'Failed', value: 'failed' },
                        { label: 'Invalid', value: 'invalid' }
                    ]}
                    value={selectedStatus}
                    placeholder="Select Status"
                    className="min-w-60"
                    onValueChange={(value: string) => setSelectedStatus(value)}
                />

                {/* Render filter selects from exportbuilder configuration */}
                {state.exportbuilder?.filters &&
                    Array.isArray(state.exportbuilder.filters) &&
                    state.exportbuilder.filters.map((filter: { jsonPath: string; javascript?: string; customLabel?: string; name?: string; key?: string }) => {
                                                // Use full jsonPath as the option key, but keep last segment for labels
                                                const path = filter.jsonPath || '';
                                                const filterName = filter.name || filter.key || (path ? path.split('.').slice(-1)[0] : '');
                                                const key = path ? path.split('.').slice(-1)[0] : '';

                                                // Use stored dynamic options (updated on each fetch) and merge with initial cached options
                                                const initialOpts = initialFilterOptions[path] || [];
                                                const dynamicOpts = dynamicFilterOptions[path] || [];
                                                const dataOptions = initialOpts.length > 0
                                                    ? [...initialOpts, ...dynamicOpts.filter(o => !initialOpts.includes(o))]
                                                    : dynamicOpts;

                        // Prepare saved options (from config) first, then append dynamic options without duplication
                        const savedOptionsRaw: any = (filter as any).options || [];
                        const savedOptions = Array.isArray(savedOptionsRaw) ? savedOptionsRaw.map(String) : [];
                        const dynamicOptionsStrings = dataOptions.map(String);
                        const dynamicFiltered = dynamicOptionsStrings.filter(opt => !savedOptions.includes(opt));

                        const mergedOptions = [
                            { label: `All ${filterName}`, value: '' },
                            ...(filter.javascript && filter.customLabel ? [{ label: filter.customLabel, value: '__custom_js__' }] : []),
                            ...savedOptions.map((opt: string) => ({ label: opt, value: opt })),
                            ...dynamicFiltered.map((opt: string) => ({ label: opt, value: opt }))
                        ];

                        return (
                                key && (filter.javascript || savedOptions.length > 0 || dataOptions.length > 0) && (
                                <SingleSelect
                                    key={filter.jsonPath}
                                    options={mergedOptions}
                                    // store selected filters using full jsonPath so API payloads use the full path
                                    value={selectedFilterValues[path] || ''}
                                    placeholder={`Select ${filterName}`}
                                    className="min-w-60"
                                    onValueChange={(value: string) => setSelectedFilterValues(prev => ({ ...prev, [path]: value }))}
                                />
                            )
                        );
                    })}
                <div>
                    <DateTimePicker
                        onChange={(range: DateRangeIF) => {
                            setStartDate(range.startDate);
                            setEndDate(range.endDate);
                        }}
                    />
                </div>
            </div>
            <ExcelExportDialogNew
                totalRecords={state.totalRecords}
                template={state.exportbuilder?.sheets || []}
                inputData={state.records}
                serverExportLoading={exporting}
                recordsLoading={state.loading}
                onServerJsonExport={(activeSheetIndex: number) => handleServerExport('json', activeSheetIndex)}
                onServerXlsxExport={() => handleServerExport('xlsx')}
            />
        </div>
    );
};

export default ViewExportbuilderPage;
