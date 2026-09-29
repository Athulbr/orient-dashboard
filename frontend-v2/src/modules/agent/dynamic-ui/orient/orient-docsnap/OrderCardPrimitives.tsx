import React from 'react';
import { Coins } from 'lucide-react';
import { CurrencyDetail } from './types';

// ── Status color config ───────────────────────────────────────

export const STATUS_CONFIG: Record<string, { text: string; bg: string; border: string; dot: string; stripe: string }> = {
    PENDING: { text: 'text-amber-800', bg: 'bg-amber-50', border: 'border-amber-200', dot: 'bg-amber-400', stripe: 'from-amber-400' },
    SUBMITTED: { text: 'text-green-800', bg: 'bg-green-50', border: 'border-green-200', dot: 'bg-green-400', stripe: 'from-green-400' },
    EXTRACTED: { text: 'text-blue-800', bg: 'bg-blue-50', border: 'border-blue-200', dot: 'bg-blue-400', stripe: 'from-blue-400' },
    COMPLETED: { text: 'text-emerald-800', bg: 'bg-emerald-50', border: 'border-emerald-200', dot: 'bg-emerald-500', stripe: 'from-emerald-400' },
    REJECTED: { text: 'text-red-800', bg: 'bg-red-50', border: 'border-red-300', dot: 'bg-red-500', stripe: 'from-red-400' },
    DEFAULT: { text: 'text-gray-700', bg: 'bg-gray-100', border: 'border-gray-200', dot: 'bg-gray-400', stripe: 'from-gray-400' }
};

// ── Ghost button ──────────────────────────────────────────────

export const GBtn: React.FC<{
    colorClass: string;
    borderClass: string;
    hoverClass: string;
    icon: React.ReactNode;
    label: string;
    onClick: () => void;
    disabled?: boolean;
}> = ({ colorClass, borderClass, hoverClass, icon, label, onClick, disabled }) => (
    <button
        onClick={onClick}
        disabled={disabled}
        className={`inline-flex items-center gap-1 px-[12px] py-[6px] rounded-md ${disabled ? 'cursor-not-allowed opacity-50' : `cursor-pointer ${hoverClass}`} text-xs font-bold border bg-transparent font-[inherit] transition-colors duration-150 ${colorClass} ${borderClass}`}
    >
        {icon}
        {label}
    </button>
);

// ── Column icon ───────────────────────────────────────────────

export const ColIcon: React.FC<{ bg: string; border: string; children: React.ReactNode }> = ({ bg, border, children }) => (
    <div className={`w-7 h-7 rounded-[7px] ${bg} ${border} border flex items-center justify-center flex-shrink-0`}>{children}</div>
);

// ── Column count badge ────────────────────────────────────────

export const ColCount: React.FC<{ colorClass: string; bgClass: string; borderClass: string; n: number }> = ({ colorClass, bgClass, borderClass, n }) => (
    <span className={`text-xs font-extrabold ${colorClass} ${bgClass} border ${borderClass} px-[7px] py-[1px] rounded-full leading-[1.8]`}>{n}</span>
);

// ── Currency mini-card ────────────────────────────────────────

export const CurrencyMiniCard: React.FC<{ item: CurrencyDetail }> = ({ item }) => (
    <div className="flex items-center gap-3 bg-slate-50/50 border border-slate-200 rounded-lg px-3 py-1.5 transition-all hover:bg-white hover:shadow-md hover:border-blue-200 group">
        <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded flex items-center justify-center bg-blue-50 text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-all duration-300">
                <Coins size={11} />
            </div>
            <span className="text-xs font-extrabold text-slate-700 tracking-tight leading-none group-hover:text-blue-700">{item.currency}</span>
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest bg-white px-1.5 py-0.5 rounded border border-slate-100 group-hover:border-blue-100">{item.product}</span>
        </div>

        <div className="h-3 w-[1px] bg-slate-200" />

        <div className="text-[10px] text-slate-500 font-semibold flex items-center gap-1">
            <span>{item.quantity.toLocaleString()}</span>
            <span className="text-slate-300">×</span>
            <span>{item.rate.toLocaleString()}</span>
        </div>

        <div className="text-xs font-black text-slate-900 ml-1">₹{item.amount.toLocaleString()}</div>
    </div>
);
