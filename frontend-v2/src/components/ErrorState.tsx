import React from 'react';
import { AlertCircle, Home, RefreshCcw } from 'lucide-react';
import { cn } from '../global-utils/twMerge';
import { useNavigate } from 'react-router-dom';

interface ErrorStateProps {
    className?: string;
    title?: string;
    message?: string;
    onRetry?: () => void;
    showHomeButton?: boolean;
}

const ErrorState: React.FC<ErrorStateProps> = ({
    className,
    title = 'Something went wrong',
    message = "We're sorry, but we encountered an unexpected error while trying to load this page. Please try again or go back home.",
    onRetry,
    showHomeButton = true
}) => {
    const navigate = useNavigate();

    return (
        <div className={cn("fixed inset-0 z-50 flex flex-col items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 p-6", className)}>
            <div className="max-w-lg w-full bg-white/80 backdrop-blur-md rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white p-10 text-center transform transition-all duration-500 hover:shadow-[0_8px_40px_rgb(0,0,0,0.08)]">
                <div className="relative w-24 h-24 mx-auto mb-8 group">
                    <div className="absolute inset-0 bg-red-100 rounded-full animate-ping opacity-75"></div>
                    <div className="relative w-full h-full bg-red-50 rounded-full flex items-center justify-center border-4 border-white shadow-sm transition-transform duration-300 group-hover:scale-110">
                        <AlertCircle className="w-12 h-12 text-red-500" />
                    </div>
                </div>
                
                <h1 className="text-3xl font-extrabold text-gray-900 mb-4 tracking-tight">
                    {title}
                </h1>
                
                <p className="text-base text-gray-500 mb-10 leading-relaxed max-w-sm mx-auto">
                    {message}
                </p>
                
                <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
                    {onRetry && (
                        <button
                            onClick={onRetry}
                            className="flex items-center justify-center gap-2 px-8 py-3 bg-gray-900 text-white rounded-xl hover:bg-gray-800 transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5 font-semibold w-full sm:w-auto"
                        >
                            <RefreshCcw className="w-5 h-5" />
                            Try Again
                        </button>
                    )}
                    {showHomeButton && (
                        <button
                            onClick={() => navigate('/')}
                            className="flex items-center justify-center gap-2 px-8 py-3 bg-white text-gray-700 border border-gray-200 rounded-xl hover:bg-gray-50 transition-all duration-300 hover:shadow-md hover:-translate-y-0.5 font-semibold w-full sm:w-auto"
                        >
                            <Home className="w-5 h-5 text-gray-500" />
                            Go Home
                        </button>
                    )}
                </div>
            </div>
            
            <div className="mt-12 text-sm text-gray-400 font-medium">
                Error Code: 500 • <span className="underline decoration-gray-300 underline-offset-4 cursor-pointer hover:text-gray-600 transition-colors">Contact Support</span>
            </div>
        </div>
    );
};

export default ErrorState;
