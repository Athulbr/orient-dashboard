import React, { useState, useEffect, useCallback } from 'react';
import {
    Activity,
    CheckCircle2,
    XCircle,
    AlertCircle,
    Clock,
    Zap,
    Database,
    Cpu,
    MemoryStick,
    RefreshCw,
    Wifi,
    WifiOff,
    Bot,
    UploadCloud,
    Send,
    FileCheck,
    HardDrive,
    Layers
} from 'lucide-react';
import BackButton from '../../../../../../components/BackButton';
import { config } from '../../../../../../config/default';

// ── Types ──────────────────────────────────────────────────────────────────────

interface HealthData {
    status: 'ok' | 'degraded' | 'error';
    timestamp: string;
    uptime: number;
    database: {
        status: string;
        responseTime: number;
        message: string;
    };
    memory: {
        heapUsed: string;
        heapTotal: string;
        rss: string;
    };
    gemini?: {
        status: string;
        message?: string;
    };
    error?: string;
}

interface GeminiHealthData {
    status: 'operational' | 'degraded' | 'error' | 'unknown';
    message?: string;
    source?: 'api' | 'redis';
}

interface MaraekatHealthData {
    status: 'operational' | 'degraded' | 'error' | 'unknown';
    message?: string;
}

interface HistoryEntry {
    ts: Date;
    status: 'ok' | 'degraded' | 'error';
}

interface LastExecutions {
    documentExtractor?: string;
    invoiceUpload?: string;
    submitOrder?: string;
}
interface SystemCpu {
    usage: string;
    cores: number;
    loadAverage: number[];
}

interface SystemMemory {
    heapUsed: string;
    heapTotal: string;
    rss: string;
    external: string;
    systemUsed: string;
    systemTotal: string;
}

interface EventLoopData {
    delay: string;
    status: string;
}

interface DatabaseData {
    status: string;
    responseTime: string;
    connections: number;
    maxConnections: number;
}

interface RedisData {
    status: string;
    responseTime: string;
    memory: string;
}

interface QueueData {
    waiting: number;
    active: number;
}
// ── Helpers ────────────────────────────────────────────────────────────────────

const formatUptime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
};

