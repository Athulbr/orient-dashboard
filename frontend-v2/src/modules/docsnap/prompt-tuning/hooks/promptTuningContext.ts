import { createContext, useContext } from 'react';
import { PromptTuningStateIF } from '..';

const promptTuningStateContext = createContext<PromptTuningContextIF | undefined>(undefined);
export const PromptTuningStateProvider = promptTuningStateContext.Provider;

export const usePromptTuningState = () => {
    const context = useContext(promptTuningStateContext);
    if (!context) {
        throw new Error('useAppContext must be used within an AppProvider');
    }
    return context;
};

interface PromptTuningContextIF {
    state: PromptTuningStateIF;
    setState: React.Dispatch<React.SetStateAction<PromptTuningStateIF>>;
}
