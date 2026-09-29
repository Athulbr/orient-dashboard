import { JSX, useEffect, useState } from 'react';
import { RenderTablebuilder } from '..';
import httpRequest from '../utils/HttpRequest';
import { TablebuilderSettingsIF } from '../interface';
import FullScreenLoader from '../../../../components/FullScreenLoader';
import { config } from '../../../../config/default';

interface UseTablebuilderPropsIF {
    fluidHeight?: boolean;
    name: string;
    customUI?: Record<string, ({ data }: { data: any }) => JSX.Element>;
    externalFilters?: Record<string, any>;
    customFunctions?: Record<string, (row: any, data: any) => void>;
    actionButtons?: { label: string; action: (selectedIds: string[]) => void }[];
    refresh?: number;
    disableLoader?: boolean;
    updatedQuery?: (query: any) => any;
    deletePermission?: string;
    updatePermission?: string;
    hiddenColumns?: string[];
    onRowSelect?: (selectedRows: any) => void;
}

export const UseTablebuilder: React.FC<UseTablebuilderPropsIF> = ({
    name,
    customUI,
    customFunctions,
    fluidHeight,
    externalFilters,
    actionButtons,
    refresh,
    disableLoader,
    updatedQuery,
    deletePermission,
    updatePermission,
    hiddenColumns,
    onRowSelect
}) => {
    const [settings, setSettings] = useState<TablebuilderSettingsIF | null>(null);
    useEffect(() => {
        const tablebuilder = window?.sessionStorage?.getItem('tablebuilder');
        if (tablebuilder) {
            const data = JSON.parse(tablebuilder);
            const tableData = data.find((item: any) => item.name === name);
            if (tableData) {
                // console.info('Retreived tablebuilder data from cache');
                setSettings(tableData.settings);
                return;
            }
        }
        const getTableSettings = async () => {
            try {
                const res: any = await httpRequest('POST', `${config.nodeApiUrl}/builder/tablebuilder/name`, { name });
                setSettings(res?.data?.settings);
            } catch (error: any) {
                console.error('error.message:===========', error.message);
            }
        };
        getTableSettings();
    }, [name]);

    if (!settings)
        return (
            <div className="flex h-full w-full flex-col items-center justify-center">
                <FullScreenLoader />
            </div>
        );

    return (
        <div className="flex h-full w-full overflow-y-auto">
            <RenderTablebuilder
                settings={settings}
                customUI={customUI}
                customFunctions={customFunctions}
                fluidHeight={fluidHeight}
                externalFilters={externalFilters}
                actionButtons={actionButtons}
                refresh={refresh}
                disableLoader={disableLoader}
                updatedQuery={updatedQuery}
                deletePermission={deletePermission}
                updatePermission={updatePermission}
                hiddenColumns={hiddenColumns}
                onRowSelect={onRowSelect}
            />
        </div>
    );
};
