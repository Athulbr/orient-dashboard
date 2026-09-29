import React from 'react';
interface MSIconIF {
    width?: number;
    height?: number;
    fill?: string;
}
const MSIcon: React.FC<MSIconIF> = ({ width = 18, height = 18 }) => {
    return (
        <svg width={width} height={height} viewBox="0 0 17 17" fill="none" xmlns="http://www.w3.org/2000/svg">
            <g clipPath="url(#clip0_162493_55693)">
                <path d="M8.10413 8.14172H0.5V0.537598H8.10413V8.14172Z" fill="#F1511B" />
                <path d="M16.5001 8.14172H8.896V0.537598H16.5001V8.14172Z" fill="#80CC28" />
                <path d="M8.10394 16.5377H0.5V8.93359H8.10394V16.5377Z" fill="#00ADEF" />
                <path d="M16.5001 16.5377H8.896V8.93359H16.5001V16.5377Z" fill="#FBBC09" />
            </g>
            <defs>
                <clipPath id="clip0_162493_55693">
                    <rect width="16" height="16" fill="white" transform="translate(0.5 0.537598)" />
                </clipPath>
            </defs>
        </svg>
    );
};

export default MSIcon;
