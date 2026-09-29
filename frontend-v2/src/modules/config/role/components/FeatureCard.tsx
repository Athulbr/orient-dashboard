export interface Feature {
    _id: string;
    key: string;
    name: string;
    description: string;
    isActive: boolean;
    isBeta: boolean;
    moduleId: string;
    deleted: boolean;
}

interface FeatureCardProps {
    feature: Feature;
    isAssigned: boolean;
    onAssign: (featureId: string) => void;
    onUnassign: (featureId: string) => void;
    showActionButton?: boolean;
}

export const FeatureCard: React.FC<FeatureCardProps> = ({ feature, isAssigned, onAssign, onUnassign, showActionButton = true }) => {
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
            {feature.description && <p className="mt-1 text-xs text-slate-500">{feature.description}</p>}
        </div>
    );
};
