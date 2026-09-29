import React, { useRef, useEffect, useState } from 'react';
import styles from './signature.module.css';
import { Button } from '../../components/button';

interface Point {
    x: number;
    y: number;
}

interface SignaturePadProps {
    value: string | null;
    width?: number;
    height?: number;
    onChange: (value: string) => void;
    onBlur: () => void;
    onClose: () => void;
}

export const SignaturePad: React.FC<SignaturePadProps> = ({ value, onChange, width = 400, height = 200, onBlur, onClose }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [lastPoint, setLastPoint] = useState<Point | null>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Set canvas size
        canvas.width = width;
        canvas.height = height;

        // Set initial styles
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, width, height);
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // Load existing signature if available
        if (value) {
            const img = new Image();
            img.onload = () => {
                ctx.drawImage(img, 0, 0);
            };
            img.src = value;
        }
    }, [width, height, value]);

    const getPointFromEvent = (e: MouseEvent | TouchEvent): Point | null => {
        const canvas = canvasRef.current;
        if (!canvas) return null;

        const rect = canvas.getBoundingClientRect();
        const x = ('touches' in e ? e.touches[0].clientX : e.clientX) - rect.left;
        const y = ('touches' in e ? e.touches[0].clientY : e.clientY) - rect.top;
        return { x, y };
    };

    const draw = (point: Point) => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!ctx || !lastPoint) return;

        ctx.beginPath();
        ctx.moveTo(lastPoint.x, lastPoint.y);
        ctx.lineTo(point.x, point.y);
        ctx.stroke();
    };

    const handleStart = (e: React.MouseEvent | React.TouchEvent) => {
        e.preventDefault();
        const point = getPointFromEvent(e.nativeEvent);
        if (!point) return;

        setIsDrawing(true);
        setLastPoint(point);
    };

    const handleMove = (e: React.MouseEvent | React.TouchEvent) => {
        e.preventDefault();
        if (!isDrawing) return;

        const point = getPointFromEvent(e.nativeEvent);
        if (!point) return;

        draw(point);
        setLastPoint(point);
    };

    const handleEnd = () => {
        setIsDrawing(false);
        const canvas = canvasRef.current;
        if (!canvas) return;

        // Save the signature as a data URL
        const dataUrl = canvas.toDataURL('image/png');
        onChange(dataUrl);
    };

    const handleClear = () => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!ctx) return;

        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, width, height);
        onChange('');
    };

    const handleLeave = () => {
        handleEnd();
        onBlur();
    };

    return (
        <div className={styles.signaturePadContainer}>
            <canvas
                ref={canvasRef}
                className={styles.signatureCanvas}
                onMouseDown={handleStart}
                onMouseMove={handleMove}
                onMouseUp={handleEnd}
                onMouseLeave={handleLeave}
                onTouchStart={handleStart}
                onTouchMove={handleMove}
                onTouchEnd={handleEnd}
            />
            <div className={styles.buttonBox}>
                <Button variant="secondary" label="Clear Signature" type="button" onClick={handleClear} />
                <Button variant="primary" label="Done" type="button" onClick={onClose} />
            </div>
        </div>
    );
};
