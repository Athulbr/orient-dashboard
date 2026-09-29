import { createContext, useContext } from 'react';
import { TemplateStateIF } from '..';

const templateStateContext = createContext<TemplateContextIF | undefined>(undefined);
export const TemplateStateProvider = templateStateContext.Provider;

export const useTemplateState = () => {
    const context = useContext(templateStateContext);
    if (!context) {
        throw new Error('useAppContext must be used within an AppProvider');
    }
    return context;
};

interface TemplateContextIF {
    state: TemplateStateIF;
    setState: React.Dispatch<React.SetStateAction<TemplateStateIF>>;
}
