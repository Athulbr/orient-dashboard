export const validateEmail = (email: string) => {
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!email?.trim()) return 'Email is required';
    if (!emailRegex.test(email)) return 'Invalid email format';
    return '';
};
export const validatePassword = (password: string) => {
    if (!password?.trim()) return 'Password is required';
    if (password?.trim().length < 6) return 'Password must be at least 6 characters';
    return '';
};
export const validateConfirmPassword = (password: string, confirmPassword: string) => {
    if (!confirmPassword?.trim()) return 'Confirm Password is required';
    if (confirmPassword?.trim().length < 6) return 'Confirm Password must be at least 6 characters';
    if (password !== confirmPassword) return 'Password and Confirm Password do not match';
    return '';
};
export const validateFirstName = (firstName: string) => {
    if (!firstName?.trim()) return 'Name is required';
    if (!/^[a-zA-Z ]+$/.test(firstName)) return 'Invalid firstname';
    return '';
};
export const validateLastName = (lastName: string) => {
    if (!lastName?.trim()) return 'Name is required';
    if (!/^[a-zA-Z ]+$/.test(lastName)) return 'Invalid lastname';
    return '';
};
