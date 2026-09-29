import { MuiTextField } from '../../../../components/MuiTextField';
import { Button } from '../../../../components/Button';
import Spinner from '../../../../components/Spinner';
import { useForgotPasswordState } from '../hooks/ForgotPasswordStateProvider';
import { useForgotPasswordApi } from '../hooks/useForgotPasswordApi';
import { useNavigate } from 'react-router-dom';

export const ForgotPasswordForm = () => {
    const { state, setState } = useForgotPasswordState();
    const { handleForgotPassword } = useForgotPasswordApi();
    const navigate = useNavigate();

    const handleKeyDown = (event: React.KeyboardEvent) => {
        if (event.key === 'Enter') {
            handleForgotPassword();
        }
    };

    if (state.success) {
        return (
            <div className="mt-4 flex flex-col items-center gap-4 text-center">
                <div className="rounded-full bg-green-100 p-4">
                    <svg className="h-8 w-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                </div>
                <h3 className="text-lg font-medium">Check your email</h3>
                <p className="text-sm font-light text-gray-500">We've sent a password reset link to {state.email}</p>
                <Button onClick={() => navigate('/auth/login')} className="bg-foreground-900 mt-4 w-full">
                    Back to Login
                </Button>
            </div>
        );
    }

    return (
        <div className="mt-4 flex flex-col gap-4">
            {state.error && <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-600">{state.error}</div>}
            <MuiTextField
                errorMessage={state.fieldError.email}
                label="Email"
                value={state.email}
                onChange={e => setState(prev => ({ ...prev, email: e.target.value }))}
                placeholder="Enter your email"
                onKeyDown={handleKeyDown}
                autoFocus
            />

            <Button onClick={handleForgotPassword} className="bg-foreground-900 mt-2" disabled={state.loading}>
                {state.loading && <Spinner size={16} />}
                {state.loading ? 'SENDING...' : 'SEND RESET LINK'}
            </Button>

            <div className="text-center">
                <button onClick={() => navigate('/auth/login')} className="text-foreground-500 text-sm hover:underline">
                    Back to Login
                </button>
            </div>
        </div>
    );
};
