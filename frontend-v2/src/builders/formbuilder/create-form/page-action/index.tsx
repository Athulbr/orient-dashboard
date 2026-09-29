import { useEffect, useState } from 'react';
import { FieldIF } from '../../interface';
import { Bot, Save, Settings, View } from 'lucide-react';
import { Chatbot } from '../../components/chatbot';
import { Dialog } from '../../components/dialog';
import PageActionBox from '../../components/table-control-box';
import { TextField } from '../../components/textfield';
import { httpAiRequest } from '../../utils/functions/httpAiRequest';
import { useFormBuilder } from '../formbuilder-context/useFormBuilder';
import Spinner from '../../components/spinner';
import { Button } from '../../../../components/Button';
import { useParams } from 'react-router-dom';
import { DialogComponent } from '../../../../components/DialogComponent';
import { RenderForm } from '../../render-form/RenderForm';
import { UseFormbuilder } from '../../use-formbuilder';
import { ButtonBox } from '../../../../components/ButtonBox';
import { useToastStore } from '../../../../components/toast/ToastStore';
import { config } from '../../../../config/default';

interface Message {
    id: number;
    text: string;
    isUser: boolean;
}

const PageActionComponent: React.FC = () => {
    const { id } = useParams();
    const toast = useToastStore();
    const [messages, setMessages] = useState<Message[]>([{ id: 1, text: 'Hello! How can I help you?', isUser: false }]);
    const {
        fields,
        showChatbot,
        formSettings,
        setFormSettings,
        setShowChatbot,
        setFields,
        setShowFieldInputError,
        loading,
        createForm,
        updateForm,
        getFormbuilderByIdApi
    } = useFormBuilder();
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [chatLoading, setChatLoading] = useState(false);
    const [showPreview, setShowPreview] = useState(false);
    const [isUserClosedChatbot, setIsUserClosedChatbot] = useState(true);
    const [email, setEmail] = useState('');
    const [showSettings, setShowSettings] = useState(false);
    const [name, setName] = useState('');
    const [showNameDialog, setShowNameDialog] = useState(false);
    const [loadingSettings, setLoadingSettings] = useState(false);

    useEffect(() => {
        if (!id) return;
        const getName = async () => {
            const name = await getFormbuilderByIdApi();
            if (name) setName(name);
        };
        getName();
    }, [id]);

    const hideChatbot = () => {
        setIsUserClosedChatbot(true);
        setShowChatbot(false);
    };

    const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value);

    const handleConfirm = () => setIsDialogOpen(false);
    const handleCancel = () => setIsDialogOpen(false);

    const addMessage = (prompt: string, isUser: boolean) => {
        setMessages(prev => [...prev, { id: prev.length + 1, text: prompt, isUser }]);
    };

    const safeParseJson = (data: string): FieldIF[] => {
        try {
            return JSON.parse(data.replace(/```(json)?/g, '')?.trim()) || [];
        } catch (error) {
            console.error('JSON Parsing Error:', error);
            return [];
        }
    };

    const updateFieldsIncrementally = (cleanedResponse: FieldIF[]) => {
        const index = 0;
        const updateFields = (i: number) => {
            if (i < cleanedResponse.length) {
                setFields(prevFields => [...prevFields, cleanedResponse[i]]);
                setTimeout(() => updateFields(i + 1), 400);
            }
        };
        updateFields(index);
    };

    const handleSendPrompt = async (prompt: string) => {
        setChatLoading(true);
        const regenerate = fields.length > 0;
        addMessage(prompt, true);

        try {
            const res = await httpAiRequest('POST', `${config.nodeApiUrl}/${regenerate ? 'regenerate' : 'generate'}`, {
                prompt,
                fields
            });

            const cleanedResponse = safeParseJson(res.data || '[]');
            const labels = cleanedResponse.map(field => field.label);

            addMessage(`Generated Fields: ${labels.join(', ')}`, false);

            if (regenerate) setFields([]);
            updateFieldsIncrementally(cleanedResponse);
        } catch (error: any) {
            const errorMessage =
                error.message === 'Please provide relevent message'
                    ? regenerate
                        ? 'Please provide input relevant to updating this form.'
                        : 'Please provide input relevant to creating a new form.'
                    : error.message;

            addMessage(errorMessage, false);
            console.error('Error:', error);
        } finally {
            setChatLoading(false);
        }
    };

    const handleUpdateFormbuilder = () => {
        if (!name) {
            toast.error('Form name is required');
            return;
        }
        id ? updateForm(name) : createForm(name);

        setShowNameDialog(false);
    };

    const handleSave = () => {
        setShowFieldInputError(true);
        if (fields.some(item => item.key?.trim() === '' || item.label?.trim() === '')) return;
        setShowNameDialog(true);
    };

    const handlePreview = () => {
        setShowFieldInputError(true);
        if (fields.some(item => item.key?.trim() === '' || item.label?.trim() === '')) return;
        setShowPreview(true);
    };

    const handleSubmitSettings = (e: any) => {
        setLoadingSettings(true);
        setFormSettings(e);
        setShowSettings(false);
        setLoadingSettings(false);
    };

    return (
        <PageActionBox pageName={id ? 'Update Form' : 'Create Form'}>
            <Button endIcon={<Bot size={18} />} disabled={!isUserClosedChatbot || showChatbot} outlined onClick={() => setShowChatbot(true)}>
                {fields.length ? 'Modify fields with AI' : 'Create fields with AI'}
            </Button>
            <Button disabled={!fields.length} endIcon={<Settings size={17} />} onClick={() => setShowSettings(true)}>
                settings
            </Button>
            <Button disabled={!fields.length} endIcon={<View size={17} />} onClick={handlePreview}>
                Preview
            </Button>
            <Button onClick={handleSave} disabled={!fields.length} startIcon={loading ? <Spinner /> : <Save size={17} />}>
                {id ? 'Update' : 'Create'}
            </Button>
            <Dialog
                isOpen={isDialogOpen}
                onClose={() => setIsDialogOpen(false)}
                primaryButtonText="Create"
                secondaryButtonText="Cancel"
                onPrimaryClick={handleConfirm}
                onSecondaryClick={handleCancel}
            >
                <TextField id="email" label="Email Address" type="email" value={email} onChange={handleEmailChange} />
            </Dialog>
            {showChatbot && <Chatbot hideChatbot={hideChatbot} messages={messages} handleSendPrompt={handleSendPrompt} chatLoading={chatLoading} />}

            <DialogComponent isOpen={showPreview} closeDialog={() => setShowPreview(false)} name="Form Preview" className="w-1/2">
                <RenderForm cancelClickHandler={() => setShowPreview(false)} submitClickHandler={() => {}} fields={fields} columns={formSettings.columns} />
            </DialogComponent>

            <UseFormbuilder
                className="w-100"
                isOpen={showSettings}
                name="Formbuilder Settings Form"
                closeDialog={() => setShowSettings(false)}
                onSubmit={handleSubmitSettings}
                loadingPrimaryButton={loadingSettings}
            />
            <DialogComponent isOpen={showNameDialog} closeDialog={() => setShowNameDialog(false)} name="Formbuilder Name">
                <div className="flex w-100 flex-col gap-4 p-4">
                    <TextField className="w-full" label="Formbuilder Name" value={name} onChange={e => setName(e.target.value)} />
                    <ButtonBox>
                        <Button onClick={handleUpdateFormbuilder}>{id ? 'Update' : 'Create'}</Button>
                    </ButtonBox>
                </div>
            </DialogComponent>
        </PageActionBox>
    );
};

export default PageActionComponent;
