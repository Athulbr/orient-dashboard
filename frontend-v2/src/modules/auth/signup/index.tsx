import { FC, useState } from 'react';
import { WelComeText } from './components/WelComeText';
import { AuthErrorComponent } from './components/AuthErrorComponent';
import { LoginRedirectText } from '../signup/components/LoginRedirectText';
import { SignupPageStateProvider } from './hooks/SignupPageStateProvider';
import { SignupInputs } from './components/SignupInputs';
import TermsAndConditionsDialog from './components/TermsAndConditionsDialog';

export interface SignupPageStateIF {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
    confirmPassword: string;
    loading: boolean;
    oAuthLoading: boolean;
    authError: string;
    fieldError: {
        firstName: string;
        lastName: string;
        email: string;
        password: string;
        confirmPassword: string;
    };
    isSubmitClicked: boolean;
    termsOfService: boolean;
    signUpSuccess: boolean;
    termsAndConditionsDialog: boolean;
}
const initialState = {
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirmPassword: '',
    loading: false,
    oAuthLoading: false,
    authError: '',
    fieldError: {
        firstName: '',
        lastName: '',
        email: '',
        password: '',
        confirmPassword: ''
    },
    isSubmitClicked: false,
    termsOfService: false,
    signUpSuccess: false,
    termsAndConditionsDialog: false
};
const SignupPage: FC = () => {
    const [state, setState] = useState<SignupPageStateIF>(initialState);

    return (
        <SignupPageStateProvider value={{ state, setState }}>
            <div className="h-auto w-3/5 max-w-90 min-w-90">
                <WelComeText />
                {!state.signUpSuccess && (
                    <>
                        <AuthErrorComponent />
                        <SignupInputs />
                        <LoginRedirectText />
                    </>
                )}
                <TermsAndConditionsDialog />
            </div>
        </SignupPageStateProvider>
    );
};

export default SignupPage;
