import { useEffect, useState } from 'react';
import { DialogComponent } from '../../../components/DialogComponent';
import httpRequest from '../../../global-utils/httpRequest';
import { RenderForm } from '../render-form/RenderForm';
import { FieldIF } from '../interface';
import { config } from '../../../config/default';
import { cn } from '../../../global-utils/twMerge';

interface UseFormbuilderIF {
    isOpen?: boolean;
    className?: string;
    renderFormClassName?: string;
    existingData?: Record<string, any> | null;
    name: string;
    title?: string;
    closeDialog: () => void;
    onSubmit: (fields: FieldIF[]) => void;
    loading?: boolean;
    loadingPrimaryButton?: boolean;
    showInDialog?: boolean;
    actionButtonText?: string;
    actionButtonClickHandler?: (fields: FieldIF[]) => void;
    disableBlurCloseDialog?: boolean;
}

export const UseFormbuilder: React.FC<UseFormbuilderIF> = ({
    isOpen = true,
    name,
    closeDialog,
    onSubmit,
    existingData = null,
    className,
    renderFormClassName,
    title,
    loading,
    loadingPrimaryButton,
    showInDialog = true,
    actionButtonText,
    actionButtonClickHandler,
    disableBlurCloseDialog
}) => {
    const [fields, setFields] = useState<FieldIF[]>([]);
    const [hasError, setHasError] = useState(false);
    const [settings, setSettings] = useState({
        columns: 1
    });

    const getFormbuilder = async () => {
        try {
            const formbuilder = window?.sessionStorage?.getItem('formbuilder');
            if (formbuilder) {
                const data = JSON.parse(formbuilder);
                const formData = data.find((item: any) => item.name === name);
                if (formData?.fields?.length) {
                    setFields(formData.fields);
                    setSettings(formData.settings);
                    return;
                }
            }
            const res = await httpRequest('POST', `${config.nodeApiUrl}/builder/formbuilder/name`, { name });
            if (fields.length) return;
            setFields(res.data.fields);
            setSettings(res.data.settings);
        } catch (error) {
            console.error(error);
            setHasError(true);
        }
    };

    useEffect(() => {
        if (name) getFormbuilder();
    }, [name]);

    useEffect(() => {
        // debugger
        if (!existingData || !fields.length) return;

        const hasChanges = fields.some(field => {
            const newValue = field.type === 'checkbox' ? existingData[field.key] : existingData[field.key] || '';
            return field.value !== newValue;
        });

        if (hasChanges) {
            const updatedFields = fields.map(field => ({
                ...field,
                value: field.type === 'checkbox' ? (existingData[field.key] ?? field.value) : (existingData[field.key] ?? field.value ?? '')
            }));
            setFields(updatedFields);
        }
    }, [existingData]);

    if (hasError) {
        return null;
    }
    if (!showInDialog) {
        return (
            <RenderForm
                fields={fields}
                loadingPrimaryButton={loadingPrimaryButton}
                submitClickHandler={onSubmit}
                cancelClickHandler={closeDialog}
                columns={settings.columns}
                className={cn('px-0', renderFormClassName)}
            />
        );
    }

    return (
        <DialogComponent
            disableBlurCloseDialog={disableBlurCloseDialog}
            loading={loading || fields.length === 0}
            closeDialog={closeDialog}
            isOpen={isOpen}
            name={title ? title : name}
            className={className}
        >
            <RenderForm
                fields={fields}
                loadingPrimaryButton={loadingPrimaryButton}
                submitClickHandler={onSubmit}
                cancelClickHandler={closeDialog}
                columns={settings.columns}
                actionButtonText={actionButtonText}
                actionButtonClickHandler={actionButtonClickHandler ? fields => actionButtonClickHandler(fields) : undefined}
            />
        </DialogComponent>
    );
};
