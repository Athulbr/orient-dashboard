import { TabNavComponent } from '../../../docsnap/record/components/TabNav/TabNav';
import { useDocumentCreationEditorState } from '../hooks/DocumentCreationEditorContext';
import { tabs } from '../static-data/tabs';
import KnowledgeBase from './knowledge-base';
import ChatWithKnowledgeBase from './ChatWithKnowledgeBase';
import FullScreenLoader from '../../../../components/FullScreenLoader';
import { Button } from '../../../../components/Button';
import { Save } from 'lucide-react';
import { DynamicForm } from './DynamicForm';

interface RightContainerIF {
    test?: string;
}

const RightContainer: React.FC<RightContainerIF> = () => {
    const { state, setState } = useDocumentCreationEditorState();

    if (state.loadingTemplate) return <FullScreenLoader />;

    return (
        <div className="flex flex-col flex-1 h-full relative">
            <div className="z-20">
                <TabNavComponent tabs={tabs} onChange={index => setState(prev => ({ ...prev, activeTab: tabs[index].id }))} />
            </div>
            <div className="border-b"></div>
            {state.activeTab === 'documentFields' && <DynamicForm />}
            {state.activeTab === 'knowledgeBase' && <KnowledgeBase />}
            {state.activeTab === 'chatWithKnowledgeBase' && <ChatWithKnowledgeBase />}
            <Button className="absolute right-3 top-3" startIcon={<Save size={16} />}>
                Save
            </Button>
        </div>
    );
};

export default RightContainer;
