import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { lazy } from 'react';

// Lazy-loaded auth pages
const LoginPage = lazy(() => import('../../modules/auth/login'));
const SignUpPage = lazy(() => import('../../modules/auth/signup'));
const ConfirmSignUpPage = lazy(() => import('../../modules/auth/confirm-signup'));
const ConfirmForgotPasswordPage = lazy(() => import('../../modules/auth/confirm-forgot-password'));
const ForgotPasswordPage = lazy(() => import('../../modules/auth/forgot-password'));
const LogoutMessagePage = lazy(() => import('../../modules/auth/logout'));
const AuthLayoutComponent = lazy(() => import('../../modules/auth/AuthLayout'));

const AuthRoutes = () => {
    return (
        <AuthLayoutComponent>
            <Routes>
                <Route path="login" element={<LoginPage />} />
                <Route path="forgot-password" element={<ForgotPasswordPage />} />
                <Route path="forgot-password/verify/:email/:token" element={<ConfirmForgotPasswordPage />} />
                <Route path="signup" element={<SignUpPage />} />
                <Route path="signup/verify/:email/:token" element={<ConfirmSignUpPage />} />
                <Route path="logout-message" element={<LogoutMessagePage />} />

                {/* Default: Redirect to login */}
                <Route path="/" element={<Navigate to="login" replace />} />
                <Route path="*" element={<Navigate to="login" replace />} />
            </Routes>
        </AuthLayoutComponent>
    );
};

export default AuthRoutes;
