import { useRef, useState } from 'react';
import { ViewRecordStateProvider } from './hooks/viewRecordContext';
import { TabViewContainer } from './components/TabViewContainer';
import ExtractedDataComponent from './ExtractedDataComponent';
import { RenderArrayFields } from './render-field-components/RenderArrayFields';
import { ResizableContainer } from '../../template/update-template/components/ResizableContainer';
import { PreviewComponent } from './PreviewComponent';
import { useBackButtonOverride } from '../../../../hooks/useBackButtonOverride';
import RegenerateFieldDialog from './components/RegenerateFieldDialog';
import ContentCreationComponent from './components/ContentCreationComponent';
import { InvoiceGenerator } from './components/InvoiceGenerator';
import ChatWithDocumentComponent from './ChatWithDocumentComponent';
import { SelectVariationImagesDialog } from './components/SelectVariationImagesDialog';
import { SelectPrimaryImageDialog } from './components/SelectPrimaryImageDialog';
import { SelectAdditionalImagesDialog } from './components/SelectAdditionalImagesDialog';

interface WirePoints {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
}
interface BboxIF {
    x_min: number;
    y_min: number;
    x_max: number;
    y_max: number;
}

export interface Message {
    text: string;
    source?: string[];
    userMessage: boolean;
}
export interface ViewRecordStateIF {
    showCreateDialog: boolean;
    loadingData: boolean;
    loadingS3File: boolean;
    tabIndex: number;
    id: string;
    extractedData: Record<string, any>;
    objectFields: Record<string, Record<string, any>>;
    arrayFields: Array<
        Record<
            string,
            Record<
                string,
                {
                    value: string;
                    page?: number;
                    bbox?: { x_min: number; y_min: number; x_max: number; y_max: number };
                    confidence?: number;
                    [key: string]: any;
                }
            >
        >
    >;
    tableNames: Array<string>;
    wire: WirePoints | null;
    bbox: BboxIF | null;
    hoveredFieldId: string | null;
    pageNumber: number;
    images: any[];
    record: any;
    messages: Message[];
    module: string;
    chatLoading: boolean;
    tableViewDialog: boolean;
    scrollToViewField: number;
    selectedTableName: string;
    hoveredOnArrayField: boolean;
    reExtracting: boolean;
    leftWidthPercent: number;
    invoiceContent: string;
    generatingInvoice: boolean;
    requestNewFieldDialog: boolean;
    dataEntryWebImages: string[];
    selectedDataEntryImages: string[];
    showRegenerateFieldDialog: any | null;
    blogContent: string;
    templateSettings: any;
    templateFields: any;
    primaryImage: { path: string; caption: string } | null;
    variationImages: Record<string, any>[];
    showSelectVariationImagesDialog: { index: number; key: string } | null;
    showSelectPrimaryImageDialog: boolean;
    additionalImages: { path: string; caption: string }[];
    showSelectAdditionalImagesDialog: boolean;
    inputText: string;
}
const initialState = {
    showCreateDialog: false,
    loadingData: false,
    loadingS3File: false,
    tabIndex: 0,
    id: '',
    extractedData: {},
    objectFields: {},
    arrayFields: [],
    tableNames: [],
    wire: null,
    bbox: null,
    hoveredFieldId: null,
    pageNumber: 1,
    images: [],
    record: null,
    messages: [],
    module: '',
    chatLoading: false,
    tableViewDialog: false,
    leftWidthPercent: 75,
    scrollToViewField: 1,
    selectedTableName: '',
    hoveredOnArrayField: false,
    reExtracting: false,
    invoiceContent: '',
    generatingInvoice: false,
    requestNewFieldDialog: false,
    showRegenerateFieldDialog: null,
    blogContent: '',
    templateSettings: null,
    templateFields: null,
    dataEntryWebImages: [],
    selectedDataEntryImages: [],
    showSelectPrimaryImageDialog: false,
    primaryImage: null,
    variationImages: [],
    showSelectVariationImagesDialog: null,
    additionalImages: [],
    showSelectAdditionalImagesDialog: false,
    inputText: ''
};

const ViewRecordPage: React.FC = () => {
    const [state, setState] = useState<ViewRecordStateIF>(initialState);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const fieldRefs = useRef<Record<string, HTMLDivElement | null>>({});
    useBackButtonOverride('/docsnap/record/list');
    const module = sessionStorage.getItem('module');

    const initialLeftWidthPercent = module === 'data-entry' || module === 'ppe-detection' ? 60 : 70;

    return (
        <ViewRecordStateProvider value={{ state, setState }}>
            <div className={`absolute top-0 left-0 flex h-[100vh] w-[100vw] gap-2 bg-white ${state.selectedTableName ? 'pb-[40vh]' : 'pb-0'}`} ref={containerRef}>
                <ResizableContainer
                    left={
                        <div className="flex h-[100vh] flex-1 flex-col overflow-hidden">
                            <PreviewComponent fieldRefs={fieldRefs} containerRef={containerRef} />
                        </div>
                    }
                    right={
                        <div className="flex h-[100vh] flex-1 flex-col overflow-hidden">
                            {state.record?.error?.message ? (
                                <div className="flex h-full gap-4 flex-col items-center justify-center">
                                    {/* <Button small outlined>
                                        Retry Extraction
                                    </Button> */}
                                    <h1 className="text-2xl font-bold">Extraction Failed</h1>
                                    <p className="mt-2 text-red-500 text-xs max-h-[80vh] overflow-y-auto p-4">{state.record?.error?.message}</p>
                                </div>
                            ) : (
                                <TabViewContainer
                                    tabContents={{
                                        extractedData: <ExtractedDataComponent containerRef={containerRef} fieldRefs={fieldRefs} />,
                                        chatWithDocument: <ChatWithDocumentComponent />,
                                        invoiceGenerator: <InvoiceGenerator />,
                                        contentCreation: <ContentCreationComponent />
                                    }}
                                />
                            )}
                        </div>
                    }
                    initialLeftWidthPercent={initialLeftWidthPercent}
                    minLeftWidthPercent={30}
                    maxLeftWidthPercent={80}
                    onResize={(leftWidthPercent: number) => setState(prev => ({ ...prev, leftWidthPercent }))}
                />
                {state.selectedTableName && (
                    <div className="absolute bottom-0 left-0 z-1 flex h-[40vh] w-full flex-col overflow-hidden border-t border-blue-200 bg-gray-50 p-2">
                        <RenderArrayFields refs={{ fieldRefs, isScrollingRef: 0, containerRef }} updateWire={() => {}} />
                    </div>
                )}
                {state.showSelectPrimaryImageDialog && <SelectPrimaryImageDialog />}
                {Boolean(state.showSelectVariationImagesDialog) && <SelectVariationImagesDialog />}
                {state.showSelectAdditionalImagesDialog && <SelectAdditionalImagesDialog />}
            </div>
            {Boolean(state.showRegenerateFieldDialog) && <RegenerateFieldDialog />}
        </ViewRecordStateProvider>
    );
};

export default ViewRecordPage;