// Tailwind class sets keyed by status, replacing the old hex-based statusColor()
const statusClasses = (s: string) => {
    if (s === 'ok' || s === 'healthy' || s === 'operational') {
        return { light: 'bg-green-100', text: 'text-green-700', border: 'border-green-200', dot: 'bg-green-500' };
    }
    if (s === 'degraded') {
        return { light: 'bg-yellow-100', text: 'text-yellow-800', border: 'border-yellow-200', dot: 'bg-amber-500' };
    }
    if (s === 'fetching') {
        return { light: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-200', dot: 'bg-blue-500' };
    }
    return { light: 'bg-rose-100', text: 'text-rose-700', border: 'border-rose-200', dot: 'bg-red-500' };
};

const statusLabel = (s: string) => {
    if (s === 'ok' || s === 'healthy' || s === 'operational') return 'Operational';
    if (s === 'degraded') return 'Degraded';
    if (s === 'fetching') return 'Fetching...';
    return 'Unavailable';
};

// ── Sub-components ─────────────────────────────────────────────────────────────

const StatusPill: React.FC<{ status: string }> = ({ status }) => {
    const c = statusClasses(status);
    const Icon = status === 'ok' || status === 'healthy' || status === 'operational' ? CheckCircle2 : status === 'degraded' ? AlertCircle : status === 'fetching' ? RefreshCw : XCircle;
    return (
        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold tracking-wide border ${c.light} ${c.text} ${c.border}`}>
            <Icon size={12} /> {statusLabel(status)}
        </span>
    );
};

const PulseDot: React.FC<{ status: string }> = ({ status }) => {
    const c = statusClasses(status);
    return (
        <span className="relative inline-flex w-3 h-3">
            <span className={`absolute inset-0 rounded-full opacity-35 animate-ping ${c.dot}`} />
            <span className={`w-3 h-3 rounded-full inline-block ${c.dot}`} />
        </span>
    );
};

interface ServerStatusProps {
    onBack?: () => void;
}

const ServerStatusPage: React.FC<ServerStatusProps> = ({ onBack }) => {
    const [health, setHealth] = useState<HealthData | null>(null);
    const [loading, setLoading] = useState(true);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [geminiHealth, setGeminiHealth] = useState<GeminiHealthData | null>(null);
    const [maraekatHealth, setMaraekatHealth] = useState<MaraekatHealthData | null>(null);
    const [cpu, setCpu] = useState<SystemCpu | null>(null);
    const [memory, setMemory] = useState<SystemMemory | null>(null);
    const [eventLoop, setEventLoop] = useState<EventLoopData | null>(null);
    const [database, setDatabase] = useState<DatabaseData | null>(null);
    const [redis, setRedis] = useState<RedisData | null>(null);
    const [queue, setQueue] = useState<QueueData | null>(null);
    const [geminiLastUpdated, setGeminiLastUpdated] = useState<Date | null>(null);
    const [lastExecutions, setLastExecutions] = useState<LastExecutions | null>(null);
    const [history, setHistory] = useState<HistoryEntry[]>([]);

    const fetchAllDetails = useCallback(async (refresh = false) => {
        setIsRefreshing(true);
        try {
            const res = await fetch(`${config.workflowService}/workflow/health/details${refresh ? '?refresh=true' : ''}`);
            const data = await res.json();

            // Set health
            setHealth(data.health);
            setLastUpdated(new Date());
            setHistory(prev => [{ ts: new Date(), status: data.health?.status || 'error' }, ...prev.slice(0, 29)]);

            // Detailed System Metrics
            setCpu(data.cpu);
            setMemory(data.memory);
            setEventLoop(data.eventLoop);
            setDatabase(data.database);
            setRedis(data.redis);
            setQueue(data.queue);

            // Set gemini health
            setGeminiHealth(data.gemini);
            setGeminiLastUpdated(new Date());

            // Set maraekat health
            setMaraekatHealth(data.maraekat);

            // Set last executions
            setLastExecutions(data.lastExecutions);
        } catch {
            const errData: HealthData = {
                status: 'error',
                timestamp: new Date().toISOString(),
                uptime: 0,
                database: { status: 'unreachable', responseTime: 0, message: 'Could not reach server' },
                memory: { heapUsed: '—', heapTotal: '—', rss: '—' },
                error: 'Failed to connect to workflow service'
            };
            setHealth(errData);
            setCpu(null);
            setMemory(null);
            setEventLoop(null);
            setDatabase(null);
            setRedis(null);
            setQueue(null);
            setGeminiHealth({ status: 'error', message: 'Could not reach Gemini health API' });
            setMaraekatHealth({ status: 'error', message: 'Could not reach Maraekat API' });
            setLastUpdated(new Date());
            setGeminiLastUpdated(new Date());
            setHistory(prev => [{ ts: new Date(), status: 'error' }, ...prev.slice(0, 29)]);
        } finally {
            setIsRefreshing(false);
            setLoading(false);
        }
    }, []);

    const handleRefreshAll = useCallback(() => {
        fetchAllDetails(true);
    }, [fetchAllDetails]);

    useEffect(() => {
        fetchAllDetails(false);
    }, [fetchAllDetails]);

    const serverStatus = health?.status ?? 'fetching';
    const geminiStatus = geminiHealth?.status ?? 'fetching';
    const maraekatStatus = maraekatHealth?.status ?? 'fetching';
    const dbStatus = health?.database?.status ?? 'fetching';
    const isOnline = serverStatus === 'ok';

    return (
        <div className="min-h-screen bg-slate-50 text-slate-800 font-[Inter,system-ui,-apple-system,sans-serif] flex flex-col w-full">
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
                @keyframes fadeUp { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
                .ss-in { animation: fadeUp 0.35s ease both; }
            `}</style>

            {/* ── Header ── */}
            <header className="bg-white border-b border-slate-200 px-5 py-2 h-16 flex items-center justify-between sticky top-0 z-[100] shadow-sm w-full box-border">
                <div className="flex items-center gap-4">
                    <BackButton onClick={onBack} />

                    <div className="w-px h-6 bg-slate-200" />

                    <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-[9px] bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center shadow-[0_2px_8px_rgba(99,102,241,0.3)]">
                            <Activity size={17} className="text-white" />
                        </div>
                        <div>
                            <div className="text-[15px] font-bold text-slate-900 tracking-tight">Service Health</div>
                            <div className="text-[11px] text-slate-400 mt-px">Real-time monitoring</div>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-3.5">
                    <button
                        onClick={handleRefreshAll}
                        disabled={isRefreshing}
                        className={`flex items-center gap-1.5 bg-indigo-50 border border-indigo-200 rounded-lg text-indigo-500 px-4 py-[7px] text-[13px] font-semibold transition-all duration-150 ${
                            isRefreshing ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer hover:bg-violet-100 hover:text-indigo-600'
                        }`}
                    >
                        <RefreshCw size={13} className={isRefreshing ? 'animate-spin' : ''} />
                        {isRefreshing ? 'Refreshing...' : 'Refresh'}
                    </button>
                </div>
            </header>

            {/* ── Body ── */}
            <main className="flex-1 px-5 py-5 w-full box-border">
                {loading ? (
                    <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
                        <div className="w-11 h-11 border-[3px] border-slate-200 border-t-indigo-500 rounded-full animate-spin" />
                        <p className="text-slate-400 text-sm">Fetching service health…</p>
                    </div>
                ) : (
                    <>
                        {/* ── Section label ── */}
                        <div className="ss-in mb-5">
                            <h2 className="text-[13px] font-semibold text-slate-400 uppercase tracking-wider m-0">Service Overview</h2>
                        </div>

                        {/* ── Service Cards ── */}
                        <div className="ss-in grid grid-cols-2 gap-5 mb-7 [animation-delay:0.05s]">
                            <ServiceCard
                                icon={<Bot size={20} />}
                                title="Document Extractor Agent"
                                status={geminiStatus !== 'operational' && geminiStatus !== 'fetching' ? 'error' : serverStatus}
                                description={
                                    geminiStatus !== 'operational' && geminiStatus !== 'fetching'
                                        ? 'LLM is not operational so this agent is also not operational.'
                                        : serverStatus === 'ok'
                                          ? 'Document extractor agent is running normally with no issues.'
                                          : serverStatus === 'degraded'
                                            ? 'Agent is running but experiencing some issues.'
                                            : serverStatus === 'fetching'
                                              ? 'Fetching agent status...'
                                              : (health?.error ?? 'Agent is unreachable.')
                                }
                                meta={[
                                    { label: 'Uptime', value: health?.uptime ? formatUptime(health.uptime) : '—', icon: <Clock size={12} /> },
                                    { label: 'Checked', value: lastUpdated?.toLocaleTimeString() ?? '—', icon: <RefreshCw size={12} /> },
                                    { label: 'Last Extracted At', value: lastExecutions?.documentExtractor || '—', icon: <FileCheck size={12} className="text-green-600" /> }
                                ]}
                            />
                            <ServiceCard
                                icon={<UploadCloud size={20} />}
                                title="Invoice Upload Agent"
                                status={geminiStatus !== 'operational' && geminiStatus !== 'fetching' ? 'error' : serverStatus}
                                description={
                                    geminiStatus !== 'operational' && geminiStatus !== 'fetching'
                                        ? 'LLM is not operational so this agent is also not operational.'
                                        : serverStatus === 'ok'
                                          ? 'Invoice upload agent is running normally with no issues.'
                                          : serverStatus === 'degraded'
                                            ? 'Agent is running but experiencing some issues.'
                                            : serverStatus === 'fetching'
                                              ? 'Fetching agent status...'
                                              : (health?.error ?? 'Agent is unreachable.')
                                }
                                meta={[
                                    { label: 'Uptime', value: health?.uptime ? formatUptime(health.uptime) : '—', icon: <Clock size={12} /> },
                                    { label: 'Checked', value: lastUpdated?.toLocaleTimeString() ?? '—', icon: <RefreshCw size={12} /> },
                                    { label: 'Last Uploaded At', value: lastExecutions?.invoiceUpload || '—', icon: <FileCheck size={12} className="text-green-600" /> }
                                ]}
                            />
                            <ServiceCard
                                icon={<Send size={20} />}
                                title="Maraekat Health"
                                status={maraekatStatus}
                                description={
                                    maraekatHealth?.message ??
                                    (maraekatStatus === 'operational'
                                        ? 'Maraekat is reachable and functioning properly.'
                                        : maraekatStatus === 'degraded'
                                          ? 'Maraekat is running but experiencing issues.'
                                          : maraekatStatus === 'fetching'
                                            ? 'Fetching Maraekat status...'
                                            : 'Maraekat is unreachable.')
                                }
                                meta={[
                                    { label: 'Checked', value: lastUpdated?.toLocaleTimeString() ?? '—', icon: <RefreshCw size={12} /> },
                                    { label: 'Source', value: 'Real-time API', icon: <Wifi size={12} /> },

                                    { label: 'Last Submitted At', value: lastExecutions?.submitOrder || '—', icon: <FileCheck size={12} className="text-green-600" /> }
                                ]}
                            />
                            <ServiceCard
                                icon={<Zap size={20} />}
                                title="LLM Health"
                                status={geminiStatus}
                                description={
                                    geminiHealth?.message ??
                                    (geminiStatus === 'operational'
                                        ? 'Gemini AI service is reachable and responding to requests.'
                                        : geminiStatus === 'degraded'
                                          ? 'Gemini AI service is experiencing some degradation.'
                                          : geminiStatus === 'fetching'
                                            ? 'Fetching Gemini AI service status...'
                                            : 'Gemini AI service status could not be determined.')
                                }
                                meta={[
                                    { label: 'Source', value: geminiHealth?.source === 'redis' ? 'Real-time API' : 'Real-time API', icon: <Wifi size={12} /> },
                                    { label: 'Checked', value: geminiLastUpdated?.toLocaleTimeString() ?? '—', icon: <RefreshCw size={12} /> }
                                ]}
                            />
                        </div>

                        {/* ── Detailed Metrics ── */}
                        <div className="ss-in mb-3 [animation-delay:0.1s]">
                            <h2 className="text-[13px] font-semibold text-slate-400 uppercase tracking-wider m-0 mb-4">Detailed System Metrics</h2>
                        </div>
                        <div className="ss-in grid grid-cols-3 gap-5 mb-8 [animation-delay:0.15s]">
                            <MetricCard title="CPU" icon={<Cpu size={16} />}>
                                <div className="flex justify-between py-1 border-b border-slate-100">
                                    <span className="text-slate-500">Usage</span>
                                    <span className="font-semibold">{cpu?.usage ?? '—'}</span>
                                </div>
                                <div className="flex justify-between py-1 border-b border-slate-100">
                                    <span className="text-slate-500">Cores</span>
                                    <span className="font-semibold">{cpu?.cores ?? '—'}</span>
                                </div>
                                <div className="flex justify-between py-1">
                                    <span className="text-slate-500">Load Average</span>
                                    <span className="font-semibold">{cpu?.loadAverage?.join(', ') ?? '—'}</span>
                                </div>
                            </MetricCard>

                            <MetricCard title="Memory" icon={<MemoryStick size={16} />}>
                                <div className="flex justify-between py-1 border-b border-slate-100">
                                    <span className="text-slate-500">Heap Used</span>
                                    <span className="font-semibold">
                                        {memory?.heapUsed ?? '—'} / {memory?.heapTotal ?? '—'}
                                    </span>
                                </div>
                                <div className="flex justify-between py-1 border-b border-slate-100">
                                    <span className="text-slate-500">RSS / Ext</span>
                                    <span className="font-semibold">
                                        {memory?.rss ?? '—'} / {memory?.external ?? '—'}
                                    </span>
                                </div>
                                <div className="flex justify-between py-1">
                                    <span className="text-slate-500">System</span>
                                    <span className="font-semibold">
                                        {memory?.systemUsed ?? '—'} / {memory?.systemTotal ?? '—'}
                                    </span>
                                </div>
                            </MetricCard>

                            <MetricCard title="Event Loop" icon={<Activity size={16} />}>
                                <div className="flex justify-between py-1 border-b border-slate-100">
                                    <span className="text-slate-500">Status</span>
                                    <span className="font-semibold">{eventLoop?.status ?? '—'}</span>
                                </div>
                                <div className="flex justify-between py-1">
                                    <span className="text-slate-500">Delay</span>
                                    <span className="font-semibold">{eventLoop?.delay ?? '—'}</span>
                                </div>
                            </MetricCard>

                            <MetricCard title="Database" icon={<Database size={16} />}>
                                <div className="flex justify-between py-1 border-b border-slate-100">
                                    <span className="text-slate-500">Status</span>
                                    <span className="font-semibold">{database?.status ?? '—'}</span>
                                </div>
                                <div className="flex justify-between py-1 border-b border-slate-100">
                                    <span className="text-slate-500">Response</span>
                                    <span className="font-semibold">{database?.responseTime ?? '—'}</span>
                                </div>
                                <div className="flex justify-between py-1">
                                    <span className="text-slate-500">Connections</span>
                                    <span className="font-semibold">
                                        {database?.connections ?? '—'} / {database?.maxConnections ?? '—'}
                                    </span>
                                </div>
                            </MetricCard>

                            <MetricCard title="Redis" icon={<HardDrive size={16} />}>
                                <div className="flex justify-between py-1 border-b border-slate-100">
                                    <span className="text-slate-500">Status</span>
                                    <span className="font-semibold">{redis?.status ?? '—'}</span>
                                </div>
                                <div className="flex justify-between py-1 border-b border-slate-100">
                                    <span className="text-slate-500">Response</span>
                                    <span className="font-semibold">{redis?.responseTime ?? '—'}</span>
                                </div>
                                <div className="flex justify-between py-1">
                                    <span className="text-slate-500">Memory</span>
                                    <span className="font-semibold">{redis?.memory ?? '—'}</span>
                                </div>
                            </MetricCard>

                            <MetricCard title="Queue" icon={<Layers size={16} />}>
                                <div className="flex justify-between py-1 border-b border-slate-100">
                                    <span className="text-slate-500">Waiting</span>
                                    <span className="font-semibold">{queue?.waiting ?? '—'}</span>
                                </div>
                                <div className="flex justify-between py-1">
                                    <span className="text-slate-500">Active</span>
                                    <span className="font-semibold">{queue?.active ?? '—'}</span>
                                </div>
                            </MetricCard>
                        </div>
                    </>
                )}
            </main>

            {/* ── Footer ── */}
            <footer className="bg-white border-t border-slate-200 px-10 py-3.5 flex items-center justify-between w-full box-border sticky bottom-0 z-[100]">
                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                    {isOnline ? (
                        <>
                            <Wifi size={13} className="text-green-500" />
                            <span>
                                Connected to <strong className="text-slate-600">{config.workflowService}</strong>
                            </span>
                        </>
                    ) : (
                        <>
                            <WifiOff size={13} className="text-red-500" />
                            <span>
                                Cannot reach <strong className="text-slate-600">{config.workflowService}</strong>
                            </span>
                        </>
                    )}
                </div>
                <div className="flex items-center gap-1.5 text-xs text-slate-400">{lastUpdated && <span>Updated {lastUpdated.toLocaleTimeString()}</span>}</div>
            </footer>
        </div>
    );
};

