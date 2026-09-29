import { Key } from 'lucide-react';
import { loginRequest } from '../sso/msal-config';
import { useParams } from 'react-router-dom';
import { useToastStore } from '../../../../components/toast/ToastStore';
import { useLoginPageState } from './LoginPageStateProvider';
import { validateEmail, validatePassword } from '../utils';
import httpRequest from '../../../../global-utils/httpRequest';
import { useGoogleLogin } from '@react-oauth/google';
import { useMsal } from '@azure/msal-react';
import { useEffect } from 'react';
import { usePermissionStore } from '../../../../zustand-store/PermissionStore';
import { config } from '../../../../config/default';

export const useLoginPageApi = () => {
    const { instance, accounts } = useMsal();
    const { state, setState } = useLoginPageState();
    const { settings, checkPermission, setPermissions } = usePermissionStore();
    const toast = useToastStore();

    // ============================= UseEffect ==================================
    useEffect(() => {
        if (!state.isSubmitClicked) return;
        const emailError = validateEmail(state.email);
        const passwordError = validatePassword(state.password);
        setState(prev => ({ ...prev, fieldError: { email: emailError, password: passwordError } }));
    }, [state.email, state.password]);

    // ============================= login With Email And Password ==================================
    const loginWithEmailAndPassword = async () => {
        //===== only for developers ======
        const autoLoginCredential = window?.localStorage?.getItem('auto_login') === 'true' ? { email: 'superadmin@makez.ai', password: 'Makez#321' } : null;
        //===== only for developers ======
        if (!autoLoginCredential) {
            setState(prev => ({ ...prev, isSubmitClicked: true }));
            const emailError = validateEmail(state.email);
            const passwordError = validatePassword(state.password);
            if (emailError || passwordError) {
                setState(prev => ({ ...prev, fieldError: { email: emailError, password: passwordError } }));
                return;
            }
        }
        setState(prev => ({ ...prev, loading: true }));

        try {
            const res = await httpRequest('POST', `${config.nodeApiUrl}/auth/login`, autoLoginCredential ? autoLoginCredential : { email: state.email, password: state.password });
            if (res?.data?.accessToken) {
                window?.sessionStorage?.setItem('accessToken', JSON.stringify(res?.data?.accessToken));
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
                // window?.sessionStorage?.setItem('branch_code', 'KOLM');
                // window?.sessionStorage?.setItem('branch_id', '12');

                toast.success('Logged in successfully');
                const permission: any = JSON.parse(window?.sessionStorage?.getItem('permissions') || '[]');
                let reconsileUser = false;
                for (let index = 0; index < permission?.length; index++) {
                    const element = permission[index].key;
                    if (element === 'read:reconsile') {
                        reconsileUser = true;
                        break;
                    }
                }
                if (reconsileUser) {
                    window?.location?.replace('/reconcilation/list');
                } else {
                    window?.location?.replace('/');
                }
            } else {
                setState(prev => ({ ...prev, authError: 'Login failed. Please check your credentials.' }));
            }
        } catch (error: any) {
            console.error('error:===========', error.message);
            if (error.message === 'Invalid password') return setState(prev => ({ ...prev, authError: 'Invalid Credentials' }));
            if (error.message === 'Invalid email') return setState(prev => ({ ...prev, authError: 'Invalid Credentials' }));

            setState(prev => ({ ...prev, authError: error.message }));
        } finally {
            setState(prev => ({ ...prev, loading: false }));
        }
    };

    // ============================= login With Google ==================================
    const loginWithGoogle = useGoogleLogin({
        onSuccess: async (response: any) => {
            try {
                setState(prev => ({ ...prev, oAuthLoading: true, authError: '' }));

                const user = await httpRequest('POST', `${config.nodeApiUrl}/auth/google/userinfo`, { access_token: response?.access_token });
                const ssoRegistration = {
                    firstName: user.given_name,
                    lastName: user.family_name,
                    email: user.email,
                    sso: true
                };
                const res = await httpRequest('POST', `${config.nodeApiUrl}/auth/signup`, ssoRegistration);
                if (res.data?.accessToken) {
                    window?.sessionStorage?.setItem('accessToken', JSON.stringify(res.data?.accessToken));
                    window?.sessionStorage?.setItem('firstName', JSON.stringify(res?.data?.user?.firstName));
                    window?.sessionStorage?.setItem('user', JSON.stringify(res?.data?.user));
                    window?.sessionStorage?.setItem('permissions', JSON.stringify(res?.data?.permissions));
                    // window?.sessionStorage?.setItem('role', JSON.stringify(res?.data?.role));
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
                    window?.location?.replace('/');
                } else {
                    setState(prev => ({ ...prev, authError: 'Authentication failed. Please try again.' }));
                }
            } catch (error: any) {
                console.error('Google login error:', error);
                setState(prev => ({ ...prev, authError: 'Failed to login with Google. Please try again.' }));
            } finally {
                setState(prev => ({ ...prev, oAuthLoading: false }));
            }
        },
        onError: error => {
            console.error('Google Login Failed:', error);
            setState(prev => ({ ...prev, oAuthLoading: false, authError: 'Failed to connect to Google. Please try again.' }));
        }
    });

    // ============================= login With MSAL ==================================
    const loginWithMSAL = async () => {
        console.info('Login with Microsoft initiated');
        instance.loginRedirect(loginRequest).catch(e => {
            console.error('Sign In issue---->', e);
        });
    };

    // ============================= login With PHP Session ==================================
    const loginWithPhpSession = async (sessionToken: string, clientId: string, orderNumber?: string, orderType?: string) => {
        try {
            setState(prev => ({ ...prev, oAuthLoading: true, authError: '' }));
            const res = await httpRequest('POST', `${config.nodeApiUrl}/auth/bootstrap`, { token: sessionToken, client_id: clientId, order_no: orderNumber });
            if (res.data?.accessToken) {
                window?.sessionStorage?.setItem('accessToken', JSON.stringify(res.data?.accessToken));
                window?.sessionStorage?.setItem('reactLoginTime', Date.now().toString());
                if (res.data?.orientClientId) {
                    window?.sessionStorage?.setItem('orientClientId', res.data.orientClientId);
                }
                if (orderNumber) {
                    window?.sessionStorage?.setItem('order_no', orderNumber);
                }
                if (res.data?.branchCode) {
                    window?.sessionStorage?.setItem('branch_code', res.data.branchCode);
                }
                if (res.data?.branchId) {
                    window?.sessionStorage?.setItem('branch_id', res.data.branchId);
                }

                window?.sessionStorage?.setItem('firstName', JSON.stringify(res?.data?.user?.firstName));
                window?.sessionStorage?.setItem('user', JSON.stringify(res?.data?.user));
                window?.sessionStorage?.setItem('permissions', JSON.stringify(res?.data?.permissions));

                // const resp = await Promise.all([
                //     httpRequest('POST', `${config.nodeApiUrl}/builder/tablebuilder/query`, { pageSize: 1000 }),
                //     httpRequest('POST', `${config.nodeApiUrl}/builder/formbuilder/query`, { pageSize: 1000 }),
                //     httpRequest('POST', `${config.nodeApiUrl}/idp/pre-template`, { pageSize: 1000, custom: true, filters: { deleted: false } }),
                //     httpRequest('POST', `${config.nodeApiUrl}/idp/template`, { pageSize: 1000, custom: true, filters: { deleted: false } })
                // ]);
                // window?.sessionStorage?.setItem('tablebuilder', JSON.stringify(resp[0]?.data));
                // window?.sessionStorage?.setItem('formbuilder', JSON.stringify(resp[1]?.data));
                // window?.sessionStorage?.setItem('predefinedTemplates', JSON.stringify(resp[2]?.data));
                // window?.sessionStorage?.setItem('templates', JSON.stringify(resp[3]?.data));
                window?.location?.replace('/agent/run/Document Extractor');
            } else {
                setState(prev => ({ ...prev, authError: 'Authentication with Orient session failed.', oAuthLoading: false }));
            }
        } catch (error: any) {
            console.error('Orient Session login error:', error);
            setState(prev => ({ ...prev, authError: 'Please open from Orient portal', oAuthLoading: false }));
        }
    };

    useEffect(() => {
        // Intercept native URL query strings to safely decode '+' literal symbols preserving base64 tokens before Space corruption
        const rawSearch = window.location.search.replace(/\+/g, '%2B');
        const queryParams = new URLSearchParams(rawSearch);

        const sessionToken = queryParams.get('token');
        const clientId = queryParams.get('client_id');
        const orderNumber = queryParams.get('order_no');

        if (sessionToken && clientId) {
            window.history.replaceState({}, document.title, window.location.pathname);
            loginWithPhpSession(sessionToken, clientId, orderNumber || undefined);
        } else {
            // No token present — Show login page.
        }
    }, []);

    // ============================= Return ==================================
    return { loginWithEmailAndPassword, loginWithGoogle, loginWithMSAL, loginWithPhpSession };
};
