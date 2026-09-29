import React from 'react';
import { useToastStore } from './ToastStore';
import { Toast } from './Toast';

export const ToastContainer: React.FC = () => {
    const { toasts, remove } = useToastStore();

    return (
        <div className="pointer-events-none fixed right-0 bottom-0 z-50 max-h-screen space-y-4 overflow-hidden md:p-4">
            {toasts.map(toast => (
                <Toast key={toast.id} {...toast} onClose={remove} />
            ))}
        </div>
    );
};
