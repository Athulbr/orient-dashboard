import { createContext, useContext } from 'react';
import { UpdateTemplateStateIF } from '..';

const updateTemplateContext = createContext<UpdateTemplateContextIF | undefined>(undefined);
export const UpdateTemplateStateProvider = updateTemplateContext.Provider;

export const useUpdateTemplateState = () => {
    const context = useContext(updateTemplateContext);
    if (!context) {
        throw new Error('useAppContext must be used within an AppProvider');
    }
    return context;
};

interface UpdateTemplateContextIF {
    state: UpdateTemplateStateIF;
    setState: React.Dispatch<React.SetStateAction<UpdateTemplateStateIF>>;
}
