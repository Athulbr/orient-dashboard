import { useToastStore } from '../../../../components/toast/ToastStore';
import { useSignupPageState } from './SignupPageStateProvider';
import { validateConfirmPassword, validateEmail, validateFirstName, validateLastName, validatePassword } from '../utils';
import httpRequest from '../../../../global-utils/httpRequest';
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { config } from '../../../../config/default';

export const useSignupPageApi = () => {
    const { state, setState } = useSignupPageState();
    const toast = useToastStore();

    const navigate = useNavigate();

    // ============================= UseEffect ==================================
    useEffect(() => {
        if (!state.isSubmitClicked) return;
        const firstNameError = validateFirstName(state.firstName);
        const lastNameError = validateLastName(state.lastName);
        const emailError = validateEmail(state.email);
        const passwordError = validatePassword(state.password);
        const confirmPasswordError = validateConfirmPassword(state.password, state.confirmPassword);
        setState(prev => ({
            ...prev,
            fieldError: {
                firstName: firstNameError,
                lastName: lastNameError,
                email: emailError,
                password: passwordError,
                confirmPassword: confirmPasswordError
            }
        }));
    }, [state.email, state.password, state.firstName, state.lastName, state.confirmPassword]);

    // ============================= signup With Email And Password ==================================
    const signupWithEmailAndPassword = async () => {
        setState(prev => ({ ...prev, isSubmitClicked: true }));
        const firstNameError = validateFirstName(state.firstName);
        const lastNameError = validateLastName(state.lastName);
        const emailError = validateEmail(state.email);
        const passwordError = validatePassword(state.password);
        const confirmPasswordError = validateConfirmPassword(state.password, state.confirmPassword);
        if (firstNameError || lastNameError || emailError || passwordError || confirmPasswordError) {
            setState(prev => ({
                ...prev,
                fieldError: {
                    firstName: firstNameError,
                    lastName: lastNameError,
                    email: emailError,
                    password: passwordError,
                    confirmPassword: confirmPasswordError
                }
            }));
            return;
        }
        setState(prev => ({ ...prev, loading: true }));
        try {
            const requestBody = {
                firstName: state.firstName,
                lastName: state.lastName,
                email: state.email,
                password: state.password,
                confirmPassword: state.confirmPassword
            };
            const res = await httpRequest('POST', `${config.nodeApiUrl}/user/signup`, requestBody);
            if (res?.success) setState(prev => ({ ...prev, signUpSuccess: true }));
        } catch (error: any) {
            console.error('error:===========', error.message);
            if (error.message === 'User already exists') return setState(prev => ({ ...prev, authError: 'User already exists' }));
            setState(prev => ({ ...prev, authError: 'Something went wrong' }));
        } finally {
            setState(prev => ({ ...prev, loading: false }));
        }
    };

    // ============================= Return ==================================
    return { signupWithEmailAndPassword };
};
