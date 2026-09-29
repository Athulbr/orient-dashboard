import { ChevronDown, FileText, Package, Settings, Users } from 'lucide-react';
import { useState } from 'react';
import { Feature, FeatureCard } from './FeatureCard';

export interface Module {
    _id: string;
    key: string;
    name: string;
    order: number;
}

interface ModuleAccordionProps {
    module: Module;
    features: Feature[];
    assignedFeatureIds: string[];
    onAssign: (featureId: string) => void;
    onUnassign: (featureId: string) => void;
    showActionButtons?: boolean;
}

const getModuleIcon = (moduleKey: string) => {
    const iconMap: Record<string, React.ComponentType<any>> = {
        user: Users,
        docsnap: FileText,
        promate: Settings
    };
    return iconMap[moduleKey] || Package;
};

export const ModuleAccordion: React.FC<ModuleAccordionProps> = ({ module, features, assignedFeatureIds, onAssign, onUnassign, showActionButtons = true }) => {
    const [isOpen, setIsOpen] = useState(true);
    const Icon = getModuleIcon(module.key);

    return (
        <div className="mb-4 overflow-hidden rounded-lg border border-slate-200 bg-white">
            <button onClick={() => setIsOpen(!isOpen)} className="flex w-full items-center justify-between p-4 text-left hover:bg-slate-50">
                <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                        <Icon size={16} />
                    </div>
                    <h2 className="font-medium text-slate-800">{module.name}</h2>
                    <span className="ml-2 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                        {features.length} {features.length === 1 ? 'feature' : 'features'}
                    </span>
                </div>
                <ChevronDown size={20} className={`text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
            </button>
            {isOpen && (
                <div className="space-y-3 p-4 pt-0">
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
