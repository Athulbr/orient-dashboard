import PageContainer from '../../../../components/PageContainer';
import PageNameComponent from '../../../../components/PageName';
import { useState } from 'react';
import { ListRecordPageStateProvider } from './hooks/listRecordPageContext';
import { ListRecordComponent } from './ListRecordComponent';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Breadcrumbs from '../../../../components/Breadcrumbs';
import { Button } from '../../../../components/Button';
import { DialogComponent } from '../../../../components/DialogComponent';
import { usePermissionStore } from '../../../../zustand-store/PermissionStore';
import ExcelExportDialogNew from './components/ExcelExportDialogNew';
import ExcelExportBuilder, { ExcelSheetConfig } from './components/ExcelExportBuilder';
import { ListRecordCustomTable } from './ListRecordCustomTable';
import { PromptFieldIF } from '../../prompt-tuning/interface';
import { useRecordListTour } from '../../../inApp-Tour/hooks/useRecordListTour';
import { ListRecordTabs, TabOption } from './components/ListRecordTabs';
import { ListPoCustomTable } from './ListPoCustomTable';
import { ListSoCustomTable } from './ListSoCustomTable';
import { ListSalesInvoiceCustomTable } from './ListSalesInvoiceCustomTable';
interface Project {
    _id: string;
    name: string;
}
interface Document {
    _id: string;
    name: string;
    fields: PromptFieldIF[];
    docType: string;
    primaryModel: string;
    enableOcr: boolean;
}

export interface ListRecordPageStateIF {
    refresh: number;
    fileUploadDialog: boolean;
    loadingProjects: boolean;
    loadingDocuments: boolean;
    projects: Project[];
    projectId: string;
    documents: Document[];
    document: Document | null;
    processing: boolean;
    uploading: boolean;
    analyzing: boolean;
    uploadDone: boolean;
    analyzeDone: boolean;
    dealerSelectionDialog: boolean;
    assignDialog: boolean;
    query: any;
    selectedIds: string[];
    loadingRecords: boolean;
    records: any[];
    showExcelExportDialog: boolean;
    assigningRecords: boolean;
}

const initialState = {
    refresh: 1,
    loadingProjects: false,
    loadingDocuments: false,
    projects: [],
    projectId: '',
    documents: [],
    document: null,
    fileUploadDialog: false,
    processing: false,
    uploading: false,
    analyzing: false,
    uploadDone: false,
    analyzeDone: false,
    dealerSelectionDialog: false,
    assignDialog: false,
    query: {},
    selectedIds: [],
    loadingRecords: false,
    records: [],
    showExcelExportDialog: false,
    assigningRecords: false
};

const ListRecordPage: React.FC = () => {
    const [state, setState] = useState<ListRecordPageStateIF>(initialState);
    const [activeTab, setActiveTab] = useState<TabOption>('Invoice');
    const navigate = useNavigate();
    const [params] = useSearchParams();
    const { checkPermission, role } = usePermissionStore();
    const moduleName = sessionStorage.getItem('module');
    const isAdminUser = !!role && ['admin', 'superadmin'].includes((role?.name || '').toLowerCase());
    const selectedFilter = params.get('status') || '' ? { status: params.get('status') || '' } : {};
    const generateId = () => Math.random().toString(36).substr(2, 9);
    const actionButtons = checkPermission('export:record:ardex');

    const [sheets, setSheets] = useState<ExcelSheetConfig[]>([{ id: generateId(), sheetName: 'Sheet 1', columns: [] }]);

    // Initialize record list tour
    useRecordListTour({ enabled: true });

    return (
        <ListRecordPageStateProvider value={{ state, setState }}>
            <PageContainer className="gap-4 p-6">
                <Breadcrumbs page="listRecord" />
                {moduleName === 'tally' && <ListRecordTabs activeTab={activeTab} onChange={setActiveTab} />}
                {activeTab === 'Invoice' ? (
                    <>
                        <PageNameComponent
                            name={`List of ${selectedFilter.status ? selectedFilter.status?.charAt(0).toUpperCase() + selectedFilter.status?.slice(1) : 'All'} Records`}
                            showBackButton
                            customGoBackFunction={() => navigate('/')}
                        >
                            <div className="flex gap-2">
                                {/* <Button outlined onClick={() => navigate('/config/exportbuilder/quick-report')}>
                                    Quick Report
                                </Button> */}
                                {/* {isAdminUser && ( */}
                                    <Button permission="export:record" outlined onClick={() => navigate('/config/exportbuilder/list')}>
                                        Export Records
                                    </Button>
                                {/* )} */}
                                <Button outlined onClick={() => navigate('/docsnap/template/list')}>
                                    Manage Templates
                                </Button>
                            </div>
                        </PageNameComponent>
                        {/* <ListRecordComponent /> */}
                        <ListRecordCustomTable />
                        <DialogComponent
                            fullScreen
                            isOpen={state.showExcelExportDialog}
                            closeDialog={() => setState(prev => ({ ...prev, showExcelExportDialog: false }))}
                        >
                            <div className="h-screen w-screen flex flex-col overflow-y-auto">
                                <ExcelExportDialogNew template={sheets} inputData={[]} />
                                <ExcelExportBuilder sheets={sheets} setSheets={setSheets} />
                            </div>
                            {/* <ExcelPreviewComponent recordData={sampleRecordData} template={sampleExcelTemplate} /> */}
                        </DialogComponent>
                    </>
                ) : activeTab === 'PO' ? (
                    <>
                        <PageNameComponent
                            name="List of PO"
                            showBackButton
                            customGoBackFunction={() => navigate('/')}
                        />
                        <ListPoCustomTable />
                    </>
                ) : activeTab === 'Sales Order' ? (
                    <>
                        <PageNameComponent
                            name="List of Sales Orders"
                            showBackButton
                            customGoBackFunction={() => navigate('/')}
                        />
                        <ListSoCustomTable />
                    </>
                ) : (
                    <>
                        <PageNameComponent
                            name="List of Sales Invoices"
                            showBackButton
                            customGoBackFunction={() => navigate('/')}
                        />
                        <ListSalesInvoiceCustomTable />
                    </>
                )}
            </PageContainer>
        </ListRecordPageStateProvider>
    );
};

export default ListRecordPage;
