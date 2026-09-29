import { DialogComponent } from '../../../../components/DialogComponent';
import { useSignupPageState } from '../hooks/SignupPageStateProvider';

const TermsAndConditionsDialog: React.FC = () => {
    const { state, setState } = useSignupPageState();
    return (
        <DialogComponent
            disableBlurCloseDialog
            className="w-[calc(100vw-100px)] max-w-3xl rounded-lg bg-white p-6 shadow-lg"
            isOpen={state.termsAndConditionsDialog}
            closeDialog={() => setState(prev => ({ ...prev, termsAndConditionsDialog: false }))}
        >
            <div className="flex flex-col space-y-6">
                <div className="space-y-4 text-gray-800">
                    <h1 className="sticky top-0 z-10 bg-white px-4 py-2 text-2xl font-bold text-gray-900">Terms and Conditions for Signing Up to Makez.ai</h1>

                    <p className="text-sm leading-relaxed">
                        Welcome to Makez.ai! These Terms and Conditions ("Agreement") govern your use of the Makez.ai platform ("Platform" or "Service"). By
                        creating an account or otherwise accessing the Platform, you agree to abide by the terms and conditions outlined below. Please read this
                        Agreement carefully before proceeding with the registration process. If you do not agree to these terms, you must refrain from using the
                        Platform.
                    </p>

                    <h2 className="mt-4 text-lg font-semibold">1. Acceptance of Terms</h2>
                    <p className="text-sm leading-relaxed">
                        By signing up for an account on Makez.ai, you (referred to as "User," "You," or "Your") agree to be bound by this Agreement, which forms
                        a legally binding contract between you and Makez.ai, Inc. ("Makez.ai," "We," or "Us"). This Agreement includes all updates, amendments,
                        or modifications made to the terms. If you disagree with any part of these terms, you should not proceed with signing up or accessing
                        the Platform.
                    </p>

                    <h2 className="mt-4 text-lg font-semibold">2. Eligibility to Use the Platform</h2>
                    <p className="text-sm leading-relaxed">
                        To register for an account and use the Platform, you must meet the following eligibility criteria:
                    </p>
                    <ul className="list-inside list-disc space-y-1 text-sm">
                        <li>Age Requirement: You must be at least 18 years old, or the legal age of majority in your jurisdiction, whichever is greater.</li>
                        <li>
                            Legal Capacity: You must have the legal capacity to enter into this Agreement. If you are accessing the Platform on behalf of an
                            organization, you represent and warrant that you have the authority to bind that organization to these terms.
                        </li>
                    </ul>
                    <p className="text-sm leading-relaxed">If you do not meet these eligibility requirements, you must refrain from using the Platform.</p>

                    <h2 className="mt-4 text-lg font-semibold">3. Account Registration</h2>
                    <p className="text-sm leading-relaxed">
                        To access the full range of services provided by Makez.ai, you will need to create an account. During the sign-up process, you are
                        required to provide accurate and up-to-date information, including but not limited to your name, email address, and other necessary
                        details. It is your responsibility to ensure that the information you provide is correct, and you must promptly update your account
                        details if any changes occur.
                    </p>

                    <h2 className="mt-4 text-lg font-semibold">4. User Responsibilities</h2>
                    <p className="text-sm leading-relaxed">
                        As a registered user, you agree to use the Platform responsibly and in compliance with all applicable laws. You are solely responsible
                        for all activities that occur under your account.
                    </p>

                    <h2 className="mt-4 text-lg font-semibold">5. Privacy and Data Protection</h2>
                    <p className="text-sm leading-relaxed">
                        We respect your privacy and are committed to protecting your personal information. By signing up for Makez.ai, you agree to our Privacy
                        Policy, which outlines the types of personal data we collect, how we use it, and how we protect it.
                    </p>

                    <h2 className="mt-4 text-lg font-semibold">6. Contact Information</h2>
                    <p className="text-sm leading-relaxed">
                        If you have any questions or concerns about these Terms and Conditions or any aspect of the Platform, please feel free to contact us at:
                    </p>
                    <p className="text-sm">Email: hello@makez.ai</p>
                    <p className="text-sm">Address: World Trade Centre, Bangalore, Karnataka 560055</p>
                </div>

                <div className="flex justify-end">
                    <button
                        className="rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
                        onClick={() => setState(prev => ({ ...prev, termsAndConditionsDialog: false }))}
                    >
                        Close
                    </button>
                </div>
            </div>
        </DialogComponent>
    );
};

export default TermsAndConditionsDialog;
