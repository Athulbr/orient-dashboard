import { create } from 'zustand';

interface AlertStore {
    alertText: string;
    isOpen: boolean;
    primaryButtonText?: string;
    secondaryButtonText?: string;
    hideCancelButton?: boolean;
    onPrimaryAction?: () => void;
    onSecondaryAction?: () => void;
    showAlert: (options: {
        alertText: string;
        primaryButtonText?: string;
        secondaryButtonText?: string;
        hideCancelButton?: boolean;
        onPrimaryAction?: () => void;
        onSecondaryAction?: () => void;
    }) => void;
    closeAlert: () => void;
}

export const useAlertStore = create<AlertStore>(set => ({
    alertText: '',
    isOpen: false,
    primaryButtonText: undefined,
    secondaryButtonText: 'Cancel',
    hideCancelButton: false,
    onPrimaryAction: undefined,
    onSecondaryAction: undefined,
    showAlert: ({ alertText, primaryButtonText, secondaryButtonText = 'Cancel', hideCancelButton = false, onPrimaryAction, onSecondaryAction }) => {
        set({
            alertText,
            isOpen: true,
            primaryButtonText,
            secondaryButtonText,
            hideCancelButton,
            onPrimaryAction,
            onSecondaryAction
        });
    },
    closeAlert: () =>
        set({
            isOpen: false,
            alertText: '',
            primaryButtonText: undefined,
            secondaryButtonText: 'Cancel',
            hideCancelButton: false,
            onPrimaryAction: undefined,
            onSecondaryAction: undefined
        })
}));
