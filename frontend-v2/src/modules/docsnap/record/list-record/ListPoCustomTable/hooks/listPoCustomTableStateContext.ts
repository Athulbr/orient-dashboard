import { createContext, useContext } from 'react';
import { ListPoCustomTableStateIF } from '..';

const listPoCustomTableStateContext = createContext<ListPoCustomTableContextIF | undefined>(undefined);
export const ListPoCustomTableStateProvider = listPoCustomTableStateContext.Provider;

export const useListPoCustomTableState = () => {
    const context = useContext(listPoCustomTableStateContext);
    if (!context) {
        throw new Error('useListPoCustomTableState must be used within a ListPoCustomTableStateProvider');
    }
    return context;
};

interface ListPoCustomTableContextIF {
    state: ListPoCustomTableStateIF;
    setState: React.Dispatch<React.SetStateAction<ListPoCustomTableStateIF>>;
}
