import React, { useEffect, useState } from 'react';
import { ChevronDown, Search, Package, Users, FileText, Settings, AlertCircle } from 'lucide-react';
import { useSubscriptionModelState } from './hooks/subscriptionModelContext';
import { useSubscriptionModelsApi } from './hooks/useSubscriptionModelApi';
import { Button } from '../../../components/Button';

// Type definitions
interface Module {
    _id: string;
    key: string;
    name: string;
    order: number;
}

interface Feature {
    _id: string;
    key: string;
    name: string;
    description: string;
    isActive: boolean;
    isBeta: boolean;
    moduleId: string;
    deleted: boolean;
}

// Utility functions
const getModuleIcon = (moduleKey: string) => {
    const iconMap: Record<string, React.ComponentType<any>> = {
        user: Users,
        docsnap: FileText,
        promate: Settings
    };
    return iconMap[moduleKey] || Package;
};

const useFeatureActions = () => {
    const { setState } = useSubscriptionModelState();

    const assignFeature = (featureId: string) => {
        setState(prev => {
            if (!prev || prev.subscriptionModel?.features.includes(featureId)) return prev;
            return {
                ...prev,
                subscriptionModel: {
                    ...prev.subscriptionModel,
                    features: [...(prev.subscriptionModel?.features || []), featureId]
                }
            };
        });
    };

    const unassignFeature = (featureId: string) => {
        setState(prev => {
            if (!prev) return prev;
            return {
                ...prev,
                subscriptionModel: {
                    ...prev.subscriptionModel,
                    features: prev.subscriptionModel?.features.filter((id: string) => id !== featureId) || []
                }
            };
        });
    };

    return { assignFeature, unassignFeature };
};

// Components
interface FeatureCardProps {
    feature: Feature;
    isAssigned: boolean;
    onAssign: (featureId: string) => void;
    onUnassign: (featureId: string) => void;
    showActionButton?: boolean;
}

const FeatureCard: React.FC<FeatureCardProps> = ({ feature, isAssigned, onAssign, onUnassign, showActionButton = true }) => {
    const handleClick = () => {
        if (isAssigned) {
            onUnassign(feature._id);
        } else {
            onAssign(feature._id);
        }
    };

    return (
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition-all duration-200 hover:shadow-md">
            <div className="mb-1 flex items-start justify-between">
                <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-slate-800">{feature.name}</h3>
                    {feature.isBeta && (
                        <span className="rounded-full bg-gradient-to-r from-purple-500 to-pink-500 px-2 py-1 text-xs font-medium text-white">Beta</span>
                    )}
                </div>
                {showActionButton && (
                    <button
                        onClick={handleClick}
                        className={`rounded-md px-3 py-1 text-xs font-medium transition-all duration-200 ${
                            isAssigned ? 'bg-red-500 text-white hover:bg-red-600' : 'bg-blue-500 text-white hover:bg-blue-600'
                        }`}
                    >
                        {isAssigned ? 'Remove' : 'Assign'}
                    </button>
                )}
            </div>
            <p className="text-xs leading-relaxed text-slate-600">{feature.description}</p>
        </div>
    );
};

interface ModuleAccordionProps {
    module: Module;
    features: Feature[];
    assignedFeatureIds: string[];
    onAssign: (featureId: string) => void;
    onUnassign: (featureId: string) => void;
    showActionButtons?: boolean;
}

