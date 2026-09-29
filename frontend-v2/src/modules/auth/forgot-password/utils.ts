const MAX_EMAIL_LENGTH = 32;

export const validateEmail = (email: string) => {
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!email?.trim()) return 'Email is required';
    if (email.length > MAX_EMAIL_LENGTH) return `Email must be less than ${MAX_EMAIL_LENGTH} characters`;
    if (!emailRegex.test(email)) return 'Invalid email format';
    return '';
};
