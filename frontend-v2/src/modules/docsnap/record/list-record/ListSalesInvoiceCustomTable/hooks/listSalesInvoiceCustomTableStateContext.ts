import { createContext, useContext } from 'react';
import { ListSalesInvoiceCustomTableStateIF } from '..';

const listSalesInvoiceCustomTableStateContext = createContext<ListSalesInvoiceCustomTableContextIF | undefined>(undefined);
export const ListSalesInvoiceCustomTableStateProvider = listSalesInvoiceCustomTableStateContext.Provider;

export const useListSalesInvoiceCustomTableState = () => {
    const context = useContext(listSalesInvoiceCustomTableStateContext);
    if (!context) {
        throw new Error('useListSalesInvoiceCustomTableState must be used within a ListSalesInvoiceCustomTableStateProvider');
    }
    return context;
};

interface ListSalesInvoiceCustomTableContextIF {
    state: ListSalesInvoiceCustomTableStateIF;
    setState: React.Dispatch<React.SetStateAction<ListSalesInvoiceCustomTableStateIF>>;
}
