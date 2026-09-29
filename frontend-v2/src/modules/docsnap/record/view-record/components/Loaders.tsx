import { FC } from 'react';
import Spinner from '../../../../../components/Spinner';

interface ProgressLoaderProps {
    progress: number;
    currentStep: string;
}

export const ProgressLoader: FC<ProgressLoaderProps> = ({ progress, currentStep }) => {
    return (
        <div className="flex h-full w-full items-center justify-center">
            <div className="flex flex-col items-center gap-1">
                <div className="relative">
                    <svg height={90} width={90} className="-rotate-90 transform">
                        {/* Background circle */}
                        <circle stroke="#e5e7eb" fill="transparent" strokeWidth={8} r={37} cx={45} cy={45} />
                        {/* Progress circle */}
                        <circle
                            stroke="#f59e0b"
                            fill="transparent"
                            strokeWidth={8}
                            strokeDasharray={`${37 * 2 * Math.PI} ${37 * 2 * Math.PI}`}
                            strokeDashoffset={37 * 2 * Math.PI - (progress / 100) * 37 * 2 * Math.PI}
                            strokeLinecap="round"
                            r={37}
                            cx={45}
                            cy={45}
                            className="transition-all duration-300 ease-in-out"
                        />
                    </svg>
                    {/* Percentage text in center */}
                    <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-lg font-semibold text-amber-500">{progress}%</span>
                    </div>
                </div>
                {/* Current step text */}
                <div className="text-center font-medium text-amber-500">{currentStep}</div>
            </div>
        </div>
    );
};

export const LoadingDataSpinner: FC<{ text?: string }> = ({ text = 'Loading Data...' }) => {
    return (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 bg-white">
            <Spinner /> {text}
        </div>
    );
};
