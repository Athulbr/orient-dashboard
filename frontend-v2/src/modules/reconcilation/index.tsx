import { useState } from 'react';
import FileUpload from './components/FileUpload';
import type { ReconType } from './components/FileUpload';
import Results from './components/Results';
import PageContainer from '../../components/PageContainer';
import { cx } from './utils/cx';
import styles from './app.module.css';

interface BRSData {
    book_closing_bal: number;
    bank_closing_bal: number;
    add_issued: number;
    less_deposited: number;
    less_debited_nb: number;
    add_credited_nb: number;
    reconciled_balance: number;
    brs_difference: number;
}
interface GatewaySummaryItem {
    name: string;
    gw_net: number;
    bank_total: number;
    gross: number;
    fees: number;
    tax: number;
    difference: number;
    matched: number;
    unmatched: number;
}
interface ReconciliationResult {
    matched: any[];
    book_only: any[];
    bank_only: any[];
    recon_type?: string;
    brs?: BRSData;
    company_name?: string;
    account_info?: string;
    brs_date?: string;
    gateway_summary?: GatewaySummaryItem[];
    books_match?: boolean;
    reconciled?: boolean;
    // Identifies the archived run on the backend — required to regenerate
    // the workbook from in-app edits (bank type only for now). Absent if
    // archiving failed server-side, in which case the download button just
    // falls back to the original file even after edits.
    transaction_ref?: string | null;
    summary: {
        book_entries: number;
        bank_entries: number;
        matched: number;
        matched_perfect: number;
        matched_with_diff: number;
        book_only: number;
        bank_only: number;
        difference: number;
    };
    download_url: string;
    file_name: string;
}

const hexToBlob = (hex: string): Blob => {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
    return new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
};

const DOWNLOAD_FILENAMES: Record<string, string> = {
    qr: 'QR_Reconciliation.xlsx',
    gateway: 'Gateway_Reconcilation.xlsx',
    bank: 'Bank_Reconciliation.xlsx',
};

const buildResult = (data: any, reconType: string, blob: Blob): ReconciliationResult => ({
    matched: data.matched || [],
    book_only: data.book_only || [],
    bank_only: data.bank_only || [],
    recon_type: data.recon_type || reconType,
    brs: data.brs || null,
    company_name: data.company_name || '',
    account_info: data.account_info || '',
    brs_date: data.brs_date || '',
    gateway_summary: data.gateway_summary || [],
    books_match: data.books_match,
    reconciled: data.reconciled,
    transaction_ref: data.transaction_ref ?? null,
    summary: data.summary || { book_entries: 0, bank_entries: 0, matched: 0, matched_perfect: 0, matched_with_diff: 0, book_only: 0, bank_only: 0, difference: 0 },
    download_url: URL.createObjectURL(blob),
    file_name: data.file_name || DOWNLOAD_FILENAMES[data.recon_type || reconType] || 'Reconciliation.xlsx',
});

