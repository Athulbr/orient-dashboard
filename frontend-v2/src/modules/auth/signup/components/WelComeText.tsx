import { useSignupPageState } from '../hooks/SignupPageStateProvider';

export const WelComeText = () => {
    const { state } = useSignupPageState();
    return (
        <section className="mt-8 flex flex-col gap-1">
            {state.signUpSuccess ? (
                <div className="flex h-50 w-full items-center justify-center border-t border-b text-sm text-gray-500">
                    Please check your inbox to verify your email address.
                </div>
            ) : (
                <>
                    <h1 className="text-[32px] font-bold">Welcome!</h1>
                    <p className="text-sm text-gray-500">Please enter your name, email and password to sign up</p>
                </>
            )}
        </section>
    );
};
