import { useEffect, useState } from 'react';
import { CheckCircle, XCircle, Loader, Copy, Download } from 'lucide-react';
import { DialogComponent } from '../../../components/DialogComponent';
import { useTenantState } from './hooks/tenantContext';
import { useToastStore } from '../../../components/toast/ToastStore';
import httpRequest from '../../../global-utils/httpRequest';
import { config } from '../../../config/default';

// ─── Types ────────────────────────────────────────────────────────────────────

type AuthMethod = 'jwt' | 'hash';
type AuthStatus = 'idle' | 'loading' | 'success' | 'error';
type TokenPlacement = 'header' | 'param';

interface SavedAuth {
    method: AuthMethod;
    token: string;
    publicKey?: string; // hash method — needed in request
}

const TABS = ['Auth', 'Prepare Payload', 'HTTP Request', 'Handle Response'] as const;
type Tab = (typeof TABS)[number];

// ─── SHA-1 helper (Web Crypto API — no external deps) ─────────────────────────

async function sha1Hex(input: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(input);
    const hashBuffer = await crypto.subtle.digest('SHA-1', data);
    return Array.from(new Uint8Array(hashBuffer))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

// ─── Shared Field input ───────────────────────────────────────────────────────

interface FieldProps {
    label: string;
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
    type?: string;
}

const Field: React.FC<FieldProps> = ({ label, value, onChange, placeholder, type = 'text' }) => (
    <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-gray-700">{label}</label>
        <input
            type={type}
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder={placeholder}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
        />
    </div>
);

// ─── Auth status badge ────────────────────────────────────────────────────────

const StatusBadge: React.FC<{ status: AuthStatus; message?: string }> = ({ status, message }) => {
    if (status === 'idle') return null;
    if (status === 'loading')
        return (
            <div className="flex items-center gap-2 text-sm text-gray-500">
                <Loader size={16} className="animate-spin" />
                <span>Testing connection...</span>
            </div>
        );
    if (status === 'success')
        return (
            <div className="flex items-center gap-2 text-sm text-green-600">
                <CheckCircle size={16} />
                <span>{message || 'Authentication successful'}</span>
            </div>
        );
    return (
        <div className="flex items-center gap-2 text-sm text-red-600">
            <XCircle size={16} />
            <span>{message || 'Authentication failed'}</span>
        </div>
    );
};

// ─── Auth Tab ─────────────────────────────────────────────────────────────────

interface AuthTabProps {
    onSaveAuth: (auth: SavedAuth) => void;
    savedAuth: SavedAuth | null;
}

const AuthTab: React.FC<AuthTabProps> = ({ onSaveAuth, savedAuth }) => {
    const toast = useToastStore();
    const [method, setMethod] = useState<AuthMethod>('jwt');
    const [status, setStatus] = useState<AuthStatus>('idle');
    const [statusMessage, setStatusMessage] = useState('');
    const [jwtUrl, setJwtUrl] = useState('');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [publicKey, setPublicKey] = useState('');
    const [privateKey, setPrivateKey] = useState('');

    const reset = () => {
        setStatus('idle');
        setStatusMessage('');
    };

    const testJwtAuth = async () => {
        if (!jwtUrl || !username || !password) {
            toast.error('Please fill in all fields');
            return;
        }
        setStatus('loading');
        try {
            const response = await fetch(jwtUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                body: JSON.stringify({ email: username, password })
            });
            const result = await response.json();
            if (response.ok) {
                const token = result?.token || result?.access_token || result?.accessToken || result?.data?.token || result?.data?.access_token || result?.data?.accessToken || '';
                setStatus('success');
                setStatusMessage('JWT authentication successful — token received');
                onSaveAuth({ method: 'jwt', token });
            } else {
                setStatus('error');
                setStatusMessage(result?.message || `Failed with status ${response.status}`);
            }
        } catch (err: any) {
            setStatus('error');
            setStatusMessage(err?.message || 'Request failed — check the URL and credentials');
        }
    };

    const testHashAuth = async () => {
        if (!publicKey || !privateKey) {
            toast.error('Please enter both keys');
            return;
        }
        setStatus('loading');
        try {
            const timestamp = Math.floor(Date.now() / 1000);
            const hash = await sha1Hex(`${publicKey}:${privateKey}:${timestamp}`);
            setStatus('success');
            setStatusMessage(`Hash generated — SHA-1: ${hash.slice(0, 16)}…`);
            onSaveAuth({ method: 'hash', token: hash, publicKey });
        } catch (err: any) {
            setStatus('error');
            setStatusMessage(err?.message || 'Failed to generate hash');
        }
    };

    return (
        <div className="flex flex-col gap-6 p-8">
            {/* Method selector */}
            <div className="flex flex-col gap-2">
                <span className="text-sm font-semibold text-gray-700">Authentication Method</span>
                <div className="flex gap-6">
                    <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
                        <input
                            type="radio"
                            name="authMethod"
                            value="jwt"
                            checked={method === 'jwt'}
                            onChange={() => {
                                setMethod('jwt');
                                reset();
                            }}
                            className="accent-blue-600"
                        />
                        JWT Token (Username &amp; Password)
                    </label>
                    <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
                        <input
                            type="radio"
                            name="authMethod"
                            value="hash"
                            checked={method === 'hash'}
                            onChange={() => {
                                setMethod('hash');
                                reset();
                            }}
                            className="accent-blue-600"
                        />
                        Hash (API Keys)
                    </label>
                </div>
            </div>

            {/* JWT fields */}
            <div className={`flex flex-col gap-4 rounded-lg border border-gray-200 bg-gray-50 p-5 ${method !== 'jwt' ? 'hidden' : ''}`}>
                <Field label="Endpoint URL" value={jwtUrl} onChange={setJwtUrl} placeholder="https://example.com/workflow/v1/authenticate" />
                <Field label="Username" value={username} onChange={setUsername} placeholder="Enter username" />
                <Field label="Password" value={password} onChange={setPassword} placeholder="Enter password" type="password" />
            </div>

            {/* Hash fields */}
            <div className={`flex flex-col gap-4 rounded-lg border border-gray-200 bg-gray-50 p-5 ${method !== 'hash' ? 'hidden' : ''}`}>
                <p className="text-xs text-gray-500">
                    A SHA-1 hash will be generated from <code className="rounded bg-gray-100 px-1">PublicKey:PrivateKey:UnixTimestamp</code>.
                </p>
                <Field label="Public Key" value={publicKey} onChange={setPublicKey} placeholder="Enter public key" />
                <Field label="Private Key" value={privateKey} onChange={setPrivateKey} placeholder="Enter private key" type="password" />
            </div>

            <div className="flex items-center justify-between">
                <div className="flex flex-col gap-1">
                    <StatusBadge status={status} message={statusMessage} />
                    {savedAuth && (
                        <span className="flex items-center gap-1.5 text-xs text-green-600">
                            <CheckCircle size={13} />
                            Auth saved — token ready for HTTP Request tab
                        </span>
                    )}
                </div>
                <button
                    onClick={method === 'jwt' ? testJwtAuth : testHashAuth}
                    disabled={status === 'loading'}
                    className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                    Test Authentication
                </button>
            </div>
        </div>
    );
};

