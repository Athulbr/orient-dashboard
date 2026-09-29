import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import httpRequest from '../../../global-utils/httpRequest';
import Spinner from '../../../components/Spinner';
import { useToastStore } from '../../../components/toast/ToastStore';
import { config } from '../../../config/default';

const ConfirmSignUpPage: React.FC = () => {
    const { email, token } = useParams();
    const [loading, setLoading] = useState(false);
    const toast = useToastStore();

    const verifySignupToken = async () => {
        try {
            setLoading(true);
            const res: any = await httpRequest('POST', `${config.nodeApiUrl}/user/signup/verify`, { email, firstLoginToken: token });
            if (res?.data?.accessToken) {
                window?.sessionStorage?.setItem('accessToken', JSON.stringify(res?.data?.accessToken));
                window?.sessionStorage?.setItem('user', JSON.stringify(res?.data?.user));
                // window?.sessionStorage?.setItem('firstName', JSON.stringify(res?.data?.user?.firstName));
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
                toast.success('Verification successful');
                window?.location?.replace('/');
            } else {
                // show server-provided message when available
                const message = res?.message || 'Verification failed. Please try again';
                toast.error(message);
            }
        } catch (error) {
            console.error('error:===========', error);
            const errMsg = (error as any)?.message || 'Verification failed. Please try again.';
            toast.error(errMsg);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!email || !token) return;
        verifySignupToken();
    }, [email, token]);

    return (
        <div className="mt-10 w-full max-w-md space-y-6 rounded-xl bg-white p-8">
            <div className="text-center">
                <h1 className="text-2xl font-bold text-gray-900">Email Verification</h1>
                <p className="mt-2 text-gray-600">We're verifying your email address</p>
            </div>

            <div className="space-y-4">
                {email && (
                    <div className="rounded-lg border border-blue-100 bg-blue-50 p-4">
                        <p className="text-sm font-medium text-blue-800">Email Address</p>
                        <p className="mt-1 text-blue-700">{email}</p>
                    </div>
                )}

                {token && (
                    <div className="rounded-lg border border-green-100 bg-green-50 p-4">
                        <p className="text-sm font-medium text-green-800">Verification Code</p>
                        <p className="mt-1 truncate font-mono tracking-wider text-green-700">{token}</p>
                    </div>
                )}

                {loading && (
                    <div className="pt-4">
                        <div className="flex items-center justify-center">
                            <Spinner size={20} />
                        </div>
                        <p className="mt-3 text-center text-sm text-gray-500">Verifying your information...</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ConfirmSignUpPage;
