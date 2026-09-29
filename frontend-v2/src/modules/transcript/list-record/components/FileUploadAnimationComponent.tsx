import { UploadCloud, FileText, FilePlus } from 'lucide-react';
import { FC, useState, useCallback, useEffect } from 'react';

interface FileUploadAnimationComponentProps {
    processing: boolean;
    uploading: boolean;
    analyzing: boolean;
    uploadDone: boolean;
    analyzeDone: boolean;
}

export const FileUploadAnimationComponent: FC<FileUploadAnimationComponentProps> = ({ processing, uploading, analyzing, uploadDone, analyzeDone }) => {
    const [progress, setProgress] = useState(0);
    const [isAnimating, setIsAnimating] = useState(false);

    // Smart progress calculation based on current state
    const updateProgress = useCallback(() => {
        setProgress(prev => {
            let targetProgress = 0;

            if (uploadDone && analyzeDone) {
                // Both tasks complete: 100%
                targetProgress = 100;
            } else if (uploadDone && analyzing) {
                // Upload done, analyzing: 50-90%
                targetProgress = 90;
            } else if (uploadDone && !analyzing) {
                // Upload done, analysis not started: 50%
                targetProgress = 95;
            } else if (uploading && !uploadDone) {
                // Upload in progress: 0-50%
                targetProgress = 90;
            } else if (analyzing && !analyzeDone) {
                // Analysis in progress: 50-90%
                targetProgress = 85;
            } else if (!processing) {
                // All complete or idle: 0% or 100%
                targetProgress = uploadDone && analyzeDone ? 100 : 0;
            }

            // Adaptive speed - slower as we approach target
            const remaining = targetProgress - prev;
            const increment = Math.max(0.5, Math.abs(remaining) * 0.12);

            if (prev < targetProgress) {
                return Math.min(prev + increment, targetProgress);
            } else if (prev > targetProgress) {
                return Math.max(prev - increment, targetProgress);
            }

            return prev;
        });
    }, [uploading, analyzing, processing, uploadDone, analyzeDone]);

    useEffect(() => {
        if (uploadDone && analyzeDone) {
            // All tasks complete - animate to 100%
            setIsAnimating(true);
            const timer = setTimeout(() => {
                setProgress(100);
                setIsAnimating(false);
            }, 200);
            return () => clearTimeout(timer);
        }

        if (!processing) {
            setProgress(0);
            return;
        }

        // Start fresh when processing begins
        if (progress === 0 && processing) {
            setProgress(5);
        }

        const interval = setInterval(updateProgress, 200);
        return () => clearInterval(interval);
    }, [processing, uploading, analyzing, uploadDone, analyzeDone, updateProgress, progress]);

    const getStatusMessage = () => {
        if (uploadDone && analyzeDone) {
            return 'Successfully added the document for extraction';
        }
        if (uploadDone && analyzing) {
            return 'Upload complete, Adding document for extraction';
        }
        if (uploading && !uploadDone) {
            return 'Uploading file...';
        }
    };

    const getCurrentIcon = () => {
        if (uploadDone && analyzeDone) {
            // All tasks completed state
            return (
                <div className="relative">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
                        <svg className="h-8 w-8 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                    </div>
                    <div className="absolute inset-0 animate-ping rounded-full border-2 border-emerald-200 opacity-20" />
                </div>
            );
        }

        if (analyzing && !analyzeDone) {
            return <FilePlus strokeWidth={1.5} size={64} className="text-purple-500 transition-colors duration-300" />;
        }

        if (uploading && !uploadDone) {
            return <UploadCloud strokeWidth={1.5} size={64} className="text-blue-500 transition-colors duration-300" />;
        }

        if (uploadDone && !analyzing) {
            return <FileText strokeWidth={1.5} size={64} className="text-emerald-500 transition-colors duration-300" />;
        }

        return <FileText strokeWidth={1.5} size={64} className="text-slate-400 transition-colors duration-300" />;
    };

    const getIconColor = () => {
        if (!processing && progress === 100) return 'text-emerald-500';
        if (analyzing) return 'text-purple-500';
        if (uploading) return 'text-blue-500';
        if (processing) return 'text-slate-600';
        return 'text-slate-400';
    };

    const getTextColor = () => {
        if (uploadDone && analyzeDone) return 'text-emerald-600';
        if (analyzing && !analyzeDone) return 'text-purple-600';
        if (uploading && !uploadDone) return 'text-blue-600';
        if (uploadDone && !analyzing) return 'text-emerald-600';
        if (processing) return 'text-slate-600';
        return 'text-slate-500';
    };

    const getBackgroundColors = () => {
        if (uploadDone && analyzeDone) return 'from-emerald-50 to-emerald-100';
        if (analyzing && !analyzeDone) return 'from-purple-50 to-purple-100';
        if (uploading && !uploadDone) return 'from-blue-50 to-blue-100';
        if (uploadDone && !analyzing) return 'from-emerald-50 to-emerald-100';
        if (processing) return 'from-slate-50 to-slate-100';
        return 'from-slate-100 to-slate-100';
    };

    const getProgressBarColor = () => {
        if (uploadDone && analyzeDone) return 'bg-emerald-400';
        if (analyzing && !analyzeDone) return 'bg-purple-400';
        if (uploading && !uploadDone) return 'bg-blue-400';
        if (uploadDone && !analyzing) return 'bg-emerald-400';
        return 'bg-slate-400';
    };

    return (
        <div className="relative flex h-full w-full flex-col items-center justify-center gap-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            {/* Subtle background progress indicator */}
            <div
                className={`absolute inset-0 bg-gradient-to-r transition-all duration-500 ease-out ${getBackgroundColors()}`}
                style={{
                    width: `${progress}%`,
                    opacity: uploadDone && analyzeDone ? 0.8 : 0.4
                }}
            />

            {/* Elegant progress bar */}
            <div className="absolute bottom-0 left-0 h-1 w-full bg-slate-100">
                <div
                    className={`h-full transition-all duration-300 ease-out ${getProgressBarColor()} ${isAnimating ? 'transition-all duration-500' : ''}`}
                    style={{ width: `${progress}%` }}
                />
            </div>

            {/* Content container */}
            <div className="relative z-10 flex flex-col items-center gap-4 px-8 py-6">
                {/* Icon with subtle animations */}
                <div
                    className={`transition-all duration-500 ${uploadDone && analyzeDone ? 'scale-110' : processing || uploading || analyzing ? 'animate-pulse' : ''}`}
                >
                    {getCurrentIcon()}
                </div>

                {/* Status text */}
                <div className="space-y-2 text-center">
                    <div className="flex items-center justify-center gap-3">
                        {(processing || uploading || analyzing) && progress < 100 && (
                            <div
                                className={`h-4 w-4 animate-spin rounded-full border-2 ${
                                    analyzing
                                        ? 'border-purple-200 border-t-purple-500'
                                        : uploading
                                          ? 'border-blue-200 border-t-blue-500'
                                          : 'border-slate-200 border-t-slate-500'
                                }`}
                            />
                        )}
                        <span className={`text-lg font-medium transition-colors duration-300 ${getTextColor()}`}>{getStatusMessage()}</span>
                    </div>

                    {/* Progress percentage */}
                    {(processing || uploading || analyzing || progress === 100) && (
                        <div className="flex items-center justify-center gap-2 text-sm">
                            <span
                                className={`font-mono font-semibold tabular-nums transition-colors duration-300 ${
                                    !processing && progress === 100
                                        ? 'text-emerald-600'
                                        : analyzing
                                          ? 'text-purple-600'
                                          : uploading
                                            ? 'text-blue-600'
                                            : 'text-slate-500'
                                }`}
                            >
                                {Math.round(progress)}%
                            </span>
                            {!processing && progress === 100 && <span className="animate-fade-in text-xs font-medium text-emerald-600">Complete</span>}
                        </div>
                    )}
                </div>

                {/* Task indicators */}
                {(processing || uploading || analyzing || progress === 100) && (
                    <div className="flex items-center gap-4 text-center">
                        <div
                            className={`flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium transition-all duration-300 ${
                                uploading ? 'bg-blue-100 text-blue-700' : progress === 100 ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                            }`}
                        >
                            <UploadCloud size={12} />
                            Uploading the file {uploading ? '...' : progress === 100 ? '✓' : ''}
                        </div>
                        <div
                            className={`flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium transition-all duration-300 ${
                                analyzing
                                    ? 'bg-purple-100 text-purple-700'
                                    : progress === 100
                                      ? 'bg-emerald-100 text-emerald-700'
                                      : 'bg-slate-100 text-slate-500'
                            }`}
                        >
                            <FilePlus size={12} />
                            Adding document for extraction {analyzing ? '...' : progress === 100 ? '✓' : ''}
                        </div>
                    </div>
                )}
            </div>

            {/* Custom animations */}
            <style>{`
        @keyframes fade-in {
          0% { opacity: 0; transform: translateY(4px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        
        .animate-fade-in {
          animation: fade-in 0.4s ease-out;
        }
      `}</style>
        </div>
    );
};
