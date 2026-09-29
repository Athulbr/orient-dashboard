import { createContext, useContext } from 'react';
import { TenantStateIF } from '..';

const tenantStateContext = createContext<TenantContextIF | undefined>(undefined);
export const TenantStateProvider = tenantStateContext.Provider;

export const useTenantState = () => {
    const context = useContext(tenantStateContext);
    if (!context) {
        throw new Error('useTenantContext must be used within a TenantStateProvider');
    }
    return context;
};

interface TenantContextIF {
    state: TenantStateIF;
    setState: React.Dispatch<React.SetStateAction<TenantStateIF>>;
}
