import { FC, useState } from 'react';

interface ImageTileProps {
    src: string;
    selected: boolean;
    onClick: () => void;
}

export const ImageTile: FC<ImageTileProps> = ({ src, selected, onClick }) => {
    const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading');

    if (status === 'error') return null;

    return (
        <div
            onClick={onClick}
            className={`relative cursor-pointer rounded-md border-2 p-1 transition-colors ${
                selected ? 'border-sky-500' : 'border-gray-200 hover:border-gray-400'
            }`}
        >
            <input
                type="checkbox"
                className="absolute right-2 top-2 z-10 h-4 w-4 cursor-pointer rounded accent-blue-600 shadow"
                checked={selected}
                onChange={onClick}
                onClick={e => e.stopPropagation()}
            />

            {status === 'loading' && (
                <div className="flex h-40 w-full animate-pulse items-center justify-center rounded bg-gray-100">
                    <span className="text-xs text-gray-400">Loading…</span>
                </div>
            )}

            <img
                src={src}
                alt=""
                loading="lazy"
                referrerPolicy="no-referrer"
                onLoad={() => setStatus('loaded')}
                onError={() => setStatus('error')}
                className={`block w-full object-contain transition-opacity ${
                    status === 'loaded' ? 'max-h-48 opacity-100' : 'h-0 opacity-0'
                }`}
            />
        </div>
    );
};