// ─── Prepare Payload Tab ───────────────────────────────────────────────────────

interface FlatField {
    displayName: string;
    sourcePath: string;
    targetKey: string;
    required: boolean;
    parentDataType?: string;
}

function flattenFields(fields: any[]): Omit<FlatField, 'targetKey'>[] {
    const result: Omit<FlatField, 'targetKey'>[] = [];
    for (const field of fields) {
        if (field.isHidden) continue;
        if (field.subFields?.length > 0) {
            for (const sub of field.subFields) {
                if (sub.isHidden) continue;
                const pathSep = field.dataType === 'list' ? '[].' : '.';
                result.push({
                    displayName: `${field.name} › ${sub.name}`,
                    sourcePath: `${field.jsonKey}${pathSep}${sub.jsonKey}`,
                    required: sub.required ?? false,
                    parentDataType: field.dataType
                });
            }
        } else {
            result.push({
                displayName: field.name,
                sourcePath: field.jsonKey,
                required: field.required ?? false
            });
        }
    }
    return result;
}

function setDeep(obj: Record<string, any>, dotPath: string, value: any) {
    // Normalize bracket notation → dot notation: "items[0].name" → ["items","0","name"]
    const parts = dotPath
        .replace(/\[(\d+)\]/g, '.$1')
        .split('.')
        .filter(Boolean);
    let cur: any = obj;
    for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        const nextIsIndex = /^\d+$/.test(parts[i + 1]);
        if (cur[part] == null) {
            cur[part] = nextIsIndex ? [] : {};
        }
        cur = cur[part];
    }
    cur[parts[parts.length - 1]] = value;
}

function buildFinalPayload(mappings: Record<string, string>, extractedData: any): Record<string, any> {
    const result: Record<string, any> = {};
    for (const [sourcePath, targetKey] of Object.entries(mappings)) {
        const key = targetKey.trim();
        if (!key) continue;
        const rawVal = getValueAtPath(extractedData, sourcePath);
        const val = rawVal && typeof rawVal === 'object' && 'value' in rawVal ? rawVal.value : rawVal;
        setDeep(result, key, val ?? null);
    }
    return result;
}

// ─── Helpers for extractedData field list ─────────────────────────────────────

