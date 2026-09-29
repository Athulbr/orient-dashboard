import { Loader } from 'lucide-react';
import { cn } from '../global-utils/twMerge';

interface SpinnerIF {
    className?: string;
    size?: number;
}

const Spinner: React.FC<SpinnerIF> = ({ className, size }) => {
    return <Loader role="img" size={size} className={cn('animate-spin', className)} />;
};

export default Spinner;
