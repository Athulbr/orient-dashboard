import { Loader } from 'lucide-react';
import { cn } from '../global-utils/twMerge';

interface FullScreenLoaderIF {
    className?: string;
    text?: string;
}

const FullScreenLoader: React.FC<FullScreenLoaderIF> = ({ className, text }) => {
    return (
        <div className={cn('flex h-full w-full items-center justify-center', className)}>
            <div className="flex flex-col items-center justify-center">
                <Loader role="img" size={26} className="ml-2 animate-spin" />
                <div className="pt-2 pl-4 text-sm">{text ? text : 'Loading...'}</div>
            </div>
        </div>
    );
};

export default FullScreenLoader;
