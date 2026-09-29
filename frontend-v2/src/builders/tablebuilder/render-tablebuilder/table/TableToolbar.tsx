import { Search, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useTablebuilderState } from '../hooks/useTablebuilderStateContext';
import { SingleSelect } from '../components/SingleSelect';
import { DatePicker } from '../components/DatePicker';
import { SearchField } from '../components/SearchField';
import { debounce, throttle } from 'lodash';
import { ActiveFilter } from '../utils/interface';
import { getFiltersObject } from '../utils/getFiltersObject';
import { useFetchDataFromApi } from '../hooks/useFetchDataFromApi';
import { Button } from '../../../../components/Button';
import Spinner from '../../../../components/Spinner';
import { config } from '../../../../config/default';
import useTablepersistance from '../../../../hooks/useTablepersistance';

const selectedTenant = window?.sessionStorage?.getItem('selectedTenant') || '';

export function TableToolbar() {
    const { injectedData, state } = useTablebuilderState();

    return (
        <div className="mb-2 flex flex-1 flex-row-reverse flex-wrap-reverse justify-start gap-4 p-1">
            {injectedData.actionButtons?.map((button, index) => (
                <Button key={index} outlined onClick={() => button.action(state.selectedIds)}>
                    {button.loading && <Spinner size={18} />} {button.label}
                </Button>
            ))}
            <SearchInput />
            <ClearFilterButton />
            <ExportButton />
            <PageSizeSelector />
            <DateRangePicker />
            <Filters />
        </div>
    );
}

// ============================================================================================================================================

// Filters Component
function Filters() {
    const { settings, state, setState } = useTablebuilderState();
    const { getDataFromApi } = useFetchDataFromApi();
    const { activeFilters } = state;
    const { injectedData } = useTablebuilderState();
    const { setFiltersParam } = useTablepersistance();

    // Update active filters
    const updateActiveFilter = useCallback(
        (newActiveFilters: ActiveFilter[]) => {
            setState(prevState => ({
                ...prevState,
                activeFilters: newActiveFilters,
                page: 1 // Reset to page 1
            }));

            // Convert filters array to object
            const filtersObject = getFiltersObject(newActiveFilters);

            // Update filters and page in URL (centralized in hook)
            setFiltersParam(filtersObject);

            // Get data with new filters
            getDataFromApi({
                page: 1,
                filters: filtersObject,
                skipActiveFilters: true
            });
        },
        [getDataFromApi, setState]
    );

    return (
        <>
            {settings.filters.map((filter, index) => {
                const found = injectedData.externalFilters[filter.key];
                return (
                    <SingleSelect
                        key={filter.key}
                        options={[
                            {
                                label: `All ${filter.key.charAt(0).toUpperCase() + filter.key.slice(1)}`,
                                value: ''
                            },
                            ...filter.options.map(option => ({ label: option, value: option }))
                        ]}
                        value={activeFilters[index]?.value || (found ? found : '')}
                        onValueChange={value => {
                            const newFilters = [...activeFilters];
                            newFilters[index] = value ? { key: filter.key, value } : { key: '', value: '' };
                            updateActiveFilter(newFilters);
                        }}
                        hidden={Boolean(found)}
                    />
                );
            })}
        </>
    );
}

// ============================================================================================================================================

// PageSize Selector Component
function PageSizeSelector() {
    const { settings, state, setState } = useTablebuilderState();
    const { getDataFromApi } = useFetchDataFromApi();
    const { setPageSizeParam } = useTablepersistance();

    const onChangePageSize = useCallback(
        (value: string) => {
            setState(prev => ({ ...prev, pageRows: parseInt(value), page: 1 }));
            getDataFromApi({ page: 1, pageSize: parseInt(value) });
            // Update pageSize and reset page using hook
            setPageSizeParam(value);
        },
        [setState, getDataFromApi]
    );

    if (!settings?.pageSize.showPageSizeSelect) return null;

    return (
        <SingleSelect
            options={settings.pageSize?.options.map(size => ({
                label: `${size} Rows`,
                value: size.toString()
            }))}
            value={state.pageRows.toString()}
            onValueChange={onChangePageSize}
        />
    );
}

// ============================================================================================================================================

