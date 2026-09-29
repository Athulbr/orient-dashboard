import { useEffect } from 'react';
import { useTablebuilderState } from '../hooks/useTablebuilderStateContext';
import { TableBody } from './TableBody';
import { TableFooter } from './TableFooter';
import { TableHeader } from './TableHeader';
import { TableToolbar } from './TableToolbar';
import { useFetchDataFromApi } from '../hooks/useFetchDataFromApi';
import useTablepersistance from '../../../../hooks/useTablepersistance';
import FullScreenLoader from '../../../../components/FullScreenLoader';

interface TableIF {
    refresh?: number;
}

const Table: React.FC<TableIF> = ({ refresh = 0 }) => {
    const { injectedData, settings, setState, state } = useTablebuilderState();
    const { getDataFromApi } = useFetchDataFromApi();
    const { getPageFromQuery, getPageSizeFromQuery, getDateRangeFromQuery, getSearchFromQuery, getFiltersFromQuery } = useTablepersistance();

    useEffect(() => {
        if (settings.api.refresh === 0) return;

        // Get params from URL
        const pageFromQuery = getPageFromQuery();
        const pageSizeFromQuery = getPageSizeFromQuery();
        const { startDate: startDateFromQuery, endDate: endDateFromQuery } = getDateRangeFromQuery();
        const searchFromQuery = getSearchFromQuery();
        const filtersFromQuery = getFiltersFromQuery();

        // Build ActiveFilter[] only when filtersFromQuery exists, otherwise keep empty
        const newActiveFilters = filtersFromQuery
            ? (settings.filters?.map(f => {
                  const external = injectedData?.externalFilters?.[f.key];
                  const val = external ?? filtersFromQuery?.[f.key] ?? '';
                  return val ? { key: f.key, value: val } : { key: '', value: '' };
              }) ?? [])
            : [];

        // initialize state (on mount or refresh)
        setState(prev => ({
            ...prev,
            activeFilters: newActiveFilters,
            searchValue: searchFromQuery,
            startDate: startDateFromQuery,
            endDate: endDateFromQuery,
            sorts: [],
            page: pageFromQuery,
            pageRows: pageSizeFromQuery ?? prev.pageRows
        }));
        getDataFromApi({
            page: pageFromQuery,
            pageSize: pageSizeFromQuery ?? undefined,
            search: searchFromQuery,
            startDate: startDateFromQuery,
            endDate: endDateFromQuery,
            sorts: [],
            filters: filtersFromQuery ?? {},
            skipActiveFilters: true
        });
    }, [settings.api.refresh, refresh]);

    return (
        <div className={`bg-background dark:bg-background-dark flex min-w-[770px] flex-1 flex-col ${injectedData.fluidHeight ? 'h-full' : 'h-fit'}`}>
            <TableToolbar />
            <div className="h-full overflow-y-auto rounded-lg border">
                <table className="min-w-full table-fixed">
                    <TableHeader />
                    {state.loading && (state.data.length === 0 || !injectedData.disableLoader) ? null : <TableBody />}
                </table>
                {state.loading && (state.data.length === 0 || !injectedData.disableLoader) ? (
                    <FullScreenLoader />
                ) : state.failedToFetch ? (
                    <div className="flex h-full items-center justify-center text-sm text-gray-400 relative bottom-15">😖&nbsp;Failed to fetch the data</div>
                ) : !state.loading && state.data.length === 0 ? (
                    <div className="flex h-full items-center justify-center text-sm text-gray-400 relative bottom-15">🤗 &nbsp;No Data Found</div>
                ) : null}
            </div>
            <TableFooter />
        </div>
    );
};

export default Table;
