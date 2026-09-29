import { createContext, useContext } from 'react';
import { ExportbuilderStateIF } from '..';

interface ExportbuilderContextIF {
    state: ExportbuilderStateIF;
    setState: React.Dispatch<React.SetStateAction<ExportbuilderStateIF>>;
}

const exportbuilderStateContext = createContext<ExportbuilderContextIF | undefined>(undefined);
export const ExportbuilderStateProvider = exportbuilderStateContext.Provider;

export const useExportbuilderState = () => {
    const context = useContext(exportbuilderStateContext);
    if (!context) {
        throw new Error('useExportbuilderState must be used within a ExportbuilderStateProvider');
    }
    return context;
};
