import { Edit } from 'lucide-react';
import { DetailsCard, DetailsCardItem } from './DetailsCard';

export const NotificationsDetails = () => {
    return (
        <DetailsCard>
            <DetailsCardItem label="Notification" value="On" />
            <Edit className="absolute top-4 right-4 cursor-pointer hover:text-sky-500" size={18} />
        </DetailsCard>
    );
};
