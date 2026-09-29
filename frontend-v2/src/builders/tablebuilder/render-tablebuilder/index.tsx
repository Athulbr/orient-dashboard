import { JSX, useState } from 'react';
import { tablebuilderInitialState } from './static-data/State';
import { TablebuilderStateProvider } from './hooks/useTablebuilderStateContext';
import Table from './table';
import { TablebuilderSettingsIF, TablebuilderStateIF } from './interface';

interface PropsIF {
    settings: TablebuilderSettingsIF;
    customUI?: Record<string, ({ data }: { data: any }) => JSX.Element>;
    externalFilters?: Record<string, string>;
    customFunctions?: Record<string, (row: any, data: any) => void>;
    fluidHeight?: boolean;
    actionButtons?: { label: string; action: (selectedIds: string[]) => void }[];
    refresh?: number;
    disableLoader?: boolean;
    updatedQuery?: (query: any) => any;
    deletePermission?: string;
    updatePermission?: string;
    hiddenColumns?: string[];
    onRowSelect?: (selectedRows: any) => void;
}

export const RenderTablebuilder: React.FC<PropsIF> = ({
    settings,
    customUI = {},
    customFunctions = {},
    fluidHeight,
    externalFilters = {},
    actionButtons = [],
    refresh,
    disableLoader,
    updatedQuery,
    deletePermission,
    updatePermission,
    hiddenColumns,
    onRowSelect
}) => {
    const [state, setState] = useState<TablebuilderStateIF>(tablebuilderInitialState);
    return (
        <TablebuilderStateProvider
            value={{
                state,
                setState,
                settings,
                injectedData: {
                    customUI,
                    updatedQuery,
                    customFunctions,
                    fluidHeight,
                    externalFilters,
                    actionButtons,
                    disableLoader,
                    deletePermission,
                    updatePermission,
                    hiddenColumns,
                    onRowSelect
                }
            }}
        >
            <Table refresh={refresh} />
        </TablebuilderStateProvider>
    );
};
