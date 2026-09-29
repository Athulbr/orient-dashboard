import { useForgotPasswordState } from './ForgotPasswordStateProvider';
import { validateEmail } from '../../login/utils';
import httpRequest from '../../../../global-utils/httpRequest';
import { useToastStore } from '../../../../components/toast/ToastStore';
import { config } from '../../../../config/default';

export const useForgotPasswordApi = () => {
    const { state, setState } = useForgotPasswordState();
    const toast = useToastStore();

    const handleForgotPassword = async () => {
        setState(prev => ({ ...prev, isSubmitClicked: true }));

        // Validate email
        const emailError = validateEmail(state.email);
        if (emailError) {
            setState(prev => ({
                ...prev,
                fieldError: { ...prev.fieldError, email: emailError }
            }));
            return;
        }

        setState(prev => ({ ...prev, loading: true, error: '' }));

        try {
            const response = await httpRequest('POST', `${config.nodeApiUrl}/user/forgot/password`, { email: state.email });

            if (response.success) {
                setState(prev => ({ ...prev, success: true }));
                toast.success('Password reset link sent to your email');
            } else {
                throw new Error(response.message || 'Failed to send reset link');
            }
        } catch (error: any) {
            console.error('Forgot password error:', error);
            setState(prev => ({
                ...prev,
                error: 'Failed to send reset link. Please try again.'
            }));
        } finally {
            setState(prev => ({ ...prev, loading: false }));
        }
    };

    return {
        handleForgotPassword
    };
};
