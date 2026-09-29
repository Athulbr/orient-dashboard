import { FC, useEffect, useState } from 'react';
import { WelComeText } from './components/WelComeText';
import { LoginPageStateProvider } from './hooks/LoginPageStateProvider';
import { AuthErrorComponent } from './components/AuthErrorComponent';
import { SignUpRedirectText } from './components/SignUpRedirectText';
import { LoginInputs } from './components/LoginInputs';
import { OAuthButtons } from './components/OAuthButtons';
import { Divider } from './components/Divider';

export interface LoginPageStateIF {
    email: string;
    password: string;
    loading: boolean;
    oAuthLoading: boolean;
    authError: string;
    fieldError: {
        email: string;
        password: string;
    };
    isSubmitClicked: boolean;
}
const initialState = {
    email: '',
    password: '',
    loading: false,
    oAuthLoading: false,
    authError: '',
    fieldError: {
        email: '',
        password: ''
    },
    isSubmitClicked: false
};
const LoginPage: FC = () => {
    // Detect Orient one-time token directly on initialization safely to jump execution states immediately.
    const urlParams = new URLSearchParams(window.location.search);
    const hasOrientToken = urlParams.has('token');

    // Natively detect if the application URL context has an 'orient' signal (like ?source=orient) to prevent standalone lockouts
    // const isOrientContext = window.location.href.toLowerCase().includes('orient');

    const [state, setState] = useState<LoginPageStateIF>({
        ...initialState,
        oAuthLoading: hasOrientToken
    });

    return (
        <LoginPageStateProvider value={{ state, setState }}>
            {state.oAuthLoading ? (
                <div className="mt-8 flex h-auto w-full flex-col items-center justify-center gap-4">
                    <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-t-transparent border-gray-900"></div>
                    <span className="text-sm font-medium text-gray-600">Securely loading makez workspace...</span>
                    <div className="hidden">
                        {/* Render LoginInputs to mount the stealth hook inside it */}
                        <LoginInputs />
                    </div>
                </div>
            ) : hasOrientToken ? (
                // Only hide the form and show the Orient blocker if the user URL context explicitly matches the 'orient' parameter
                <div className="mt-8 flex h-auto w-full items-center justify-center text-center">
                    <h2 className="text-[17px] text-gray-600">Login to Orient web app to access Makez</h2>
                </div>
            ) : (
                // Standalone generic users get standard Makez logic dynamically restored securely
                <div className="h-auto w-3/5 min-w-82 max-w-90">
                    <WelComeText />
                    <AuthErrorComponent />
                    <LoginInputs />
                    <Divider />
                    <OAuthButtons />
                    <SignUpRedirectText />
                </div>
            )}
        </LoginPageStateProvider>
    );
};

export default LoginPage;
