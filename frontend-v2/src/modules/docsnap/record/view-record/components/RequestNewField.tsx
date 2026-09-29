import { UseFormbuilder } from '../../../../../builders/formbuilder/use-formbuilder';
import { Button } from '../../../../../components/Button';
import { DialogComponent } from '../../../../../components/DialogComponent';
import { useState } from 'react';
import { useViewRecordApi } from '../hooks/useViewRecordApi';
import { useViewRecordState } from '../hooks/viewRecordContext';

interface RequestNewFieldIF {
    test?: string;
}

const RequestNewField: React.FC<RequestNewFieldIF> = () => {
    const { state, setState } = useViewRecordState();
    const { createRequestedNewField } = useViewRecordApi();
    const onSubmit = (fields: any) => {
        createRequestedNewField(fields.description);
    };
    return (
        <div className="">
            {state.templateSettings?.requestNewField && (
                <Button disabled={state.reExtracting} small outlined onClick={() => setState(prev => ({ ...prev, requestNewFieldDialog: true }))}>
                    Request New Field
                </Button>
            )}
            <UseFormbuilder
                onSubmit={onSubmit}
                name="Request New Field Form"
                className="w-100"
                closeDialog={() => setState(prev => ({ ...prev, requestNewFieldDialog: false }))}
                isOpen={state.requestNewFieldDialog}
            />
        </div>
    );
};

export default RequestNewField;
