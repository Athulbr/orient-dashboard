import { DialogComponent } from '../../../../components/DialogComponent';
import { RichTextEditor } from '../../../../components/RichTextEditor';
import { useDocumentCreationEditorState } from '../hooks/DocumentCreationEditorContext';
interface RichTextEditorDialogIF {
    test?: string;
}

const RichTextEditorDialog: React.FC<RichTextEditorDialogIF> = () => {
    const { state, setState } = useDocumentCreationEditorState();
    const richTextValue = state.documentText?.split('\n').map((item: string, index: number): string => {
        const parts = item?.split(/({{.*?}})/g);
        const row = parts.map((part: string, index: number) => {
            const match = part.match(/{{(.*?)}}/);
            if (match) {
                const key = match[1].trim();
                const value = state.formValues[key];
                return `${value}`;
            }
            return `${part}`;
        });
        return row.join('');
    });
    return (
        <DialogComponent
            disableBlurCloseDialog
            className="w-[80vw] max-w-[1000px] h-full max-h-[90vh]"
            name="Edit Text"
            isOpen={state.showRichTextEditor}
            closeDialog={() => setState(prev => ({ ...prev, showRichTextEditor: false }))}
        >
            <div className="p-4">
                <RichTextEditor height={'87vh'} value={richTextValue?.join('<br/>')} onChange={value => {}} />
            </div>
        </DialogComponent>
    );
};

export default RichTextEditorDialog;
