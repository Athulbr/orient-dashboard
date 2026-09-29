import { useEffect, useState } from 'react';
import BackButton from '../../../components/BackButton';
import { Button } from '../../../components/Button';
import { useToastStore } from '../../../components/toast/ToastStore';
import { useExportbuilderState } from '../../../modules/config/exportbuilder/hooks/exportbuilderContext';
import { useExportbuilderApi } from '../../../modules/config/exportbuilder/hooks/useExportbuilderApi';
import Spinner from '../../../components/Spinner';
import { ExcelExportDialogNew } from '../../../builders/excelbuilder/preview';
import { ExcelExportBuilder, ExcelSheetConfig } from '../../../builders/excelbuilder/builder';
import { FiltersBuilder, FilterItemIF } from '../../../builders/excelbuilder/builder/FiltersBuilder';
import { UseFormbuilder } from '../../../builders/formbuilder/use-formbuilder';

interface CreateExportbuilderIF {}

export const CreateExportbuilderPage: React.FC<CreateExportbuilderIF> = () => {
    const { state, setState } = useExportbuilderState();
    const generateId = () => Math.random().toString(36).substr(2, 9);
    const toast = useToastStore();
    const { createExportbuilderApi, updateExportbuilderApi, getExportbuilderByIdApi, getRecordsApi } = useExportbuilderApi();
    const [sheets, setSheets] = useState<ExcelSheetConfig[]>([{ id: generateId(), sheetName: 'Sheet 1', columns: [] }]);
    const [filters, setFilters] = useState<FilterItemIF[]>([]);
    const [showFiltersView, setShowFiltersView] = useState(false);
    const [showCreateDialog, setShowCreateDialog] = useState(false); // controls meta form dialog

    // Re-fetch records whenever the selected template changes
    useEffect(() => {
        const tenantId = sessionStorage.getItem('selectedTenant') ?? JSON.parse(sessionStorage.getItem('user') || '{}').tenant?._id;
        const moduleFilter = sessionStorage.getItem('module');

        const payload: any = {
            pageSize: 20,
            filters: { deleted: false },
            startDate: null,
            endDate: null,
            tenantId: tenantId || ''
        };

        if (moduleFilter) payload.module = moduleFilter;
        if (state.selectedTemplateId && state.selectedTemplateId.length) payload.templateId = state.selectedTemplateId;

        getRecordsApi(payload);
    }, [state.selectedTemplateId]);

    useEffect(() => {
        if (state.id) {
            getExportbuilderByIdApi(state.id);
        }
    }, [state.id]);

    useEffect(() => {
        if (state.exportbuilder) {
            setSheets(state.exportbuilder.sheets);
            // Map filters to FilterItemIF structure
            const loadedFilters = (state.exportbuilder.filters || []).map((f: any) => ({
                id: f.id || generateId(),
                key: f.name || f.key || '',
                jsonPath: f.jsonPath,
                options: f.options || [],
                rawOptions: f.options ? (Array.isArray(f.options) ? f.options.join(',') : String(f.options)) : ''
            }));
            setFilters(loadedFilters);
        }
    }, [state.exportbuilder]);

    const handleCreateExportbuilder = () => {
        if (sheets[0]?.columns?.length === 0) {
            toast.error('Please add at least one column to the first sheet before creating the export builder');
            return;
        }
        setShowCreateDialog(true); // open meta form
    };

    const handleCreateRecord = async (data: any) => {
        setState(prev => ({ ...prev, loading: true }));
        if (sheets[0]?.columns?.length === 0) {
            toast.error('Please add at least one column to the first sheet before creating the export builder');
            setState(prev => ({ ...prev, loading: false }));
            return;
        }

        const payload = {
            name: data?.name || 'Untitled Export',
            description: data?.description || '',
            sheets: sheets,
            filters: filters.map(f => ({
                name : f.key,
                jsonPath: f.jsonPath,
                ...(f.options && f.options.length ? { options: f.options } : {})
            })),
            ...(state.selectedTemplateId && state.selectedTemplateId.length ? { templateId: state.selectedTemplateId } : {})
        };

        try {
            if (state.id) {
                await updateExportbuilderApi(payload);
            } else {
                await createExportbuilderApi(payload);
            }
            toast.success('Exportbuilder created successfully');
            setShowCreateDialog(false);
            setState(prev => ({ ...prev, id: '', exportbuilder: null, createDialog: false, loading: false }));
        } catch (err) {
            console.error('Failed to create exportbuilder', err);
            toast.error('Failed to create export builder');
            setState(prev => ({ ...prev, loading: false }));
        }
    };

    return (
        <div className="absolute top-0 left-0 w-screen h-screen bg-white max-h-screen flex flex-col">
            <header className="flex items-center gap-4 p-3 justify-between">
                <div className="flex items-center gap-2">
                    <BackButton onClick={() => setState(prev => ({ ...prev, id: '', exportbuilder: null, createDialog: false, loading: false }))} />
                    <div className=" w-full text-xl font-semibold text-gray-800">{state.id ? 'Update Exportbuilder' : 'Create Exportbuilder'}</div>
                </div>
                <Button
                    onClick={handleCreateExportbuilder}
                    outlined
                    disabled={state.loading}
                    startIcon={state.loading ? <Spinner className="h-4 w-4 animate-spin" /> : undefined}
                >
                    {state.id ? 'Update' : 'Create'} Exportbuilder
                </Button>
            </header>
            <ExcelExportDialogNew template={sheets} inputData={state.records} />
            {showFiltersView ? (
                <FiltersBuilder
                    filters={filters}
                    setFilters={setFilters}
                    inputData={state.records}
                    showFiltersView={showFiltersView}
                    onToggleFiltersView={() => setShowFiltersView(!showFiltersView)}
                />
            ) : (
                <ExcelExportBuilder
                    sheets={sheets}
                    setSheets={setSheets}
                    inputData={state.records}
                    filters={filters}
                    setFilters={setFilters}
                    showFiltersView={showFiltersView}
                    onToggleFiltersView={() => setShowFiltersView(!showFiltersView)}
                />
            )}
            <UseFormbuilder
                isOpen={showCreateDialog}
                name="Create Record Form" // form definition should include name/description
                closeDialog={() => setShowCreateDialog(false)}
                onSubmit={handleCreateRecord} // collects meta and calls create/update
                existingData={state.id ? state.exportbuilder || {} : {}}
                loadingPrimaryButton={state.loading}
            />
        </div>
    );
};
