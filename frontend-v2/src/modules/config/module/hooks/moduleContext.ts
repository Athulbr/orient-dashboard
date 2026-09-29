import { createContext, useContext } from 'react';
import { ModuleStateIF } from '..';

const moduleStateContext = createContext<ModuleContextIF | undefined>(undefined);
export const ModuleStateProvider = moduleStateContext.Provider;

export const useModuleState = () => {
    const context = useContext(moduleStateContext);
    if (!context) {
        throw new Error('useModuleContext must be used within a ModuleStateProvider');
    }
    return context;
};

interface ModuleContextIF {
    state: ModuleStateIF;
    setState: React.Dispatch<React.SetStateAction<ModuleStateIF>>;
}
