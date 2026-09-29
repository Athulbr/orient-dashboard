import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { MuiPasswordTextField } from '../../../components/MuiPasswordTextField';
import { Button } from '../../../components/Button';
import Spinner from '../../../components/Spinner';
import { useToastStore } from '../../../components/toast/ToastStore';
import { CircleX } from 'lucide-react';
import httpRequest from '../../../global-utils/httpRequest';
import { config } from '../../../config/default';

interface ConfirmForgotPasswordPageIF {
    test?: string;
}

const ConfirmForgotPasswordPage: React.FC<ConfirmForgotPasswordPageIF> = () => {
    const { email, token } = useParams<{ email: string; token: string }>();
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [passwordError, setPasswordError] = useState('');
    const [confirmPasswordError, setConfirmPasswordError] = useState('');
    const toast = useToastStore();
    const navigate = useNavigate();

    const validatePassword = (value: string) => {
        if (!value) {
            setPasswordError('Password is required');
            return false;
        }
        if (value.length < 8) {
            setPasswordError('Password must be at least 8 characters long');
            return false;
        }
        setPasswordError('');
        return true;
    };

    const validateConfirmPassword = (value: string) => {
        if (!value) {
            setConfirmPasswordError('Please confirm your password');
            return false;
        }
        if (value !== password) {
            setConfirmPasswordError('Passwords do not match');
            return false;
        }
        setConfirmPasswordError('');
        return true;
    };

    const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        setPassword(value);

        // Clear general error when user starts typing
        if (error) setError('');

        // Validate password if user has already interacted with it
        if (value || passwordError) {
            validatePassword(value);
        }

        // Re-validate confirm password if it exists and passwords don't match
        if (confirmPassword && confirmPassword !== value) {
            setConfirmPasswordError('Passwords do not match');
        } else if (confirmPassword && confirmPassword === value) {
            setConfirmPasswordError('');
        }
    };

    const handleConfirmPasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        setConfirmPassword(value);

        // Clear general error when user starts typing
        if (error) setError('');

        // Validate confirm password if user has already interacted with it
        if (value || confirmPasswordError) {
            validateConfirmPassword(value);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        // Clear previous errors
        setError('');
        setPasswordError('');
        setConfirmPasswordError('');

        // Validate all fields
        const isPasswordValid = validatePassword(password);
        const isConfirmPasswordValid = validateConfirmPassword(confirmPassword);

        if (!isPasswordValid || !isConfirmPasswordValid) {
            return;
        }

        try {
            setLoading(true);

            // TODO: Replace with actual API call
            const response = await httpRequest('POST', `${config.nodeApiUrl}/user/forgot/password/verify`, { email, token, password });

            toast.success('Password reset successfully!');
            navigate('/login');
        } catch (err) {
            console.error('Password reset failed:', err);
            setError('Failed to reset password. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex items-center justify-center px-4 py-8 sm:px-6 lg:px-8">
            <div className="w-full max-w-md space-y-4">
                <div>
                    <h2 className="text-center text-3xl font-semibold text-gray-900">Reset Your Password</h2>
                    <p className="mt-2 text-center text-sm text-gray-600">Enter your new password below</p>
                </div>

                {error && (
                    <div className="rounded-md bg-red-50 p-4">
                        <div className="flex">
                            <h3 className="text-sm text-red-500">{error}</h3>
                        </div>
                    </div>
                )}

                <form className="space-y-6" onSubmit={handleSubmit}>
                    <div className="flex flex-col gap-2 rounded-md">
                        <MuiPasswordTextField errorMessage={passwordError} label="New Password" value={password} onChange={handlePasswordChange} />
                        <MuiPasswordTextField
                            errorMessage={confirmPasswordError}
                            label="Confirm New Password"
                            value={confirmPassword}
                            onChange={handleConfirmPasswordChange}
                        />
                    </div>

                    <div>
                        <Button type="submit" className="w-full bg-black" disabled={loading}>
                            {loading ? (
                                <div className="flex items-center">
                                    <Spinner size={20} className="mr-2" />
                                    Resetting Password...
                                </div>
                            ) : (
                                'Reset Password'
                            )}
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default ConfirmForgotPasswordPage;
