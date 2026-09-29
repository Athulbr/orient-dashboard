import { FC } from 'react';

interface ValidateSkuButtonIF {
    label?: string;
    value: string;
}
export const ValidateSkuButton: FC<ValidateSkuButtonIF> = ({ label, value }) => {
    const onClick = () => {
        if (label === 'sku_number') {
            const newWindow = window.open(`https://www.rehabmart.com/search/?q=${value} `, '_blank', 'noopener,noreferrer');
            if (newWindow) newWindow.opener = null;
        } else {
            const newWindow = window.open(`https://www.rehabmart.com/product/${value}.html `, '_blank', 'noopener,noreferrer');
            if (newWindow) newWindow.opener = null;
        }
    };
    if ((label !== 'sku_number' && label !== 'rehab_id') || !value) return null;
    return (
        <span onClick={onClick} className="cursor-pointer w-full flex justify-end pr-2 text-xs text-sky-600 hover:text-sky-800">
            Validate
        </span>
    );
};
