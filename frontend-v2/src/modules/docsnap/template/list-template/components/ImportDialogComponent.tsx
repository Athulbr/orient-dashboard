import { DialogComponent } from '../../../../../components/DialogComponent';
import { TextAreaComponent } from '../../../../../components/Textarea';
import { useTemplateState } from '../hooks/templateContext';
import { Button } from '../../../../../components/Button';
import { useState } from 'react';
import { useListTemplatePageApi } from '../hooks/useTemplateApi';
interface ImportDialogComponentIF {
    test?: string;
}

const ImportDialogComponent: React.FC<ImportDialogComponentIF> = () => {
    const { state, setState } = useTemplateState();
    const [templateData, setTemplateData] = useState('');
    const { importTemplateApi } = useListTemplatePageApi();
    const importTemplate = () => {
        const parsedData = JSON.parse(templateData);
        importTemplateApi(parsedData);
        setTemplateData('');
    };
    return (
        <DialogComponent
            className="w-[80%]"
            isOpen={state.showImportTemplateDialog}
            closeDialog={() => setState({ ...state, showImportTemplateDialog: false })}
        >
            <div className="flex flex-col gap-4 p-4">
                <TextAreaComponent value={templateData} onChange={e => setTemplateData(e.target.value)} className="min-h-[60vh]" />
                <Button onClick={importTemplate} className="w-full">
                    Import
                </Button>
            </div>
        </DialogComponent>
    );
};

export default ImportDialogComponent;
