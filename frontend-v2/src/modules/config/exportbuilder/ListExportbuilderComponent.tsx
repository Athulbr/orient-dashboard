import { UseTablebuilder } from '../../../builders/tablebuilder/render-tablebuilder/components/UseTablebuilder';
import { useExportbuilderState } from './hooks/exportbuilderContext';
import { useExportbuilderApi } from './hooks/useExportbuilderApi';

interface ListExportbuilderComponentIF {
    test?: string;
}

const ListExportbuilderComponent: React.FC<ListExportbuilderComponentIF> = () => {
    const { state, setState } = useExportbuilderState();
    const { deleteExportbuilderApi } = useExportbuilderApi();
    const actionButtons = [
        {
            label: 'Create Exportbuilder',
            action: () => {
                setState(prev => ({ ...prev, id: '', createDialog: true }));
            }
        }
    ];
    const customFunctions = {
        editClickHandler: (row: Record<string, string>) => {
            setState(prev => ({ ...prev, id: row._id, createDialog: true }));
        },
        deleteClickHandler: (row: Record<string, string>) => {
            deleteExportbuilderApi(row._id);
        },
        rowClickHandler: (row: Record<string, string>) => {
            setState(prev => ({ ...prev, exportbuilder: row, viewDialog: true }));
        }
    };
    return (
        <UseTablebuilder
            deletePermission="delete:exportbuilder"
            updatePermission="update:exportbuilder"
            name="list exportbuilder"
            refresh={state.refresh}
            fluidHeight
            actionButtons={actionButtons}
            customFunctions={customFunctions}
        />
    );
};

export default ListExportbuilderComponent;
