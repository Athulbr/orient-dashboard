import PageContainer from '../../../components/PageContainer';
import PageNameComponent from '../../../components/PageName';
import { useState } from 'react';
import ListTablebuilderComponent from './ListTablebuilderComponent';
import { MakezAgentStateProvider } from './hooks/tablebuilderContext';

export interface MakezAgentStateIF {
    refresh: number;
    id: string;
    tablebuilder: any;
    refreshingCache: boolean;
}
const makezAgentInitialState: MakezAgentStateIF = {
    refresh: 1,
    id: '',
    tablebuilder: null,
    refreshingCache: false
};

const ListMakezAgentPage: React.FC = () => {
    const [state, setState] = useState<MakezAgentStateIF>(makezAgentInitialState);

    return (
        <MakezAgentStateProvider value={{ state, setState }}>
            <PageContainer className="gap-2">
                <PageNameComponent name="Makez Agent List" />
                <ListTablebuilderComponent />
            </PageContainer>
        </MakezAgentStateProvider>
    );
};

export default ListMakezAgentPage;
