import React, { useState, useRef, useEffect } from 'react';
import { htmlData } from './data/html';
import { config } from '../../../config/default';
import { SingleSelect } from '../../../components/SingleSelect';
import { ReconciliationDetails } from './ReconciliationDetails';
import { Button } from '../../../components/Button';
import { ArrowRight, ArrowRightLeft, Eye, Upload } from 'lucide-react';

const ArdexReconcillation: React.FC = () => {
    const [leftWidth, setLeftWidth] = useState(20);
    const [proposals, setProposals] = useState<any>(null);
    const [activeProposalId, setActiveProposalId] = useState<string | null>(null);
    const [dashboardData, setDashboardData] = useState<any>(null);
    const [selectedVendorId, setSelectedVendorId] = useState<string | null>(null);
    const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [vendorFilter, setVendorFilter] = useState<string>('all');
    const [reconcileData, setReconcileData] = useState<any>(null);
    const [isReconcileLoading, setIsReconcileLoading] = useState<boolean>(false);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [uploadedProposalUrl, setUploadedProposalUrl] = useState<string | null>(null);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const isDragging = useRef(false);

    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        try {
            // Simulate dummy API call
            console.log('Calling dummy API for file upload:', file.name);
            await new Promise(resolve => setTimeout(resolve, 500));

            const url = URL.createObjectURL(file);
            setUploadedProposalUrl(url);
        } catch (error) {
            console.error('Error uploading file:', error);
        }

        // Reset input value so same file can be uploaded again if needed
        if (event.target) {
            event.target.value = '';
        }
    };

    const handleMouseDown = () => {
        isDragging.current = true;
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
    };

    const handleMouseUp = () => {
        isDragging.current = false;
        document.body.style.cursor = 'default';
        document.body.style.userSelect = '';
    };

    const handleMouseMove = (e: MouseEvent) => {
        if (!isDragging.current || !containerRef.current) return;
        const containerRect = containerRef.current.getBoundingClientRect();
        const newLeftWidth = ((e.clientX - containerRect.left) / containerRect.width) * 100;
        if (newLeftWidth > 15 && newLeftWidth < 85) {
            setLeftWidth(newLeftWidth);
        }
    };

    useEffect(() => {
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, []);

    const fetchReconcileData = async (propId: string, vendId: string) => {
        if (!propId || !vendId) return;
        setIsReconcileLoading(true);
        try {
            let token = '';
            const sessionToken = sessionStorage.getItem('accessToken');
            if (sessionToken) {
                try {
                    token = JSON.parse(sessionToken);
                } catch {
                    token = sessionToken;
                }
            }
            if (!token) {
                token = localStorage.getItem('token') || '';
            }

            const headers: Record<string, string> = {
                'Content-Type': 'application/json'
            };
            if (token) {
                headers['Authorization'] = `Bearer ${token}`;
            }

            const baseUrl = config.nodeApiUrl || 'http://localhost:4000';
            const url = `${baseUrl}/idp/proposal-line/reconcile/${propId}/${vendId}`;

            const response = await fetch(url, {
                method: 'GET',
                headers
            });

            const result = await response.json();
            console.log(`Reconcile API (GET /idp/proposal-line/reconcile/${propId}/${vendId}) response:`, result);
            setReconcileData(result?.data || null);
        } catch (err: any) {
            console.error('Error fetching reconcile data:', err);
        } finally {
            setIsReconcileLoading(false);
        }
    };

    useEffect(() => {
        const fetchProposalAndDashboard = async () => {
            setIsLoading(true);
            setError(null);
            try {
                let token = '';
                const sessionToken = sessionStorage.getItem('accessToken');
                if (sessionToken) {
                    try {
                        token = JSON.parse(sessionToken);
                    } catch {
                        console.log('Failed to fetch session token');
                    }
                }
                const headers: Record<string, string> = {
                    'Content-Type': 'application/json'
                };
                if (token) {
                    headers['Authorization'] = `Bearer ${token}`;
                }

                const baseUrl = config.nodeApiUrl || 'http://localhost:4000';
                const postResponse = await fetch(`${baseUrl}/idp/proposal`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({ page: 1, pageSize: 10 })
                });

                const postData = await postResponse.json();
                console.log('(POST /idp/proposal) response:', postData);
                const proposalsList = postData?.data;
                const proposalId = Array.isArray(proposalsList) ? proposalsList[0]?._id : proposalsList?._id;

                if (proposalId) {
                    setProposals(proposalsList);
                    setActiveProposalId(proposalId);

                    const getResponse = await fetch(`${baseUrl}/idp/proposal/${proposalId}/dashboard`, {
                        method: 'GET',
                        headers
                    });

                    const getData = await getResponse.json();
                    console.log('(GET /idp/proposal/:id/dashboard) response:', getData);
                    const fetchedVendors = getData?.data?.vendors || [];
                    setDashboardData(getData?.data || null);
                    if (fetchedVendors.length > 0) {
                        const firstVendorId = fetchedVendors[0].vendorId;
                        setSelectedVendorId(firstVendorId);

                        const allInvoicesTemp = fetchedVendors.flatMap((v: any) => v.invoices || []);
                        if (allInvoicesTemp.length > 0) {
                            setSelectedInvoiceId(allInvoicesTemp[0].proposalLineId);
                        }

                        // Fetch Reconcile data for the first vendor
                        fetchReconcileData(proposalId, firstVendorId);
                    }
                } else {
                    console.warn('No proposal ID found in API 1 response');
                }
            } catch (err: any) {
                console.error('Error fetching proposal data:', err);
                setError(err?.message || 'Failed to fetch proposal data');
            } finally {
                setIsLoading(false);
            }
        };

        fetchProposalAndDashboard();
    }, []);

    const handleInvoiceSelect = (invoiceId: string, vendorId: string) => {
        setSelectedInvoiceId(invoiceId);
        setSelectedVendorId(vendorId);
        if (activeProposalId) {
            fetchReconcileData(activeProposalId, vendorId);
        }
    };

    const vendors = dashboardData?.vendors || [];
    const allInvoices = vendors.flatMap((vendor: any) =>
        (vendor.invoices || []).map((invoice: any) => ({
            ...invoice,
            vendorId: vendor.vendorId,
            vendorName: vendor.vendorName
        }))
    );
    const selectedVendor = vendors.find((v: any) => v.vendorId === selectedVendorId) || vendors[0];

    const totalNetValue = reconcileData?.proposalTable?.reduce((sum: number, item: any) => sum + (Number(item.netValue) || 0), 0) || 0;
    const formattedNetValue = `Rs. ${totalNetValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
    const invoiceCount = reconcileData?.proposalTable?.length || 0;
    const hasMismatch = reconcileData?.proposalTable?.some((item: any) => item.hasMismatch) || false;

    return (
        <div className="flex flex-col h-full w-full bg-gray-50 overflow-hidden p-1 pt-0">
            {/* Page Header */}
            <header className="bg-white border-b border-gray-200 px-4 py-4 flex flex-col gap-4 shrink-0">
                {/* <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-xl font-bold text-gray-800">Reconciliation</h1>
                    </div>
                    <div className="flex gap-3">
                        <button className="px-4 py-2 rounded-lg font-medium hover:bg-gray-200 transition-colors shadow-sm">Upload</button>
                    </div>
                </div> */}

                {/* Filters Row */}
                <div className="flex justify-between">
                    {/* <div className="">
                        <h1 className="text-xl font-bold text-gray-800">Reconciliation</h1>
                    </div> */}
                    <div>
                        <SingleSelect
                            className="min-w-78"
                            value={statusFilter}
                            onValueChange={val => setStatusFilter(val as string)}
                            options={[
                                { label: 'All Proposals', value: 'all' },
                                { label: 'test', value: 'test' }
                            ]}
                        />
                    </div>
                    <div className="flex gap-3">
                        <SingleSelect
                            className="min-w-40"
                            value={statusFilter}
                            onValueChange={val => setStatusFilter(val as string)}
                            options={[
                                { label: 'All Status', value: 'all' },
                                { label: 'Pending', value: 'pending' },
                                { label: 'Extracted', value: 'extracted' },
                                { label: 'Success', value: 'success' },
                                { label: 'Failed', value: 'failed' }
                            ]}
                        />

                        <SingleSelect
                            className="min-w-48"
                            value={vendorFilter}
                            onValueChange={val => setVendorFilter(val as string)}
                            options={[{ label: 'All Vendors', value: 'all' }, ...vendors.map((v: any) => ({ label: v.vendorName, value: v.vendorId }))]}
                        />
                        <input type="file" accept=".html,.htm" style={{ display: 'none' }} ref={fileInputRef} onChange={handleFileUpload} />
                        <Button outlined endIcon={<Upload size={16} />} onClick={() => fileInputRef.current?.click()}>
                            {uploadedProposalUrl ? 'Update' : 'Upload'} Proposal
                        </Button>
                        {uploadedProposalUrl && (
                            <Button outlined endIcon={<Eye size={16} />} onClick={() => window.open(uploadedProposalUrl, '_blank')}>
                                View Proposal
                            </Button>
                        )}
                    </div>
                </div>
            </header>

            {/* Resizable Area */}
            <div ref={containerRef} className="flex flex-1 w-full overflow-hidden">
                {/* Left Container */}
                <div style={{ width: `${leftWidth}%` }} className="h-full flex flex-col border-r border-gray-200 bg-white">
                    <div className="px-5 py-4 border-b border-gray-200 bg-white flex items-center justify-between shrink-0 z-10">
                        <span className="font-bold text-gray-800 text-lg tracking-tight">Invoices</span>
                        <span className="bg-gray-100 text-gray-600 text-xs font-bold px-2.5 py-1 rounded-full">
                            {allInvoices.length} / {allInvoices.length}
                        </span>
                    </div>
                    <div className="flex-1 overflow-y-auto bg-white">
                        {allInvoices.length > 0 ? (
                            allInvoices.map((invoice: any) => {
                                const isSelected = selectedInvoiceId === invoice.proposalLineId;
                                return (
                                    <div
                                        key={invoice.proposalLineId || invoice.invoiceNo}
                                        onClick={() => handleInvoiceSelect(invoice.proposalLineId, invoice.vendorId)}
                                        className={`group relative flex flex-col p-4 cursor-pointer transition-all duration-200 border-b border-gray-100 last:border-b-0
                                            ${isSelected ? 'bg-blue-50/60 shadow-sm' : 'bg-white hover:bg-gray-50/80'}`}
                                    >
                                        {isSelected && <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-600 rounded-r-md shadow-[1px_0_4px_rgba(37,99,235,0.4)]" />}

                                        <div className="flex justify-between items-start mb-2">
                                            <div className="font-bold text-gray-900 truncate pr-3 text-[15px] group-hover:text-blue-700 transition-colors">
                                                {invoice.invoiceNo || 'Unknown Invoice'}
                                            </div>
                                            {invoice.gross !== undefined && (
                                                <div className="font-bold text-gray-900 whitespace-nowrap text-[14px]">
                                                    ₹{Number(invoice.gross).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                                                </div>
                                            )}
                                        </div>

                                        <div className="flex justify-between items-center text-[13px]">
                                            <div className="text-gray-500 truncate pr-3 flex items-center gap-1.5 font-medium" title={invoice.vendorName}>
                                                <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path
                                                        strokeLinecap="round"
                                                        strokeLinejoin="round"
                                                        strokeWidth={1.5}
                                                        d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                                                    />
                                                </svg>
                                                <span className="truncate">{invoice.vendorName}</span>
                                            </div>
                                            {invoice.aiVerdict && (
                                                <span
                                                    className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest whitespace-nowrap
                                                      ${
                                                          invoice.aiVerdict === 'pass'
                                                              ? 'bg-emerald-100/80 text-emerald-700'
                                                              : invoice.aiVerdict === 'fail'
                                                                ? 'bg-rose-100/80 text-rose-700'
                                                                : 'bg-amber-100/80 text-amber-700'
                                                      }`}
                                                >
                                                    {invoice.aiVerdict}
                                                </span>
                                            )}
                                        </div>
                                        {invoice.invoiceDate && (
                                            <div className="mt-2 text-[11px] text-gray-400 font-semibold uppercase tracking-wider flex items-center gap-1">
                                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path
                                                        strokeLinecap="round"
                                                        strokeLinejoin="round"
                                                        strokeWidth={2}
                                                        d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                                                    />
                                                </svg>
                                                {new Date(invoice.invoiceDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                                            </div>
                                        )}
                                    </div>
                                );
                            })
                        ) : (
                            <div className="p-8 text-center text-gray-500 font-medium">No invoices found.</div>
                        )}
                    </div>

                    {/* Left Footer */}
                    <div className="p-3 border-t border-gray-200 bg-gray-50/50 shrink-0 flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-500">Total: {allInvoices.length}</span>
                        <Button outlined className="text-xs px-3 py-1.5 h-auto bg-white">
                            Refresh
                        </Button>
                    </div>
                </div>

                {/* Resizer */}
                <div
                    onMouseDown={handleMouseDown}
                    className="w-1 cursor-col-resize bg-gray-200 hover:bg-blue-400 active:bg-blue-500 transition-colors z-10 flex items-center justify-center relative group"
                >
                    <div className="absolute h-8 w-3 bg-white border border-gray-300 rounded flex flex-col justify-center items-center gap-[2px] shadow-sm z-20 group-hover:border-blue-400 group-active:bg-blue-50 group-active:border-blue-500">
                        <div className="w-[1px] h-1 bg-gray-400 group-hover:bg-blue-400 group-active:bg-blue-500" />
                        <div className="w-[1px] h-1 bg-gray-400 group-hover:bg-blue-400 group-active:bg-blue-500" />
                        <div className="w-[1px] h-1 bg-gray-400 group-hover:bg-blue-400 group-active:bg-blue-500" />
                    </div>
                </div>

                {/* Right Container */}
                <div style={{ width: `calc(${100 - leftWidth}% - 8px)` }} className="h-full flex flex-col bg-gray-50">
                    {/* <div className="p-4  bg-white border-b border-gray-100 font-semibold text-lg sticky top-0 z-10 flex items-center justify-between">
                        <span>Details for {selectedVendor ? selectedVendor.vendorName : 'Invoice'}</span>
                    </div> */}
                    <div className="flex-1 overflow-hidden">
                        <ReconciliationDetails data={reconcileData} isLoading={isReconcileLoading} selectedInvoiceId={selectedInvoiceId} />
                    </div>

                    {/* Right Footer */}
                    <div className="px-4 py-3 border-t border-gray-200 bg-white shrink-0 flex items-center justify-between shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.02)] z-10">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-600">
                            <span>Net Value to be paid &middot;</span>
                            <span className="bg-[#fef3c7] text-[#92400e] px-2 py-0.5 rounded border border-[#fde68a] font-bold text-[13px]">
                                {formattedNetValue}{hasMismatch ? ' *' : ''}
                            </span>
                            <span className="ml-0.5">
                                across {invoiceCount} invoice{invoiceCount !== 1 ? 's' : ''} {hasMismatch ? <>&middot;</> : null}
                            </span>
                            {hasMismatch && <span className="text-[#ea580c] font-bold text-xs tracking-wide">FLAGGED</span>}
                        </div>
                        <Button small endIcon={<ArrowRight size={16} />} outlined>
                            Summary
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ArdexReconcillation;
