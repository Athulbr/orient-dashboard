import React from 'react';
import { UseTablebuilder } from '../../../builders/tablebuilder/render-tablebuilder/components/UseTablebuilder';
import { useMakezAgentApi } from './hooks/useTablebuilderApi';
import { useMakezAgentState } from './hooks/tablebuilderContext';
interface ListMakezAgentComponentIF {
    test?: string;
}

const ListMakezAgentComponent: React.FC<ListMakezAgentComponentIF> = () => {
    const { state, setState } = useMakezAgentState();
    const { deleteMakezAgentApi } = useMakezAgentApi();
    const actionButtons = [
        {
            label: 'Makez Agents',
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
            deleteMakezAgentApi(row._id);
        }
    };
    return (
        <UseTablebuilder
            deletePermission="delete:MakezAgent"
            updatePermission="update:MakezAgent"
            name="list makez agent"
            refresh={state.refresh}
            fluidHeight
            actionButtons={actionButtons}
            customFunctions={customFunctions}
        />
    );
};

export default ListMakezAgentComponent;
