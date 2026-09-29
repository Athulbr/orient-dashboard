export const StatusBadge = ({ status }: { status: string }) => {
    let color = '';
    switch (status) {
        case 'Review':
            color = 'border-blue-100 bg-blue-50  text-blue-500 hover:bg-blue-100 hover:text-blue-700';
            break;
        default:
            color = 'bg-gray-100 text-gray-700 border-gray-300';
    }
    return <div className={`w-fit cursor-pointer rounded-lg border px-3 py-1 text-xs font-semibold ${color}`}>{status}</div>;
};
