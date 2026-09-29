import { use, useEffect, useState } from 'react';
import { mapRenderComponents, validateAllFields } from './MapRenderComponents';
import { FieldIF, FormSettingsIF } from '../interface';
import { Button } from '../../../components/Button';
import Spinner from '../../../components/Spinner';
import { cn } from '../../../global-utils/twMerge';

interface RenderFormIF {
    fields: FieldIF[];
    submitClickHandler: (fields: FieldIF[]) => void;
    cancelClickHandler: () => void;
    columns?: number;
    loadingPrimaryButton?: boolean;
    className?: string;
    actionButtonText?: string;
    actionButtonClickHandler?: (fields: FieldIF[]) => void;
}

export const RenderForm: React.FC<RenderFormIF> = ({
    fields,
    columns = 2,
    cancelClickHandler,
    submitClickHandler,
    loadingPrimaryButton,
    className,
    actionButtonText,
    actionButtonClickHandler
}) => {
    const [fieldsArray, setFields] = useState<FieldIF[]>([]);
    // const [fieldsArray, setFields] = useState<FieldIF[]>(fields.map(field => ({ ...field })));

    useEffect(() => {
        setFields(fields.map(field => ({ ...field })));
    }, [fields]);

    const submitHandler = () => {
        const noError = validateAllFields(fieldsArray, setFields);
        if (!noError) {
            return;
        }
        const finalObject: any = {};
        fieldsArray.forEach((item: FieldIF) => {
            finalObject[item.key] = item.value;
        });
        submitClickHandler(finalObject);
    };

    const inputWrapperClassName = {
        1: 'w-full',
        2: 'w-1/2',
        3: 'w-1/3',
        4: 'w-1/4'
    }[columns];

    return (
        <div className={cn('flex flex-wrap px-4 pt-6', className)}>
            {fieldsArray.map((item, index) => {
                const Component = mapRenderComponents[item.type];
                if (Component) {
                    return <Component key={index} index={index} fields={fieldsArray} inputWrapperClassName={inputWrapperClassName} setFields={setFields} />;
                }
                return null;
            })}
            {fieldsArray.length ? (
                <div
                    style={{
                        display: 'flex',
                        justifyContent: 'flex-end',
                        padding: '10px 11px 10px',
                        width: '100%',
                        gap: '10px'
                    }}
                >
                    {actionButtonText && (
                        <Button onClick={actionButtonClickHandler ? () => actionButtonClickHandler(fieldsArray) : undefined} outlined>
                            {actionButtonText}
                        </Button>
                    )}
                    <Button onClick={cancelClickHandler} outlined>
                        Cancel
                    </Button>
                    <Button startIcon={loadingPrimaryButton ? <Spinner size={18} /> : null} onClick={submitHandler}>
                        {loadingPrimaryButton ? 'Submitting...' : 'Submit'}
                    </Button>
                </div>
            ) : null}
        </div>
    );
};
