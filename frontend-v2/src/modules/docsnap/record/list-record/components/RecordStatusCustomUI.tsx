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
            <div
                className="w-fit cursor-pointer rounded-lg border-blue-100 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-500 hover:bg-blue-100 hover:text-blue-700"
                data-tour-id={row?.isFirstExtracted ? 'review-button' : undefined}
            >
                Review
            </div>
        );
    }
    if (row?.data?.status === 'reviewed') {
        return (
            <div className="w-fit cursor-pointer rounded-lg border-blue-100 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-500 hover:bg-blue-100 hover:text-blue-700">
                Reviewed
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
    if (row?.data?.status === 'exception') {
        return (
            <div className="w-fit cursor-pointer rounded-lg border-red-100 bg-red-50 px-3 py-1 text-xs font-semibold text-red-500 hover:bg-red-100 hover:text-red-700">
                Exception
            </div>
        );
    }
    if (row?.data?.status === 'missing_tracking_id') {
        return (
            <div className="w-fit cursor-pointer rounded-lg border-red-100 bg-red-50 px-3 py-1 text-xs font-semibold text-red-500 hover:bg-red-100 hover:text-red-700">
                Missing Tracking ID
            </div>
        );
    }
    if (row?.data?.status === 'already_reported') {
        return (
            <div className="w-fit cursor-pointer rounded-lg border-green-100 bg-green-50 px-3 py-1 text-xs font-semibold text-green-500 hover:bg-green-100 hover:text-green-700">
                Already Reported
            </div>
        );
    }
    if (row?.data?.status === 'carriers not found') {
        return (
            <div className="w-fit cursor-pointer rounded-lg border-red-100 bg-red-50 px-3 py-1 text-xs font-semibold text-red-500 hover:bg-red-100 hover:text-red-700">
                Carriers Not Found
            </div>
        );
    }
    if (row?.data?.status === 'missing_order_id') {
        return (
            <div className="w-fit cursor-pointer rounded-lg border-red-100 bg-red-50 px-3 py-1 text-xs font-semibold text-red-500 hover:bg-red-100 hover:text-red-700">
                Missing Order ID
            </div>
        );
    }
    if (row?.data?.status === 'invalid_id') {
        return (
            <div className="w-fit cursor-pointer rounded-lg border-red-100 bg-red-50 px-3 py-1 text-xs font-semibold text-red-500 hover:bg-red-100 hover:text-red-700">
                Invalid Order ID
            </div>
        );
    }
    if (row?.data?.status === 'id_not_found') {
        return (
            <div className="w-fit cursor-pointer rounded-lg border-red-100 bg-red-50 px-3 py-1 text-xs font-semibold text-red-500 hover:bg-red-100 hover:text-red-700">
                Order ID not found
            </div>
        );
    }
    if (row?.data?.status === 'PO_NOT_FOUND') {
        return (
            <div className="w-fit cursor-pointer rounded-lg border-red-100 bg-red-50 px-3 py-1 text-xs font-semibold text-red-500 hover:bg-red-100 hover:text-red-700">
                PO Not Found
            </div>
        );
    }
    if (row?.data?.status === 'PO_NOT_CREATED_IN_TALLY') {
        return (
            <div className="w-fit cursor-pointer rounded-lg border-red-100 bg-red-50 px-3 py-1 text-xs font-semibold text-red-500 hover:bg-red-100 hover:text-red-700">
                PO Not Created in Tally
            </div>
        );
    }
    if (row?.data?.status === 'DATE_NOT_IN_RANGE') {
        return (
            <div className="w-fit cursor-pointer rounded-lg border-red-100 bg-red-50 px-3 py-1 text-xs font-semibold text-red-500 hover:bg-red-100 hover:text-red-700">
                Date Not in Range
            </div>
        );
    }
    if (row?.data?.status === 'PO_LIMIT_EXCEEDED') {
        return (
            <div className="w-fit cursor-pointer rounded-lg border-red-100 bg-red-50 px-3 py-1 text-xs font-semibold text-red-500 hover:bg-red-100 hover:text-red-700">
                PO Limit Exceeded
            </div>
        );
    }
    if (row?.data?.status === 'PO_FULLY_CONSUMED') {
        return (
            <div className="w-fit cursor-pointer rounded-lg border-green-100 bg-green-50 px-3 py-1 text-xs font-semibold text-green-500 hover:bg-green-100 hover:text-green-700">
                PO Fully Consumed
            </div>
        );
    }
    if (row?.data?.status === 'PO_PARTIALLY_CONSUMED') {
        return (
            <div className="w-fit cursor-pointer rounded-lg border-amber-100 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-500 hover:bg-amber-100 hover:text-amber-700">
                PO Partially Consumed
            </div>
        );
    }
    if (row?.data?.status === 'PO_QUANTITY_EXCEED') {
        return (
            <div className="w-fit cursor-pointer rounded-lg border-red-100 bg-red-50 px-3 py-1 text-xs font-semibold text-red-500 hover:bg-red-100 hover:text-red-700">
                PO Quantity Exceeded
            </div>
        );
    }

    return <div className="pl-5">-</div>;
};
