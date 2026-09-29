import { UseFormbuilder } from '../../../builders/formbuilder/use-formbuilder';
import { useFeatureState } from './hooks/featureContext';
import { useFeaturesApi } from './hooks/useFeatureApi';

interface CreateFeatureComponentIF {
    test?: string;
}

const CreateFeatureComponent: React.FC<CreateFeatureComponentIF> = () => {
    const { state, setState } = useFeatureState();
    const { createFeatureApi, updateFeatureApi } = useFeaturesApi();

    return (
        <UseFormbuilder
            isOpen={state.showCreateDialog}
            title={state.feature ? 'Update Feature' : 'Create Feature'}
            name="Create Feature Form"
            className="w-130"
            existingData={state.feature || {}}
            onSubmit={e => (state.feature ? updateFeatureApi(e) : createFeatureApi(e))}
            closeDialog={() => setState(prev => ({ ...prev, showCreateDialog: false, id: '', feature: null }))}
            loadingPrimaryButton={state.loading}
        />
    );
};

export default CreateFeatureComponent;
