import React, { useState, useRef, useEffect } from 'react';
import { Building2, Receipt, Wallet, AlertCircle, CheckCircle2, Clock, CreditCard, Percent, Landmark, FileText, ArrowRightLeft, Check, X, Eye, AlertTriangle, TriangleAlert } from 'lucide-react';
import { htmlData } from './data/html';
interface ReconciliationDetailsProps {
    data: any;
    isLoading: boolean;
    selectedInvoiceId?: string | null;
}
const DataCard = ({
    title,
    badge,
    badgeClassName = 'text-[10px] text-gray-400',
    children,
    hasBorder = false,
    valueClassName = 'text-base font-semibold text-gray-900',
    id,
    compareKey,
    isHighlighted,
    onHover
}: {
    title: string;
    badge?: string;
    badgeClassName?: string;
    children: React.ReactNode;
    hasBorder?: boolean;
    valueClassName?: string;
    id?: string;
    compareKey?: string;
    isHighlighted?: boolean;
    onHover?: (key: string | null) => void;
}) => (
    <div
        id={id}
        onMouseEnter={() => compareKey && onHover?.(compareKey)}
        onMouseLeave={() => compareKey && onHover?.(null)}
        className={`bg-white px-4 py-3 rounded-xl shadow-sm flex flex-col gap-2 transition-all duration-300 ${hasBorder ? 'border border-gray-100' : ''} ${isHighlighted ? 'ring-2 ring-indigo-500 shadow-lg scale-[1.02] relative z-10' : ''}`}
    >
        <div className="text-xs font-bold text-gray-500 uppercase tracking-wider">
            {title} {badge && <span className={`ml-1 ${badgeClassName}`}>{badge}</span>}
        </div>
        <div className={valueClassName}>{children}</div>
    </div>
);

