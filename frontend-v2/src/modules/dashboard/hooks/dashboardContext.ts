import { createContext, useContext } from 'react';
import { DashboardStateIF } from '..';

const dashboardStateContext = createContext<DashboardContextIF | undefined>(undefined);
export const DashboardStateProvider = dashboardStateContext.Provider;

export const useDashboardState = () => {
    const context = useContext(dashboardStateContext);
    if (!context) {
        throw new Error('useAppContext must be used within an AppProvider');
    }
    return context;
};

interface DashboardContextIF {
    state: DashboardStateIF;
    setState: React.Dispatch<React.SetStateAction<DashboardStateIF>>;
}
