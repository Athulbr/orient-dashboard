import { useNavigate, useLocation } from 'react-router-dom';
import BackButton from './BackButton';
import { ReactElement } from 'react';
import { cn } from '../global-utils/twMerge';

interface PageNameComponentIF {
    showBackButton?: boolean;
    name: string;
    customGoBackFunction?: () => void;
    children?: ReactElement;
    className?: string;
}

const PageNameComponent: React.FC<PageNameComponentIF> = ({ showBackButton, name, customGoBackFunction, children, className }) => {
    return (
        <div className={cn('flex justify-between pb-1 gap-2', className)}>
            <div className="flex items-center gap-2 text-xl text-nowrap">
                {showBackButton && <BackButton onClick={customGoBackFunction} />} {name}
            </div>
            {children}
        </div>
    );
};

export default PageNameComponent;
