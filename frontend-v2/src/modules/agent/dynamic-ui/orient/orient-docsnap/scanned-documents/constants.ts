import { Clock, CheckCircle2, XCircle } from 'lucide-react';
import React from 'react';
import type { StatusConfig } from './types';

// ── Static branch codes ────────────────────────────────────────

export const STATIC_BRANCHES: string[] = [
    'AHMD', 'AMTR', 'BANH', 'BANW', 'BELG', 'CALCT', 'CHAD', 'CHN',
    'COARP', 'COMB', 'COMGR', 'DLHI', 'GURG', 'HYD', 'JLDR', 'KOL',
    'KOLM', 'KTM', 'MNGLR', 'MUMD', 'MUMV', 'PUNE', 'SURAT', 'THRI',
    'TVM', 'VADO'
];

// ── API key ────────────────────────────────────────────────────

export const API_KEY: string = import.meta.env.VITE_WORKFLOW_API_KEY || 'secret1';

// ── Default items per page ─────────────────────────────────────

export const DEFAULT_PAGE_SIZE = 10;

// ── Status visual configuration ────────────────────────────────

export const STATUS_CONFIG: Record<string, StatusConfig> = {
    pending: {
        label: 'Pending',
        icon: React.createElement(Clock, { size: 12 }),
        text: 'text-amber-800',
        bg: 'bg-amber-50',
        border: 'border-amber-200',
        dot: 'bg-amber-400',
        stripe: 'from-amber-400',
        badgeBg: 'bg-amber-100 text-amber-800 border-amber-200'
    },
    extracted: {
        label: 'Extracted',
        icon: React.createElement(Clock, { size: 12 }),
        text: 'text-blue-800',
        bg: 'bg-blue-50',
        border: 'border-blue-200',
        dot: 'bg-blue-400',
        stripe: 'from-blue-400',
        badgeBg: 'bg-blue-100 text-blue-800 border-blue-200'
    },
    success: {
        label: 'Success',
        icon: React.createElement(CheckCircle2, { size: 12 }),
        text: 'text-emerald-800',
        bg: 'bg-emerald-50',
        border: 'border-emerald-200',
        dot: 'bg-emerald-500',
        stripe: 'from-emerald-400',
        badgeBg: 'bg-emerald-100 text-emerald-800 border-emerald-200'
    },
    failed: {
        label: 'Failed',
        icon: React.createElement(XCircle, { size: 12 }),
        text: 'text-red-800',
        bg: 'bg-red-50',
        border: 'border-red-300',
        dot: 'bg-red-500',
        stripe: 'from-red-400',
        badgeBg: 'bg-red-100 text-red-800 border-red-200'
    }
};
