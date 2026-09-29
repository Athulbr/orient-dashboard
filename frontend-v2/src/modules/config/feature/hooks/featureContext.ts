import { createContext, useContext } from 'react';
import { FeatureStateIF } from '..';

const featureStateContext = createContext<FeatureContextIF | undefined>(undefined);
export const FeatureStateProvider = featureStateContext.Provider;

export const useFeatureState = () => {
    const context = useContext(featureStateContext);
    if (!context) {
        throw new Error('useFeatureContext must be used within a FeatureStateProvider');
    }
    return context;
};

interface FeatureContextIF {
    state: FeatureStateIF;
    setState: React.Dispatch<React.SetStateAction<FeatureStateIF>>;
}
