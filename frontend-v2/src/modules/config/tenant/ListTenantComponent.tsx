import { StatusCustomUI } from '../../../builders/tablebuilder/render-tablebuilder/components/CustomUI';
import { UseTablebuilder } from '../../../builders/tablebuilder/render-tablebuilder/components/UseTablebuilder';
import { useTenantState } from './hooks/tenantContext';
import { useTenantsApi } from './hooks/useTenantApi';

export const ListTenantComponent: React.FC = () => {
    const { setState, state } = useTenantState();
    const { getTenantByIdApi, deleteTenantApi } = useTenantsApi();

    const actionButtons = [
        {
            label: 'Create Tenant',
            action: () => {
                setState(prev => ({ ...prev, showCreateDialog: true }));
            }
        },
        {
            label: 'Integrate API',
            action: () => {
                setState(prev => ({ ...prev, showIntegrateApiDialog: true }));
            }
        }
    ];

    const customFunctions = {
        rowClickHandler: (row: any) => {
            setState(prev => ({ ...prev, showViewDialog: true, id: row._id }));
            getTenantByIdApi(row._id);
        },
        editClickHandler: (row: any) => {
            setState(prev => ({ ...prev, showCreateDialog: true, tenant: row, id: row._id }));
        },
        deleteClickHandler: (row: any) => {
            deleteTenantApi(row._id);
        }
    };

    const customUI = {
        status: StatusCustomUI
    };

    return (
        <UseTablebuilder
            name="List Tenant Table"
            fluidHeight
            refresh={state.refresh}
            customFunctions={customFunctions}
            customUI={customUI}
            actionButtons={actionButtons}
            deletePermission="delete:tenant"
            updatePermission="update:tenant"
        />
    );
};
