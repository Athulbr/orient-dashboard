import { createContext, useContext } from 'react';
import { ViewRecordStateIF } from '..';

const viewRecordStateContext = createContext<ViewRecordContextIF | undefined>(undefined);
export const ViewRecordStateProvider = viewRecordStateContext.Provider;

export const useViewRecordState = () => {
    const context = useContext(viewRecordStateContext);
    if (!context) {
        throw new Error('useAppContext must be used within an AppProvider');
    }
    return context;
};

interface ViewRecordContextIF {
    state: ViewRecordStateIF;
    setState: React.Dispatch<React.SetStateAction<ViewRecordStateIF>>;
}
