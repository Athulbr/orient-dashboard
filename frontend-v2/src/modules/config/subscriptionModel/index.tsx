import { useState } from 'react';
import PageContainer from '../../../components/PageContainer';
import PageNameComponent from '../../../components/PageName';
import { SubscriptionModelStateProvider } from './hooks/subscriptionModelContext';
import { ListSubscriptionModelComponent } from './ListSubscriptionModelComponent';
import CreateSubscriptionModelComponent from './CreateSubscriptionModelComponent';
import { ViewSubscriptionModelComponent } from './ViewSubscriptionModelComponent';

export interface SubscriptionModelStateIF {
    showViewDialog: boolean;
    showCreateDialog: boolean;
    loading: boolean;
    id: string;
    subscriptionModel: any | null;
    modules: any[];
    features: any[];
    refresh: number;
}

const initialState: SubscriptionModelStateIF = {
    showViewDialog: false,
    showCreateDialog: false,
    loading: false,
    id: '',
    subscriptionModel: null,
    modules: [],
    features: [],
    refresh: 1
};

const ListSubscriptionModelPage: React.FC = () => {
    const [state, setState] = useState<SubscriptionModelStateIF>(initialState);

    return (
        <SubscriptionModelStateProvider value={{ state, setState }}>
            {state.showViewDialog ? (
                <ViewSubscriptionModelComponent />
            ) : (
                <PageContainer className="gap-2">
                    <PageNameComponent name="List of Subscription Models" />
                    <ListSubscriptionModelComponent />
                </PageContainer>
            )}
            <CreateSubscriptionModelComponent />
        </SubscriptionModelStateProvider>
    );
};

export default ListSubscriptionModelPage;
