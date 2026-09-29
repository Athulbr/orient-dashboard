import React, { useEffect, useCallback } from 'react';
import styles from './dialog.module.css';
import { Button } from '../button';
import { X } from 'lucide-react';

interface DialogProps {
    isOpen: boolean;
    onClose: () => void;
    title?: string;
    children: React.ReactNode;
    primaryButtonText?: string;
    secondaryButtonText?: string;
    onPrimaryClick?: () => void;
    onSecondaryClick?: () => void;
}

export const Dialog: React.FC<DialogProps> = ({
    isOpen,
    onClose,
    title,
    children,
    primaryButtonText,
    secondaryButtonText,
    onPrimaryClick,
    onSecondaryClick
}) => {
    const handleEscape = useCallback(
        (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                onClose();
            }
        },
        [onClose]
    );

    useEffect(() => {
        if (isOpen) {
            document.addEventListener('keydown', handleEscape);
            document.body.style.overflow = 'hidden';
        }

        return () => {
            document.removeEventListener('keydown', handleEscape);
            document.body.style.overflow = 'unset';
        };
    }, [isOpen, handleEscape]);

    if (!isOpen) return null;

    return (
        <div
            className={`${styles.overlay} ${isOpen ? styles.overlayVisible : ''}`}
            onClick={e => {
                if (e.target === e.currentTarget) onClose();
            }}
        >
            <div className={styles.dialog}>
                <div className={styles.header}>
                    {title && <h2 className={styles.title}>{title}</h2>}
                    <button className={styles.closeButton} onClick={onClose} aria-label="Close dialog">
                        <X size={22} />
                    </button>
                </div>
                <div className={styles.content}>{children}</div>
                <div className={styles.footer}>
                    {secondaryButtonText && <Button variant="secondary" onClick={onSecondaryClick} label={secondaryButtonText} />}

                    {primaryButtonText && <Button onClick={onPrimaryClick} label={primaryButtonText} />}
                </div>
            </div>
        </div>
    );
};
