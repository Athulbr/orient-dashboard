import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bot, Activity, Boxes, Workflow } from 'lucide-react';
import httpRequest from '../../../global-utils/httpRequest';
import { config } from '../../../config/default';
import Spinner from '../../../components/Spinner';
import { Button } from '../../../components/Button';
import clientLogger from '../../../global-utils/clientLog';
import clientLoggerNew from '../../../global-utils/clientLoggerNew';

interface Agent {
    _id: string;
    name: string;
    description: string;
    isActive: boolean;
    nodes?: any[];
    updatedAt: string;
}

const ListAgentsPage = () => {
    const navigate = useNavigate();

    const [agents, setAgents] = useState<Agent[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');

    const fetchAgents = useCallback(async () => {
        setIsLoading(true);
        try {
            const response: any = await httpRequest('GET', `${config.workflowService}/workflow/workflows?limit=100&category=main`);

            let agentList: Agent[] = [];
            if (response && response.data) {
                agentList = response.data;
            } else if (Array.isArray(response)) {
                agentList = response;
            }

            if (agentList.length === 1) {
                navigate(`/agent/run/${agentList[0].name}`, { replace: true });
                return;
            }

            setAgents(agentList);
        } catch (err) {
            setError('Failed to load agents');
            console.error('Failed to load agents', err);
        } finally {
            setIsLoading(false);
        }
    }, [navigate]);

    useEffect(() => {
        fetchAgents();
    }, [fetchAgents]);

    const tempFunction = () => {
        clientLoggerNew({ message: 'Total agents card clicked 1' });

        // alert('Test');
    };

    return (
        <div className="min-h-screen bg-slate-50 text-zinc-900 min-w-screen">
            <main className="mx-auto px-4 py-8 sm:px-6 lg:px-8">
                {/* Stats Row */}
                <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
                        <div onClick={tempFunction} className="flex items-center gap-4">
                            <div className="rounded-lg bg-indigo-50 p-3 text-indigo-600">
                                <Bot size={24} />
                            </div>
                            <div>
                                <p className="text-sm font-medium text-zinc-500">Total Agents</p>
                                <p className="text-2xl font-bold text-zinc-900">{agents.length}</p>
                            </div>
                        </div>
                    </div>
                    <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
                        <div className="flex items-center gap-4">
                            <div className="rounded-lg bg-emerald-50 p-3 text-emerald-600">
                                <Activity size={24} />
                            </div>
                            <div>
                                <p className="text-sm font-medium text-zinc-500">Active Agents</p>
                                <p className="text-2xl font-bold text-zinc-900">{agents.filter(a => a.isActive).length}</p>
                            </div>
                        </div>
                    </div>
                    <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
                        <div className="flex items-center gap-4">
                            <div className="rounded-lg bg-rose-50 p-3 text-rose-600">
                                <Boxes size={24} />
                            </div>
                            <div>
                                <p className="text-sm font-medium text-zinc-500">Inactive Agents</p>
                                <p className="text-2xl font-bold text-zinc-900">{agents.filter(a => !a.isActive).length}</p>
                            </div>
                        </div>
                    </div>
                    <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
                        <div className="flex items-center gap-4">
                            <div className="rounded-lg bg-rose-50 p-3 text-rose-600">
                                <Boxes size={24} />
                            </div>
                            <div>
                                <p className="text-sm font-medium text-zinc-500">Total Executions</p>
                                <p className="text-2xl font-bold text-zinc-900">100</p>
                            </div>
                        </div>
                    </div>
                </div>

                <h2 className="mb-6 text-lg font-semibold text-zinc-900">All Agents</h2>

                {isLoading ? (
                    <div className="flex items-center justify-center py-20">
                        <Spinner />
                    </div>
                ) : error ? (
                    <div className="rounded-2xl border border-red-200 bg-white p-12 text-center shadow-sm">
                        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 text-zinc-400">
                            <Workflow size={32} />
                        </div>
                        <h3 className="mb-2 text-lg font-medium text-red-700">{error}</h3>
                    </div>
                ) : agents.length === 0 ? (
                    <div className="rounded-2xl border border-zinc-200 bg-white p-12 text-center shadow-sm">
                        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 text-zinc-400">
                            <Workflow size={32} />
                        </div>
                        <h3 className="mb-2 text-lg font-medium text-zinc-900">No Agents Found</h3>
                        <p className="text-zinc-500">Create a new agent to see it here.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                        {agents.map(agent => (
                            <div
                                key={agent._id}
                                className="group relative flex cursor-pointer flex-col justify-between overflow-hidden rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm transition-all hover:border-indigo-300 hover:shadow-md"
                            >
                                <div className="absolute inset-0 bg-gradient-to-br from-indigo-50/50 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100" />

                                <div className="relative z-10 flex flex-col gap-4">
                                    <div className="flex items-start justify-between">
                                        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-zinc-600 ring-1 ring-zinc-200">
                                            <Bot size={24} />
                                        </div>
                                        <span
                                            className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium shadow-sm ${
                                                agent.isActive ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-zinc-200 bg-slate-50 text-zinc-600'
                                            }`}
                                        >
                                            {agent.isActive ? 'Active' : 'Inactive'}
                                        </span>
                                    </div>

                                    <div>
                                        <h3 className="mb-1 truncate text-lg font-semibold text-zinc-900" title={agent.name}>
                                            {agent.name}
                                        </h3>
                                        <p className="line-clamp-2 text-sm text-zinc-500" title={agent.description}>
                                            {agent.description || 'No description provided.'}
                                        </p>
                                    </div>
                                </div>

                                <div className="relative z-10 mt-6 flex items-center justify-between border-t border-slate-100 pt-4">
                                    <div className="text-right text-xs text-zinc-500">Updated {new Date(agent.updatedAt).toLocaleDateString()}</div>
                                    <Button outlined small onClick={() => navigate(`/agent/run/${agent.name}`)}>
                                        Run Agent
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </main>
        </div>
    );
};

export default ListAgentsPage;
