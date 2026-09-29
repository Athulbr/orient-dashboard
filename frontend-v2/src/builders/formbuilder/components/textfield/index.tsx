import React, { forwardRef } from 'react';
import styles from './textfield.module.css';

export interface TextFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
    label?: string;
    error?: string;
    fullWidth?: boolean;
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(({ label, error, className, ...props }, ref) => {
    return (
        <div className={styles.textFieldContainer}>
            {label && (
                <label className={styles.label} htmlFor={props.id}>
                    {label}
                </label>
            )}
            <div className={`${styles.inputWrapper} ${error ? styles.error : ''}`}>
                <input
                    ref={ref}
                    className={`${styles.input} ${className || ''}`}
                    aria-invalid={!!error}
                    aria-describedby={error ? `${props.id}-error` : undefined}
                    {...props}
                />
            </div>
            {error && (
                <span className={styles.errorMessage} id={`${props.id}-error`} role="alert">
                    {error}
                </span>
            )}
        </div>
    );
});
