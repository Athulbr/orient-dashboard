import React, { useState, useRef } from 'react';
import styles from '../styles/FileUpload.module.css';
import { cx } from '../utils/cx';
import { DialogComponent } from '../../../components/DialogComponent';
import { Button } from '../../../components/Button';
import { useNavigate } from 'react-router-dom';

export type ReconType = 'bank' | 'qr' | 'gateway';

interface FileUploadProps {
    onUpload: (
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
    ) => void;
    isLoading: boolean;
}

const VALID_EXT = ['.xlsx', '.xls', '.csv'];
const VALID_EXT_PDF = ['.xlsx', '.xls', '.csv', '.pdf'];

interface SlotConfig {
    id: string;
    label: string;
    sublabel: string;
    ref: React.RefObject<HTMLInputElement | null>;
    file: File | null;
    onFile: (f: File) => void;
    onClear: () => void;
    required?: boolean;
    accent?: 'qr' | 'gateway';
    accept?: string;
    icon?: string;
}

const TYPE_META: Record<ReconType, { icon: string; label: string; desc: string; files: string }> = {
    bank: { icon: '', label: 'Bank Reconciliation', desc: 'Standard bank statement — HDFC, Axis, SBI, ICICI, IndusInd, etc.', files: '3 required' },
    qr: { icon: '', label: 'QR Gateway Reconciliation', desc: 'HDFC QR gateway transaction report — SaleSuccess UPI transactions.', files: '4 required' },
    gateway: { icon: '', label: 'Gateway YES Bank', desc: 'PayU / CashFree / EaseBuzz settlements vs YES Bank statement.', files: '11 required' }
};

