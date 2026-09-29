import { createContext, useContext } from 'react';
import { TablebuilderStateIF } from '..';

interface TablebuilderContextIF {
    state: TablebuilderStateIF;
    setState: React.Dispatch<React.SetStateAction<TablebuilderStateIF>>;
}

const tablebuilderStateContext = createContext<TablebuilderContextIF | undefined>(undefined);
export const TablebuilderStateProvider = tablebuilderStateContext.Provider;

export const useTablebuilderState = () => {
    const context = useContext(tablebuilderStateContext);
    if (!context) {
        throw new Error('useTablebuilderState must be used within a TablebuilderStateProvider');
    }
    return context;
};
