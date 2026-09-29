import React from 'react';
import { CHANNEL_META } from '../derive';
import type { ChannelKey } from '../types';
import { cx } from '../../utils/cx';

const CHANNELS: ChannelKey[] = ['bank', 'qr', 'gateway'];

interface ChannelToggleProps {
    value: ChannelKey;
    onChange: (ch: ChannelKey) => void;
}

const ChannelToggle: React.FC<ChannelToggleProps> = ({ value, onChange }) => (
    <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5">
        {CHANNELS.map(ch => (
            <button
                key={ch}
                onClick={() => onChange(ch)}
                className={cx(
                    'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                    value === ch ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                )}
            >
                <span className={cx('h-1.5 w-1.5 rounded-full', CHANNEL_META[ch].dot)} />
                {CHANNEL_META[ch].label}
            </button>
        ))}
    </div>
);

export default ChannelToggle;
