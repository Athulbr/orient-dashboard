import { createContext, useContext } from 'react';
import { LoginPageStateIF } from '..';

const loginPageStateContext = createContext<LoginPageContextIF | undefined>(undefined);
export const LoginPageStateProvider = loginPageStateContext.Provider;

export const useLoginPageState = () => {
    const context = useContext(loginPageStateContext);
    if (!context) {
        throw new Error('useAppContext must be used within an AppProvider');
    }
    return context;
};

interface LoginPageContextIF {
    state: LoginPageStateIF;
    setState: React.Dispatch<React.SetStateAction<LoginPageStateIF>>;
}
