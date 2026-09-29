import { useViewRecordState } from '../hooks/viewRecordContext';
import { RefObject, useMemo } from 'react';

interface WireConfig {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
}

interface AnnotationLineProps {
    bboxRef: any;
}

const WIRE_COLOR = 'rgb(13 109 214)';
const HORIZONTAL_OFFSET = 50;
const ARRAY_FIELD_BBOX_KEY = 1234;

export const AnnotationLine = ({ bboxRef }: AnnotationLineProps) => {
    const { state } = useViewRecordState();
    const { wire, tabIndex, loadingS3File, bbox, hoveredFieldId, hoveredOnArrayField } = state;

    // Early return conditions
    const shouldRender = useMemo(() => {
        return !!(wire && tabIndex === 0 && !loadingS3File && bbox !== null && bboxRef?.current && hoveredFieldId && wire.x1 && wire.y1 && wire.x2 && wire.y2);
    }, [wire, tabIndex, loadingS3File, bbox, bboxRef, hoveredFieldId]);

    const wireConfig = useMemo((): WireConfig | null => {
        if (!shouldRender || !wire) return null;

        let config: WireConfig = {
            x1: wire.x1,
            y1: wire.y1,
            x2: wire.x2,
            y2: wire.y2
        };

        // Handle array field hover state
        if (hoveredOnArrayField && bboxRef.current) {
            const box = bboxRef.current[ARRAY_FIELD_BBOX_KEY]?.getBoundingClientRect();
            if (box) {
                config.x1 = box.left + box.width / 2;
                config.y1 = box.top + box.height;
            }
        }

        return config;
    }, [shouldRender, wire, hoveredOnArrayField, bboxRef]);

    const pathData = useMemo(() => {
        if (!wireConfig) return '';

        const startHorizontalX = wireConfig.x1 + (hoveredOnArrayField ? 0 : HORIZONTAL_OFFSET);
        const startHorizontalY = wireConfig.y1;
        const endHorizontalX = wireConfig.x2 - (hoveredOnArrayField ? 0 : HORIZONTAL_OFFSET);
        const endHorizontalY = wireConfig.y2;

        return `M ${wireConfig.x1} ${wireConfig.y1} L ${startHorizontalX} ${startHorizontalY} L ${endHorizontalX} ${endHorizontalY} L ${wireConfig.x2} ${wireConfig.y2}`;
    }, [wireConfig, hoveredOnArrayField]);

    if (!shouldRender || !wireConfig) {
        return null;
    }

    return (
        <svg className="pointer-events-none absolute top-0 left-0 z-10 h-full w-full" role="img" aria-label="Annotation connection line">
            <path d={pathData} stroke={WIRE_COLOR} strokeWidth={2} fill="none" />
            <circle cx={wireConfig.x1} cy={wireConfig.y1} r={2.5} fill={WIRE_COLOR} />
            <circle cx={wireConfig.x2} cy={wireConfig.y2} r={3} fill={WIRE_COLOR} />
        </svg>
    );
};