// DateRange Picker Component
function DateRangePicker() {
    const { settings, state, setState } = useTablebuilderState();
    const { startDate, endDate } = state;
    const { getDataFromApi } = useFetchDataFromApi();
    const { setDateRangeParam } = useTablepersistance();

    // Update date range
    const onChangeDateRange = useCallback(
        (newStartDate: Date | null, newEndDate: Date | null) => {
            setState(prev => ({
                ...prev,
                startDate: newStartDate,
                endDate: newEndDate,
                page: 1 // Reset to page 1 when date range changes
            }));

            getDataFromApi({ startDate: newStartDate, endDate: newEndDate });
            setDateRangeParam(newStartDate, newEndDate);
        },
        [setState, getDataFromApi]
    );

    if (!settings.dateRange.showDateRangeInput) return null;
    return <DatePicker from={startDate} to={endDate} onSubmit={onChangeDateRange} />;
}
// ============================================================================================================================================

// Search Input Component

function SearchInput() {
    const { settings, state, setState } = useTablebuilderState();
    const { getDataFromApi } = useFetchDataFromApi();

    const { searchValue } = state;
    const { search } = settings;
    const { setSearchParam } = useTablepersistance();

    // Use refs to always get the latest values
    const getDataFromApiRef = useRef(getDataFromApi);
    const searchSettingsRef = useRef(search);

    // Update refs when dependencies change
    useEffect(() => {
        getDataFromApiRef.current = getDataFromApi;
    }, [getDataFromApi]);

    useEffect(() => {
        searchSettingsRef.current = search;
    }, [search]);

    // Create debounced function that uses current refs
    const debouncedSearch = useMemo(() => {
        const debouncedFn = debounce((query: string, searchableColumns: string[]) => {
            getDataFromApiRef.current({
                page: 1,
                search: query,
                searchableColumns
            });
        }, 1000);

        return debouncedFn;
    }, []); // Empty dependency array since we use refs

    // Create throttled function that uses current refs
    const throttleSearch = useMemo(() => {
        const throttledFn = throttle((query: string, searchableColumns: string[]) => {
            getDataFromApiRef.current({
                page: 1,
                search: query,
                searchableColumns
            });
        }, 2000);

        return throttledFn;
    }, []); // Empty dependency array since we use refs

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            debouncedSearch.cancel();
            throttleSearch.cancel();
        };
    }, [debouncedSearch, throttleSearch]);

    // Update search value
    const onChangeSearchValue = useCallback(
        (newSearchValue: string, clear: boolean) => {
            setState(prev => ({
                ...prev,
                searchValue: newSearchValue,
                page: 1
            }));

            // Persist search to URL and reset page to 1 (centralized in hook)
            setSearchParam(newSearchValue);

            if (clear) {
                // Cancel pending debounced/throttled calls when clearing
                debouncedSearch.cancel();
                throttleSearch.cancel();

                getDataFromApi({
                    page: 1,
                    search: newSearchValue
                });
            }
        },
        [setState, getDataFromApi, debouncedSearch, throttleSearch]
    );

    const handleSearchChange = useCallback(
        (value: string) => {
            if (/[!@#$%^&*()+\|{};:]/.test(value)) {
                return null;
            }

            onChangeSearchValue(value, false);

            const currentSearch = searchSettingsRef.current;

            if (currentSearch.searchRateControl === 'debouncing') {
                debouncedSearch(value, currentSearch.searchableColumns);
            } else if (currentSearch.searchRateControl === 'throttling') {
                throttleSearch(value, currentSearch.searchableColumns);
            }
        },
        [onChangeSearchValue, debouncedSearch, throttleSearch]
    );

    if (!search.showSearchInput) return null;

    const activeClasses = 'focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-1';

    return (
        <SearchField
            className={`w-full max-w-150 flex-1 ${activeClasses}`}
            placeholder={search.placeholder}
            value={searchValue}
            onChange={e => handleSearchChange(e.target.value)}
            leftIcon={<Search className="h-4 w-4" />}
            rightIcon={searchValue ? <X className="h-4 w-4 cursor-pointer" onClick={() => onChangeSearchValue('', true)} /> : undefined}
        />
    );
}
// ============================================================================================================================================

