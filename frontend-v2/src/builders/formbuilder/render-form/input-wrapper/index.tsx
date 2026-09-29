import { ReactNode } from 'react';
import { FieldIF, FormSettingsIF } from '../../interface';
import styles from './wrapper.module.css';

interface InputWrapperPropsIF {
    children: ReactNode;
    focus: boolean;
    invisibleLabel?: boolean;
    hideLabel?: boolean;
    error: string;
    className?: string;
    field: FieldIF;
    style?: React.CSSProperties | undefined;
}

export const InputWrapper: React.FC<InputWrapperPropsIF> = ({ children, focus, error, field, style, invisibleLabel, hideLabel, className }) => {
    const { config, label } = field;
    const isDisabled = config.disabled;
    const isError = !!error;

    if (config.hidden) return null;

    return (
        <div className={`${styles.container} ${field.config.shrink ? styles.reducedHeight : ''} ${className}`}>
            {!hideLabel && (
                <label className={`${styles.label} ${isDisabled ? styles.labelDisabled : ''}`}>
                    {invisibleLabel ? (
                        <span>&nbsp;</span>
                    ) : (
                        <>
                            {label}
                            {config.mandatory && ' *'}
                        </>
                    )}
                </label>
            )}
            <div
                style={style}
                className={`${styles.inputWrapper} ${
                    isDisabled
                        ? styles.inputWrapperDisabled
                        : focus && isError
                          ? styles.wrapperErrorFocus
                          : focus
                            ? styles.focus
                            : isError
                              ? styles.wrapperError
                              : ''
                }`}
            >
                {children}
            </div>
            {error && <p className={styles.errorMessage}>{error}</p>}
        </div>
    );
};
