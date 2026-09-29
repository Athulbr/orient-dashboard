import { createContext, useContext } from 'react';
import { UserAccountStateIF } from '..';

const userAccountStateContext = createContext<UserAccountContextIF | undefined>(undefined);
export const UserAccountStateProvider = userAccountStateContext.Provider;

export const useUserAccountState = () => {
    const context = useContext(userAccountStateContext);
    if (!context) {
        throw new Error('useAppContext must be used within an AppProvider');
    }
    return context;
};

interface UserAccountContextIF {
    state: UserAccountStateIF;
    setState: React.Dispatch<React.SetStateAction<UserAccountStateIF>>;
}
