import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Plus, Search, Trash2, Layers, Table2, Zap, Clock, AlertCircle, Download, Copy } from 'lucide-react';
import httpRequest from '../../../../global-utils/httpRequest';
import { config } from '../../../../config/default';
import Spinner from '../../../../components/Spinner';
import { useToastStore } from '../../../../components/toast/ToastStore';
import ImportDialogComponent from './components/ImportDialogComponent';

interface AgentTemplate {
    _id: string;
    name: string;
    settings: {
        llmProvider: string;
        llmModel: string;
        extractionLimit: number;
        disableBoundingBox: boolean;
        alignmentCorrection: boolean;
        includeOcrTextForExtraction: boolean;
    };
    sections: Array<{
        id: string;
        type: 'group' | 'table';
        key: string;
        label: string;
        instruction?: string;
        fields: Array<{ id: string; label: string }>;
    }>;
    createdAt: string;
    updatedAt: string;
}

const ListAgentTemplatePage = () => {
    const navigate = useNavigate();

    const [templates, setTemplates] = useState<AgentTemplate[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [exportingId, setExportingId] = useState<string | null>(null);
    const [showImportDialog, setShowImportDialog] = useState(false);
    const toast = useToastStore();

    const fetchTemplates = useCallback(async () => {
        setIsLoading(true);
        setError('');
        try {
            const response: any = await httpRequest('GET', `${config.workflowService}/workflow/agent-templates`);
            if (response?.success && response.templates) {
                setTemplates(response.templates);
            } else {
                setTemplates([]);
            }
        } catch (err) {
            setError('Failed to load templates');
            console.error('Failed to load templates', err);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchTemplates();
    }, []);

    const handleDelete = async (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        if (!confirm('Are you sure you want to delete this template?')) return;

        setDeletingId(id);
        try {
            await httpRequest('DELETE', `${config.workflowService}/workflow/agent-templates/${id}`);
            setTemplates(prev => prev.filter(t => t._id !== id));
            toast.success('Template deleted successfully');
        } catch (err) {
            console.error('Failed to delete template', err);
            toast.error('Failed to delete template');
        } finally {
            setDeletingId(null);
        }
    };

    const handleExport = async (e: React.MouseEvent, id: string, name: string) => {
        e.stopPropagation();
        setExportingId(id);
        try {
            const response: any = await httpRequest('GET', `${config.workflowService}/workflow/agent-templates/${id}`);
            if (response?.success && response.template) {
                const data = {
                    name: response.template.name,
                    settings: response.template.settings,
                    sections: response.template.sections
                };
                const textToCopy = JSON.stringify(data, null, 2);
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    await navigator.clipboard.writeText(textToCopy);
                    toast.success('Template exported to clipboard');
                } else {
                    const textArea = document.createElement('textarea');
                    textArea.value = textToCopy;
                    document.body.appendChild(textArea);
                    textArea.select();
                    try {
                        document.execCommand('copy');
                        toast.success('Template exported to clipboard');
                    } catch (err) {
                        toast.error('Failed to copy to clipboard');
                    } finally {
                        document.body.removeChild(textArea);
                    }
                }
            } else {
                toast.error('Failed to fetch template details');
            }
        } catch (err) {
            toast.error('Failed to export template');
            console.error(err);
        } finally {
            setExportingId(null);
        }
    };

    const filtered = templates.filter(t => t.name.toLowerCase().includes(searchQuery.toLowerCase()));

    const totalFields = (t: AgentTemplate) => t.sections.reduce((sum, s) => sum + s.fields.length, 0);

    const groupCount = (t: AgentTemplate) => t.sections.filter(s => s.type === 'group').length;

    const tableCount = (t: AgentTemplate) => t.sections.filter(s => s.type === 'table').length;

    const formatDate = (d: string) => {
        const date = new Date(d);
        const now = new Date();
        const diff = now.getTime() - date.getTime();
        const mins = Math.floor(diff / 60000);
        if (mins < 1) return 'just now';
        if (mins < 60) return `${mins}m ago`;
        const hours = Math.floor(mins / 60);
        if (hours < 24) return `${hours}h ago`;
        const days = Math.floor(hours / 24);
        if (days < 7) return `${days}d ago`;
        return date.toLocaleDateString();
    };

    return (
        <div className="min-h-screen w-full  bg-slate-50 text-zinc-900">
            <main className="mx-auto px-4 py-8 sm:px-6 lg:px-8">
                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h1 className="text-2xl font-bold text-zinc-900 flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-blue-900 flex items-center justify-center flex-shrink-0">
                                <FileText size={20} className="text-white" />
                            </div>
                            Agent Templates
                        </h1>
                        <p className="text-sm text-zinc-500 mt-1 ml-[52px]">Manage your extraction template configurations</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="relative max-w-md">
                            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                            <input
                                type="text"
                                placeholder="Search templates..."
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                className="w-full pl-9 pr-4 py-2.5 border border-zinc-200 rounded-xl text-sm text-zinc-900 bg-white outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition-colors"
                            />
                        </div>
                        <button
                            onClick={() => setShowImportDialog(true)}
                            className="flex items-center gap-2 px-4 py-2.5 border border-zinc-200 bg-white text-zinc-700 rounded-xl text-sm font-medium hover:bg-zinc-50 transition-colors shadow-sm cursor-pointer"
                        >
                            <Download size={16} />
                            Import
                        </button>
                        <button
                            onClick={() => navigate('/agent/template/create')}
                            className="flex items-center gap-2 px-4 py-2.5 bg-blue-900 text-white rounded-xl text-sm font-medium hover:bg-blue-800 transition-colors shadow-sm cursor-pointer"
                        >
                            <Plus size={16} />
                            Create Template
                        </button>
                    </div>
                </div>

                {/* Search */}
                {/* <div className="mb-6">
                    <div className="relative max-w-md">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                        <input
                            type="text"
                            placeholder="Search templates..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="w-full pl-9 pr-4 py-2.5 border border-zinc-200 rounded-xl text-sm text-zinc-900 bg-white outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition-colors"
                        />
                    </div>
                </div> */}

                {/* Content */}
                {isLoading ? (
                    <div className="flex items-center justify-center py-20">
                        <Spinner />
                    </div>
                ) : error ? (
                    <div className="rounded-2xl border border-red-200 bg-white p-12 text-center shadow-sm">
                        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-50 text-red-400">
                            <AlertCircle size={32} />
                        </div>
                        <h3 className="mb-2 text-lg font-medium text-red-700">{error}</h3>
                        <button onClick={fetchTemplates} className="mt-2 text-sm text-blue-600 hover:underline cursor-pointer">
                            Try again
                        </button>
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="rounded-2xl border border-zinc-200 bg-white p-12 text-center shadow-sm">
                        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 text-zinc-400">
                            <FileText size={32} />
                        </div>
                        <h3 className="mb-2 text-lg font-medium text-zinc-900">{searchQuery ? 'No matching templates' : 'No Templates Yet'}</h3>
                        <p className="text-zinc-500 mb-4">{searchQuery ? 'Try a different search term.' : 'Create your first extraction template to get started.'}</p>
                        {!searchQuery && (
                            <button
                                onClick={() => navigate('/agent/template/create')}
                                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-900 text-white rounded-lg text-sm font-medium hover:bg-blue-800 transition-colors cursor-pointer"
                            >
                                <Plus size={14} />
                                Create Template
                            </button>
                        )}
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                        {filtered.map(template => (
                            <div
                                key={template._id}
                                onClick={() => navigate(`/agent/template/${template._id}`)}
                                className="group relative flex cursor-pointer flex-col justify-between overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm transition-all hover:border-blue-300 hover:shadow-md"
                            >
                                {/* Gradient hover overlay */}
                                <div className="absolute inset-0 bg-gradient-to-br from-blue-50/60 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100" />

                                <div className="relative z-10 p-5">
                                    {/* Header row */}
                                    <div className="flex items-start justify-between mb-4">
                                        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-900/5 text-blue-900 ring-1 ring-blue-900/10">
                                            <FileText size={20} />
                                        </div>
                                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                                            <button
                                                onClick={e => handleExport(e, template._id, template.name)}
                                                disabled={exportingId === template._id}
                                                className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-300 hover:text-blue-600 hover:bg-blue-50 transition-all cursor-pointer disabled:opacity-50"
                                                title="Export Template"
                                            >
                                                <Copy size={15} />
                                            </button>
                                            <button
                                                onClick={e => handleDelete(e, template._id)}
                                                disabled={deletingId === template._id}
                                                className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-300 hover:text-red-500 hover:bg-red-50 transition-all cursor-pointer disabled:opacity-50"
                                                title="Delete Template"
                                            >
                                                <Trash2 size={15} />
                                            </button>
                                        </div>
                                    </div>

                                    {/* Name */}
                                    <h3 className="text-[15px] font-semibold text-zinc-900 mb-1 truncate" title={template.name}>
                                        {template.name}
                                    </h3>

                                    {/* Provider pill */}
                                    <div className="flex items-center gap-1.5 mb-4">
                                        <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-zinc-600 border border-zinc-200">
                                            <Zap size={10} />
                                            {template.settings?.llmProvider} · {template.settings?.llmModel}
                                        </span>
                                    </div>

                                    {/* Section badges */}
                                    <div className="flex items-center gap-2 flex-wrap">
                                        {groupCount(template) > 0 && (
                                            <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md bg-blue-50 text-blue-600 border border-blue-200">
                                                <Layers size={10} />
                                                {groupCount(template)} group
                                                {groupCount(template) > 1 ? 's' : ''}
                                            </span>
                                        )}
                                        {tableCount(template) > 0 && (
                                            <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md bg-violet-50 text-violet-600 border border-violet-200">
                                                <Table2 size={10} />
                                                {tableCount(template)} table
                                                {tableCount(template) > 1 ? 's' : ''}
                                            </span>
                                        )}
                                        <span className="text-[11px] text-zinc-400">
                                            {totalFields(template)} field{totalFields(template) !== 1 ? 's' : ''}
                                        </span>
                                    </div>
                                </div>

                                {/* Footer */}
                                <div className="relative z-10 flex items-center justify-between border-t border-slate-100 px-5 py-3 bg-slate-50/50">
                                    <div className="flex items-center gap-1.5 text-[11px] text-zinc-400">
                                        <Clock size={11} />
                                        {formatDate(template.updatedAt)}
                                    </div>
                                    <span className="text-[11px] font-medium text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity">Edit →</span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {showImportDialog && <ImportDialogComponent isOpen={showImportDialog} onClose={() => setShowImportDialog(false)} onImportSuccess={fetchTemplates} />}
            </main>
        </div>
    );
};

export default ListAgentTemplatePage;