function ListReconcilationPage() {
    const [stage, setStage] = useState<'upload' | 'results'>('upload');
    const [isLoading, setIsLoading] = useState(false);
    const [results, setResults] = useState<ReconciliationResult | null>(null);
    const [error, setError] = useState<string | null>(null);

    const API_BASE_URL = 'http://127.0.0.1:8000';
    // const API_BASE_URL = 'http://172.16.0.47';

    const handleUpload = async (bookFile: File, statementFile: File, prevBrsFile: File | null, reconType: ReconType, hotBookFile?: File | null) => {
        setIsLoading(true);
        setError(null);
        try {
            const formData = new FormData();
            const placeholder = new File([], 'placeholder.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            if (reconType === 'qr') {
                formData.append('all_branches_file', bookFile);
                formData.append('hot_book_file', hotBookFile!);
                formData.append('statement_file', statementFile);
                formData.append('previous_brs_file', prevBrsFile || placeholder);
            } else {
                formData.append('book_file', bookFile);
                formData.append('statement_file', statementFile);
                formData.append('previous_brs_file', prevBrsFile || placeholder);
            }
            const endpoint = reconType === 'qr' ? '/reconcile/reconcile-qr' : '/reconcile/reconcile-bank';
            const response = await fetch(`${API_BASE_URL}${endpoint}`, { method: 'POST', body: formData });
            if (!response.ok) {
                const err = await response.json().catch(() => null);
                throw new Error(err?.detail || `Server error: ${response.statusText}`);
            }
            const data = await response.json();
            setResults(buildResult(data, reconType, hexToBlob(data.file_bytes)));
            setStage('results');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleGatewayUpload = async (
        allBranchesFile: File,
        hotBookFile: File,
        statementFile: File,
        payuFiles: File[],
        prevBrsFile: File | null,
        payuOdFiles: File[],
        cashfreeFiles: File[],
        easebuzzFiles: File[],
        nameMatchDirectFile: File | null,
        nameMatchFile: File | null,
        totalOrdersFile: File | null,
        smartPayFiles: File[]
    ) => {
        setIsLoading(true);
        setError(null);
        try {
            const formData = new FormData();
            formData.append('all_branches_file', allBranchesFile);
            formData.append('hot_book_file', hotBookFile);
            formData.append('statement_file', statementFile);
            for (const f of payuFiles) formData.append('payu_files', f);
            for (const f of payuOdFiles) formData.append('payu_od_files', f);
            for (const f of cashfreeFiles) formData.append('cashfree_files', f);
            for (const f of easebuzzFiles) formData.append('easebuzz_files', f);
            for (const f of smartPayFiles) formData.append('smart_pay_files', f);
            if (prevBrsFile) formData.append('previous_brs_file', prevBrsFile);
            if (nameMatchDirectFile) formData.append('name_match_direct_file', nameMatchDirectFile);
            if (nameMatchFile) formData.append('name_match_file', nameMatchFile);
            if (totalOrdersFile) formData.append('total_orders_file', totalOrdersFile);
            const response = await fetch(`${API_BASE_URL}/reconcile/reconcile-gateway`, { method: 'POST', body: formData });
            if (!response.ok) {
                const err = await response.json().catch(() => null);
                throw new Error(err?.detail || `Server error: ${response.statusText}`);
            }
            const data = await response.json();
            setResults(buildResult(data, 'gateway', hexToBlob(data.file_bytes)));
            setStage('results');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleUploadDispatch = (
        bookFile: File,
        statementFile: File,
        prevBrsFile: File | null,
        reconType: ReconType,
        hotBookFile?: File | null,
        payuOdFiles?: File[],
        cashfreeFiles?: File[],
        easebuzzFiles?: File[],
        payuFiles?: File[],
        nameMatchDirectFile?: File | null,
        nameMatchFile?: File | null,
        totalOrdersFile?: File | null,
        smartPayFiles?: File[]
    ) => {
        if (reconType === 'gateway') {
            if (!payuFiles || payuFiles.length === 0) {
                setError('PayU Regular file is required for Gateway reconciliation.');
                return;
            }
            if (!nameMatchDirectFile) {
                setError('Name Matching Report - Direct payment file is required for Gateway reconciliation.');
                return;
            }
            if (!nameMatchFile) {
                setError('Name Matching Report file is required for Gateway reconciliation.');
                return;
            }
            if (!totalOrdersFile) {
                setError('Total Orders List file is required for Gateway reconciliation.');
                return;
            }
            handleGatewayUpload(bookFile, hotBookFile!, statementFile, payuFiles, prevBrsFile, payuOdFiles || [], cashfreeFiles || [], easebuzzFiles || [], nameMatchDirectFile, nameMatchFile, totalOrdersFile, smartPayFiles || []);
        } else {
            handleUpload(bookFile, statementFile, prevBrsFile, reconType, hotBookFile);
        }
    };

    const reconPillLabel = () => {
        if (results?.recon_type === 'qr') return 'QR Gateway';
        if (results?.recon_type === 'gateway') return 'Gateway YES Bank';
        return 'Bank Reconciliation';
    };
    const reconPillClass = () => {
        if (results?.recon_type === 'qr') return styles.reconModePillQr;
        if (results?.recon_type === 'gateway') return styles.reconModePillGateway;
        return styles.reconModePillBank;
    };

    return (
        // Match the exact PageContainer usage of other pages: gap-4 p-6
        // NO overflow-y here — the parent layout (AuthenticatedLayout) is the single scroller
        <PageContainer className="gap-4 p-6">
            {/* Results action bar — only shown when viewing results */}
            {stage === 'results' && (
                <div className={styles.pageHeader}>
                    {results?.recon_type && <span className={cx(styles.reconModePill, reconPillClass())}>{reconPillLabel()}</span>}
                    <button
                        className={styles.btnOutline}
                        onClick={() => {
                            setStage('upload');
                            setResults(null);
                            setError(null);
                        }}
                    >
                        ← New Reconciliation
                    </button>
                </div>
            )}

            {/* Error banner */}
            {error && (
                <div className={styles.appError}>
                    <div className={styles.appErrorBody}>
                        <span className={styles.appErrorTitle}>Error</span>
                        <span className={styles.appErrorMsg}>{error}</span>
                    </div>
                    <button className={styles.appErrorClose} onClick={() => setError(null)}>
                        Dismiss
                    </button>
                </div>
            )}

            {/* Content — flows naturally, no inner scroll container */}
            {stage === 'upload' ? (
                <FileUpload onUpload={handleUploadDispatch} isLoading={isLoading} />
            ) : (
                <Results data={results!} apiBaseUrl={API_BASE_URL} />
            )}
        </PageContainer>
    );
}

export default ListReconcilationPage;
