import { useMsal, useIsAuthenticated } from '@azure/msal-react';
import { loginRequest } from '../sso/msal-config';
import MSIcon from '../../../../assets/svg-icons/MSIcon';
import { Button } from '../../../../components/Button';
import { useLoginPageState } from '../hooks/LoginPageStateProvider';
import Spinner from '../../../../components/Spinner';

const MicrosoftLogin: React.FC<any> = ({ className, children }) => {
    const { instance } = useMsal();
    const isAuthenticated = useIsAuthenticated();
    const { state } = useLoginPageState();

    const loginWithMicrosoft = async () => {
        console.info('Login with Microsoft initiated');
        instance.loginRedirect(loginRequest).catch(e => {
            console.error('MSAL Sign In issue---->', e);
        });
    };

    const handleLogout = () => {
        instance.logoutRedirect({
            postLogoutRedirectUri: '/auth/login'
        });
    };

    return (
        <>
            {isAuthenticated ? (
                <Button className="w-full" outlined onClick={handleLogout} disabled={state.oAuthLoading}>
                    <MSIcon /> Microsoft {state.oAuthLoading && <Spinner size={16} />}
                </Button>
            ) : (
                <Button className="w-full" outlined onClick={loginWithMicrosoft} disabled={state.oAuthLoading}>
                    <MSIcon /> Microsoft {state.oAuthLoading && <Spinner size={16} />}
                </Button>
            )}

            {children}
        </>
    );
};

export default MicrosoftLogin;
