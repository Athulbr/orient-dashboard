import { useListSalesInvoiceCustomTableState } from './hooks/listSalesInvoiceCustomTableStateContext';
import { Button } from '../../../../../components/Button';

const TableToolbar: React.FC = () => {
    const { setState } = useListSalesInvoiceCustomTableState();

    return (
        <div className="p-2 flex flex-1 flex-row-reverse flex-wrap-reverse justify-start gap-4">
            <Button outlined onClick={() => setState(prev => ({ ...prev, showCreateDialog: true }))}>Create Sales Voucher</Button>
        </div>
    );
};

export default TableToolbar;
