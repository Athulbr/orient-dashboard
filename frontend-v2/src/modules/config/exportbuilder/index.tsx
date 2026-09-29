import PageContainer from '../../../components/PageContainer';
import PageNameComponent from '../../../components/PageName';
import { useState } from 'react';
import { ExportbuilderStateProvider } from './hooks/exportbuilderContext';
import ListExportbuilderComponent from './ListExportbuilderComponent';
import ViewExportbuilderPage from './ViewExportbuilderPage';
import { CreateExportbuilderPage } from './CreateExportbuilderPage';

export interface ExportbuilderStateIF {
    refresh: number;
    id: string;
    exportbuilder: any;
    createDialog: boolean;
    viewDialog: boolean;
    records: any[];
    loading: boolean;
    totalRecords: number;
    selectedTemplateId?: string[];
}
const exportbuilderInitialState: ExportbuilderStateIF = {
    refresh: 1,
    id: '',
    exportbuilder: null,
    createDialog: false,
    viewDialog: false,
    records: [],
    loading: false,
    totalRecords: 0
    ,selectedTemplateId: []
};

const ListExportbuilderPage: React.FC = () => {
    const [state, setState] = useState<ExportbuilderStateIF>(exportbuilderInitialState);

    if (state.createDialog) {
        return (
            <ExportbuilderStateProvider value={{ state, setState }}>
                <CreateExportbuilderPage />
            </ExportbuilderStateProvider>
        );
    }
    if (state.viewDialog) {
        return (
            <ExportbuilderStateProvider value={{ state, setState }}>
                <ViewExportbuilderPage />
            </ExportbuilderStateProvider>
        );
    }

    return (
        <ExportbuilderStateProvider value={{ state, setState }}>
            <PageContainer className="gap-2">
                <PageNameComponent name="Exportbuilder List" />
                <ListExportbuilderComponent />
            </PageContainer>
        </ExportbuilderStateProvider>
    );
};

export default ListExportbuilderPage;
