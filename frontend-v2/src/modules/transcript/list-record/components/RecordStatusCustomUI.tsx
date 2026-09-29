export const RecordStatusCustomUI = (row: any) => {
    if (row?.data?.status === 'processing') {
        return (
            <div className="w-fit cursor-pointer rounded-lg border-amber-100 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-500 hover:bg-amber-100 hover:text-amber-700">
                Processing
            </div>
        );
    }
    if (row?.data?.status === 'extracted') {
        return (
            <div className="w-fit cursor-pointer rounded-lg border-blue-100 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-500 hover:bg-blue-100 hover:text-blue-700">
                Review
            </div>
        );
    }
    if (row?.data?.status === 'submitted') {
        return (
            <div className="w-fit cursor-pointer rounded-lg border-green-100 bg-green-50 px-3 py-1 text-xs font-semibold text-green-500 hover:bg-green-100 hover:text-green-700">
                Submitted
            </div>
        );
    }
    if (row?.data?.status === 'failed') {
        return (
            <div className="w-fit cursor-pointer rounded-lg border-red-100 bg-red-50 px-3 py-1 text-xs font-semibold text-red-500 hover:bg-red-100 hover:text-red-700">
                Failed
            </div>
        );
    }
    if (row?.data?.status === 'invalid') {
        return (
            <div className="w-fit cursor-pointer rounded-lg border-red-100 bg-red-50 px-3 py-1 text-xs font-semibold text-red-500 hover:bg-red-100 hover:text-red-700">
                Invalid
            </div>
        );
    }

    return <div className="pl-5">-</div>;
};
