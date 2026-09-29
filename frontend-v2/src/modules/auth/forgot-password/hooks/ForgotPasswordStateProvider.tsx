import { createContext, useContext, useState } from 'react';

export interface ForgotPasswordStateIF {
    email: string;
    loading: boolean;
    success: boolean;
    error: string;
    fieldError: {
        email: string;
    };
    isSubmitClicked: boolean;
}

interface ForgotPasswordContextIF {
    state: ForgotPasswordStateIF;
    setState: React.Dispatch<React.SetStateAction<ForgotPasswordStateIF>>;
}

const initialState: ForgotPasswordStateIF = {
    email: '',
    loading: false,
    success: false,
    error: '',
    fieldError: {
        email: ''
    },
    isSubmitClicked: false
};

const forgotPasswordStateContext = createContext<ForgotPasswordContextIF | undefined>(undefined);
export const ForgotPasswordStateProvider = forgotPasswordStateContext.Provider;

export const useForgotPasswordState = () => {
    const context = useContext(forgotPasswordStateContext);
    if (!context) {
        throw new Error('useForgotPasswordState must be used within a ForgotPasswordStateProvider');
    }
    return context;
};

export const ForgotPasswordStateProviderWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [state, setState] = useState<ForgotPasswordStateIF>(initialState);

    return <ForgotPasswordStateProvider value={{ state, setState }}>{children}</ForgotPasswordStateProvider>;
};
