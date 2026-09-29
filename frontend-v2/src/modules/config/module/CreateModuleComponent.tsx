import { UseFormbuilder } from '../../../builders/formbuilder/use-formbuilder';
import { useModuleState } from './hooks/moduleContext';
import { useModulesApi } from './hooks/useModuleApi';

interface CreateModuleComponentIF {
    test?: string;
}

const CreateModuleComponent: React.FC<CreateModuleComponentIF> = () => {
    const { state, setState } = useModuleState();
    const { createModuleApi, updateModuleApi } = useModulesApi();

    return (
        <UseFormbuilder
            isOpen={state.showCreateDialog}
            title={state.module ? 'Update Module' : 'Create Module'}
            name="Create Module Form"
            className="w-130"
            existingData={state.module || {}}
            onSubmit={e => (state.module ? updateModuleApi(e) : createModuleApi(e))}
            closeDialog={() => setState(prev => ({ ...prev, showCreateDialog: false, id: '', module: null }))}
            loadingPrimaryButton={state.loading}
        />
    );
};

export default CreateModuleComponent;
