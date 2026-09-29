import { UseFormbuilder } from '../../../builders/formbuilder/use-formbuilder';
import { useSubscriptionModelState } from './hooks/subscriptionModelContext';
import { useSubscriptionModelsApi } from './hooks/useSubscriptionModelApi';

interface CreateSubscriptionModelComponentIF {
    test?: string;
}

const CreateSubscriptionModelComponent: React.FC<CreateSubscriptionModelComponentIF> = () => {
    const { state, setState } = useSubscriptionModelState();
    const { createSubscriptionModelApi, updateSubscriptionModelApi } = useSubscriptionModelsApi();

    return (
        <UseFormbuilder
            isOpen={state.showCreateDialog}
            title={state.subscriptionModel ? 'Update Subscription Model' : 'Create Subscription Model'}
            name="Create Subscription Model Form"
            className="w-130"
            existingData={state.subscriptionModel || {}}
            onSubmit={e => (state.subscriptionModel ? updateSubscriptionModelApi(e) : createSubscriptionModelApi(e))}
            closeDialog={() => setState(prev => ({ ...prev, showCreateDialog: false, id: '', subscriptionModel: null }))}
            loadingPrimaryButton={state.loading}
        />
    );
};

export default CreateSubscriptionModelComponent;
