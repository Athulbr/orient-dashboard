import { createContext, useContext } from 'react';
import { ListRecordPageStateIF } from '..';

const listRecordPageStateContext = createContext<ListRecordPageContextIF | undefined>(undefined);
export const ListRecordPageStateProvider = listRecordPageStateContext.Provider;

export const useListRecordPageState = () => {
    const context = useContext(listRecordPageStateContext);
    if (!context) {
        throw new Error('useAppContext must be used within an AppProvider');
    }
    return context;
};

interface ListRecordPageContextIF {
    state: ListRecordPageStateIF;
    setState: React.Dispatch<React.SetStateAction<ListRecordPageStateIF>>;
}
