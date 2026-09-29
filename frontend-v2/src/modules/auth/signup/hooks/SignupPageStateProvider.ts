import { createContext, useContext } from 'react';
import { SignupPageStateIF } from '..';

const signupPageStateContext = createContext<SignupPageContextIF | undefined>(undefined);
export const SignupPageStateProvider = signupPageStateContext.Provider;

export const useSignupPageState = () => {
    const context = useContext(signupPageStateContext);
    if (!context) {
        throw new Error('useAppContext must be used within an AppProvider');
    }
    return context;
};

interface SignupPageContextIF {
    state: SignupPageStateIF;
    setState: React.Dispatch<React.SetStateAction<SignupPageStateIF>>;
}
