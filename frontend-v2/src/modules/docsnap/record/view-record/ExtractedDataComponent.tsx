import { FC, useEffect, useRef } from 'react';
import { useViewRecordState } from './hooks/viewRecordContext';
import { RenderObjectFields } from './render-field-components/RenderObjectFields';
import { LoadingDataSpinner } from './components/Loaders';
import ExtractedDataFooter from './components/ExtractedDataFooter';
import { ExportButton } from './components/ExportButton';
import { TableNames } from './render-field-components/TableNames';
import RequestNewField from './components/RequestNewField';
import { DataEntryImages } from './render-field-components/DataEntryImages';

interface ExtractedDataComponentProps {
    containerRef: any;
    fieldRefs: any;
}

const ExtractedDataComponent: FC<ExtractedDataComponentProps> = ({ containerRef, fieldRefs }) => {
    const { state, setState } = useViewRecordState();

    const extractedDataContainerRef = useRef<HTMLDivElement | null>(null);
    const scrollTimerRef = useRef<NodeJS.Timeout | null>(null);
    const hoverTimerRef = useRef<NodeJS.Timeout | null>(null);
    const isScrollingRef = useRef<boolean>(false);

    const updateWire = (fieldId: string, bbox: any) => {
        if (!fieldId || !bbox) return;
        const fieldEl = fieldRefs.current[fieldId];
        const containerBox = containerRef.current?.getBoundingClientRect();
        if (!fieldEl || !containerBox) return;

        const fieldBox = fieldEl.getBoundingClientRect();
        let x2 = fieldBox.left - containerBox.left;
        let y2 = fieldBox.top + fieldBox.height / 2 - containerBox.top;

        if (state.hoveredOnArrayField) {
            x2 = fieldBox.left - containerBox.left + fieldBox.width / 2;
            y2 = fieldBox.top;
        }

        setState(prev => ({
            ...prev,
            bbox,
            wire: {
                x1: prev?.wire?.x1 || 0,
                y1: prev?.wire?.y1 || 0,
                x2,
                y2
            }
        }));
    };

    const scrollToView = (fieldId: string) => {
        const fieldEl = fieldRefs.current[fieldId];
        if (!fieldEl) return;

        fieldEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };

    useEffect(() => {
        if (state.hoveredFieldId !== null) updateWire(state.hoveredFieldId, state.bbox);
    }, [state.leftWidthPercent]);

    useEffect(() => {
        const handleScroll = () => {
            if (state.hoveredFieldId !== null) updateWire(state.hoveredFieldId, state.bbox);

            if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);

            isScrollingRef.current = true;
            scrollTimerRef.current = setTimeout(() => {
                isScrollingRef.current = false;
            }, 100);
        };
        const container = containerRef.current;
        container?.addEventListener('scroll', handleScroll);
        window.addEventListener('scroll', handleScroll, true);
        return () => {
            container?.removeEventListener('scroll', handleScroll);
            window.removeEventListener('scroll', handleScroll, true);
            if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
            if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
        };
    }, [state.hoveredFieldId]);

    useEffect(() => {
        if (state.hoveredFieldId && state.scrollToViewField > 1) {
            scrollToView(state.hoveredFieldId);
        }
    }, [state.scrollToViewField]);

    useEffect(() => {
        if (state.selectedTableName && extractedDataContainerRef.current) {
            extractedDataContainerRef.current.scrollTo({
                top: extractedDataContainerRef.current.scrollHeight,
                behavior: 'smooth'
            });
        }
    }, [state.selectedTableName]);

    if (!state.record) return <LoadingDataSpinner />;
    if (state.record?.status === 'processing') return <LoadingDataSpinner text="Processing..." />;
    if (state.loadingData) return <LoadingDataSpinner />;

    return (
        <div className="flex h-full flex-col overflow-hidden">
            <div className="z-20 flex justify-end gap-2 border-b p-2">
                <RequestNewField />
                <ExportButton />
            </div>
            <div ref={extractedDataContainerRef} className="flex flex-1 flex-col gap-4 overflow-y-auto px-3 pt-3 pb-50">
                <RenderObjectFields refs={{ fieldRefs, isScrollingRef }} updateWire={updateWire} />
                <DataEntryImages />
                <TableNames />
            </div>
            <ExtractedDataFooter />
        </div>
    );
};

export default ExtractedDataComponent;
