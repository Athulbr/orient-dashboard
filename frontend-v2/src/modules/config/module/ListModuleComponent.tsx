import { StatusCustomUI } from '../../../builders/tablebuilder/render-tablebuilder/components/CustomUI';
import { UseTablebuilder } from '../../../builders/tablebuilder/render-tablebuilder/components/UseTablebuilder';
import { useToastStore } from '../../../components/toast/ToastStore';
import { useModuleState } from './hooks/moduleContext';
import { useModulesApi } from './hooks/useModuleApi';

export const ListModuleComponent: React.FC = () => {
    const { setState, state } = useModuleState();
    const { getModuleByIdApi } = useModulesApi();
    const toast = useToastStore();

    const actionButtons = [
        {
            label: 'Create Module',
            action: () => {
                setState(prev => ({ ...prev, showCreateDialog: true }));
            }
        }
    ];

    const customFunctions = {
        rowClickHandler: (row: any) => {
            setState(prev => ({ ...prev, showViewDialog: true, id: row._id }));
            getModuleByIdApi(row._id);
        },
        editClickHandler: (row: any) => {
            setState(prev => ({ ...prev, showCreateDialog: true, module: row, id: row._id }));
        },
        deleteClickHandler: (row: any) => {
            toast.info('Module should be deleted from the database');
            // deleteModuleApi(row._id);
        }
    };

    const customUI = {
        status: StatusCustomUI
    };

    return (
        <UseTablebuilder
            name="List Module Table"
            fluidHeight
            refresh={state.refresh}
            customFunctions={customFunctions}
            customUI={customUI}
            actionButtons={actionButtons}
            deletePermission="delete:module"
            updatePermission="update:module"
        />
    );
};
