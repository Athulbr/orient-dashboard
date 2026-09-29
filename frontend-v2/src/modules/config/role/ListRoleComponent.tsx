import { StatusCustomUI } from '../../../builders/tablebuilder/render-tablebuilder/components/CustomUI';
import { UseTablebuilder } from '../../../builders/tablebuilder/render-tablebuilder/components/UseTablebuilder';
import { useRoleState } from './hooks/roleContext';
import { useRolesApi } from './hooks/useRoleApi';

export const ListRoleComponent: React.FC = () => {
    const { setState, state } = useRoleState();
    const { deleteRoleApi, getSubscriptionModelByIdApi, getAllModulesApi, getAllFeaturesApi } = useRolesApi();

    const actionButtons = [
        {
            label: 'Create Role',
            action: () => {
                setState(prev => ({ ...prev, showCreateDialog: true }));
            }
        }
    ];
    const customFunctions = {
        rowClickHandler: (row: any) => {
            setState(prev => ({ ...prev, showViewDialog: true, id: row._id, role: row }));
            getSubscriptionModelByIdApi(row.tenant?.subscription?.planRef);
            getAllModulesApi();
            getAllFeaturesApi();
        },
        editClickHandler: (row: any) => {
            setState(prev => ({ ...prev, showCreateDialog: true, role: row, id: row._id }));
        },
        deleteClickHandler: (row: any) => {
            deleteRoleApi(row._id);
        }
    };
    const customUI = {
        status: StatusCustomUI
    };
    return (
        <UseTablebuilder
            name="List Role Table"
            fluidHeight
            refresh={state.refresh}
            customFunctions={customFunctions}
            customUI={customUI}
            actionButtons={actionButtons}
            deletePermission="delete:role"
            updatePermission="update:role"
        />
    );
};
