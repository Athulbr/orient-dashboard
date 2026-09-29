import { FC } from 'react';
import GoogleIcon from '../../../../assets/svg-icons/GoogleIcon';
import { useLoginPageApi } from '../hooks/useLoginPageApi';
import Spinner from '../../../../components/Spinner';
import { useLoginPageState } from '../hooks/LoginPageStateProvider';
import { Button } from '../../../../components/Button';
import MicrosoftLogin from './msal';
import ProfileContent from './profileContent';

export const OAuthButtons: FC = () => {
    const { loginWithGoogle, loginWithMSAL } = useLoginPageApi();
    const { state } = useLoginPageState();
    // const isAuthenticated = useIsAuthenticated();

    return (
        <section className="mt-8 flex w-full gap-4">
            <Button className="w-full" outlined onClick={() => loginWithGoogle()} disabled={state.oAuthLoading}>
                <GoogleIcon /> Google {state.oAuthLoading && <Spinner size={16} />}
            </Button>
            <MicrosoftLogin>
                <ProfileContent data="auth" />
            </MicrosoftLogin>
        </section>
    );
};
