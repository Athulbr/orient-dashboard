import { AlertCircle } from 'lucide-react';

export const EmptyStateCustomComponent: React.FC<{ searchTerm: string; type: 'assigned' | 'available' }> = ({ searchTerm, type }) => (
    <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-200 p-8 text-center">
        <AlertCircle size={40} className="mb-2 text-slate-300" />
        <h3 className="mb-1 text-sm font-medium text-slate-700">{searchTerm ? `No ${type} features match "${searchTerm}"` : `No ${type} features`}</h3>
        <p className="text-xs text-slate-500">
            {searchTerm
                ? "Try adjusting your search or filter to find what you're looking for."
                : type === 'assigned'
                  ? 'Assign features from the available features list.'
                  : 'All available features have been assigned.'}
        </p>
    </div>
);
