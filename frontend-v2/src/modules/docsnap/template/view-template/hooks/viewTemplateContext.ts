import { createContext, useContext } from 'react';
import { ViewTemplateStateIF } from '..';

const viewTemplateContext = createContext<ViewTemplateContextIF | undefined>(undefined);
export const ViewTemplateStateProvider = viewTemplateContext.Provider;

export const useViewTemplateState = () => {
    const context = useContext(viewTemplateContext);
    if (!context) {
        throw new Error('useAppContext must be used within an AppProvider');
    }
    return context;
};

interface ViewTemplateContextIF {
    state: ViewTemplateStateIF;
    setState: React.Dispatch<React.SetStateAction<ViewTemplateStateIF>>;
}
