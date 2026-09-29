import React from 'react';
import styles from './button.module.css';

export interface ButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
    variant?: 'primary' | 'secondary' | 'outline';
    size?: 'small' | 'medium' | 'large';
    hidden?: boolean;
    isLoading?: boolean;
    isDisabled?: boolean;
    fullWidth?: boolean;
    leftIcon?: React.ReactNode;
    rightIcon?: React.ReactNode;
    children?: React.ReactNode;
    className?: string;
    loadingType?: 'spinner' | 'dots';
    label?: string;
    width?: string | number;
    height?: string | number;
}

export const Button: React.FC<ButtonProps> = ({
    label,
    variant = 'primary',
    size = 'medium',
    isLoading = false,
    isDisabled = false,
    fullWidth = false,
    leftIcon,
    rightIcon,
    className = '',
    loadingType = 'spinner',
    width,
    height,
    style,
    hidden,
    children,
    ...props
}) => {
    const buttonClasses = [
        styles.button,
        styles[variant],
        styles[size],
        isDisabled && styles.disabled,
        isLoading && styles.loading,
        fullWidth && styles.fullWidth,
        className
    ]
        .filter(Boolean)
        .join(' ');

    const buttonStyle = {
        ...style,
        width: fullWidth ? '100%' : width,
        height: height
    };

    const renderLoadingIndicator = () => {
        if (!isLoading) return null;

        if (loadingType === 'spinner') {
            return <span className={styles.spinner} />;
        }

        return <span className={styles.dots}>Loading</span>;
    };

    if (hidden) return null;

    return (
        <button className={buttonClasses} disabled={isDisabled || isLoading} style={buttonStyle} {...props}>
            {!isLoading && leftIcon && <span className="icon-left">{leftIcon}</span>}
            {isLoading ? renderLoadingIndicator() : label || children}
            {!isLoading && rightIcon && <span className="icon-right">{rightIcon}</span>}
        </button>
    );
};