const FileUpload: React.FC<FileUploadProps> = ({ onUpload, isLoading }) => {
    const [reconType, setReconType] = useState<ReconType | null>(null);
    // step1Open = true means type-selector is expanded; false = collapsed (showing summary)
    const [step1Open, setStep1Open] = useState(true);
    const navigate = useNavigate();

    const [bookFile, setBookFile] = useState<File | null>(null);
    const [hotBookFile, setHotBookFile] = useState<File | null>(null);
    const [statFile, setStatFile] = useState<File | null>(null);
    const [prevBrsFile, setPrevFile] = useState<File | null>(null);
    const [payuFiles, setPayuFiles] = useState<File[]>([]);
    const [payuOdFiles, setPayuOdFiles] = useState<File[]>([]);
    const [cashfreeFiles, setCashfreeFiles] = useState<File[]>([]);
    const [easebuzzFiles, setEasebuzzFiles] = useState<File[]>([]);
    const [smartPayFiles, setSmartPayFiles] = useState<File[]>([]);
    const [alertMessage, setAlertMessage] = useState<string | null>(null);
    const [nameMatchDirectFile, setNameMatchDirectFile] = useState<File | null>(null);
    const [nameMatchFile, setNameMatchFile] = useState<File | null>(null);
    const [totalOrdersFile, setTotalOrdersFile] = useState<File | null>(null);

    const [errors, setErrors] = useState<string[]>([]);
    const [dragOver, setDragOver] = useState<string | null>(null);

    const bookRef = useRef<HTMLInputElement>(null);
    const hotBookRef = useRef<HTMLInputElement>(null);
    const stmtRef = useRef<HTMLInputElement>(null);
    const prevRef = useRef<HTMLInputElement>(null);
    const payuRef = useRef<HTMLInputElement>(null);
    const payuOdRef = useRef<HTMLInputElement>(null);
    const cashfreeRef = useRef<HTMLInputElement>(null);
    const easebuzzRef = useRef<HTMLInputElement>(null);
    const smartPayRef = useRef<HTMLInputElement>(null);
    const nameMatchDirectRef = useRef<HTMLInputElement>(null);
    const nameMatchRef = useRef<HTMLInputElement>(null);
    const totalOrdersRef = useRef<HTMLInputElement>(null);

    const validate = (file: File, allowPdf = false): boolean => {
        const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
        const allowed = allowPdf ? VALID_EXT_PDF : VALID_EXT;
        if (!allowed.includes(ext)) {
            setErrors([`"${file.name}" is not supported. Use ${allowed.join(', ')}.`]);
            return false;
        }
        setErrors([]);
        return true;
    };

    const handleSelectType = (type: ReconType) => {
        setReconType(type);
        setBookFile(null);
        setHotBookFile(null);
        setStatFile(null);
        setPrevFile(null);
        setPayuFiles([]);
        setPayuOdFiles([]);
        setCashfreeFiles([]);
        setEasebuzzFiles([]);
        setSmartPayFiles([]);
        setNameMatchDirectFile(null);
        setNameMatchFile(null);
        setTotalOrdersFile(null);
        setErrors([]);
        // collapse step 1, open step 2
        setStep1Open(false);
    };

    const handleDrop = (e: React.DragEvent, slot: string) => {
        e.preventDefault();
        setDragOver(null);
        const file = e.dataTransfer.files[0];
        if (!file) return;
        if (slot === 'book') {
            if (validate(file)) setBookFile(file);
        }
        if (slot === 'hotbook') {
            if (validate(file)) setHotBookFile(file);
        }
        if (slot === 'stmt') {
            if (validate(file, reconType === 'gateway')) setStatFile(file);
        }
        if (slot === 'prev') {
            if (validate(file)) setPrevFile(file);
        }
        if (slot === 'namematchdirect') {
            if (validate(file)) setNameMatchDirectFile(file);
        }
        if (slot === 'namematch') {
            if (validate(file)) setNameMatchFile(file);
        }
        if (slot === 'totalorders') {
            if (validate(file)) setTotalOrdersFile(file);
        }
        const handleMulti = (currentFiles: File[], setFilesFn: React.Dispatch<React.SetStateAction<File[]>>, allowPdf: boolean, label: string) => {
            const droppedFiles = Array.from(e.dataTransfer.files);
            const valid = droppedFiles.filter(f => validate(f, allowPdf));
            if (valid.length) {
                setFilesFn(prev => {
                    const total = [...prev, ...valid];
                    if (total.length > 4) {
                        setAlertMessage(`Maximum 4 files allowed for ${label}. Taking the first 4 files.`);
                        setErrors([]);
                        return total.slice(0, 4);
                    }
                    setErrors([]);
                    return total;
                });
            }
        };

        if (slot === 'payu') {
            handleMulti(payuFiles, setPayuFiles, false, 'PayU Regular');
        }
        if (slot === 'payuod') {
            handleMulti(payuOdFiles, setPayuOdFiles, false, 'PayU On-Demand');
        }
        if (slot === 'cashfree') {
            handleMulti(cashfreeFiles, setCashfreeFiles, false, 'CashFree');
        }
        if (slot === 'easebuzz') {
            handleMulti(easebuzzFiles, setEasebuzzFiles, true, 'EaseBuzz');
        }
        if (slot === 'smartpay') {
            handleMulti(smartPayFiles, setSmartPayFiles, false, 'Smart Pay');
        }
    };

    const handleSubmit = () => {
        const errs: string[] = [];
        if (reconType === 'bank') {
            if (!bookFile) errs.push('Book Report is required.');
            if (!statFile) errs.push('Bank Statement is required.');
        } else if (reconType === 'qr') {
            if (!bookFile) errs.push('All-Branches Book Report is required.');
            if (!hotBookFile) errs.push('HOT Book Report is required.');
            if (!statFile) errs.push('QR Statement is required.');
        } else if (reconType === 'gateway') {
            if (!bookFile) errs.push('All-Branches Book is required.');
            if (!hotBookFile) errs.push('HOT Book is required.');
            if (!statFile) errs.push('YES Bank Statement (PDF) is required.');
            if (payuFiles.length === 0) errs.push('PayU Regular report is required.');
            if (!nameMatchDirectFile) errs.push('Name Matching Report - Direct payment is required.');
            if (!nameMatchFile) errs.push('Name Matching Report is required.');
            if (!totalOrdersFile) errs.push('Total Orders List is required.');
        }
        if (errs.length) {
            setErrors(errs);
            return;
        }
        setErrors([]);
        onUpload(
            bookFile!,
            statFile!,
            prevBrsFile,
            reconType!,
            hotBookFile,
            payuOdFiles.length > 0 ? payuOdFiles : [],
            cashfreeFiles.length > 0 ? cashfreeFiles : [],
            easebuzzFiles.length > 0 ? easebuzzFiles : [],
            payuFiles.length > 0 ? payuFiles : [],
            nameMatchDirectFile,
            nameMatchFile,
            totalOrdersFile,
            smartPayFiles.length > 0 ? smartPayFiles : []
        );
    };

    const canSubmit =
        reconType &&
        !isLoading &&
        (() => {
            if (reconType === 'bank') return !!bookFile && !!statFile;
            if (reconType === 'qr') return !!bookFile && !!hotBookFile && !!statFile;
            if (reconType === 'gateway') return !!bookFile && !!hotBookFile && !!statFile && payuFiles.length > 0 && !!nameMatchDirectFile && !!nameMatchFile && !!totalOrdersFile;
            return false;
        })();

    // ── Slot renderer ──────────────────────────────────────────────────────────
    const renderSlot = (cfg: SlotConfig) => {
        const { id, label, sublabel, ref, file, onFile, onClear, required = true, accent, accept = '.xlsx,.xls,.csv' } = cfg;
        const isDragging = dragOver === id;
        return (
            <div
                key={id}
                className={cx(styles['upload-slot'], isDragging && styles['upload-slot--drag'], file && styles['upload-slot--filled'], accent && file && styles[`upload-slot--${accent}`])}
                onDragOver={e => {
                    e.preventDefault();
                    setDragOver(id);
                }}
                onDragLeave={() => setDragOver(null)}
                onDrop={e => handleDrop(e, id)}
                onClick={() => !isLoading && !file && ref.current?.click()}
            >
                <input
                    ref={ref}
                    type="file"
                    accept={accept}
                    className={styles['file-input']}
                    disabled={isLoading}
                    onChange={e => {
                        const f = e.target.files?.[0];
                        if (f) onFile(f);
                        e.target.value = '';
                    }}
                />
                {!file ? (
                    <div className={styles['slot-empty']}>
                        <div className={styles['slot-text']}>
                            <p className={styles['slot-label']}>{label}</p>
                            <p className={styles['slot-sub']}>{sublabel}</p>
                            <p className={styles['slot-formats']}>{accept.split(',').join(' · ')}</p>
                        </div>
                        <div className={styles['slot-cta']}>Click or drag file here</div>
                    </div>
                ) : (
                    <div className={styles['slot-filled']} onClick={e => e.stopPropagation()}>
                        <div className={styles['slot-filled-icon']}></div>
                        <div className={styles['slot-filled-info']}>
                            <p className={styles['slot-filled-label']}>{label}</p>
                            <p className={styles['slot-filled-name']} title={file.name}>
                                {file.name}
                            </p>
                        </div>
                        <button
                            className={styles['slot-remove']}
                            disabled={isLoading}
                            onClick={e => {
                                e.stopPropagation();
                                onClear();
                            }}
                            aria-label="Remove file"
                        >
                            ✕
                        </button>
                    </div>
                )}
            </div>
        );
    };

    // ── Multi-file slot ────────────────────────────────────────────────────────
    const renderMultiSlot = (cfg: {
        id: string;
        label: string;
        sublabel: string;
        ref: React.RefObject<HTMLInputElement | null>;
        files: File[];
        setFiles: React.Dispatch<React.SetStateAction<File[]>>;
        accent?: 'qr' | 'gateway';
        accept?: string;
        allowPdf?: boolean;
    }) => {
        const { id, label, sublabel, ref, files, setFiles, accent, accept = '.xlsx,.xls,.csv', allowPdf = false } = cfg;
        const hasFiles = files.length > 0;
        const isDragging = dragOver === id;

        return (
            <div
                key={id}
                className={cx(styles['upload-slot'], isDragging && styles['upload-slot--drag'], hasFiles && styles['upload-slot--filled'], accent && hasFiles && styles[`upload-slot--${accent}`])}
                onDragOver={e => {
                    e.preventDefault();
                    setDragOver(id);
                }}
                onDragLeave={() => setDragOver(null)}
                onDrop={e => handleDrop(e, id)}
                onClick={() => !isLoading && ref.current?.click()}
            >
                <input
                    ref={ref as React.RefObject<HTMLInputElement>}
                    type="file"
                    accept={accept}
                    className={styles['file-input']}
                    multiple
                    disabled={isLoading}
                    onChange={e => {
                        const selectedFiles = Array.from(e.target.files || []);
                        const valid = selectedFiles.filter(f => validate(f, allowPdf));
                        if (valid.length) {
                            setFiles(prev => {
                                const total = [...prev, ...valid];
                                if (total.length > 4) {
                                    setAlertMessage(`Maximum 4 files allowed for ${label}. Taking the first 4 files.`);
                                    setErrors([]);
                                    return total.slice(0, 4);
                                }
                                setErrors([]);
                                return total;
                            });
                        }
                        e.target.value = '';
                    }}
                />

                {!hasFiles ? (
                    <div className={styles['slot-empty']}>
                        <div className={styles['slot-text']}>
                            <p className={styles['slot-label']}>{label}</p>
                            <p className={styles['slot-sub']}>{sublabel}</p>
                            <p className={styles['slot-formats']}>{accept.split(',').join(' · ')}</p>
                        </div>
                        <div className={styles['slot-cta']}>Click or drag file(s) here</div>
                    </div>
                ) : (
                    <div className={styles['slot-filled']} onClick={e => e.stopPropagation()}>
                        <div className={styles['slot-filled-icon']} />
                        <div className={styles['slot-filled-info']}>
                            <p className={styles['slot-filled-label']}>{label}</p>
                            {files.map((file, idx) => (
                                <div
                                    key={idx}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        gap: '8px'
                                    }}
                                >
                                    <p className={styles['slot-filled-name']} title={file.name} style={{ margin: 0 }}>
                                        {file.name}
                                    </p>
                                    <button
                                        className={styles['slot-remove']}
                                        disabled={isLoading}
                                        onClick={e => {
                                            e.stopPropagation();
                                            setFiles(prev => prev.filter((_, i) => i !== idx));
                                        }}
                                    >
                                        ✕
                                    </button>
                                </div>
                            ))}
                        </div>
                        {files.length < 4 && (
                            <button
                                className={styles['slot-add-more']}
                                disabled={isLoading}
                                onClick={e => {
                                    e.stopPropagation();
                                    ref.current?.click();
                                }}
                            >
                                + Add
                            </button>
                        )}
                    </div>
                )}
            </div>
        );
    };

    // ── Slot grids ─────────────────────────────────────────────────────────────
    const renderSlots = () => {
        if (!reconType) return null;
        if (reconType === 'bank')
            return (
                <div className={cx(styles['upload-slots'], styles['upload-slots--bank'])}>
                    {renderSlot({
                        id: 'book',
                        label: 'Book Report',
                        sublabel: 'Company ledger / book entries',
                        ref: bookRef,
                        file: bookFile,
                        onFile: f => {
                            if (validate(f)) setBookFile(f);
                        },
                        onClear: () => setBookFile(null)
                    })}
                    {renderSlot({
                        id: 'stmt',
                        label: 'Bank Statement',
                        sublabel: 'Bank transaction statement',
                        ref: stmtRef,
                        file: statFile,
                        onFile: f => {
                            if (validate(f)) setStatFile(f);
                        },
                        onClear: () => setStatFile(null)
                    })}
                    {renderSlot({
                        id: 'prev',
                        label: 'Previous BRS',
                        sublabel: 'For carry-forward matching',
                        ref: prevRef,
                        file: prevBrsFile,
                        onFile: f => {
                            if (validate(f)) setPrevFile(f);
                        },
                        onClear: () => setPrevFile(null)
                    })}
                </div>
            );
        if (reconType === 'qr')
            return (
                <div className={cx(styles['upload-slots'], styles['upload-slots--qr'])}>
                    {renderSlot({
                        id: 'book',
                        label: 'All-Branches Book Report',
                        sublabel: 'All-branches consolidated ledger',
                        ref: bookRef,
                        file: bookFile,
                        onFile: f => {
                            if (validate(f)) setBookFile(f);
                        },
                        onClear: () => setBookFile(null)
                    })}
                    {renderSlot({
                        id: 'hotbook',
                        label: 'HOT Book Report',
                        sublabel: 'HOT QRHDFC book entries',
                        ref: hotBookRef,
                        file: hotBookFile,
                        accent: 'qr',
                        onFile: f => {
                            if (validate(f)) setHotBookFile(f);
                        },
                        onClear: () => setHotBookFile(null)
                    })}
                    {renderSlot({
                        id: 'stmt',
                        label: 'QR Gateway Statement',
                        sublabel: 'HDFC QR transaction report',
                        ref: stmtRef,
                        file: statFile,
                        accent: 'qr',
                        onFile: f => {
                            if (validate(f)) setStatFile(f);
                        },
                        onClear: () => setStatFile(null)
                    })}
                    {renderSlot({
                        id: 'prev',
                        label: 'Previous BRS',
                        sublabel: 'For carry-forward matching',
                        ref: prevRef,
                        file: prevBrsFile,
                        onFile: f => {
                            if (validate(f)) setPrevFile(f);
                        },
                        onClear: () => setPrevFile(null)
                    })}
                </div>
            );
        if (reconType === 'gateway')
            return (
                <div className={cx(styles['upload-slots'], styles['upload-slots--gateway'])}>
                    {renderSlot({
                        id: 'book',
                        label: 'All-Branches Book',
                        sublabel: 'All-branches Gateway book (.xls)',
                        ref: bookRef,
                        file: bookFile,
                        accent: 'gateway',
                        onFile: f => {
                            if (validate(f)) setBookFile(f);
                        },
                        onClear: () => setBookFile(null)
                    })}
                    {renderSlot({
                        id: 'hotbook',
                        label: 'HOT Book',
                        sublabel: 'HOT Gateway book report (.xls)',
                        ref: hotBookRef,
                        file: hotBookFile,
                        accent: 'gateway',
                        onFile: f => {
                            if (validate(f)) setHotBookFile(f);
                        },
                        onClear: () => setHotBookFile(null)
                    })}
                    {renderSlot({
                        id: 'stmt',
                        label: 'YES Bank Statement',
                        sublabel: 'YES Bank statement PDF',
                        ref: stmtRef,
                        file: statFile,
                        accent: 'gateway',
                        accept: '.pdf,.xlsx,.xls',
                        onFile: f => {
                            if (validate(f, true)) setStatFile(f);
                        },
                        onClear: () => setStatFile(null)
                    })}
                    {renderMultiSlot({ id: 'payu', label: 'PayU Regular', sublabel: 'PayU transaction report (.xlsx)', ref: payuRef, files: payuFiles, setFiles: setPayuFiles, accent: 'gateway' })}
                    {renderMultiSlot({ id: 'payuod', label: 'PayU On-Demand', sublabel: 'Multiple files allowed', ref: payuOdRef, files: payuOdFiles, setFiles: setPayuOdFiles })}
                    {renderMultiSlot({ id: 'cashfree', label: 'CashFree', sublabel: 'CashFree settlement report (.xlsx)', ref: cashfreeRef, files: cashfreeFiles, setFiles: setCashfreeFiles })}
                    {renderMultiSlot({
                        id: 'easebuzz',
                        label: 'EaseBuzz',
                        sublabel: 'EaseBuzz settlement report (.csv)',
                        ref: easebuzzRef,
                        files: easebuzzFiles,
                        setFiles: setEasebuzzFiles,
                        accept: '.csv,.xlsx,.xls',
                        allowPdf: true
                    })}
                    {renderMultiSlot({
                        id: 'smartpay',
                        label: 'Smart Pay',
                        sublabel: 'Smart Pay settlement report (.xlsx)',
                        ref: smartPayRef,
                        files: smartPayFiles,
                        setFiles: setSmartPayFiles
                    })}
                    {renderSlot({
                        id: 'namematchdirect',
                        label: 'Name Match - Direct Payment',
                        sublabel: 'Name Matching Report - Direct payment workbook',
                        ref: nameMatchDirectRef,
                        file: nameMatchDirectFile,
                        accent: 'gateway',
                        onFile: f => {
                            if (validate(f)) setNameMatchDirectFile(f);
                        },
                        onClear: () => setNameMatchDirectFile(null)
                    })}
                    {renderSlot({
                        id: 'namematch',
                        label: 'Name Matching Report',
                        sublabel: 'Name Matching Report workbook',
                        ref: nameMatchRef,
                        file: nameMatchFile,
                        accent: 'gateway',
                        onFile: f => {
                            if (validate(f)) setNameMatchFile(f);
                        },
                        onClear: () => setNameMatchFile(null)
                    })}
                    {renderSlot({
                        id: 'totalorders',
                        label: 'Total Orders List',
                        sublabel: 'Total Orders List workbook',
                        ref: totalOrdersRef,
                        file: totalOrdersFile,
                        accent: 'gateway',
                        onFile: f => {
                            if (validate(f)) setTotalOrdersFile(f);
                        },
                        onClear: () => setTotalOrdersFile(null)
                    })}
                    {renderSlot({
                        id: 'prev',
                        label: 'Previous BRS',
                        sublabel: 'For carry-forward matching',
                        ref: prevRef,
                        file: prevBrsFile,
                        onFile: f => {
                            if (validate(f)) setPrevFile(f);
                        },
                        onClear: () => setPrevFile(null)
                    })}
                </div>
            );
    };

    // ── Progress dots ──────────────────────────────────────────────────────────
    const progressItems = () => {
        if (reconType === 'bank')
            return [
                { label: 'Book Report', done: !!bookFile, required: true },
                { label: 'Bank Statement', done: !!statFile, required: true },
                { label: 'Previous BRS', done: !!prevBrsFile, required: true }
            ];
        if (reconType === 'qr')
            return [
                { label: 'All-Branches Book', done: !!bookFile, required: true },
                { label: 'HOT Book', done: !!hotBookFile, required: true },
                { label: 'QR Statement', done: !!statFile, required: true },
                { label: 'Previous BRS', done: !!prevBrsFile, required: true }
            ];
        if (reconType === 'gateway')
            return [
                { label: 'All-Branches Book', done: !!bookFile, required: true },
                { label: 'HOT Book', done: !!hotBookFile, required: true },
                { label: 'YES Bank PDF', done: !!statFile, required: true },
                { label: 'PayU Regular', done: payuFiles.length > 0, required: true },
                { label: 'PayU On-Demand', done: payuOdFiles.length > 0, required: true },
                { label: 'CashFree', done: cashfreeFiles.length > 0, required: true },
                { label: 'EaseBuzz', done: easebuzzFiles.length > 0, required: true },
                { label: 'Smart Pay', done: smartPayFiles.length > 0, required: false },
                { label: 'Name Match Direct', done: !!nameMatchDirectFile, required: true },
                { label: 'Name Matching', done: !!nameMatchFile, required: true },
                { label: 'Total Orders', done: !!totalOrdersFile, required: true },
                { label: 'Previous BRS', done: !!prevBrsFile, required: true }
            ];
        return [];
    };

    const selectedMeta = reconType ? TYPE_META[reconType] : null;

    return (
        <div className={styles['stepper-container']}>
            <div className="flex justify-end">
                <Button outlined onClick={() => navigate('/reconcilation/recent')}>
                    Recent Reconciliations
                </Button>
            </div>

            {/* ── Step 1: Select Type ───────────────────────────────────────────── */}
            <div className={cx(styles['stepper-card'], !step1Open && reconType && styles['stepper-card--done'])}>
                {/* Card header — always visible, clickable to toggle */}
                <button
                    className={styles['stepper-header']}
                    onClick={() => {
                        if (reconType) setStep1Open(o => !o); // only toggle if a type was ever chosen
                    }}
                    disabled={isLoading}
                    aria-expanded={step1Open}
                >
                    <span className={cx(styles['stepper-badge'], !step1Open && reconType && styles['stepper-badge--done'])}>{!step1Open && reconType ? '✓' : '1'}</span>
                    <span className={styles['stepper-title']}>{!step1Open && selectedMeta ? <>{selectedMeta.label}</> : 'Select Reconciliation Type'}</span>
                    {!step1Open && reconType && <span className={styles['stepper-change']}>Change</span>}
                </button>

                {/* Expandable body */}
                {step1Open && (
                    <div className={styles['stepper-body']}>
                        <div className={cx(styles['type-cards'], styles['type-cards--three'])}>
                            {(['bank', 'qr', 'gateway'] as ReconType[]).map(type => {
                                const m = TYPE_META[type];
                                const isActive = reconType === type;
                                return (
                                    <button
                                        key={type}
                                        className={cx(
                                            styles['type-card'],
                                            isActive && styles['type-card--active'],
                                            isActive && styles[`type-card--${type === 'bank' ? 'bank' : type === 'qr' ? 'bank' : 'bank'}`]
                                        )}
                                        onClick={() => handleSelectType(type)}
                                        disabled={isLoading}
                                    >
                                        <span className={styles['type-card-body']}>
                                            <span className={styles['type-card-title']}>{m.label}</span>
                                            <span className={styles['type-card-desc']}>{m.desc}</span>
                                            <span className={styles['type-card-files']}>{m.files}</span>
                                        </span>
                                        {isActive && <span className={styles['type-card-check']}>✓</span>}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>

            {/* ── Step 2: Upload Files ──────────────────────────────────────────── */}
            <div className={cx(styles['stepper-card'], !reconType && styles['stepper-card--locked'])}>
                {/* Card header */}
                <button
                    className={styles['stepper-header']}
                    onClick={() => {
                        if (reconType) setStep1Open(false);
                    }}
                    disabled={!reconType || isLoading}
                    aria-expanded={!!reconType && !step1Open}
                >
                    <span className={cx(styles['stepper-badge'], !reconType && styles['stepper-badge--locked'])}>2</span>
                    <span className={styles['stepper-title']}>Upload Files</span>
                    {selectedMeta && !step1Open && <span className={cx(styles['files-step-badge'], styles['files-step-badge--bank'])}>{selectedMeta.label}</span>}
                </button>

                {/* Expandable body — only when type chosen and step 1 collapsed */}
                {reconType && !step1Open && (
                    <div className={styles['stepper-body']}>
                        {renderSlots()}

                        {/* Progress tracker */}
                        <div className={styles['upload-progress']}>
                            {progressItems().map((item, i) => (
                                <div key={i} className={cx(styles['progress-item'], item.done && styles['progress-item--done'])}>
                                    <span className={styles['progress-dot']}>{item.done ? '✓' : '○'}</span>
                                    <span className={styles['progress-label']}>{item.label}</span>
                                </div>
                            ))}
                        </div>

                        {/* Errors */}
                        {errors.length > 0 && (
                            <div className={styles['upload-errors']}>
                                {errors.map((err, i) => (
                                    <p key={i} className={styles['upload-error-item']}>
                                        {err}
                                    </p>
                                ))}
                            </div>
                        )}

                        {/* Actions */}
                        <div className={styles['upload-actions']}>
                            <button onClick={handleSubmit} disabled={!canSubmit} className={cx(styles['btn'], styles['btn-primary'])}>
                                {isLoading ? (
                                    <>
                                        <span className={styles['spinner']} />
                                        Processing…
                                    </>
                                ) : (
                                    `Run ${reconType === 'bank' ? '' : reconType === 'qr' ? 'QR ' : 'Gateway '}Reconciliation`
                                )}
                            </button>
                        </div>
                    </div>
                )}
            </div>

            <DialogComponent
                isOpen={!!alertMessage}
                closeDialog={() => setAlertMessage(null)}
                name="File Limit Reached"
                primaryButtonText="Got it"
                onPrimaryAction={() => setAlertMessage(null)}
                className="max-w-md w-full"
            >
                <div className="p-6 pt-2 text-gray-600">{alertMessage}</div>
            </DialogComponent>
        </div>
    );
};

export default FileUpload;
