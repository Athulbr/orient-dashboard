export interface TablebuilderStateIF {
    data: any[];
    selectedIds: string[];
    loading: boolean;
    total: number;
    page: number;
    pageRows: number;
    startDate: Date | null;
    endDate: Date | null;
    searchValue: string;
    skipActiveFilters: boolean;
    activeFilters: {
        key: string;
        value: string;
    }[];
    sorts: {
        column: string;
        direction: 'asc' | 'desc';
    }[];
    failedToFetch: boolean;
}

interface SearchableColumnsIF {
    searchableColumns: string[];
}

export interface QueryParams extends SearchableColumnsIF {
    page?: number;
    pageSize?: number;
    startDate?: Date | null;
    endDate?: Date | null;
    search?: string;
    filters?: Record<string, string>;
    sorts?: {
        column: string;
        direction: 'asc' | 'desc';
    }[];
    skipActiveFilters?: boolean; // Added flag to skip using active filters
}

export interface TablebuilderSettingsIF {
    clearFilters: {
        showClearFiltersButton: boolean;
    };
    pagination: {
        showPaginaion: boolean;
        showPaginaionDetails: boolean;
    };
    rowSelection: {
        showRowSelection: boolean;
        showSelectedRowCount: boolean;
        enableRowHighlight: boolean;
    };
    exportTableData: {
        showExportButton: boolean;
    };
    search: {
        showSearchInput: boolean;
        placeholder: string;
        searchRateControl: string;
        searchableColumns: string[];
    };
    dateRange: {
        showDateRangeInput: boolean;
        dateFieldKey: string;
    };
    pageSize: {
        showPageSizeSelect: boolean;
        options: number[];
    };
    api: {
        getUrlFromEnv: boolean;
        envVariable: string;
        url: string;
        endPoint: string;
        refresh: number;
    };
    filters: Array<{
        key: string;
        options: string[];
    }>;
    columns: Array<{
        key: string;
        header: string;
        sortable: boolean;
        customUI: boolean;
        customUiKey: string;
        capitalize: boolean;
        hidden: boolean;
        dateUI: boolean;
        editButton: boolean;
        deleteButton: boolean;
        editUrl: string;
        deleteUrl: string;
    }>;
}
