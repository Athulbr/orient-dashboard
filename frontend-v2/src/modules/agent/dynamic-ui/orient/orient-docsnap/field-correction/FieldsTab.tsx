import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronRight, Hash, Database, Search, X, Clock } from 'lucide-react';
import { fetchCorrectedFields, fetchFieldOrders } from './api';
import { Button } from '../../../../../../components/Button';

interface CorrectedField {
    _id: string;
    path: string;
    correctionCount: number;
}

interface FieldDetails {
    _id: string;
    path: string;
    corrections: Array<{
        value: string;
        initialValue: string;
        submittedAt?: string;
        correctedOrderId: {
            _id: string;
            orderNumber: number;
            orderType: string;
            eonNumber: string;
        };
    }>;
}

const formatLabel = (path: string) => {
    return path
        .split('.')
        .map(part => {
            const spaced = part.replace(/_/g, ' ');
            return spaced.charAt(0).toUpperCase() + spaced.slice(1);
        })
        .join(' > ');
};

const formatSubmittedAt = (dateStr?: string) => {
    if (!dateStr) return null;
    try {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return null;
        return d.toLocaleString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        });
    } catch (e) {
        return null;
    }
};

interface FieldsTabProps {
    dateRange: { startDate: string; endDate: string };
    searchTerm?: string;
}

