import { UseTablebuilder } from '../../../builders/tablebuilder/render-tablebuilder/components/UseTablebuilder';
import { useTablebuilderState } from './hooks/tablebuilderContext';
import { useTablebuilderApi } from './hooks/useTablebuilderApi';
interface ListTablebuilderComponentIF {
    test?: string;
}

const ListTablebuilderComponent: React.FC<ListTablebuilderComponentIF> = () => {
    const { state, setState } = useTablebuilderState();
    const { refreshCache, deleteTablebuilderApi } = useTablebuilderApi();
    const actionButtons = [
        {
            label: 'Create Tablebuilder',
            action: () => {
                setState(prev => ({ ...prev, id: '', createDialog: true }));
            }
        },
        {
            label: state.refreshingCache ? 'Refreshing Cache...' : 'Refresh Cache',
            action: refreshCache,
            loading: state.refreshingCache
        }
    ];
    const customFunctions = {
        editClickHandler: (row: Record<string, string>) => {
            setState(prev => ({ ...prev, id: row._id, createDialog: true }));
        },
        deleteClickHandler: (row: Record<string, string>) => {
            deleteTablebuilderApi(row._id);
        }
    };
    return (
        <UseTablebuilder
            deletePermission="delete:tablebuilder"
            updatePermission="update:tablebuilder"
            name="list tablebuilder"
            refresh={state.refresh}
            fluidHeight
            actionButtons={actionButtons}
            customFunctions={customFunctions}
        />
    );
};

export default ListTablebuilderComponent;