// ── ServiceCard ────────────────────────────────────────────────────────────────

interface MetaItem {
    label: string;
    value: string;
    icon: React.ReactNode;
}

const ServiceCard: React.FC<{
    icon: React.ReactNode;
    title: string;
    status: string;
    description: string;
    meta?: MetaItem[];
}> = ({ icon, title, status, description, meta }) => {
    const c = statusClasses(status);
    return (
        <div
            className={`bg-white rounded-2xl px-7 py-6 border border-slate-200 shadow-sm transition-shadow transition-transform duration-200 hover:shadow-lg hover:-translate-y-0.5 border-l-4 ${c.dot.replace('bg-', 'border-l-')}`}
        >
            <div className="flex items-start justify-between mb-3.5">
                <div className="flex items-center gap-3">
                    <div className={`w-11 h-11 rounded-xl border flex items-center justify-center ${c.light} ${c.border} ${c.text}`}>{icon}</div>
                    <div>
                        <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">{title}</div>
                        <StatusPill status={status} />
                    </div>
                </div>
                <PulseDot status={status} />
            </div>

            <p className="text-[13px] text-slate-500 leading-relaxed mb-4">{description}</p>

            {meta && meta.length > 0 && (
                <div className="flex gap-5 flex-wrap pt-3.5 border-t border-slate-100">
                    {meta.map((m, i) => (
                        <div key={i} className="flex items-center gap-1.5 text-xs text-slate-500">
                            <span className="text-slate-400">{m.icon}</span>
                            {m.label}:&nbsp;<strong className="text-slate-700">{m.value}</strong>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

// ── MetricCard ────────────────────────────────────────────────────────────────

const MetricCard: React.FC<{ title: string; icon: React.ReactNode; children: React.ReactNode }> = ({ title, icon, children }) => (
    <div className="bg-white rounded-[14px] px-6 py-5 border border-slate-200 shadow-sm transition-shadow transition-transform duration-200 hover:shadow-lg hover:-translate-y-0.5 border-t-[3px] border-t-indigo-500">
        <div className="flex items-center gap-2 mb-4 text-[13px] font-semibold text-slate-400 uppercase tracking-wider">
            <span className="text-indigo-500">{icon}</span> {title}
        </div>
        <div className="text-[13px] text-slate-600 space-y-2">{children}</div>
    </div>
);

export default ServerStatusPage;
