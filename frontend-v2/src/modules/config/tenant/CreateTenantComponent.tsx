import { UseFormbuilder } from '../../../builders/formbuilder/use-formbuilder';
import { useTenantState } from './hooks/tenantContext';
import { useTenantsApi } from './hooks/useTenantApi';

interface CreateTenantComponentIF {
    test?: string;
}

const CreateTenantComponent: React.FC<CreateTenantComponentIF> = () => {
    const { state, setState } = useTenantState();
    const { createTenantApi, updateTenantApi } = useTenantsApi();

    const onSubmit = (data: any) => {
        if (state.tenant) {
            updateTenantApi(data);
        } else {
            const requestBody = {
                subscription: {
                    status: 'active',
                    isTrialOn: false,
                    isAutoRenew: false,
                    planRef: data.subscriptionPlan,
                    startDate: '2025-09-06T18:30:00.000Z',
                    endDate: '2025-08-07T18:30:00.000Z',
                    nextBillingDate: '2025-08-07T18:30:00.000Z' // TODO: change this
                },
                name: data.name,
                domain: data.domain,
                dbURI: data.dbURI
            };
            createTenantApi(requestBody);
        }
    };

    return (
        <UseFormbuilder
            isOpen={state.showCreateDialog}
            title={state.tenant ? 'Update Tenant' : 'Create Tenant'}
            name="Create Tenant Form"
            className="w-130"
            existingData={state.tenant || {}}
            onSubmit={onSubmit}
            closeDialog={() => setState(prev => ({ ...prev, showCreateDialog: false, id: '', tenant: null }))}
            loadingPrimaryButton={state.loading}
        />
    );
};

export default CreateTenantComponent;
