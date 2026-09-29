import { ReactNode } from 'react';
import { cn } from '../global-utils/twMerge';

interface PageContainerIF {
    className?: string;
    children?: ReactNode;
}

const PageContainer: React.FC<PageContainerIF> = ({ className = '', children }) => {
    return <div className={cn('flex flex-1 flex-col overflow-y-auto', className)}>{children}</div>;
};

export default PageContainer;