interface ExtractedField {
    path: string; // dot-notation path  e.g. "product_information.vendor_product_name"
    label: string; // last key segment
    level: number; // 0 = top-level group, 1 = sub-field
    isGroup: boolean; // true for dict/list parents
}

function buildFieldList(data: any, prefix = '', level = 0): ExtractedField[] {
    if (!data || typeof data !== 'object') return [];
    const result: ExtractedField[] = [];
    const entries = Array.isArray(data) ? (data.length > 0 && typeof data[0] === 'object' ? Object.entries(data[0]) : []) : Object.entries(data);

    for (const [key, val] of entries) {
        const path = prefix ? `${prefix}.${key}` : key;
        const isLeafObj = val && typeof val === 'object' && !Array.isArray(val) && 'value' in val;
        const isGroup = val && typeof val === 'object' && !isLeafObj;

        result.push({ path, label: key, level, isGroup: !!isGroup });

        if (isGroup) {
            result.push(...buildFieldList(val as any, path, level + 1));
        }
    }
    return result;
}

function getValueAtPath(data: any, path: string): any {
    if (!data || !path) return data;
    const parts = path.split('.');
    let cur = data;
    for (const part of parts) {
        if (cur == null || typeof cur !== 'object') return undefined;
        cur = Array.isArray(cur) ? cur[0]?.[part] : cur[part];
    }
    return cur;
}

// ─── Prepare Payload Tab ───────────────────────────────────────────────────────

interface PreparePayloadTabProps {
    onSave: (payload: Record<string, any>) => void;
    savedPayload: Record<string, any> | null;
}

