import { describe, it, expect, beforeEach } from 'vitest';
import { useAuthStore } from '../AuthStore';
import { validateEmail, validatePassword } from '../login/utils';
import {
    validateEmail as validateSignupEmail,
    validatePassword as validateSignupPassword,
    validateConfirmPassword,
    validateFirstName,
    validateLastName
} from '../signup/utils';

describe('AuthStore', () => {
    beforeEach(() => {
        // Reset store state before each test
        useAuthStore.setState({ user: null });
    });

    describe('Initial State', () => {
        it('should have null user initially', () => {
            const { user } = useAuthStore.getState();
            expect(user).toBeNull();
        });
    });

    describe('setUser', () => {
        it('should set user correctly', () => {
            const { setUser } = useAuthStore.getState();
            const mockUser = { firstName: 'John' };

            setUser(mockUser);

            const { user } = useAuthStore.getState();
            expect(user).toEqual(mockUser);
        });

        it('should clear user when set to null', () => {
            const { setUser } = useAuthStore.getState();
            const mockUser = { firstName: 'John' };

            setUser(mockUser);
            expect(useAuthStore.getState().user).toEqual(mockUser);

            setUser(null);
            expect(useAuthStore.getState().user).toBeNull();
        });

        it('should update user when called multiple times', () => {
            const { setUser } = useAuthStore.getState();

            setUser({ firstName: 'John' });
            expect(useAuthStore.getState().user?.firstName).toBe('John');

            setUser({ firstName: 'Jane' });
            expect(useAuthStore.getState().user?.firstName).toBe('Jane');
        });
    });
});

describe('Login Utils', () => {
    describe('validateEmail', () => {
        it('should return error for empty email', () => {
            expect(validateEmail('')).toBe('Email is required');
        });

        it('should return error for whitespace-only email', () => {
            expect(validateEmail('   ')).toBe('Email is required');
        });

        it('should return error for email exceeding max length', () => {
            const longEmail = 'a'.repeat(30) + '@test.com';
            expect(validateEmail(longEmail)).toBe('Email must be less than 32 characters');
        });

        it('should return error for invalid email format - no @', () => {
            expect(validateEmail('invalidemail')).toBe('Invalid email format');
        });

        it('should return error for invalid email format - no domain', () => {
            expect(validateEmail('test@')).toBe('Invalid email format');
        });

        it('should return error for invalid email format - no TLD', () => {
            expect(validateEmail('test@domain')).toBe('Invalid email format');
        });

        it('should return error for invalid email format - single char TLD', () => {
            expect(validateEmail('test@domain.c')).toBe('Invalid email format');
        });

        it('should return empty string for valid email', () => {
            expect(validateEmail('test@example.com')).toBe('');
        });

        it('should return empty string for valid email with subdomain', () => {
            expect(validateEmail('test@sub.example.com')).toBe('');
        });

        it('should return empty string for valid email with plus sign', () => {
            expect(validateEmail('test+tag@example.com')).toBe('');
        });
    });

    describe('validatePassword', () => {
        it('should return error for empty password', () => {
            expect(validatePassword('')).toBe('Password is required');
        });

        it('should return error for whitespace-only password', () => {
            expect(validatePassword('   ')).toBe('Password is required');
        });

        it('should return error for password shorter than 6 characters', () => {
            expect(validatePassword('12345')).toBe('Password must be at least 6 characters');
        });

        it('should return error for password exceeding max length', () => {
            const longPassword = 'a'.repeat(33);
            expect(validatePassword(longPassword)).toBe('Password must be less than 32 characters');
        });

        it('should return empty string for valid password', () => {
            expect(validatePassword('password123')).toBe('');
        });

        it('should return empty string for password at minimum length', () => {
            expect(validatePassword('123456')).toBe('');
        });

        it('should return empty string for password at maximum length', () => {
            expect(validatePassword('a'.repeat(32))).toBe('');
        });
    });
});

describe('Signup Utils', () => {
    describe('validateEmail', () => {
        it('should return error for empty email', () => {
            expect(validateSignupEmail('')).toBe('Email is required');
        });

        it('should return error for invalid email format', () => {
            expect(validateSignupEmail('notanemail')).toBe('Invalid email format');
        });

        it('should return empty string for valid email', () => {
            expect(validateSignupEmail('user@example.com')).toBe('');
        });
    });

    describe('validatePassword', () => {
        it('should return error for empty password', () => {
            expect(validateSignupPassword('')).toBe('Password is required');
        });

        it('should return error for short password', () => {
            expect(validateSignupPassword('12345')).toBe('Password must be at least 6 characters');
        });

        it('should return empty string for valid password', () => {
            expect(validateSignupPassword('password123')).toBe('');
        });
    });

    describe('validateConfirmPassword', () => {
        it('should return error for empty confirm password', () => {
            expect(validateConfirmPassword('password123', '')).toBe('Confirm Password is required');
        });

        it('should return error for short confirm password', () => {
            expect(validateConfirmPassword('password123', '12345')).toBe('Confirm Password must be at least 6 characters');
        });

        it('should return error when passwords do not match', () => {
            expect(validateConfirmPassword('password123', 'password456')).toBe('Password and Confirm Password do not match');
        });

        it('should return empty string when passwords match', () => {
            expect(validateConfirmPassword('password123', 'password123')).toBe('');
        });
    });

    describe('validateFirstName', () => {
        it('should return error for empty first name', () => {
            expect(validateFirstName('')).toBe('Name is required');
        });

        it('should return error for whitespace-only first name', () => {
            expect(validateFirstName('   ')).toBe('Name is required');
        });

        it('should return error for first name with numbers', () => {
            expect(validateFirstName('John123')).toBe('Invalid firstname');
        });

        it('should return error for first name with special characters', () => {
            expect(validateFirstName('John@Doe')).toBe('Invalid firstname');
        });

        it('should return empty string for valid first name', () => {
            expect(validateFirstName('John')).toBe('');
        });

        it('should return empty string for first name with spaces', () => {
            expect(validateFirstName('John Paul')).toBe('');
        });
    });

    describe('validateLastName', () => {
        it('should return error for empty last name', () => {
            expect(validateLastName('')).toBe('Name is required');
        });

        it('should return error for whitespace-only last name', () => {
            expect(validateLastName('   ')).toBe('Name is required');
        });

        it('should return error for last name with numbers', () => {
            expect(validateLastName('Doe123')).toBe('Invalid lastname');
        });

        it('should return error for last name with special characters', () => {
            expect(validateLastName('Doe-Smith')).toBe('Invalid lastname');
        });

        it('should return empty string for valid last name', () => {
            expect(validateLastName('Doe')).toBe('');
        });

        it('should return empty string for last name with spaces', () => {
            expect(validateLastName('Van Gogh')).toBe('');
        });
    });
});
