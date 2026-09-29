import { error } from 'console';
import { Button } from '../../../../components/Button';
import { MuiPasswordTextField } from '../../../../components/MuiPasswordTextField';
import { MuiTextField } from '../../../../components/MuiTextField';
import Spinner from '../../../../components/Spinner';
import { useLoginPageState } from '../hooks/LoginPageStateProvider';
import { useNavigate } from 'react-router-dom';
import { useLoginPageApi } from '../hooks/useLoginPageApi';
import { useEffect } from 'react';

interface LoginInputsIF {
    test?: string;
}

export const LoginInputs: React.FC<LoginInputsIF> = () => {
    const { state, setState } = useLoginPageState();
    const navigate = useNavigate();
    const { loginWithEmailAndPassword } = useLoginPageApi();

    const handleKeyDown = (event: React.KeyboardEvent) => {
        if (event.key === 'Enter') {
            loginWithEmailAndPassword();
        }
    };

    useEffect(() => {
        if (window?.localStorage?.getItem('auto_login') === 'true') {
            loginWithEmailAndPassword();
        }
    }, []);

    return (
        <div className="mt-4 flex flex-col gap-2">
            <MuiTextField
                errorMessage={state.fieldError.email}
                label="Email"
                value={state.email}
                onChange={e => setState(prev => ({ ...prev, email: e.target.value }))}
                className="-webkit-text-fill-color: #fff"
                onKeyDown={handleKeyDown}
                autoComplete="current-password"
                name="email"
            />
            <MuiPasswordTextField
                errorMessage={state.fieldError.password}
                label="Password"
                value={state.password}
                onChange={e => setState(prev => ({ ...prev, password: e.target.value }))}
                onKeyDown={handleKeyDown}
            />
            <p
                tabIndex={0}
                onClick={() => navigate('/auth/forgot-password')}
                className="w-fit cursor-pointer pl-1 text-[12px] text-gray-400 hover:text-gray-700 active:border-gray-400 active:outline-gray-400"
            >
                Forgot Password?
            </p>
            <Button onClick={loginWithEmailAndPassword} className="bg-foreground-900 mt-2" disabled={state.loading}>
                {state.loading && <Spinner size={16} />} {state.loading ? 'SIGNING IN...' : 'SIGN IN'}
            </Button>
        </div>
    );
};