const PreparePayloadTab: React.FC<PreparePayloadTabProps> = ({ onSave, savedPayload }) => {
    const toast = useToastStore();
    const [tenants, setTenants] = useState<{ label: string; value: string }[]>([]);
    const [selectedTenantId, setSelectedTenantId] = useState('');
    const [allTenantTemplates, setAllTenantTemplates] = useState<any[]>([]);
    const [modules, setModules] = useState<string[]>([]);
    const [selectedModule, setSelectedModule] = useState('');
    const [selectedTemplateId, setSelectedTemplateId] = useState('');
    const [latestRecord, setLatestRecord] = useState<any>(null);
    const [loadingTenants, setLoadingTenants] = useState(false);
    const [loadingTemplates, setLoadingTemplates] = useState(false);
    const [loadingRecord, setLoadingRecord] = useState(false);
    const [selectedFieldPath, setSelectedFieldPath] = useState('');
    const [mappings, setMappings] = useState<Record<string, string>>({});

    // Fetch tenants on mount
    useEffect(() => {
        const fetch = async () => {
            setLoadingTenants(true);
            try {
                const res = await httpRequest('POST', `${config.nodeApiUrl}/tenant/option-list`, {});
                setTenants(res?.data ?? []);
            } catch {
                toast.error('Failed to load tenants');
            } finally {
                setLoadingTenants(false);
            }
        };
        fetch();
    }, [toast]);

    // Fetch templates when tenant changes
    useEffect(() => {
        if (!selectedTenantId) {
            setAllTenantTemplates([]);
            setModules([]);
            setSelectedModule('');
            setSelectedTemplateId('');
            setLatestRecord(null);
            setSelectedFieldPath('');
            setMappings({});
            return;
        }
        const fetch = async () => {
            setLoadingTemplates(true);
            try {
                const res = await httpRequest('POST', `${config.nodeApiUrl}/idp/template`, {
                    pageSize: 1000,
                    filters: { deleted: false }
                });
                const all: any[] = (res?.data ?? []).filter((t: any) => t.tenantId === selectedTenantId);
                setAllTenantTemplates(all);
                const uniqueModules = [...new Set(all.map((t: any) => t.settings?.module).filter(Boolean))] as string[];
                setModules(uniqueModules);
            } catch {
                toast.error('Failed to load templates');
            } finally {
                setLoadingTemplates(false);
            }
        };
        fetch();
    }, [selectedTenantId, toast]);

    // Fetch latest record when template changes
    useEffect(() => {
        if (!selectedTemplateId) {
            setLatestRecord(null);
            setSelectedFieldPath('');
            setMappings({});
            return;
        }
        const fetchRecord = async () => {
            setLoadingRecord(true);
            setLatestRecord(null);
            setSelectedFieldPath('');
            setMappings({});
            try {
                const res = await httpRequest('POST', `${config.nodeApiUrl}/idp/history`, {
                    pageSize: 1,
                    filters: { deleted: false },
                    templateId: selectedTemplateId,
                    module: selectedModule
                });
                const records: any[] = res?.data ?? [];
                setLatestRecord(records[0] ?? null);
            } catch {
                /* silently — no record found */
            } finally {
                setLoadingRecord(false);
            }
        };
        fetchRecord();
    }, [selectedTemplateId, selectedModule]);

    const filteredTemplates = selectedModule ? allTenantTemplates.filter(t => t.settings?.module === selectedModule) : [];

    const extractedData = latestRecord?.extractedData ?? null;
    const fieldList: ExtractedField[] = extractedData ? buildFieldList(extractedData) : [];
    const configuredMappings = Object.entries(mappings).filter(([, v]) => v.trim());
    const finalPayload = configuredMappings.length > 0 ? buildFinalPayload(mappings, extractedData) : null;

    return (
        <div className="flex flex-col gap-4 p-6">
            {/* Selectors */}
            <div className="grid grid-cols-3 gap-4">
                <div className="flex flex-col gap-1">
                    <label className="text-sm font-medium text-gray-700">Tenant</label>
                    <select
                        value={selectedTenantId}
                        onChange={e => {
                            setSelectedTenantId(e.target.value);
                            setSelectedModule('');
                            setSelectedTemplateId('');
                        }}
                        disabled={loadingTenants}
                        className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none disabled:opacity-60"
                    >
                        <option value="">{loadingTenants ? 'Loading…' : 'Select tenant'}</option>
                        {tenants.map(t => (
                            <option key={t.value} value={t.value}>
                                {t.label}
                            </option>
                        ))}
                    </select>
                </div>
                <div className="flex flex-col gap-1">
                    <label className="text-sm font-medium text-gray-700">Module</label>
                    <select
                        value={selectedModule}
                        onChange={e => {
                            setSelectedModule(e.target.value);
                            setSelectedTemplateId('');
                        }}
                        disabled={!selectedTenantId || loadingTemplates || modules.length === 0}
                        className="rounded-md border border-gray-300 px-3 py-2 text-sm capitalize focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none disabled:opacity-60"
                    >
                        <option value="">{loadingTemplates ? 'Loading…' : 'Select module'}</option>
                        {modules.map(m => (
                            <option key={m} value={m}>
                                {m}
                            </option>
                        ))}
                    </select>
                </div>
                <div className="flex flex-col gap-1">
                    <label className="text-sm font-medium text-gray-700">Template</label>
                    <select
                        value={selectedTemplateId}
                        onChange={e => setSelectedTemplateId(e.target.value)}
                        disabled={!selectedModule}
                        className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none disabled:opacity-60"
                    >
                        <option value="">Select template</option>
                        {filteredTemplates.map(t => (
                            <option key={t._id} value={t._id}>
                                {t.name}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Record banner */}
            {selectedTemplateId && (
                <div className="flex items-center gap-3 rounded-md border border-gray-200 bg-gray-50 px-4 py-2.5">
                    {loadingRecord ? (
                        <>
                            <Loader size={14} className="animate-spin text-gray-400" />
                            <span className="text-xs text-gray-500">Fetching latest record…</span>
                        </>
                    ) : latestRecord ? (
                        <>
                            <CheckCircle size={14} className="shrink-0 text-green-500" />
                            <div className="flex min-w-0 flex-col">
                                <span className="truncate text-xs font-medium text-gray-800">{latestRecord.name || latestRecord._id}</span>
                                <span className="text-[10px] text-gray-400">
                                    {latestRecord.createdAt ? new Date(latestRecord.createdAt).toLocaleString() : 'Latest record'}
                                    {' · '}Select a field from the list below to start mapping
                                </span>
                            </div>
                        </>
                    ) : (
                        <>
                            <XCircle size={14} className="shrink-0 text-gray-400" />
                            <span className="text-xs text-gray-400">No records found for this template</span>
                        </>
                    )}
                </div>
            )}

            {/* 3-panel mapping area — always visible */}
            <div className="grid grid-cols-[220px_240px_1fr] gap-3" style={{ height: 360 }}>
                {/* Panel 1 — Field list from extractedData */}
                <div className="flex flex-col overflow-hidden rounded-lg border border-gray-200">
                    <div className="border-b border-gray-200 bg-gray-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Fields</div>
                    <div className="flex-1 divide-y divide-gray-100 overflow-y-auto">
                        {fieldList.length > 0 ? (
                            fieldList.map(field => (
                                <button
                                    key={field.path}
                                    type="button"
                                    onClick={() => setSelectedFieldPath(field.path)}
                                    className={[
                                        'flex w-full flex-col px-3 py-2 text-left transition-colors cursor-pointer',
                                        field.level === 0 ? 'bg-gray-50' : '',
                                        selectedFieldPath === field.path ? 'bg-blue-50 border-l-2 border-blue-500' : 'hover:bg-blue-50'
                                    ]
                                        .filter(Boolean)
                                        .join(' ')}
                                    style={{ paddingLeft: `${0.75 + field.level * 1}rem` }}
                                >
                                    <span
                                        className={['truncate text-xs', field.isGroup ? 'font-semibold text-gray-600' : 'text-gray-700', mappings[field.path] ? 'text-blue-600' : '']
                                            .filter(Boolean)
                                            .join(' ')}
                                    >
                                        {field.label}
                                        {field.isGroup && <span className="ml-1 text-[9px] text-gray-400">[{Array.isArray(getValueAtPath(extractedData, field.path)) ? 'array' : 'object'}]</span>}
                                        {mappings[field.path] && <span className="ml-1 text-[9px] text-blue-400">→ {mappings[field.path]}</span>}
                                    </span>
                                </button>
                            ))
                        ) : (
                            <div className="flex flex-1 items-center justify-center p-4 text-center">
                                <p className="text-xs italic text-gray-400">
                                    {loadingRecord ? 'Fetching fields…' : selectedTemplateId ? 'No record data found for this template' : 'Select a tenant, module and template to see fields'}
                                </p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Panel 2 — Target API key input + mapped fields summary */}
                <div className="flex flex-col overflow-hidden rounded-lg border border-gray-200">
                    <div className="border-b border-gray-200 bg-gray-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Target API Key</div>
                    <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-3">
                        {selectedFieldPath ? (
                            <div className="flex flex-col gap-1.5">
                                <span className="truncate font-mono text-[10px] text-gray-500">{selectedFieldPath}</span>
                                <input
                                    type="text"
                                    value={mappings[selectedFieldPath] ?? ''}
                                    onChange={e => setMappings(prev => ({ ...prev, [selectedFieldPath]: e.target.value }))}
                                    placeholder="e.g. order.customer.name"
                                    autoFocus
                                    className="rounded-md border border-blue-300 px-3 py-2 text-sm ring-1 ring-blue-200 focus:border-blue-500 focus:ring-blue-400 focus:outline-none"
                                />
                                <div className="rounded bg-gray-50 p-2 text-[9px] leading-relaxed text-gray-400">
                                    <span className="font-semibold text-gray-500">Syntax</span>
                                    <br />
                                    <span className="font-mono">name</span> → flat key
                                    <br />
                                    <span className="font-mono">order.customer</span> → nested object
                                    <br />
                                    <span className="font-mono">items[0].price</span> → array of objects
                                </div>
                            </div>
                        ) : (
                            <p className="text-xs italic text-gray-400">Select a field to set its target key</p>
                        )}

                        {/* Configured mappings summary */}
                        {configuredMappings.length > 0 && (
                            <div className="flex flex-col gap-1 border-t border-gray-100 pt-3">
                                <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Mapped ({configuredMappings.length})</span>
                                <div className="flex flex-col gap-0.5">
                                    {configuredMappings.map(([src, tgt]) => (
                                        <div key={src} className="flex items-center gap-1 rounded bg-gray-50 px-2 py-1">
                                            <span className="min-w-0 flex-1 truncate font-mono text-[9px] text-gray-500">{src.split('.').pop()}</span>
                                            <span className="shrink-0 text-[9px] text-gray-400">→</span>
                                            <span className="min-w-0 flex-1 truncate font-mono text-[9px] font-semibold text-blue-600">{tgt}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Panel 3 — Final JSON payload preview */}
                <div className="flex flex-col overflow-hidden rounded-lg border border-gray-200">
                    <div className="border-b border-gray-200 bg-gray-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500">JSON Preview</div>
                    <pre className="flex-1 overflow-y-auto whitespace-pre-wrap break-all bg-white p-4 font-mono text-[11px] text-gray-700">
                        {finalPayload ? JSON.stringify(finalPayload, null, 2) : <span className="italic text-gray-400">Map fields to see the final payload</span>}
                    </pre>
                </div>
            </div>

            {/* Save footer */}
            {extractedData && (
                <div className="flex items-center justify-between border-t border-gray-200 pt-3">
                    {savedPayload ? (
                        <span className="flex items-center gap-1.5 text-xs text-green-600">
                            <CheckCircle size={13} />
                            Payload saved — ready for HTTP Request tab
                        </span>
                    ) : (
                        <span className="text-xs text-gray-400">Map fields above then save to continue</span>
                    )}
                    <button
                        type="button"
                        disabled={!finalPayload}
                        onClick={() => finalPayload && onSave(finalPayload)}
                        className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                        Save Payload
                    </button>
                </div>
            )}
        </div>
    );
};

// ─── HTTP Request Tab ─────────────────────────────────────────────────────────

interface ApiResponse {
    status: number;
    body: any;
}

interface HttpRequestTabProps {
    savedAuth: SavedAuth | null;
    savedPayload: Record<string, any> | null;
    onResponse: (res: ApiResponse) => void;
}

const HttpRequestTab: React.FC<HttpRequestTabProps> = ({ savedAuth, savedPayload, onResponse }) => {
    const [apiUrl, setApiUrl] = useState('');
    const [httpMethod, setHttpMethod] = useState('POST');
    const [placement, setPlacement] = useState<'header' | 'param'>('header');
    const [headerKey, setHeaderKey] = useState('Authorization');
    const [useBearer, setUseBearer] = useState(true);
    const [paramKey, setParamKey] = useState('token');
    const [sending, setSending] = useState(false);
    const [sent, setSent] = useState(false);
    const [requestError, setRequestError] = useState('');

    const tokenValue = savedAuth ? (placement === 'header' && useBearer ? `Bearer ${savedAuth.token}` : savedAuth.token) : '';

    const send = async () => {
        if (!apiUrl) return;
        setSending(true);
        setSent(false);
        setRequestError('');
        try {
            const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json' };
            let url = apiUrl;

            if (savedAuth) {
                if (placement === 'header') {
                    headers[headerKey] = tokenValue;
                } else {
                    const separator = url.includes('?') ? '&' : '?';
                    url = `${url}${separator}${paramKey}=${encodeURIComponent(savedAuth.token)}`;
                }
            }

            const res = await fetch(url, {
                method: httpMethod,
                headers,
                body: httpMethod !== 'GET' ? JSON.stringify(savedPayload ?? {}) : undefined
            });

            const ct = res.headers.get('content-type') || '';
            const body: any = ct.includes('application/json') ? await res.json() : await res.text();
            onResponse({ status: res.status, body });
            setSent(true);
        } catch (err: any) {
            setRequestError(err?.message || 'Request failed');
        } finally {
            setSending(false);
        }
    };

    return (
        <div className="flex flex-col gap-5 p-6">
            {/* Token info */}
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Access Token</p>
                {savedAuth ? (
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-2">
                            <CheckCircle size={13} className="shrink-0 text-green-500" />
                            <span className="font-mono text-[11px] break-all text-gray-700">{savedAuth.token || '(empty — check auth response)'}</span>
                        </div>
                        {/* Placement */}
                        <div className="flex flex-col gap-2 border-t border-gray-200 pt-3">
                            <p className="text-xs font-semibold text-gray-600">Token placement</p>
                            <div className="flex gap-6 text-sm">
                                <label className="flex cursor-pointer items-center gap-2 text-gray-700">
                                    <input type="radio" checked={placement === 'header'} onChange={() => setPlacement('header')} className="accent-blue-600" />
                                    In request headers
                                </label>
                                <label className="flex cursor-pointer items-center gap-2 text-gray-700">
                                    <input type="radio" checked={placement === 'param'} onChange={() => setPlacement('param')} className="accent-blue-600" />
                                    In query params
                                </label>
                            </div>

                            {placement === 'header' ? (
                                <div className="flex items-center gap-3">
                                    <div className="flex flex-col gap-1">
                                        <label className="text-xs text-gray-500">Header key</label>
                                        <input
                                            type="text"
                                            value={headerKey}
                                            onChange={e => setHeaderKey(e.target.value)}
                                            className="rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
                                        />
                                    </div>
                                    <label className="flex cursor-pointer items-center gap-1.5 pt-5 text-xs text-gray-600">
                                        <input type="checkbox" checked={useBearer} onChange={e => setUseBearer(e.target.checked)} className="accent-blue-600" />
                                        Prefix with <code className="rounded bg-gray-100 px-1">Bearer</code>
                                    </label>
                                    <div className="flex flex-col gap-1 pt-5">
                                        <span className="font-mono text-[10px] text-gray-400">
                                            → {headerKey}: {tokenValue.slice(0, 40)}
                                            {tokenValue.length > 40 ? '…' : ''}
                                        </span>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex items-center gap-3">
                                    <div className="flex flex-col gap-1">
                                        <label className="text-xs text-gray-500">Param key</label>
                                        <input
                                            type="text"
                                            value={paramKey}
                                            onChange={e => setParamKey(e.target.value)}
                                            className="rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
                                        />
                                    </div>
                                    <span className="pt-5 font-mono text-[10px] text-gray-400">
                                        → ?{paramKey}={savedAuth.token.slice(0, 20)}…
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>
                ) : (
                    <span className="text-xs text-gray-400 italic">No auth saved — go to Auth tab and test authentication first</span>
                )}
            </div>

            {/* Payload summary */}
            <div className="flex gap-4">
                <div className="flex flex-1 flex-col gap-1">
                    <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">Payload</label>
                    <pre className="max-h-28 overflow-y-auto rounded-lg border border-gray-200 bg-gray-50 p-3 font-mono text-[10px] text-gray-700">
                        {savedPayload ? JSON.stringify(savedPayload, null, 2) : <span className="italic text-gray-400">No payload saved</span>}
                    </pre>
                </div>
            </div>

            {/* URL + method + send */}
            <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">API Endpoint</label>
                <div className="flex gap-2">
                    <select
                        value={httpMethod}
                        onChange={e => setHttpMethod(e.target.value)}
                        className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium focus:border-blue-500 focus:outline-none"
                    >
                        {['POST', 'PUT', 'PATCH', 'GET'].map(m => (
                            <option key={m}>{m}</option>
                        ))}
                    </select>
                    <input
                        type="text"
                        value={apiUrl}
                        onChange={e => setApiUrl(e.target.value)}
                        placeholder="https://example.com/workflow/v1/data"
                        className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                    />
                    <button
                        type="button"
                        onClick={send}
                        disabled={!apiUrl || sending}
                        className="flex items-center gap-2 rounded-md bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                        {sending ? <Loader size={14} className="animate-spin" /> : null}
                        {sending ? 'Sending…' : 'Send'}
                    </button>
                </div>
            </div>

            {/* Status feedback */}
            {requestError && <p className="text-xs text-red-500">{requestError}</p>}
            {sent && (
                <div className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 px-4 py-2.5">
                    <CheckCircle size={14} className="shrink-0 text-green-500" />
                    <span className="text-xs text-green-700">
                        Request sent — view the response in the <strong>Handle Response</strong> tab
                    </span>
                </div>
            )}
        </div>
    );
};

// ─── Handle Response Tab ──────────────────────────────────────────────────────

interface HandleResponseTabProps {
    apiResponse: ApiResponse | null;
}

const HandleResponseTab: React.FC<HandleResponseTabProps> = ({ apiResponse }) => {
    const toast = useToastStore();
    const [copied, setCopied] = useState(false);
    const [saveUrl, setSaveUrl] = useState('');
    const [saveMethod, setSaveMethod] = useState('POST');
    const [saving, setSaving] = useState(false);
    const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
    const [saveError, setSaveError] = useState('');

    const bodyText = apiResponse ? (typeof apiResponse.body === 'string' ? apiResponse.body : JSON.stringify(apiResponse.body, null, 2)) : '';

    const copyToClipboard = async () => {
        await navigator.clipboard.writeText(bodyText);
        setCopied(true);
        toast.success('Response copied to clipboard');
        setTimeout(() => setCopied(false), 2000);
    };

    const downloadJson = () => {
        const blob = new Blob([bodyText], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `api-response-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success('Response downloaded');
    };

    const saveResponse = async () => {
        if (!saveUrl || !apiResponse) return;
        setSaving(true);
        setSaveStatus('idle');
        setSaveError('');
        try {
            const res = await fetch(saveUrl, {
                method: saveMethod,
                headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                body: JSON.stringify(apiResponse.body)
            });
            if (res.ok) {
                setSaveStatus('success');
                toast.success('Response saved successfully');
            } else {
                const errBody = await res.json().catch(() => ({}));
                const msg = errBody?.message || `Server responded with ${res.status}`;
                setSaveStatus('error');
                setSaveError(msg);
                toast.error(msg);
            }
        } catch (err: any) {
            const msg = err?.message || 'Save request failed';
            setSaveStatus('error');
            setSaveError(msg);
            toast.error(msg);
        } finally {
            setSaving(false);
        }
    };

    if (!apiResponse) {
        return (
            <div className="flex flex-col items-center justify-center gap-2 p-12 text-center">
                <XCircle size={32} className="text-gray-300" />
                <p className="text-sm text-gray-400">No response yet — go to the HTTP Request tab and send a request first</p>
            </div>
        );
    }

    const isSuccess = apiResponse.status < 300;

    return (
        <div className="flex flex-col gap-4 p-6">
            {/* Status banner */}
            <div className={`flex items-center gap-3 rounded-lg border px-4 py-3 ${isSuccess ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
                {isSuccess ? <CheckCircle size={16} className="shrink-0 text-green-500" /> : <XCircle size={16} className="shrink-0 text-red-500" />}
                <div className="flex flex-col">
                    <span className={`text-sm font-semibold ${isSuccess ? 'text-green-700' : 'text-red-700'}`}>
                        HTTP {apiResponse.status} — {isSuccess ? 'Success' : 'Error'}
                    </span>
                    <span className="text-xs text-gray-500">API response received</span>
                </div>
            </div>

            {/* Response body */}
            <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">Response Body</label>
                    <div className="flex gap-2">
                        <button type="button" onClick={copyToClipboard} className="flex items-center gap-1.5 rounded-md border border-gray-200 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50">
                            <Copy size={12} />
                            {copied ? 'Copied!' : 'Copy'}
                        </button>
                        <button type="button" onClick={downloadJson} className="flex items-center gap-1.5 rounded-md border border-gray-200 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50">
                            <Download size={12} />
                            Download JSON
                        </button>
                    </div>
                </div>
                <pre className="max-h-64 overflow-y-auto rounded-lg border border-gray-200 bg-gray-50 p-4 font-mono text-[11px] leading-relaxed text-gray-700">
                    {bodyText || <span className="italic text-gray-400">Empty response body</span>}
                </pre>
            </div>

            {/* Save section */}
            <div className="flex flex-col gap-2 border-t border-gray-200 pt-4">
                <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">Save Response</label>
                <div className="flex gap-2">
                    <select
                        value={saveMethod}
                        onChange={e => setSaveMethod(e.target.value)}
                        className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium focus:border-blue-500 focus:outline-none"
                    >
                        {['POST', 'PUT', 'PATCH'].map(m => (
                            <option key={m}>{m}</option>
                        ))}
                    </select>
                    <input
                        type="text"
                        value={saveUrl}
                        onChange={e => {
                            setSaveUrl(e.target.value);
                            setSaveStatus('idle');
                        }}
                        placeholder="https://example.com/workflow/v1/save"
                        className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                    />
                    <button
                        type="button"
                        onClick={saveResponse}
                        disabled={!saveUrl || saving}
                        className="flex items-center gap-2 rounded-md bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                        {saving ? <Loader size={14} className="animate-spin" /> : null}
                        {saving ? 'Saving…' : 'Save'}
                    </button>
                </div>
                {saveStatus === 'success' && (
                    <span className="flex items-center gap-1.5 text-xs text-green-600">
                        <CheckCircle size={13} /> Response saved successfully
                    </span>
                )}
                {saveStatus === 'error' && (
                    <span className="flex items-center gap-1.5 text-xs text-red-500">
                        <XCircle size={13} /> {saveError}
                    </span>
                )}
            </div>
        </div>
    );
};

// ─── Main dialog ──────────────────────────────────────────────────────────────

export const IntegrateApiDialog: React.FC = () => {
    const { state, setState } = useTenantState();
    const [activeTab, setActiveTab] = useState<Tab>('Auth');
    const [savedAuth, setSavedAuth] = useState<SavedAuth | null>(null);
    const [savedPayload, setSavedPayload] = useState<Record<string, any> | null>(null);
    const [apiResponse, setApiResponse] = useState<ApiResponse | null>(null);

    const close = () => setState(prev => ({ ...prev, showIntegrateApiDialog: false }));

    const handleResponse = (res: ApiResponse) => {
        setApiResponse(res);
        setActiveTab('Handle Response');
    };

    const enabledTabs: Tab[] = ['Auth', 'Prepare Payload', ...(savedPayload ? ['HTTP Request' as Tab] : []), ...(apiResponse ? ['Handle Response' as Tab] : [])];

    return (
        <DialogComponent name="API Integration" isOpen={state.showIntegrateApiDialog} closeDialog={close} className="w-[920px]" disableBlurCloseDialog>
            {/* Tab bar */}
            <div className="flex border-b border-gray-200">
                {TABS.map((tab, i) => {
                    const isActive = tab === activeTab;
                    const isEnabled = enabledTabs.includes(tab);
                    return (
                        <button
                            key={tab}
                            onClick={() => isEnabled && setActiveTab(tab)}
                            disabled={!isEnabled}
                            className={[
                                'flex items-center gap-2 border-b-2 px-6 py-4 text-sm font-medium transition-colors',
                                isActive ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-400',
                                isEnabled && !isActive ? 'cursor-pointer hover:text-gray-600' : '',
                                !isEnabled ? 'cursor-not-allowed opacity-40' : ''
                            ]
                                .filter(Boolean)
                                .join(' ')}
                        >
                            <span
                                className={['flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold', isActive ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'].join(' ')}
                            >
                                {i + 1}
                            </span>
                            {tab}
                        </button>
                    );
                })}
            </div>

            {/* Tab content */}
            {activeTab === 'Auth' && <AuthTab onSaveAuth={setSavedAuth} savedAuth={savedAuth} />}
            {activeTab === 'Prepare Payload' && <PreparePayloadTab onSave={setSavedPayload} savedPayload={savedPayload} />}
            {activeTab === 'HTTP Request' && <HttpRequestTab savedAuth={savedAuth} savedPayload={savedPayload} onResponse={handleResponse} />}
            {activeTab === 'Handle Response' && <HandleResponseTab apiResponse={apiResponse} />}
        </DialogComponent>
    );
};