const ModuleAccordion: React.FC<ModuleAccordionProps> = ({ module, features, assignedFeatureIds, onAssign, onUnassign, showActionButtons = true }) => {
    const [isOpen, setIsOpen] = useState(true);
    const IconComponent = getModuleIcon(module.key);

    if (features.length === 0) return null;

    const assignedCount = features.filter(f => assignedFeatureIds.includes(f._id)).length;

    return (
        <div className="mb-3 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex w-full items-center justify-between px-4 py-3 transition-colors duration-200 hover:bg-slate-50"
            >
                <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-r from-blue-500 to-indigo-500">
                        <IconComponent className="h-4 w-4 text-white" />
                    </div>
                    <div className="text-left">
                        <h3 className="text-sm font-semibold text-slate-800">{module.name}</h3>
                        <p className="text-xs text-slate-500">
                            {showActionButtons ? `${assignedCount}/${features.length} assigned` : `${features.length} features`}
                        </p>
                    </div>
                </div>
                <ChevronDown className={`h-4 w-4 transform text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {isOpen && (
                <div className="space-y-4 border-t border-slate-100 px-4 py-4">
                    {features.map(feature => (
                        <FeatureCard
                            key={feature._id}
                            feature={feature}
                            isAssigned={assignedFeatureIds.includes(feature._id)}
                            onAssign={onAssign}
                            onUnassign={onUnassign}
                            showActionButton={showActionButtons}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

interface SearchInputProps {
    placeholder: string;
    value: string;
    onChange: (value: string) => void;
}

const SearchInput: React.FC<SearchInputProps> = ({ placeholder, value, onChange }) => (
    <div className="relative">
        <input
            type="text"
            placeholder={placeholder}
            value={value}
            onChange={e => onChange(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-slate-50 px-4 py-3 pl-10 text-slate-800 placeholder-slate-500 transition-all duration-200 focus:border-transparent focus:ring-2 focus:ring-blue-500"
        />
        <div className="absolute top-1/2 left-3 -translate-y-1/2 transform text-slate-400">
            <Search className="h-4 w-4" />
        </div>
    </div>
);

interface EmptyStateProps {
    searchTerm: string;
    type: 'assigned' | 'available';
}

const EmptyState: React.FC<EmptyStateProps> = ({ searchTerm, type }) => (
    <div className="py-12 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-slate-200">
            <AlertCircle className="h-8 w-8 text-slate-400" />
        </div>
        <p className="text-slate-500">
            {searchTerm ? 'No features match your search' : type === 'assigned' ? 'No features assigned to this plan' : 'No features available'}
        </p>
        <p className="mt-1 text-sm text-slate-400">
            {searchTerm
                ? 'Try adjusting your search terms'
                : type === 'assigned'
                  ? 'Add features from the available features panel'
                  : 'Features will appear here when loaded'}
        </p>
    </div>
);

const LeftContainer: React.FC = () => {
    const { state } = useSubscriptionModelState();
    const { assignFeature, unassignFeature } = useFeatureActions();
    const { updateSubscriptionModelApi } = useSubscriptionModelsApi();
    const [searchTerm, setSearchTerm] = useState('');

    const subscription = state.subscriptionModel;
    const modules = state.modules || [];
    const features = state.features || [];

    if (!subscription) return null;

    const assignedFeatures = features.filter(feature => subscription.features.includes(feature._id));

    const filteredFeatures = assignedFeatures.filter(
        feature => feature.name.toLowerCase().includes(searchTerm.toLowerCase()) || feature.description.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const sortedModules = [...modules].sort((a, b) => a.order - b.order);

    const handleUpdate = async () => {
        await updateSubscriptionModelApi(subscription);
    };

    return (
        <div className="flex h-full flex-col bg-gradient-to-br from-slate-50 to-slate-100">
            <div className="flex-shrink-0 border-b border-slate-200 bg-white p-6 shadow-sm">
                <div className="mb-4 flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-r from-violet-500 to-purple-500 shadow-lg">
                        <span className="text-lg font-bold text-white">{subscription.name.charAt(0).toUpperCase()}</span>
                    </div>
                    <div className="flex w-full justify-between">
                        <div className="flex flex-col gap-2">
                            <h1 className="text-xl font-bold text-slate-800">{subscription.name} Plan</h1>
                            <p className="text-sm text-slate-600">{subscription.description}</p>
                        </div>
                        <Button onClick={handleUpdate}>Update</Button>
                    </div>
                </div>

                <div className="mb-4 flex items-center gap-4 text-sm">
                    <div className="rounded-lg bg-gradient-to-r from-green-500 to-emerald-500 px-3 py-1 font-semibold text-white">
                        ${subscription.price} / {subscription.cycle}
                    </div>
                    <div className="text-slate-600">
                        <span className="font-semibold text-slate-800">{assignedFeatures.length}</span> features assigned
                    </div>
                </div>

                <SearchInput placeholder="Search assigned features..." value={searchTerm} onChange={setSearchTerm} />
            </div>

            <div className="flex-1 overflow-y-auto p-6">
                {filteredFeatures.length === 0 ? (
                    <EmptyState searchTerm={searchTerm} type="assigned" />
                ) : (
                    <div className="space-y-3">
                        {sortedModules.map(module => {
                            const moduleFeatures = filteredFeatures.filter(feature => feature.moduleId === module._id);
                            return (
                                <ModuleAccordion
                                    key={module._id}
                                    module={module}
                                    features={moduleFeatures}
                                    assignedFeatureIds={subscription.features}
                                    onAssign={assignFeature}
                                    onUnassign={unassignFeature}
                                    showActionButtons={true}
                                />
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};

const RightContainer: React.FC = () => {
    const { state } = useSubscriptionModelState();
    const { assignFeature, unassignFeature } = useFeatureActions();
    const [searchTerm, setSearchTerm] = useState('');

    const features = state.features || [];
    const modules = state.modules || [];
    const assignedFeatureIds = state.subscriptionModel?.features || [];

    const filteredFeatures = features.filter(
        feature => feature.name.toLowerCase().includes(searchTerm.toLowerCase()) || feature.description.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const sortedModules = [...modules].sort((a, b) => a.order - b.order);

    return (
        <div className="flex h-full flex-col bg-gradient-to-br from-slate-50 to-slate-100">
            <div className="flex-shrink-0 border-b border-slate-200 bg-white p-6 shadow-sm">
                <div className="mb-4 flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 shadow-lg">
                        <Package className="h-6 w-6 text-white" />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-slate-800">Available Features</h2>
                        <p className="text-sm text-slate-600">
                            {features.length} features across {modules.length} modules
                        </p>
                    </div>
                </div>

                <div className="mb-4 h-9"></div>

                <SearchInput placeholder="Search features..." value={searchTerm} onChange={setSearchTerm} />
            </div>

            <div className="flex-1 overflow-y-auto p-6">
                {filteredFeatures.length === 0 ? (
                    <EmptyState searchTerm={searchTerm} type="available" />
                ) : (
                    <div className="space-y-3">
                        {sortedModules.map(module => {
                            const moduleFeatures = filteredFeatures.filter(feature => feature.moduleId === module._id);
                            return (
                                <ModuleAccordion
                                    key={module._id}
                                    module={module}
                                    features={moduleFeatures}
                                    assignedFeatureIds={assignedFeatureIds}
                                    onAssign={assignFeature}
                                    onUnassign={unassignFeature}
                                    showActionButtons={true}
                                />
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};

export const ViewSubscriptionModelComponent: React.FC = () => {
    return (
        <div className="flex flex-1 overflow-hidden rounded-xl shadow-2xl">
            <div className="w-1/2 border-r border-slate-300">
                <LeftContainer />
            </div>
            <div className="w-1/2">
                <RightContainer />
            </div>
        </div>
    );
};

export default ViewSubscriptionModelComponent;
