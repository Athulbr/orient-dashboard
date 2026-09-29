import React, { useState } from 'react';
import { useRoleState } from './hooks/roleContext';
import { useRolesApi } from './hooks/useRoleApi';
import { Button } from '../../../components/Button';
import Spinner from '../../../components/Spinner';
import { Feature } from './components/FeatureCard';
import { Module, ModuleAccordion } from './components/ModuleAccordion';
import { SearchInputCustom } from './components/SearchInputCustom';
import { EmptyStateCustomComponent } from './components/EmptyStateCustomComponent';

const LeftContainer: React.FC = () => {
    const { state, setState } = useRoleState();
    const [searchTerm, setSearchTerm] = useState('');
    const { updateRoleApi } = useRolesApi();

    const assignedFeatures = state.role?.features || [];
    const assignedFeatureIds = assignedFeatures.map((f: Feature) => (typeof f === 'string' ? f : f._id));
    const allFeatures = state.features || [];
    const modules = state.modules || [];

    // Filter features based on search
    const filteredAssignedFeatures = allFeatures.filter((feature: Feature) => {
        const matchesSearch =
            feature.name.toLowerCase().includes(searchTerm.toLowerCase()) || feature.description?.toLowerCase().includes(searchTerm.toLowerCase());
        return assignedFeatureIds.includes(feature._id) && matchesSearch;
    });

    // Group features by module
    const featuresByModule = modules
        .map((module: Module) => ({
            module,
            features: filteredAssignedFeatures.filter((f: Feature) => f.moduleId === module._id)
        }))
        .filter((group: { module: Module; features: Feature[] }) => group.features.length > 0);

    // Visual update logic
    const assignFeature = (featureId: string) => {
        if (!assignedFeatureIds.includes(featureId)) {
            setState(prev => ({
                ...prev,
                role: {
                    ...prev.role,
                    features: [...prev.role.features, featureId]
                }
            }));
        }
    };

    const unassignFeature = (featureId: string) => {
        setState(prev => ({
            ...prev,
            role: {
                ...prev.role,
                features: prev.role.features.filter((id: string) => id !== featureId)
            }
        }));
    };

    const handleUpdateRole = () => {
        setState(prev => ({ ...prev, loading: true }));
        updateRoleApi(state.role);
    };

    const noResults = searchTerm && filteredAssignedFeatures.length === 0;

    return (
        <div className="flex h-full flex-col rounded-xl bg-gradient-to-br from-slate-50 to-slate-100 shadow-2xl">
            <div className="flex flex-shrink-0 items-center justify-between border-b border-slate-200 bg-white p-6 shadow-sm">
                <div>
                    <h2 className="mb-1 flex items-center gap-2 text-xl font-bold text-slate-800">
                        Assigned Features
                        {state.role?.name && (
                            <span className="ml-2 rounded-full bg-gradient-to-r from-blue-500 to-cyan-500 px-3 py-1 text-xs font-semibold text-white">
                                {state.role.name}
                            </span>
                        )}
                    </h2>
                    <p className="text-sm text-slate-600">These features are currently assigned to the role.</p>
                </div>
                <Button
                    onClick={handleUpdateRole}
                    className="bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-md hover:from-emerald-600 hover:to-teal-600"
                    disabled={state.loading}
                    startIcon={state.loading ? <Spinner size={16} /> : undefined}
                >
                    {state.loading ? 'Updating...' : 'Update'}
                </Button>
            </div>
            <div className="p-6">
                <div className="flex-shrink-0">
                    <SearchInputCustom value={searchTerm} onChange={setSearchTerm} placeholder="Search assigned features..." />
                </div>

                <div className="flex-1 overflow-y-auto">
                    {noResults ? (
                        <EmptyStateCustomComponent searchTerm={searchTerm} type="assigned" />
                    ) : filteredAssignedFeatures.length === 0 ? (
                        <div className="mt-8 flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-200 p-8 text-center">
                            <h3 className="mb-1 text-sm font-medium text-slate-700">No features assigned yet</h3>
                            <p className="text-xs text-slate-500">Assign features from the available features list.</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {featuresByModule.map(({ module, features }: { module: Module; features: Feature[] }) => (
                                <ModuleAccordion
                                    key={module._id}
                                    module={module}
                                    features={features}
                                    assignedFeatureIds={assignedFeatureIds}
                                    onAssign={assignFeature}
                                    onUnassign={unassignFeature}
                                    showActionButtons={true}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

const RightContainer: React.FC = () => {
    const { state, setState } = useRoleState();
    const [searchTerm, setSearchTerm] = useState('');

    const subscriptionModelFeatures = state.subscriptionModel?.features || [];
    const allFeatures = state.features || [];
    const modules = state.modules || [];
    const roleFeatures = state.role?.features || [];

    // Get all features that are in the subscription model
    const availableFeatures = allFeatures.filter((feature: Feature) => subscriptionModelFeatures.includes(feature._id));

    const filteredAvailableFeatures = availableFeatures.filter((feature: Feature) => {
        const matchesSearch =
            feature.name.toLowerCase().includes(searchTerm.toLowerCase()) || feature.description?.toLowerCase().includes(searchTerm.toLowerCase());
        return matchesSearch;
    });

    const featuresByModule = modules
        .map((module: Module) => ({
            module,
            features: filteredAvailableFeatures.filter((f: Feature) => f.moduleId === module._id)
        }))
        .filter((group: { module: Module; features: Feature[] }) => group.features.length > 0);

    const assignFeature = (featureId: string) => {
        if (!roleFeatures.some((f: any) => (typeof f === 'string' ? f === featureId : f._id === featureId))) {
            setState(prev => ({
                ...prev,
                role: {
                    ...prev.role,
                    features: [...prev.role.features, featureId]
                }
            }));
        }
    };

    const unassignFeature = (featureId: string) => {
        setState(prev => ({
            ...prev,
            role: {
                ...prev.role,
                features: prev.role.features.filter((f: any) => (typeof f === 'string' ? f !== featureId : f._id !== featureId))
            }
        }));
    };

    const noResults = searchTerm && filteredAvailableFeatures.length === 0;

    return (
        <div className="h-full overflow-y-auto border-l border-slate-200 pl-4">
            <div className="mb-6">
                <h2 className="mb-2 text-lg font-semibold text-slate-800">Available Features in {state.subscriptionModel?.name} plan</h2>
                <p className="text-sm text-slate-500">Assign features from your subscription model</p>
            </div>

            <SearchInputCustom value={searchTerm} onChange={setSearchTerm} placeholder="Search available features..." />

            {noResults ? (
                <EmptyStateCustomComponent searchTerm={searchTerm} type="available" />
            ) : filteredAvailableFeatures.length === 0 ? (
                <div className="mt-8 text-center text-sm text-slate-500">No features found matching your search.</div>
            ) : (
                <div className="space-y-4">
                    {featuresByModule.map(({ module, features }: { module: Module; features: Feature[] }) => (
                        <ModuleAccordion
                            key={module._id}
                            module={module}
                            features={features}
                            assignedFeatureIds={roleFeatures.map((f: any) => (typeof f === 'string' ? f : f._id))}
                            onAssign={assignFeature}
                            onUnassign={unassignFeature}
                            showActionButtons={true}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

const ViewRoleComponent: React.FC = () => {
    const { state } = useRoleState();

    if (!state.role) {
        return (
            <div className="flex h-full items-center justify-center">
                <div className="text-center">
                    <h3 className="text-lg font-medium text-slate-800">No role selected</h3>
                    <p className="mt-1 text-sm text-slate-500">Select a role to view or edit its features</p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex h-[calc(100vh-200px)] flex-col">
            <div className="flex flex-1 overflow-hidden">
                <div className="w-1/2 overflow-y-auto p-4">
                    <LeftContainer />
                </div>
                <div className="w-1/2 overflow-y-auto border-l border-slate-200 p-4">
                    <RightContainer />
                </div>
            </div>
        </div>
    );
};

export default ViewRoleComponent;
