import { cn } from '../../../../../../global-utils/twMerge';

interface StatusBadgeProps {
    status?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
    const normalized = (status || '').toLowerCase().trim();
    const isRedStatus =
        normalized === 'expired' ||
        normalized === 'balance exceeded' ||
        normalized === 'quantity exceeded' ||
        normalized.startsWith('expires in');

    if (!normalized) {
        return (
            <div className="w-fit cursor-pointer rounded-lg border-blue-100 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-500 hover:bg-blue-100 hover:text-blue-700">
                Review
            </div>
        );
    }

    return (
        <div
            className={cn(
                'w-fit cursor-pointer rounded-lg px-3 py-1 text-xs font-semibold hover:text-red-700',
                isRedStatus
                    ? 'border border-red-100 bg-red-50 text-red-500 hover:bg-red-100'
                    : 'border border-blue-100 bg-blue-50 text-blue-500 hover:bg-blue-100'
            )}
        >
            {status}
        </div>
    );
};
