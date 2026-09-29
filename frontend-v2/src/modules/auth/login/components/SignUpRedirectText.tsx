import { useNavigate } from 'react-router-dom';

export const SignUpRedirectText = () => {
    const navigate = useNavigate();
    return (
        <section className="mt-6 flex w-full justify-center gap-2">
            <p className="text-sm text-gray-400">Don't have an account?</p>
            <p tabIndex={0} onClick={() => navigate('/auth/signup')} className="cursor-pointer text-sm font-semibold hover:underline">
                Sign up
            </p>
        </section>
    );
};
