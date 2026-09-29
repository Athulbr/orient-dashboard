import { createContext, useContext } from 'react';
import { TablebuilderSettingsIF } from '../../render-tablebuilder/interface';

export interface BuilderIF {
    name: string;
    loading: boolean;
}

const TablebuilderSettingsContext = createContext<
    | {
          settings: TablebuilderSettingsIF;
          setSettings: React.Dispatch<React.SetStateAction<TablebuilderSettingsIF>>;
          builder: BuilderIF;
          setBuilder: React.Dispatch<React.SetStateAction<BuilderIF>>;
      }
    | undefined
>(undefined);
export const TablebuilderSettingsProvider = TablebuilderSettingsContext.Provider;

export const useTablebuilderSettings = () => {
    const context = useContext(TablebuilderSettingsContext);
    if (!context) {
        throw new Error('useAppContext must be used within an AppProvider');
    }
    return context;
};
