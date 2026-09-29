import { create } from 'zustand';

export type ToastType = 'info' | 'success' | 'warning' | 'error';

export interface Toast {
    id: string;
    title?: string;
    message: string;
    type: ToastType;
    duration?: number;
    createdAt: number;
}

export interface ToastStore {
    toasts: Toast[];
    toast: (message: string, options?: ToastOptions) => string;
    info: (message: string, options?: Omit<ToastOptions, 'type'>) => string;
    success: (message: string, options?: Omit<ToastOptions, 'type'>) => string;
    warning: (message: string, options?: Omit<ToastOptions, 'type'>) => string;
    error: (message: string, options?: Omit<ToastOptions, 'type'>) => string;
    remove: (id: string) => void;
    clearAll: () => void;
}

export interface ToastOptions {
    title?: string;
    duration?: number;
    type?: ToastType;
}

const generateId = () => Math.random().toString(36).substring(2, 9);

export const useToastStore = create<ToastStore>((set, get) => ({
    toasts: [],

    toast: (message, options) => {
        const { type = 'info', title, duration } = options || {};
        const id = generateId();
        const newToast: Toast = {
            id,
            message,
            title,
            type,
            duration: duration || 6000,
            createdAt: Date.now()
        };

        set(state => ({
            toasts: [...state.toasts, newToast]
        }));

        return id;
    },

    info: (message, options) => {
        return get().toast(message, { ...options, type: 'info' });
    },

    success: (message, options) => {
        return get().toast(message, { ...options, type: 'success' });
    },

    warning: (message, options) => {
        return get().toast(message, { ...options, type: 'warning' });
    },

    error: (message, options) => {
        return get().toast(message, { ...options, type: 'error' });
    },

    remove: id => {
        set(state => ({
            toasts: state.toasts.filter(toast => toast.id !== id)
        }));
    },

    clearAll: () => {
        set({ toasts: [] });
    }
}));
