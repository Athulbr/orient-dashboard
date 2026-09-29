import { Trash, Trash2 } from 'lucide-react';
import { formatDate } from '../utils/formatDate';

export const StatusCustomUI = ({ data }: { data: any }) => {
    return (
        <div
            className={`inline rounded-md px-2 py-1 text-sm capitalize ${
                data.status === 'active'
                    ? 'bg-green-50 text-green-600'
                    : data.status === 'inactive'
                      ? 'bg-red-50 text-red-500'
                      : data.status === 'pending'
                        ? 'bg-orange-50 text-orange-400'
                        : 'bg-gray-50 text-gray-600'
            }`}
        >
            {data.status}
        </div>
    );
};
export const DeleteCustomUI = ({}: { data: any }) => {
    const handleDelete = (e: React.MouseEvent) => {
        e.stopPropagation();
    };
    return (
        <div>
            <Trash2 onClick={handleDelete} className="ml-4 cursor-pointer hover:text-red-500" size={16} />
        </div>
    );
};
export const DateCustomUI = ({ data }: { data: any }) => {
    return <div>{formatDate(data.updatedAt)}</div>;
};
