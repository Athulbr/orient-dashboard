import { useState } from 'react';
import { emptyInitialData, filledInitialData } from './static-data/Settings';
import { TableSettings } from './table-settings';
import { BuilderIF, TablebuilderSettingsProvider } from './hooks/useTablebuilderSettingsContext';
import { RenderTablebuilder } from '../render-tablebuilder';
import { StatusCustomUI, DeleteCustomUI, DateCustomUI } from '../render-tablebuilder/components/CustomUI';
import { TablebuilderSettingsIF } from '../render-tablebuilder/interface';

interface PropsIF {
    update?: boolean;
    id?: string;
}

export const CreateTablebuilder: React.FC<PropsIF> = ({ update, id }) => {
    const [settings, setSettings] = useState<TablebuilderSettingsIF>(update ? emptyInitialData : filledInitialData);
    const [builder, setBuilder] = useState<BuilderIF>({ name: '', loading: false });

    const customUI = {
        status: StatusCustomUI,
        delete: DeleteCustomUI,
        date: DateCustomUI
    };

    return (
        <TablebuilderSettingsProvider value={{ settings, setSettings, builder, setBuilder }}>
            <div className="absolute top-0 left-0 flex h-[100vh] w-[100vw] gap-2 divide-gray-200 overflow-y-auto bg-white p-4">
                <TableSettings id={id} />
                <RenderTablebuilder settings={settings} fluidHeight customUI={customUI} />
            </div>
        </TablebuilderSettingsProvider>
    );
};
