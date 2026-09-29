import React, { useState, useRef, useEffect } from 'react';

interface ImageMagnifierProps {
    src: string;
    alt?: string;
    className?: string;
    magnifierWidth?: number;
    magnifierHeight?: number;
    zoomLevel?: number;
    children?: React.ReactNode;
}

export const ImageMagnifier: React.FC<ImageMagnifierProps> = ({
    src,
    alt = 'Image',
    className = '',
    magnifierWidth = 350,
    magnifierHeight = 200,
    zoomLevel = 2,
    children
}) => {
    const [showMagnifier, setShowMagnifier] = useState(false);
    const [magnifierPosition, setMagnifierPosition] = useState({ x: 0, y: 0 });
    const [imgSize, setImgSize] = useState({ width: 0, height: 0 });
    const imgRef = useRef<HTMLImageElement>(null);

    useEffect(() => {
        if (imgRef.current) {
            const updateSize = () => {
                if (imgRef.current) {
                    setImgSize({
                        width: imgRef.current.offsetWidth,
                        height: imgRef.current.offsetHeight
                    });
                }
            };

            updateSize();
            window.addEventListener('resize', updateSize);
            return () => window.removeEventListener('resize', updateSize);
        }
    }, [src]);

    const handleMouseEnter = () => {
        setShowMagnifier(true);
    };

    const handleMouseLeave = () => {
        setShowMagnifier(false);
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!imgRef.current) return;

        const rect = imgRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        // Calculate magnifier position (offset to avoid covering cursor)
        const magnifierX = e.clientX - 160;
        const magnifierY = e.clientY - magnifierHeight / 2;

        setMagnifierPosition({ x: magnifierX, y: magnifierY });
    };

    const getMagnifierStyle = () => {
        if (!imgRef.current || !showMagnifier) return {};

        const rect = imgRef.current.getBoundingClientRect();
        const x = magnifierPosition.x - rect.left + 160; // Adjust for offset
        const y = magnifierPosition.y - rect.top + magnifierHeight / 2;

        // Calculate background position for magnification
        const backgroundX = -x * zoomLevel + magnifierWidth / 2;
        const backgroundY = -y * zoomLevel + magnifierHeight / 2;

        return {
            position: 'fixed' as const,
            left: `${magnifierPosition.x}px`,
            top: `${magnifierPosition.y}px`,
            width: `${magnifierWidth}px`,
            height: `${magnifierHeight}px`,
            border: '3px solid #fff',
            borderRadius: '10px',
            backgroundImage: `url(${src})`,
            backgroundSize: `${imgSize.width * zoomLevel}px ${imgSize.height * zoomLevel}px`,
            backgroundPosition: `${backgroundX - 20}px ${backgroundY}px`,
            backgroundRepeat: 'no-repeat',
            boxShadow: '0 4px 8px rgba(0,0,0,0.3)',
            pointerEvents: 'none' as const,
            zIndex: 9,
            transition: 'opacity 0.2s ease-in-out'
        };
    };

    return (
        <>
            <img
                ref={imgRef}
                src={src}
                alt={alt}
                className="h-full w-full rounded-lg object-contain transition-discrete"
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
                onMouseMove={handleMouseMove}
                onLoad={() => {
                    if (imgRef.current) {
                        setImgSize({
                            width: imgRef.current.offsetWidth,
                            height: imgRef.current.offsetHeight
                        });
                    }
                }}
            />

            {children}

            {showMagnifier && !(magnifierPosition.x === 0 && magnifierPosition.y === 0) && <div style={getMagnifierStyle()} />}
        </>
    );
};
