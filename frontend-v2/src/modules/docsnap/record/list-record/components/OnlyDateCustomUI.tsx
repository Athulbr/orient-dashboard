import { formatDate } from '../../../../../builders/tablebuilder/render-tablebuilder/utils/formatDate';
import { cn } from '../../../../../global-utils/twMerge';

export const OnlyDateCustomUI = (row: any) => {
    const date = formatDate(row?.data?.documentDate, true);
    return <div className={cn(date === '-' ? 'pl-14' : '')}>{date}</div>;
};
