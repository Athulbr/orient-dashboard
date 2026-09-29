import { FC } from 'react';
import { useSignupPageState } from '../hooks/SignupPageStateProvider';

export const AuthErrorComponent: FC = () => {
    const { state } = useSignupPageState();
    if (!state.authError) return null;
    return <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-600">{state.authError}</div>;
};
