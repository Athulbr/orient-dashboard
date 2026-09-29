import { createContext, useContext } from 'react';
import { ListRecordCustomTableStateIF } from '..';

const listRecordCustomTableStateContext = createContext<ListRecordCustomTableContextIF | undefined>(undefined);
export const ListRecordCustomTableStateProvider = listRecordCustomTableStateContext.Provider;

export const useListRecordCustomTableState = () => {
    const context = useContext(listRecordCustomTableStateContext);
    if (!context) {
        throw new Error('useAppContext must be used within an AppProvider');
    }
    return context;
};

interface ListRecordCustomTableContextIF {
    state: ListRecordCustomTableStateIF;
    setState: React.Dispatch<React.SetStateAction<ListRecordCustomTableStateIF>>;
}
