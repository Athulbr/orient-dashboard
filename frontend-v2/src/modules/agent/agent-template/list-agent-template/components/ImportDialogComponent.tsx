import React, { useState } from 'react';
import { DialogComponent } from '../../../../../components/DialogComponent';
import { TextAreaComponent } from '../../../../../components/Textarea';
import { Button } from '../../../../../components/Button';
import httpRequest from '../../../../../global-utils/httpRequest';
import { config } from '../../../../../config/default';
import { useToastStore } from '../../../../../components/toast/ToastStore';

interface ImportDialogComponentProps {
    isOpen: boolean;
    onClose: () => void;
    onImportSuccess: () => void;
}

const ImportDialogComponent: React.FC<ImportDialogComponentProps> = ({ isOpen, onClose, onImportSuccess }) => {
    const [templateData, setTemplateData] = useState('');
    const [isImporting, setIsImporting] = useState(false);
    const toast = useToastStore();

    const importTemplate = async () => {
        try {
            if (!templateData.trim()) {
                toast.error('Please paste valid template JSON data');
                return;
            }

            let parsedData;
            try {
                parsedData = JSON.parse(templateData);
            } catch (err) {
                toast.error('Invalid JSON format');
                return;
            }

            setIsImporting(true);

            // Removing properties that shouldn't be imported, just in case
            const payload = {
                name: parsedData.name || 'Imported Template',
                settings: parsedData.settings || {},
                sections: parsedData.sections || []
            };

            const response: any = await httpRequest('POST', `${config.workflowService}/workflow/agent-templates`, payload);

            if (response?.success) {
                toast.success('Template imported successfully');
                setTemplateData('');
                onImportSuccess();
                onClose();
            } else {
                toast.error(response?.message || 'Failed to import template');
            }
        } catch (error: any) {
            console.error('Import failed', error);
            toast.error(error?.message || 'Failed to import template');
        } finally {
            setIsImporting(false);
        }
    };

    return (
        <DialogComponent className="w-[80%]" isOpen={isOpen} closeDialog={onClose} name="Import Agent Template">
            <div className="flex flex-col gap-4 p-4">
                <TextAreaComponent
                    value={templateData}
                    onChange={e => setTemplateData(e.target.value)}
                    className="min-h-[60vh] font-mono text-sm p-4 text-gray-800 outline-none"
                    placeholder="Paste your copied JSON template data here..."
                />
                <Button onClick={importTemplate} className="w-full" disabled={isImporting}>
                    {isImporting ? 'Importing...' : 'Import'}
                </Button>
            </div>
        </DialogComponent>
    );
};

export default ImportDialogComponent;
