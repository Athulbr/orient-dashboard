import { useState } from 'react';
import PageContainer from '../../../components/PageContainer';
import PageNameComponent from '../../../components/PageName';
import { ModuleStateProvider } from './hooks/moduleContext';
import { ListModuleComponent } from './ListModuleComponent';
import { DialogComponent } from '../../../components/DialogComponent';
import { ViewModuleComponent } from './ViewModuleComponent';
import CreateModuleComponent from './CreateModuleComponent';

export interface ModuleStateIF {
    showViewDialog: boolean;
    showCreateDialog: boolean;
    loading: boolean;
    id: string;
    module: any | null;
    refresh: number;
}

const initialState: ModuleStateIF = {
    showViewDialog: false,
    showCreateDialog: false,
    loading: false,
    id: '',
    module: null,
    refresh: 1
};

const ListModulePage: React.FC = () => {
    const [state, setState] = useState<ModuleStateIF>(initialState);

    return (
        <ModuleStateProvider value={{ state, setState }}>
            {state.showViewDialog ? (
                <DialogComponent closeDialog={() => setState(prev => ({ ...prev, showViewDialog: false }))} name="View Module" isOpen className="w-[90vw]">
                    <ViewModuleComponent />
                </DialogComponent>
            ) : (
                <PageContainer className="gap-2">
                    <PageNameComponent name="List of Modules" />
                    <ListModuleComponent />
                </PageContainer>
            )}
            <CreateModuleComponent />
        </ModuleStateProvider>
    );
};

export default ListModulePage;
