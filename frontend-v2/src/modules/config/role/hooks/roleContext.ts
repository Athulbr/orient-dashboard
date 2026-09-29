import { createContext, useContext } from 'react';
import { RoleStateIF } from '..';

const roleStateContext = createContext<RoleContextIF | undefined>(undefined);
export const RoleStateProvider = roleStateContext.Provider;

export const useRoleState = () => {
    const context = useContext(roleStateContext);
    if (!context) {
        throw new Error('useAppContext must be used within an AppProvider');
    }
    return context;
};

interface RoleContextIF {
    state: RoleStateIF;
    setState: React.Dispatch<React.SetStateAction<RoleStateIF>>;
}
