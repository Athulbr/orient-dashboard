import { useState } from 'react';
import PageContainer from '../../../components/PageContainer';
import PageNameComponent from '../../../components/PageName';
import { FeatureStateProvider } from './hooks/featureContext';
import { ListFeatureComponent } from './ListFeatureComponent';
import { DialogComponent } from '../../../components/DialogComponent';
import { ViewFeatureComponent } from './ViewFeatureComponent';
import CreateFeatureComponent from './CreateFeatureComponent';
import Breadcrumbs from '../../../components/Breadcrumbs';

export interface FeatureStateIF {
    showViewDialog: boolean;
    showCreateDialog: boolean;
    loading: boolean;
    id: string;
    feature: any | null;
    refresh: number;
}

const initialState: FeatureStateIF = {
    showViewDialog: false,
    showCreateDialog: false,
    loading: false,
    id: '',
    feature: null,
    refresh: 1
};

const ListFeaturePage: React.FC = () => {
    const [state, setState] = useState<FeatureStateIF>(initialState);

    return (
        <FeatureStateProvider value={{ state, setState }}>
            {state.showViewDialog ? (
                <DialogComponent closeDialog={() => setState(prev => ({ ...prev, showViewDialog: false }))} name="View Feature" isOpen className="w-[90vw]">
                    <ViewFeatureComponent />
                </DialogComponent>
            ) : (
                <PageContainer className="gap-2">
                    <PageNameComponent name="List of Features" />
                    <ListFeatureComponent />
                </PageContainer>
            )}
            <CreateFeatureComponent />
        </FeatureStateProvider>
    );
};

export default ListFeaturePage;
