import PreviewContainer from './preview-container';
import RightContainer from './right-container';
import { ResizableContainer } from '../docsnap/template/update-template/components/ResizableContainer';
import { ContentCreationEditorStateProvider } from './hooks/DocumentCreationEditorContext';
import { useContentCreationApi } from './hooks/useContentCreationApi';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { ContentCreationEditorStateIF } from './types';

const ContentCreationEditor: React.FC = () => {
    const [state, setState] = useState<ContentCreationEditorStateIF>({});

    return (
        <ContentCreationEditorStateProvider value={{ state, setState }}>
            <ContentCreationEditorInner />
        </ContentCreationEditorStateProvider>
    );
};

function ContentCreationEditorInner() {
    const { id } = useParams();
    const { fetchRecord } = useContentCreationApi();

    useEffect(() => {
        fetchRecord();
    }, [id]);

    return (
        <div className="flex flex-1 overflow-y-auto absolute left-0 top-0 h-full w-full bg-white">
            <ResizableContainer
                className="flex flex-1 overflow-y-auto"
                left={<PreviewContainer />}
                right={<RightContainer />}
                initialLeftWidthPercent={60}
                minLeftWidthPercent={30}
                maxLeftWidthPercent={75}
            />
        </div>
    );
}

export default ContentCreationEditor;
