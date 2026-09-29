import { config } from '../../../../config/default';
import { TablebuilderSettingsIF } from '../../render-tablebuilder/interface';

export const filledInitialData: TablebuilderSettingsIF = {
    clearFilters: {
        showClearFiltersButton: true
    },
    pagination: {
        showPaginaion: true,
        showPaginaionDetails: true
    },
    rowSelection: {
        showRowSelection: true,
        showSelectedRowCount: true,
        enableRowHighlight: true
    },
    exportTableData: {
        showExportButton: true
    },
    search: {
        showSearchInput: true,
        placeholder: 'Search...',
        searchRateControl: 'debouncing',
        searchableColumns: ['name', 'email']
    },
    dateRange: {
        showDateRangeInput: true,
        dateFieldKey: 'updatedAt'
    },
    pageSize: {
        showPageSizeSelect: true,
        options: [10, 20, 50, 100]
    },
    api: {
        getUrlFromEnv: true,
        envVariable: '',
        url: `${config.nodeApiUrl}`,
        endPoint: '',
        refresh: 1
    },
    filters: [],
    columns: [
        {
            key: 'name',
            header: 'Name',
            sortable: true,
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
};
export const emptyInitialData: TablebuilderSettingsIF = {
    clearFilters: {
        showClearFiltersButton: false
    },
    pagination: {
        showPaginaion: false,
        showPaginaionDetails: false
    },
    rowSelection: {
        showRowSelection: false,
        showSelectedRowCount: false,
        enableRowHighlight: false
    },
    exportTableData: {
        showExportButton: false
    },
    search: {
        showSearchInput: false,
        placeholder: 'Search...',
        searchRateControl: 'debouncing',
        searchableColumns: ['name']
    },
    dateRange: {
        showDateRangeInput: false,
        dateFieldKey: 'updatedAt'
    },
    pageSize: {
        showPageSizeSelect: false,
        options: [10, 20, 50, 100]
    },
    api: {
        getUrlFromEnv: false,
        envVariable: '',
        url: `${config.nodeApiUrl}`,
        endPoint: '/user/query',
        refresh: 1
    },
    filters: [],
    columns: []
};
