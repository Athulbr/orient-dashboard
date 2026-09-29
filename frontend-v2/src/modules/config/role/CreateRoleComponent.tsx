import { UseFormbuilder } from '../../../builders/formbuilder/use-formbuilder';
import { useRoleState } from './hooks/roleContext';
import { useRolesApi } from './hooks/useRoleApi';

interface CreteRoleComponentIF {
    test?: string;
}

const CreteRoleComponent: React.FC<CreteRoleComponentIF> = () => {
    const { state, setState } = useRoleState();
    const { createRoleApi, updateRoleApi } = useRolesApi();

    // console.log('state in create role component', state);

    const existingData = {name : state.role?.name, description: state.role?.description, tenantId : state.role?.tenant?._id || []}

    return (
        <UseFormbuilder
            isOpen={state.showCreateDialog}
            title={state.role ? 'Update Role' : 'Create Role'}
            name="Create Role Form"
            className="w-130"
            existingData={existingData}
            onSubmit={e => (state.role ? updateRoleApi(e) : createRoleApi(e))}
            closeDialog={() => setState(prev => ({ ...prev, showCreateDialog: false, id: '', role: null }))}
            loadingPrimaryButton={state.loading}
        />
    );
};

export default CreteRoleComponent;
