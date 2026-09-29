import { createContext, useContext } from 'react';
import { SubscriptionModelStateIF } from '..';

const subscriptionModelStateContext = createContext<SubscriptionModelContextIF | undefined>(undefined);
export const SubscriptionModelStateProvider = subscriptionModelStateContext.Provider;

export const useSubscriptionModelState = () => {
    const context = useContext(subscriptionModelStateContext);
    if (!context) {
        throw new Error('useSubscriptionModelContext must be used within a SubscriptionModelStateProvider');
    }
    return context;
};

interface SubscriptionModelContextIF {
    state: SubscriptionModelStateIF;
    setState: React.Dispatch<React.SetStateAction<SubscriptionModelStateIF>>;
}
