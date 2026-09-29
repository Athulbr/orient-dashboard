import { FC } from 'react';
import { ForgotPasswordStateProviderWrapper } from './hooks/ForgotPasswordStateProvider';
import { ForgotPasswordForm } from './components/ForgotPasswordForm';
import { Divider } from '../login/components/Divider';
import { PageHeader } from './components/PageHeader';

const ForgotPasswordPage: FC = () => {
    return (
        <ForgotPasswordStateProviderWrapper>
            <div className="h-auto w-3/5 max-w-90 min-w-82">
                <PageHeader title="Reset Password" subtitle="Enter your email to receive a password reset link" />
                <ForgotPasswordForm />
            </div>
        </ForgotPasswordStateProviderWrapper>
    );
};

export default ForgotPasswordPage;
