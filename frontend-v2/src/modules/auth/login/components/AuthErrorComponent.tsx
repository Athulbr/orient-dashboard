import { FC } from 'react';
import { useLoginPageState } from '../hooks/LoginPageStateProvider';

export const AuthErrorComponent: FC = () => {
    const { state } = useLoginPageState();
    if (!state.authError) return null;
    return <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-600">{state.authError}</div>;
};
