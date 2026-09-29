import React from 'react';
import { CheckCircle2, Clock, XCircle, AlertCircle } from 'lucide-react';

export const DEFAULT_PAGE_SIZE = 10;

export const STATUS_CONFIG: Record<string, { label: string; icon: React.ReactNode; stripe: string; badgeBg: string }> = {
    pending: {
        label: 'Pending',
        icon: <Clock size={12} className="text-amber-500" />,
        stripe: 'from-amber-400',
        badgeBg: 'bg-amber-50 text-amber-700 border-amber-200'
    },
    completed: {
        label: 'Completed',
        icon: <CheckCircle2 size={12} className="text-emerald-500" />,
        stripe: 'from-emerald-400',
        badgeBg: 'bg-emerald-50 text-emerald-700 border-emerald-200'
    },
    failed: {
        label: 'Failed',
        icon: <XCircle size={12} className="text-red-500" />,
        stripe: 'from-red-400',
        badgeBg: 'bg-red-50 text-red-700 border-red-200'
    }
};

// Formatting helpers
export const formatBytes = (bytes?: number): string => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

export const formatDate = (dateString?: string): string => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '-';
    return new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
    }).format(date);
};
