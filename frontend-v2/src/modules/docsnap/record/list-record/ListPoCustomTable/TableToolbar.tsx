import { useListPoCustomTableState } from './hooks/listPoCustomTableStateContext';
import { Button } from '../../../../../components/Button';

const TableToolbar: React.FC = () => {
    const { setState } = useListPoCustomTableState();

    return (
        <div className="p-2 flex flex-1 flex-row-reverse flex-wrap-reverse justify-start gap-4">
            <Button outlined onClick={() => setState(prev => ({ ...prev, showCreatePoDialog: true }))}>Create PO</Button>
            {/* <input
                type="text"
                placeholder="Search..."
                value={state.searchText}
                onChange={e => setState(prev => ({ ...prev, searchText: e.target.value, page: 1 }))}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            /> */}
        </div>
    );
};

export default TableToolbar;