export const ReconciliationDetails: React.FC<ReconciliationDetailsProps> = ({ data, isLoading, selectedInvoiceId }) => {
    const [hoveredCompareKey, setHoveredCompareKey] = useState<string | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [lineCoords, setLineCoords] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);

    useEffect(() => {
        if (hoveredCompareKey && containerRef.current) {
            const pCard = document.getElementById(`proposal-${hoveredCompareKey}`);
            const aCard = document.getElementById(`ai-${hoveredCompareKey}`);

            if (pCard && aCard) {
                const containerRect = containerRef.current.getBoundingClientRect();
                const pRect = pCard.getBoundingClientRect();
                const aRect = aCard.getBoundingClientRect();

                const x1 = pRect.left + pRect.width / 2 - containerRect.left;
                const y1 = pRect.bottom - containerRect.top;

                const x2 = aRect.left + aRect.width / 2 - containerRect.left;
                const y2 = aRect.top - containerRect.top;

                setLineCoords({ x1, y1, x2, y2 });
            } else {
                setLineCoords(null);
            }
        } else {
            setLineCoords(null);
        }
    }, [hoveredCompareKey]);
    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center h-full space-y-4">
                <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                <p className="text-gray-500 font-medium">Loading reconciliation details...</p>
            </div>
        );
    }

    if (!data) {
        return (
            <div className="flex flex-col items-center justify-center h-full p-8 text-center text-gray-500">
                <FileText className="w-12 h-12 mb-4 text-gray-300" />
                <p className="font-medium">No reconciliation data available</p>
                <p className="text-sm mt-1 text-gray-400">Select an invoice to view its reconciliation details.</p>
            </div>
        );
    }

    const formatCurrency = (value: number | undefined) => {
        if (value === undefined || value === null) return '₹0';
        return `₹${Number(value).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
    };

    const { vendor, proposalTable = [], aiVerificationTable = [] } = data;

    const vendorDetails = [
        { label: 'Code', value: vendor?.vendorCode || '-' },
        { label: 'Account', value: vendor?.accountNumber || '-', icon: <CreditCard size={14} className="text-indigo-500" />, compareKey: 'accountNumber' },
        { label: 'Bank', value: vendor?.bankKey || '-', icon: <Landmark size={14} className="text-indigo-500" />, compareKey: 'bankKey' },
        { label: 'GSTIN', value: vendor?.gstin || '-', compareKey: 'gstin' },
        { label: 'TDS', value: vendor?.tdsRate ? `${(vendor.tdsRate * 100).toFixed(4)}%` : '-', icon: <Percent size={14} className="text-orange-500" /> },
        { label: 'CD', value: vendor?.cdRate ? `${(vendor.cdRate * 100).toFixed(2)}%` : '-', icon: <Percent size={14} className="text-rose-500" /> }
    ];

    const selectedProposal = proposalTable?.find((item: any) => item.proposalLineId === selectedInvoiceId) || proposalTable?.[0];
    const selectedAiVerification = aiVerificationTable?.find((item: any) => item.proposalLineId === selectedInvoiceId || item.recordId === selectedInvoiceId) || aiVerificationTable?.[0];

    const proposalCards = selectedProposal
        ? [
              //   {
              //       title: 'MSME',
              //       badge: 'MASTER',
              //       badgeClassName: 'text-[10px] text-gray-400',
              //       children: vendor?.msme ? 'Yes' : 'No'
              //   },
              {
                  title: 'Invoice No',
                  badge: 'PROPOSAL',
                  badgeClassName: 'text-[8px] text-blue-500',
                  id: 'proposal-invoiceNo',
                  compareKey: 'invoiceNo',
                  children: selectedProposal.invoiceNo || '-'
              },
              {
                  title: 'Invoice Date',
                  badge: 'PROPOSAL',
                  badgeClassName: 'text-[8px] text-blue-500',
                  id: 'proposal-invoiceDate',
                  compareKey: 'invoiceDate',
                  children: selectedProposal.invoiceDate ? new Date(selectedProposal.invoiceDate).toLocaleDateString('en-GB').replace(/\//g, '.') : '-'
              },
              {
                  title: 'CD Deducted',
                  badge: 'PROPOSAL',
                  badgeClassName: 'text-[8px] text-blue-500',
                  id: 'proposal-cdDeducted',
                  compareKey: 'cdDeducted',
                  children: selectedProposal.cdDeducted !== undefined ? formatCurrency(selectedProposal.cdDeducted).replace('₹', '').trim() : '0.00'
              },

              {
                  title: 'Invoice Gross Value',
                  badge: 'PROPOSAL',
                  badgeClassName: 'text-[8px] text-blue-500',
                  id: 'proposal-grossValue',
                  compareKey: 'grossValue',
                  children: selectedProposal.invoiceValue !== undefined ? formatCurrency(selectedProposal.invoiceValue).replace('₹', '').trim() : '-'
              },
              {
                  title: 'SAP Document No',
                  badge: 'PROPOSAL',
                  badgeClassName: 'text-[8px] text-blue-500',
                  children: selectedProposal.sapDocumentNo || '-'
              },
              {
                  title: 'Agreed Days',
                  badge: 'PROPOSAL',
                  badgeClassName: 'text-[8px] text-blue-500',
                  children: selectedProposal.agreedDays || '-'
              },
              {
                  title: 'Payment Due Date',
                  badge: 'PROPOSAL',
                  badgeClassName: 'text-[8px] text-blue-500',
                  valueClassName: 'text-base font-semibold text-gray-900 flex items-center gap-1.5',
                  children: (
                      <>
                          {selectedProposal.paymentDueDate ? new Date(selectedProposal.paymentDueDate).toLocaleDateString('en-GB').replace(/\//g, '.') : '-'}
                          <AlertTriangle size={16} className="text-rose-500" />
                      </>
                  )
              },
              {
                  title: 'CD %',
                  badge: 'PROPOSAL',
                  badgeClassName: 'text-[8px] text-blue-500',
                  children: selectedProposal.cdPercentage !== undefined ? `${selectedProposal.cdPercentage}%` : '0%'
              },

              {
                  title: 'Net Value',
                  badge: 'PROPOSAL',
                  badgeClassName: 'text-[8px] text-blue-500',
                  valueClassName: 'text-base font-semibold text-gray-900 flex items-center gap-1.5',
                  id: 'proposal-netValue',
                  compareKey: 'netValue',
                  children: (
                      <>
                          {selectedProposal.netValue !== undefined ? formatCurrency(selectedProposal.netValue).replace('₹', '').trim() : '-'}
                          {selectedProposal.hasMismatch && <span className="text-amber-600 font-black">- *</span>}
                      </>
                  )
              }
          ]
        : [];

    const aiVerificationCards = selectedAiVerification
        ? [
              {
                  title: 'Bank Account',
                  badge: 'INVOICE',
                  badgeClassName: 'text-[10px] text-gray-400',
                  id: 'ai-accountNumber',
                  compareKey: 'accountNumber',
                  children: vendor?.accountNumber || '-'
              },
              {
                  title: 'Bank IFSC',
                  badge: 'INVOICE',
                  badgeClassName: 'text-[10px] text-gray-400',
                  id: 'ai-bankKey',
                  compareKey: 'bankKey',
                  children: vendor?.bankKey || '-'
              },
              {
                  title: 'Vendor GSTIN',
                  badge: 'INVOICE',
                  badgeClassName: 'text-[10px] text-gray-400',
                  id: 'ai-gstin',
                  compareKey: 'gstin',
                  children: vendor?.gstin || '-'
              },
              {
                  title: 'Invoice No',

                  badge: 'MATCHED',
                  badgeClassName: 'text-[10px] text-emerald-500',
                  id: 'ai-invoiceNo',
                  compareKey: 'invoiceNo',
                  children: selectedAiVerification.invoiceNo || '-'
              },
              {
                  title: 'Invoice Date',
                  badge: 'MATCHED',
                  badgeClassName: 'text-[10px] text-emerald-500',
                  id: 'ai-invoiceDate',
                  compareKey: 'invoiceDate',
                  children: selectedAiVerification.invoiceDate ? new Date(selectedAiVerification.invoiceDate).toLocaleDateString('en-GB').replace(/\//g, '.') : '-'
              },
              {
                  title: 'CD Deducted',
                  badge: 'INVOICE (-)',
                  badgeClassName: 'text-[10px] text-gray-400',
                  id: 'ai-cdDeducted',
                  compareKey: 'cdDeducted',
                  children: (
                      <>
                          {selectedAiVerification.invoiceCdDeducted !== undefined ? formatCurrency(selectedAiVerification.invoiceCdDeducted).replace('₹', '').trim() : '0.00'}
                          <span className="text-[11px] text-gray-400 ml-1.5 font-normal">({selectedAiVerification.invoiceCdPercentage || 2}%)</span>
                      </>
                  )
              },
              {
                  title: 'Gross Value',
                  badge: 'INVOICE',
                  badgeClassName: 'text-[10px] text-gray-400',
                  hasBorder: true,
                  id: 'ai-grossValue',
                  compareKey: 'grossValue',
                  children: selectedAiVerification.grossValueOfInvoice !== undefined ? formatCurrency(selectedAiVerification.grossValueOfInvoice).replace('₹', '').trim() : '-'
              },
              {
                  title: 'Basic Invoice Value (a)',
                  badge: 'INVOICE (+)',
                  badgeClassName: 'text-[10px] text-gray-400',
                  children: selectedAiVerification.basicInvoiceValue !== undefined ? formatCurrency(selectedAiVerification.basicInvoiceValue).replace('₹', '').trim() : '-'
              },
              {
                  title: 'Freight Inward (b)',
                  badge: 'INVOICE (+)',
                  badgeClassName: 'text-[10px] text-gray-400',
                  children: selectedAiVerification.freightInwardValue !== undefined ? formatCurrency(selectedAiVerification.freightInwardValue).replace('₹', '').trim() : '0.00'
              },

              {
                  title: 'Others',
                  badge: 'INVOICE (+)',
                  badgeClassName: 'text-[10px] text-gray-400',
                  children: selectedAiVerification.others !== undefined ? formatCurrency(selectedAiVerification.others).replace('₹', '').trim() : '0.00'
              },
              {
                  title: 'GST (c)',
                  badge: 'INVOICE (+)',
                  badgeClassName: 'text-[10px] text-gray-400',
                  children: selectedAiVerification.gst !== undefined ? formatCurrency(selectedAiVerification.gst).replace('₹', '').trim() : '0.00'
              },

              {
                  title: 'Invoice Value',
                  badge: 'COMPUTED (a+b+c-CD=d)',
                  badgeClassName: 'text-[10px] text-purple-500',
                  hasBorder: true,
                  children:
                      selectedAiVerification.computedInvoiceValue !== undefined
                          ? formatCurrency(selectedAiVerification.computedInvoiceValue).replace('₹', '').trim()
                          : selectedAiVerification.grossValueOfInvoice !== undefined
                            ? formatCurrency(selectedAiVerification.grossValueOfInvoice).replace('₹', '').trim()
                            : '-'
              },
              {
                  title: 'Extracted TDS',
                  badge: 'INVOICE',
                  badgeClassName: 'text-[10px] text-gray-400',
                  hasBorder: true,
                  children: selectedAiVerification.extractedTds !== undefined ? formatCurrency(selectedAiVerification.extractedTds).replace('₹', '').trim() : '0.00'
              },
              {
                  title: 'Calculated TDS (e)',
                  badge: 'COMPUTED (-)',
                  badgeClassName: 'text-[10px] text-purple-500',
                  hasBorder: true,
                  children: (
                      <>
                          {selectedAiVerification.calculatedTds !== undefined ? formatCurrency(selectedAiVerification.calculatedTds).replace('₹', '').trim() : '0.00'}
                          <span className="text-[11px] font-medium text-gray-400 ml-1.5">
                              ({selectedAiVerification.calculatedTdsPercentage !== undefined ? selectedAiVerification.calculatedTdsPercentage : 0.1}%)
                          </span>
                      </>
                  )
              },
              {
                  title: 'Net Value (d-e-f)',
                  badge: 'MATCHED',
                  badgeClassName: 'text-[10px] text-emerald-500',
                  hasBorder: true,
                  valueClassName: 'text-base font-semibold text-gray-900 flex items-center gap-1.5',
                  id: 'ai-netValue',
                  compareKey: 'netValue',
                  children: (
                      <>
                          {selectedAiVerification.netValueToBePaid !== undefined ? formatCurrency(selectedAiVerification.netValueToBePaid).replace('₹', '').trim() : '-'}
                          {selectedAiVerification.hasMismatch !== false && <span className="text-amber-600 font-black">- *</span>}
                      </>
                  )
              },
              {
                  title: 'Adjustments',
                  badge: 'INPUT (+/-)',
                  badgeClassName: 'text-[10px] text-gray-400',
                  hasBorder: true,
                  valueClassName: '',
                  children: (
                      <input
                          type="text"
                          className="w-24 h-8 px-2 text-base font-semibold text-gray-900 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 outline-none bg-white shadow-sm"
                          defaultValue={selectedAiVerification.adjustments || 0}
                      />
                  )
              }
          ]
        : [];

    return (
        <div className="flex flex-col h-full bg-[#f8fafc] overflow-y-auto w-full">
            <div ref={containerRef} className="p-3 mx-auto w-full space-y-2 relative">
                {lineCoords && (
                    <svg className="absolute inset-0 w-full h-full pointer-events-none z-50">
                        <path
                            d={`M ${lineCoords.x1} ${lineCoords.y1} C ${lineCoords.x1} ${(lineCoords.y1 + lineCoords.y2) / 2}, ${lineCoords.x2} ${(lineCoords.y1 + lineCoords.y2) / 2}, ${lineCoords.x2} ${lineCoords.y2}`}
                            stroke="rgba(99, 102, 241, 0.6)"
                            strokeWidth="3"
                            fill="none"
                            strokeDasharray="6 6"
                        />
                        <circle cx={lineCoords.x1} cy={lineCoords.y1} r="3" fill="rgba(99, 102, 241, 1)" />
                        <circle cx={lineCoords.x2} cy={lineCoords.y2} r="3" fill="rgba(99, 102, 241, 1)" />
                    </svg>
                )}
                {/* Header & Vendor Details */}
                <div className="bg-white rounded-xl border border-gray-200 py-3 px-4">
                    {/* Header */}
                    <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600 shrink-0">
                                <Building2 size={20} />
                            </div>

                            <div className="flex gap-2 items-center min-w-0">
                                <h2 className="text-xl font-semibold text-gray-900 truncate">{vendor?.vendorName || 'Unknown Vendor'}</h2>

                                {vendor?.msmeVendor && <span className="text-[10px] rounded px-2 py-0.5 bg-emerald-100 text-emerald-700">MSME Vendor</span>}
                            </div>
                        </div>

                        {/* Amount */}
                        <div className="flex items-center gap-2 rounded-lg bg-blue-50 border border-blue-100 px-4 py-2 text-right shrink-0">
                            <p className="text-[11px] uppercase tracking-wide text-gray-500">Total Payable:</p>

                            <p className="text-xl font-bold text-blue-700">{formatCurrency(vendor?.vendorPayableAmount)}</p>
                        </div>
                    </div>

                    {/* Full Width Info Bar */}
                    <div className="mt-3 pt-3 border-t border-gray-100">
                        <div className="flex items-center justify-around text-sm">
                            {vendorDetails.map((item, idx) => (
                                <div
                                    key={idx}
                                    id={item.compareKey ? `proposal-${item.compareKey}` : undefined}
                                    className={`flex items-center gap-1 p-1.5 rounded-md transition-colors cursor-default ${hoveredCompareKey === item.compareKey ? 'bg-indigo-50 ring-1 ring-indigo-200' : 'hover:bg-gray-50'}`}
                                    onMouseEnter={() => item.compareKey && setHoveredCompareKey(item.compareKey)}
                                    onMouseLeave={() => setHoveredCompareKey(null)}
                                >
                                    {item.icon}
                                    <span className={`text-gray-500 ${hoveredCompareKey === item.compareKey ? 'text-indigo-600' : ''}`}>{item.label}</span>
                                    <span className={`font-semibold text-gray-900 ${hoveredCompareKey === item.compareKey ? 'text-indigo-900' : ''}`}>{item.value}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Proposal Details Section */}
                {selectedProposal && (
                    <div className="bg-white rounded-2xl shadow-sm  relative z-20">
                        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between rounded-t-2xl">
                            <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center text-orange-600">
                                    <FileText size={18} />
                                </div>
                                <h3 className="text-md font-bold text-gray-900">Proposal Details</h3>
                            </div>
                            <div className="group relative">
                                <button className="py-1 px-2 rounded-md text-indigo-600 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 transition-colors">
                                    <Eye size={18} />
                                </button>
                                <div className="absolute right-0 bottom-full mb-2 w-[740px] max-h-[400px] overflow-auto bg-white rounded-xl shadow-2xl border border-gray-200 z-50 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 origin-bottom-right">
                                    <div className="p-4" dangerouslySetInnerHTML={{ __html: htmlData }} />
                                </div>
                            </div>
                        </div>

                        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 bg-gray-50/30 relative z-20">
                            {proposalCards.map((card, index) => (
                                <DataCard key={index} {...card} isHighlighted={hoveredCompareKey !== null && hoveredCompareKey === card.compareKey} onHover={setHoveredCompareKey} />
                            ))}
                        </div>
                    </div>
                )}

                {/* AI Verification Section */}
                {selectedAiVerification && (
                    <div className="bg-white rounded-2xl shadow-sm  overflow-hidden">
                        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-600">
                                    <CheckCircle2 size={18} />
                                </div>
                                <h3 className="text-md font-bold text-gray-900">AI Verification Details</h3>
                            </div>
                            <div className="flex items-center gap-3">
                                <button className="py-1 px-2 rounded-md text-indigo-600 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 transition-colors">
                                    <Eye size={18} />
                                </button>
                                <button className="px-4 py-1 text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md text-sm font-semibold hover:bg-emerald-100 transition-colors">
                                    Approve
                                </button>
                                <button className="px-4 py-1 text-rose-700 bg-rose-50 border border-rose-200 rounded-md text-sm font-semibold hover:bg-rose-100 transition-colors">Reject</button>
                            </div>
                        </div>

                        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 bg-gray-50/30 relative z-20">
                            {aiVerificationCards.map((card, index) => (
                                <DataCard key={index} {...card} isHighlighted={hoveredCompareKey !== null && hoveredCompareKey === card.compareKey} onHover={setHoveredCompareKey} />
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