const FieldsTab: React.FC<FieldsTabProps> = ({ dateRange, searchTerm }) => {
    const navigate = useNavigate();
    const [fields, setFields] = useState<CorrectedField[]>([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalCount, setTotalCount] = useState(0);
    const [totalCorrections, setTotalCorrections] = useState(0);
    const [expandedFieldId, setExpandedFieldId] = useState<string | null>(null);
    const [fieldDetails, setFieldDetails] = useState<Record<string, FieldDetails>>({});
    const [detailsLoading, setDetailsLoading] = useState<Record<string, boolean>>({});
    const [valueSearch, setValueSearch] = useState<string>('');

    const loadFields = async (p: number) => {
        try {
            setLoading(true);
            const res = await fetchCorrectedFields(p, 20, dateRange.startDate, dateRange.endDate, searchTerm);
            if (res.success) {
                const sortedFields = [...res.data].sort((a: CorrectedField, b: CorrectedField) => b.correctionCount - a.correctionCount);
                setFields(sortedFields);
                setTotalPages(res.pagination.totalPages);
                setTotalCount(res.pagination.total || 0);
                setTotalCorrections(res.pagination.totalCorrections ?? sortedFields.reduce((acc, f) => acc + (f.correctionCount || 0), 0));
                setPage(res.pagination.page);
            }
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const timer = setTimeout(() => {
            setExpandedFieldId(null);
            setFieldDetails({});
            setValueSearch('');
            loadFields(1);
        }, 250);

        return () => clearTimeout(timer);
    }, [dateRange, searchTerm]);

    const toggleField = async (fieldId: string) => {
        setValueSearch('');
        if (expandedFieldId === fieldId) {
            setExpandedFieldId(null);
            return;
        }

        setExpandedFieldId(fieldId);

        // Fetch details if not already loaded
        if (!fieldDetails[fieldId]) {
            try {
                setDetailsLoading(prev => ({ ...prev, [fieldId]: true }));
                const res = await fetchFieldOrders(fieldId, dateRange.startDate, dateRange.endDate);
                if (res.success) {
                    setFieldDetails(prev => ({ ...prev, [fieldId]: res.data }));
                }
            } catch (error) {
                console.error(error);
            } finally {
                setDetailsLoading(prev => ({ ...prev, [fieldId]: false }));
            }
        }
    };

    if (loading && fields.length === 0) {
        return <div className="p-8 text-center text-gray-500">Loading fields...</div>;
    }

    return (
        <div className="flex flex-col h-full overflow-hidden">
            <div className="flex-1 overflow-auto">
                <table className="w-full text-left border-collapse">
                    <thead className="sticky top-0 z-10 bg-gray-50 shadow-sm">
                        <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                            <th className="p-4 font-semibold w-2/3 bg-gray-50">Field Path</th>
                            <th className="p-4 font-semibold bg-gray-50">Total Corrections</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {fields.length === 0 && !loading && (
                            <tr>
                                <td colSpan={2} className="p-8 text-center text-gray-500">
                                    No field corrections found{searchTerm ? ` matching "${searchTerm}"` : ''}.
                                </td>
                            </tr>
                        )}
                        {fields.map(field => (
                            <React.Fragment key={field._id}>
                                <tr className={`hover:bg-blue-50 cursor-pointer transition-colors ${expandedFieldId === field._id ? 'bg-blue-50' : ''}`} onClick={() => toggleField(field._id)}>
                                    <td className="p-4 font-mono text-sm text-gray-800 flex items-center gap-2">
                                        {expandedFieldId === field._id ? <ChevronDown size={16} className="text-blue-500" /> : <ChevronRight size={16} className="text-gray-400" />}
                                        <Database size={14} className="text-gray-400" />
                                        <span className="break-all">{formatLabel(field.path)}</span>
                                    </td>
                                    <td className="p-4 text-gray-600">
                                        <span className="px-3 py-1  text-blue-700 rounded-full text-xs ">{field.correctionCount}</span>
                                    </td>
                                </tr>

                                {/* Expanded Row */}
                                {expandedFieldId === field._id && (
                                    <tr className="bg-slate-50/50 border-t border-blue-100 shadow-inner">
                                        <td colSpan={2} className="p-4">
                                            {detailsLoading[field._id] ? (
                                                <div className="text-center text-sm text-gray-500">Loading correction details...</div>
                                            ) : fieldDetails[field._id] ? (
                                                <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
                                                    <div className="bg-gray-100 px-4 py-2 border-b border-gray-200 flex items-center justify-between gap-2">
                                                        <h3 className="font-semibold text-gray-700 text-sm">{formatLabel(field.path)}</h3>
                                                        <div className="relative flex items-center min-w-[200px]">
                                                            <Search size={14} className="absolute left-2.5 text-gray-400 pointer-events-none" />
                                                            <input
                                                                type="text"
                                                                placeholder="Search value or order..."
                                                                value={valueSearch}
                                                                onChange={e => setValueSearch(e.target.value)}
                                                                className="w-full pl-8 pr-7 py-1 text-xs font-medium bg-white border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-800 placeholder-gray-400 transition-all"
                                                            />
                                                            {valueSearch && (
                                                                <button
                                                                    onClick={() => setValueSearch('')}
                                                                    className="absolute right-2 text-gray-400 hover:text-gray-600 p-0.5 rounded-full"
                                                                    title="Clear search"
                                                                >
                                                                    <X size={12} />
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div className="p-4">
                                                        {(() => {
                                                            const keyword = valueSearch.trim().toLowerCase();
                                                            const filteredCorrections = fieldDetails[field._id].corrections.filter(correction => {
                                                                if (!keyword) return true;
                                                                const extracted = (correction.initialValue || '').toLowerCase();
                                                                const corrected = (correction.value || '').toLowerCase();
                                                                const orderNo = (correction.correctedOrderId?.orderNumber?.toString() || '').toLowerCase();
                                                                const eonNo = (correction.correctedOrderId?.eonNumber || '').toLowerCase();
                                                                const orderType = (correction.correctedOrderId?.orderType || '').toLowerCase();
                                                                return (
                                                                    extracted.includes(keyword) ||
                                                                    corrected.includes(keyword) ||
                                                                    orderNo.includes(keyword) ||
                                                                    eonNo.includes(keyword) ||
                                                                    orderType.includes(keyword)
                                                                );
                                                            });

                                                            if (filteredCorrections.length === 0) {
                                                                return <div className="p-4 text-center text-sm text-gray-500">No corrections found matching "{valueSearch}".</div>;
                                                            }

                                                            return (
                                                                <div className="flex flex-wrap gap-4">
                                                                    {filteredCorrections.map((correction, idx) => (
                                                                        <div key={idx} className="bg-white border border-gray-100 rounded-lg p-3 shadow-sm hover:shadow-md transition-shadow">
                                                                            <div className="text-xs gap-4 font-bold text-gray-600 mb-2 flex items-center justify-between border-b border-gray-100 pb-2">
                                                                                <div className="flex flex-col gap-0.5">
                                                                                    <span className="text-blue-600 text-sm font-semibold">{correction.correctedOrderId?.orderNumber || 'Unknown'}</span>
                                                                                    {formatSubmittedAt(correction.submittedAt) && (
                                                                                        <span className="text-[11px] font-normal text-gray-400 flex items-center gap-1">
                                                                                            <Clock size={10} className="text-gray-400 shrink-0" />
                                                                                            {formatSubmittedAt(correction.submittedAt)}
                                                                                        </span>
                                                                                    )}
                                                                                </div>
                                                                                <button
                                                                                    className="text-[10px] bg-white text-gray-600 border border-gray-200 hover:bg-gray-50 hover:text-blue-600 px-2 py-1 rounded shadow-sm transition-colors cursor-pointer self-start"
                                                                                    onClick={e => {
                                                                                        e.stopPropagation();
                                                                                        if (correction.correctedOrderId?.orderNumber) {
                                                                                            sessionStorage.setItem('order_no', correction.correctedOrderId.orderNumber.toString());
                                                                                            navigate('/agent/run/Document%20Extractor');
                                                                                        }
                                                                                    }}
                                                                                >
                                                                                    Visit Order
                                                                                </button>
                                                                            </div>
                                                                            <div className="flex flex-col gap-2 mt-2">
                                                                                <div className="bg-red-50 p-2 rounded border border-red-100">
                                                                                    <span className="text-[10px] text-red-400 uppercase font-bold block mb-1">Extracted Value</span>
                                                                                    <span
                                                                                        className="text-base text-red-700 font-medium block"
                                                                                        style={{
                                                                                            fontFamily: "Consolas, Menlo, Monaco, 'Courier New', monospace",
                                                                                            fontVariantNumeric: 'slashed-zero',
                                                                                            fontFeatureSettings: "'zero' 1"
                                                                                        }}
                                                                                    >
                                                                                        {correction.initialValue || 'empty'}
                                                                                    </span>
                                                                                </div>
                                                                                <div className="bg-green-50 p-2 rounded border border-green-100">
                                                                                    <span className="text-[10px] text-green-500 uppercase font-bold block mb-1">Corrected Value</span>
                                                                                    <span
                                                                                        className="text-base text-green-700 font-semibold block"
                                                                                        style={{
                                                                                            fontFamily: "Consolas, Menlo, Monaco, 'Courier New', monospace",
                                                                                            fontVariantNumeric: 'slashed-zero',
                                                                                            fontFeatureSettings: "'zero' 1"
                                                                                        }}
                                                                                    >
                                                                                        {correction.value || 'empty'}
                                                                                    </span>
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            );
                                                        })()}
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="text-center text-sm text-red-500">Failed to load details.</div>
                                            )}
                                        </td>
                                    </tr>
                                )}
                            </React.Fragment>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between px-4 py-2 border-t border-gray-200 bg-gray-50 mt-auto">
                <span className="text-sm text-gray-600 flex items-center gap-4">
                    <span>
                        Total Fields: <b className="text-gray-900">{totalCount}</b>
                    </span>
                    <span>
                        {/* TODO: Unhide Total Corrections */}
                        {/* Total Corrections: <b className="text-gray-900">{totalCorrections}</b> */}
                    </span>
                </span>
                <div className="flex gap-3 items-center">
                    <span className="text-sm ">
                        Page {page} of {totalPages}
                    </span>
                    <Button small disabled={page === 1} onClick={() => loadFields(page - 1)} outlined>
                        Previous
                    </Button>
                    <Button small disabled={page === totalPages} onClick={() => loadFields(page + 1)} outlined>
                        Next
                    </Button>
                </div>
            </div>
        </div>
    );
};

export default FieldsTab;
