import { createContext, useContext } from 'react';
import { ListSoCustomTableStateIF } from '..';

const listSoCustomTableStateContext = createContext<ListSoCustomTableContextIF | undefined>(undefined);
export const ListSoCustomTableStateProvider = listSoCustomTableStateContext.Provider;

export const useListSoCustomTableState = () => {
    const context = useContext(listSoCustomTableStateContext);
    if (!context) {
        throw new Error('useListSoCustomTableState must be used within a ListSoCustomTableStateProvider');
    }
    return context;
};

interface ListSoCustomTableContextIF {
    state: ListSoCustomTableStateIF;
    setState: React.Dispatch<React.SetStateAction<ListSoCustomTableStateIF>>;
}