// Export Button Component
const ExportButton = () => {
    const { settings, state } = useTablebuilderState();

    const { selectedIds, data } = state;
    const { columns, exportTableData } = settings;

    // Get visible column keys to filter export data
    const filterDataByColumns = useCallback(
        (data: Record<string, any>[]) => {
            const visibleColumnKeys = columns.filter(col => !col.hidden).map(col => col.key as string);

            return data.map(row => {
                const filteredRow: Record<string, any> = {};
                visibleColumnKeys.forEach(key => {
                    if (row.hasOwnProperty(key)) {
                        filteredRow[key] = row[key];
                    }
                });
                return filteredRow;
            });
        },
        [columns]
    );

    const handleExport = useCallback(
        (value: string) => {
            let dataToExport: Record<string, any>[] = [];

            if (value === 'selected') {
                // Filter data to only include selected rows
                const filtered = data.filter(row => selectedIds.includes(row._id));
                dataToExport = filterDataByColumns(filtered);
                if (dataToExport.length === 0) {
                    return;
                }
                // Convert data to CSV string
                const headers = Object.keys(dataToExport[0]).join(',');
                const rows = dataToExport.map(row => Object.values(row).join(','));
                const csv = [headers, ...rows].join('\n');

                // Create blob and download
                const blob = new Blob([csv], { type: 'text/csv' });
                const url = window.URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.setAttribute('download', `table-export-${new Date().getTime()}.csv`);
                document.body.appendChild(link);
                link.click();
                link.remove();
                window.URL.revokeObjectURL(url);
            } else if (value === 'all') {
                // `${config.nodeApiUrl}/idp/history/export/new`;

                const downloadXlsxFile = async () => {
                    const recordId = 'export';
                    const accessToken = window?.sessionStorage?.getItem('accessToken') as string;

                    let exportURL = '';
                    // Update this condition based on your tenant settings
                    const user = JSON.parse(window?.sessionStorage?.getItem('user') as string);
                    if (user.tenant._id === '68896ef48e0baa23315c3cfd') {
                        exportURL = `${config.nodeApiUrl}/idp/history/export/new`;
                    } else {
                        exportURL = `${config.nodeApiUrl}/idp/history/export`;
                    }

                    const response = await fetch(exportURL, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            authorization: `Bearer ${accessToken ? JSON.parse(accessToken) : ''}`,
                            tenantid: selectedTenant
                        },
                        body: JSON.stringify({ recordId })
                    });

                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status}`);
                    }

                    const blob = await response.blob();

                    const url = window.URL.createObjectURL(blob);
                    const link = document.createElement('a');
                    link.href = url;
                    link.download = `table-export-${new Date().getTime()}.xlsx`;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    window.URL.revokeObjectURL(url);
                };
                downloadXlsxFile();
            }
        },
        [data, selectedIds, filterDataByColumns]
    );

    if (!exportTableData.showExportButton) return null;

    return (
        <SingleSelect
            placeholder="Export"
            options={[
                {
                    label: 'All',
                    value: 'all'
                },
                {
                    label: 'Selected',
                    value: 'selected'
                }
            ]}
            value={''}
            onValueChange={value => handleExport(value)}
        />
    );
};

// ============================================================================================================================================

const ClearFilterButton = () => {
    const { settings, state, setState } = useTablebuilderState();
    const { getDataFromApi } = useFetchDataFromApi();
    const { clearFiltersParams } = useTablepersistance();

    const clearActiveFilters = useCallback(() => {
        setState(prev => ({
            ...prev,
            activeFilters: [],
            searchValue: '',
            startDate: null,
            endDate: null,
            sorts: [],
            page: 1, // Reset to page 1
            selectedIds: []
        }));
        // clear relevant URL params and set page=1 (centralized in hook)
        clearFiltersParams();
        getDataFromApi({}, true);
    }, [setState, getDataFromApi]);

    if (!settings.clearFilters.showClearFiltersButton) return null;

    return (
        <Button
            className="flex cursor-pointer items-center gap-1 rounded border px-3 py-2 text-sm transition-colors hover:bg-gray-100"
            onClick={clearActiveFilters}
            outlined
        >
            <X className="h-3.5 w-3.5" />
            Clear
        </Button>
    );
};
