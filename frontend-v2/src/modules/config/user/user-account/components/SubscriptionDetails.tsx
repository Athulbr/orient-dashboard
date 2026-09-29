import { Edit } from 'lucide-react';
import { DetailsCard, DetailsCardItem } from './DetailsCard';

export const SubscriptionDetails = () => {
    return (
        <DetailsCard>
            <DetailsCardItem label="Subscription" value="Free Plan" />
            <Edit className="absolute top-4 right-4 cursor-pointer hover:text-sky-500" size={18} />
        </DetailsCard>
    );
};
