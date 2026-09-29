import { DatePicker } from '../../../builders/tablebuilder/render-tablebuilder/components/DatePicker';
import { formatDate } from '../../../builders/tablebuilder/render-tablebuilder/utils/formatDate';
import { Button } from '../../../components/Button';
import { DialogComponent } from '../../../components/DialogComponent';
import FullScreenLoader from '../../../components/FullScreenLoader';
import { TextAreaComponent } from '../../../components/Textarea';
import { usePromptTuningState } from './hooks/promptTuningContext';
import { usePromptTuningApi } from './hooks/usePromptTuningApi';
import { useToastStore } from '../../../components/toast/ToastStore';
import Spinner from '../../../components/Spinner';

interface PromptTuningDialogComponentIF {
    test?: string;
}

const PromptTuningDialogComponent: React.FC<PromptTuningDialogComponentIF> = () => {
    const { state, setState } = usePromptTuningState();
    const { fineTunePrompt, updateTemplateApi } = usePromptTuningApi();
    const toast = useToastStore();

    const fineTuneTemplate = () => {
        // const requestBody = {
        //   templateId: '686eb2d9205d42635ef9f283',
        //   start_date: '2025-07-13',
        //   end_date: '2025-07-14',
        //   updated_count: 5,
        //   data_source: 'mongodb',
        // };
        const requestBody = {
            templateId: state.selectedTemplateId,
            start_date: `${state.fromDate}`,
            end_date: `${state.toDate}`,
            updated_count: 7,
            data_source: 'mongodb'
        };

        fineTunePrompt(requestBody);
    };

    const savePrompt = () => {
        if (state.fineTunedFieldList.length === 0) {
            toast.error('Please fine-tune the template first');
            return;
        }
        const fineTunedFieldList = state.fineTunedFieldList.map((field: any) => {
            return {
                field_name: field.field_name,
                current_prompt: field.current_prompt,
                updated_prompt: field.updated_prompt
            };
        });
        const requestBody = {
            templateId: state.selectedTemplateId,
            updatedFields: fineTunedFieldList
        };
        updateTemplateApi(requestBody);
    };

    const additionalButtons = [
        {
            label: state.updatingTemplate ? 'Saving Template...' : 'Save Template',
            action: savePrompt
        }
    ];

    const ValidateHandler = () => {
        setState(prev => ({ ...prev, validating: true }));
        setTimeout(() => {
            setState(prev => ({ ...prev, validationSuccess: true, validating: false }));
        }, 4000);
    };

    return (
        <DialogComponent
            additionalButtons={state.validationSuccess ? additionalButtons : []}
            primaryButtonText={state.fineTunedFieldList.length > 0 ? 'Validate' : ''}
            secondaryButtonText="Cancel"
            className="max-h-[95vh] w-[80vw]"
            isOpen={state.showTuningDialog}
            name={`Template Prompt Tuning: ${state.templateName}`}
            onPrimaryAction={savePrompt}
            disableBlurCloseDialog
            closeDialog={() => setState(prev => ({ ...prev, showTuningDialog: false, fromDate: null, toDate: null, loading: false, fineTunedFieldList: [] }))}
        >
            <div className="flex min-h-140 flex-col gap-4 overflow-hidden p-4 pb-0">
                <div className="flex w-full">
                    <DatePicker
                        from={state.fromDate}
                        to={state.toDate}
                        onSubmit={(from: any, to: any) =>
                            setState(prev => ({ ...prev, fromDate: `${from.toISOString()}`.split('T')[0], toDate: `${to.toISOString()}`.split('T')[0] }))
                        }
                    />
                </div>
                {state.loading || state.updatingTemplate || state.validating ? (
                    <div className="flex h-full w-full flex-1 flex-col items-center justify-center">
                        <FullScreenLoader
                            text={state.loading ? 'Fine-Tuning Template...' : state.updatingTemplate ? 'Saving Template...' : 'Validating Template...'}
                        />
                    </div>
                ) : state.fineTunedFieldList.length > 0 ? (
                    <div className="flex w-full flex-col gap-8 overflow-y-auto p-4">
                        {state.fineTunedFieldList.map((field: any, index: number) => (
                            <div key={index} className="flex w-full flex-col gap-4 rounded-md border border-gray-300 p-6 shadow-md shadow-gray-400">
                                <div className="flex w-full gap-2">
                                    <span className="font-semibold text-gray-600">Field Name:</span> {field.field_name}
                                </div>
                                <TextAreaComponent label="Current Prompt" placeholder="Enter your prompt" value={field.current_prompt} onChange={e => {}} />
                                <TextAreaComponent label="Updated Prompt" placeholder="Enter your prompt" value={field.updated_prompt} onChange={e => {}} />
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="flex h-full w-full flex-1 flex-col items-center justify-center">
                        <div className="flex w-full flex-col gap-2 border-gray-200 pb-4">
                            <div className="flex items-center justify-center gap-2">
                                {state.fromDate && state.toDate ? (
                                    <>
                                        <span className="text-gray-500">{state.fromDate}</span>
                                        <span className="text-gray-400">-</span>
                                        <span className="text-gray-500">{state.toDate}</span>
                                    </>
                                ) : (
                                    'Please select date range'
                                )}
                            </div>
                        </div>
                        <Button disabled={!state.fromDate || !state.toDate} onClick={fineTuneTemplate} outlined>
                            {state.loading ? (
                                <span className="flex items-center gap-2">
                                    <Spinner /> Fine-Tuning Template...
                                </span>
                            ) : (
                                'Fine-Tune Template'
                            )}
                        </Button>
                    </div>
                )}
            </div>
        </DialogComponent>
    );
};

export default PromptTuningDialogComponent;
