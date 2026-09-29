import Breadcrumbs from '../../../../components/Breadcrumbs';
import PageContainer from '../../../../components/PageContainer';
import PageNameComponent from '../../../../components/PageName';
import { useState } from 'react';
import { ViewTemplateStateProvider } from './hooks/viewTemplateContext';
import { ListRecordComponent } from './ListRecordComponent';
import { TabViewContainer } from './components/TabViewContainer';
import { ConfigurationComponent } from './ConfigurationComponent';
import { TemplateFieldsComponent } from './TemplateFieldsComponent';
import { TrainingComponent } from './TrainingComponent';
import { AnalyticsComponent } from './AnalyticsComponent';

export interface ViewTemplateStateIF {
    template: any;
    templateFields: any[];
    loadingS3File: boolean;
    loadingTemplate: boolean;
    images: any[];
    tabIndex: number;
}
const initialState: ViewTemplateStateIF = {
    template: null,
    templateFields: [],
    loadingS3File: false,
    loadingTemplate: false,
    images: [],
    tabIndex: 0
};

const ViewTemplatePage: React.FC = () => {
    const [state, setState] = useState<ViewTemplateStateIF>(initialState);

    return (
        <ViewTemplateStateProvider value={{ state, setState }}>
            <PageContainer className="gap-4 overflow-hidden py-6">
                <div className="flex flex-col gap-4 px-6">
                    <Breadcrumbs page="viewTemplate" pageName={state.template?.name} />
                    <PageNameComponent name={state.template?.name} showBackButton />
                </div>
                <div className="flex h-full w-full flex-col bg-red-500">
                    <TabViewContainer>
                        <ListRecordComponent />
                        <TemplateFieldsComponent />
                        <AnalyticsComponent />
                        <TrainingComponent />
                        <ConfigurationComponent />
                    </TabViewContainer>
                </div>
            </PageContainer>
        </ViewTemplateStateProvider>
    );
};

export default ViewTemplatePage;
