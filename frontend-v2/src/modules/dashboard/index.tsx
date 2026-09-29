import { useEffect, useState } from 'react';
import { DashboardHeaderComponent } from './components/DashboardHeader';
import { DashboardStateProvider } from './hooks/dashboardContext';
import RecentFilesCardComponent from './components/RecentFilesCard';
import { StatusCardComponent } from './components/StatusCard';
import { CreateTemplateComponent } from '../docsnap/template/list-template/components/CreateTemplateDialog';
import { TemplateCardListComponent } from './components/TemplateCardList';
import { UploadDocumentComponentNew } from '../docsnap/upload-document-new';

export interface DashboardStateIF {
    totalTemplates: number;
    records: any[];
    templates: any[];
    loadingRecords: boolean;
    loadingTemplates: boolean;
    showCreateTemplateDialog: boolean;
    showUploadDocumentDialog: boolean;
    selectedTemplate: any;
    refresh: number;
    isDashboard: boolean;
    predefinedTemplates: any[];
    loadingPredefinedTemplates: boolean;
    statusCounts: any;
    loadingStatusCounts: boolean;
    test: any[];
    module: string;
    showManualInputForm: boolean;
}

const DashboardPage: React.FC<{ module: string }> = ({ module }) => {
    const initialState = {
        totalTemplates: 0,
        isDashboard: true,
        records: [],
        loadingRecords: false,
        templates: [],
        loadingTemplates: false,
        showCreateTemplateDialog: false,
        showUploadDocumentDialog: false,
        selectedTemplate: null,
        refresh: 1,
        predefinedTemplates: [],
        loadingPredefinedTemplates: false,
        statusCounts: null,
        loadingStatusCounts: false,
        test: [],
        showManualInputForm: false,
        module: module
    };
    const [state, setState] = useState<DashboardStateIF>(initialState);

    return (
        <DashboardStateProvider value={{ state, setState }}>
            <div className="flex flex-1 flex-col gap-y-4 overflow-hidden bg-[#F4F7FE] px-3 pt-2 lg:px-6 lg:pt-5 2xl:pb-4">
                <DashboardHeaderComponent />
                <div className="h-full flex-1 overflow-y-auto p-1">
                    <div className="mb-4 flex h-full max-h-250 min-h-400 flex-1 flex-col gap-6 overflow-y-auto lg:min-h-192 2xl:mb-0">
                        <div className="flex w-full flex-1 flex-col gap-6 overflow-hidden lg:flex-row">
                            <RecentFilesCardComponent module={module} />
                            <StatusCardComponent module={module} />
                        </div>
                        <TemplateCardListComponent module={module} />
                    </div>
                </div>
            </div>
            <CreateTemplateComponent state={state} setState={setState} />
            {state.showUploadDocumentDialog && (
                <UploadDocumentComponentNew setShowManualInputForm={(value) => setState({ ...state, showManualInputForm: false, showUploadDocumentDialog:false })} showManualInputForm={state.showManualInputForm}  template={state.selectedTemplate} closeDialog={() => setState({ ...state, showUploadDocumentDialog: false })} />
            )}
        </DashboardStateProvider>
    );
};

export default DashboardPage;
