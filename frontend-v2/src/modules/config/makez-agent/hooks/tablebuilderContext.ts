import { createContext, useContext } from 'react';
import { MakezAgentStateIF } from '..';

interface MakezAgentContextIF {
    state: MakezAgentStateIF;
    setState: React.Dispatch<React.SetStateAction<MakezAgentStateIF>>;
}

const makezAgentStateContext = createContext<MakezAgentContextIF | undefined>(undefined);
export const MakezAgentStateProvider = makezAgentStateContext.Provider;

export const useMakezAgentState = () => {
    const context = useContext(makezAgentStateContext);
    if (!context) {
        throw new Error('useMakezAgentState must be used within a MakezAgentStateProvider');
    }
    return context;
};
