import { createContext, useContext } from 'react';
import { UserStateIF } from '..';

const userStateContext = createContext<UserContextIF | undefined>(undefined);
export const UserStateProvider = userStateContext.Provider;

export const useUserState = () => {
    const context = useContext(userStateContext);
    if (!context) {
        throw new Error('useAppContext must be used within an AppProvider');
    }
    return context;
};

interface UserContextIF {
    state: UserStateIF;
    setState: React.Dispatch<React.SetStateAction<UserStateIF>>;
}
