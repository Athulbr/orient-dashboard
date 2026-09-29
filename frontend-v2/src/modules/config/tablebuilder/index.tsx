import PageContainer from '../../../components/PageContainer';
import PageNameComponent from '../../../components/PageName';
import { useState } from 'react';
import { TablebuilderStateProvider } from './hooks/tablebuilderContext';
import ListTablebuilderComponent from './ListTablebuilderComponent';
import CreateTablebuilderPage from './CreateTablebuilderPage';

export interface TablebuilderStateIF {
    refresh: number;
    id: string;
    tablebuilder: any;
    createDialog: boolean;
    refreshingCache: boolean;
}
const tablebuilderInitialState: TablebuilderStateIF = {
    refresh: 1,
    id: '',
    tablebuilder: null,
    createDialog: false,
    refreshingCache: false
};

const ListTablebuilderPage: React.FC = () => {
    const [state, setState] = useState<TablebuilderStateIF>(tablebuilderInitialState);

    if (state.createDialog) {
        return (
            <TablebuilderStateProvider value={{ state, setState }}>
                {state.id ? <CreateTablebuilderPage update={true} id={state.id} /> : <CreateTablebuilderPage update={false} />}
            </TablebuilderStateProvider>
        );
    }

    return (
        <TablebuilderStateProvider value={{ state, setState }}>
            <PageContainer className="gap-2">
                <PageNameComponent name="Tablebuilder List" />
                <ListTablebuilderComponent />
            </PageContainer>
        </TablebuilderStateProvider>
    );
};

export default ListTablebuilderPage;
