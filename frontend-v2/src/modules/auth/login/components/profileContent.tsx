import React from 'react';
import { useMsal, useIsAuthenticated } from '@azure/msal-react';
import { useNavigate } from 'react-router-dom';
import { callMsGraph } from '../sso/graph';
import { loginRequest } from '../sso/msal-config';
import httpRequest from '../../../../global-utils/httpRequest';
import { useToastStore } from '../../../../components/toast/ToastStore';
import { useLoginPageState } from '../hooks/LoginPageStateProvider';
import { config } from '../../../../config/default';
const ProfileContent: React.FC<any> = ({ data }) => {
    const { instance, accounts } = useMsal();
    const isAuthenticated = useIsAuthenticated();
    const toast = useToastStore();
    const { state, setState } = useLoginPageState();

    if (isAuthenticated) {
        instance
            .acquireTokenSilent({
                ...loginRequest,
                account: accounts[0]
            })
            .then((response: any) => {
                callMsGraph(response.accessToken).then(async response => {
                    const ssoRegistraion = {
                        firstName: response.givenName,
                        lastName: response.surname,
                        email: response.mail,
                        sso: true
                    };
                    try {
                        const res = await httpRequest('POST', `${config.nodeApiUrl}/auth/signup`, ssoRegistraion);
                        if (res.data?.accessToken) {
                            window?.sessionStorage?.setItem('accessToken', JSON.stringify(res.data?.accessToken));
                            window?.sessionStorage?.setItem('firstName', JSON.stringify(res?.data?.user?.firstName));
                            window?.sessionStorage?.setItem('user', JSON.stringify(res?.data?.user));
                            window?.sessionStorage?.setItem('role', JSON.stringify(res?.data?.user?.role));
                            window?.sessionStorage?.setItem('permissions', JSON.stringify(res?.data?.permissions));

                            const resp = await Promise.all([
                                httpRequest('POST', `${config.nodeApiUrl}/builder/tablebuilder/query`, { pageSize: 1000 }),
                                httpRequest('POST', `${config.nodeApiUrl}/builder/formbuilder/query`, { pageSize: 1000 }),
                                httpRequest('POST', `${config.nodeApiUrl}/idp/pre-template`, { pageSize: 1000, custom: true, filters: { deleted: false } }),
                                httpRequest('POST', `${config.nodeApiUrl}/idp/template`, { pageSize: 1000, custom: true, filters: { deleted: false } })
                            ]);
                            window?.sessionStorage?.setItem('tablebuilder', JSON.stringify(resp[0]?.data));
                            window?.sessionStorage?.setItem('formbuilder', JSON.stringify(resp[1]?.data));
                            window?.sessionStorage?.setItem('predefinedTemplates', JSON.stringify(resp[2]?.data));
                            window?.sessionStorage?.setItem('templates', JSON.stringify(resp[3]?.data));

                            toast.success('Logged in successfully');
                            window?.location?.replace('/');
                            // setTimeout(() => {
                            //     window?.location?.replace('/');
                            // }, 500);
                        } else {
                            setState(prev => ({ ...prev, authError: 'Authentication failed. Please try again.' }));
                        }
                    } catch (error: any) {
                        console.error('Google login error:', error);
                        setState(prev => ({ ...prev, authError: 'Failed to login with Google. Please try again.' }));
                    } finally {
                        setState(prev => ({ ...prev, oAuthLoading: false }));
                    }
                });
            });
    }

    return <></>;
};

export default ProfileContent;
