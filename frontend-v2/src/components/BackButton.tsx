import { ArrowLeft } from 'lucide-react';
import Tooltip from './Tooltip';
import { cn } from '../global-utils/twMerge';
import { useNavigate, useLocation } from 'react-router-dom';

interface BackButtonIF {
    onClick?: () => void;
    tooltipText?: string;
    className?: string;
}

const BackButton: React.FC<BackButtonIF> = ({ onClick, tooltipText = 'Go back', className }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const isOrient = location.state?.orient;

    const onClickHandler = () => {
        if (isOrient) {
            navigate('/agent/run/69ce4d5d95ebad5341099ad1');
            return;
        }
        if (onClick) return onClick();
        if (location.state?.from) {
            // Convert absolute URL into relative pathname + search
            try {
                const prevUrl = new URL(location.state.from);
                navigate(prevUrl.pathname + prevUrl.search);
            } catch {
                // fallback if state.from is not a valid URL
                navigate(-1);
            }
        } else {
            navigate(-1);
        }
    };
    const handleKeyDown = (event: React.KeyboardEvent) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onClickHandler();
        }
    };

    return (
        <Tooltip text={tooltipText} position="bottom">
            <span
                role="button"
                tabIndex={0}
                onClick={onClickHandler}
                onKeyDown={handleKeyDown}
                className={cn(
                    'flex h-8 w-10 cursor-pointer items-center justify-center rounded-lg bg-gray-50 hover:bg-gray-200 focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 focus:outline-none',
                    className
                )}
            >
                <ArrowLeft role="img" size={20} />
            </span>
        </Tooltip>
    );
};

export default BackButton;
