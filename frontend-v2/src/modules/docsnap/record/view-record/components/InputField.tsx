import { Ref, useId, useState, useRef, useEffect } from 'react'; // 1. Import Ref
import { useViewRecordState } from '../hooks/viewRecordContext';
import { CircleCheck, Eye, MessageSquareText } from 'lucide-react';
import httpRequest from '../../../../../global-utils/httpRequest';
import { config } from '../../../../../config/default';
import { CommentDialog } from './CommentDialog';
import { ConfidenceScore } from './ConfidenceScore';
import Spinner from '../../../../../components/Spinner';
import { lab } from 'd3';

interface InputFieldProps {
    label?: string;
    confidence?: string;
    errorMessage?: string;
    onMouseAction?: () => void;
    onchange: (bbox: any) => void;

    // 2. CHANGE: Use Ref<any> to allow both Objects and Functions
    ref?: Ref<any>;

    value: string;
    checked?: boolean;
    checkClickHandler?: (checked: boolean) => void;
    disabled?: boolean;
    handleRegenerateField?: () => void;
    jsonKey?: string;
    showRegenButton?: boolean;
    validationUrl?: string;
    showTextarea?: boolean;
    dataTourId?: string;
}

export const InputField = ({
    label,
    errorMessage,
    onMouseAction,
    ref,
    confidence,
    value,
    onchange,
    disabled,
    checked,
    checkClickHandler,
    jsonKey,
    handleRegenerateField,
    showRegenButton,
    validationUrl,
    showTextarea,
    dataTourId,
    ...props
}: InputFieldProps) => {
    const { state, setState } = useViewRecordState();
    const [commentDialog, setCommentDialog] = useState(false);
    const [validating, setValidating] = useState(false);
    const [validated, setValidated] = useState(false);
    const id = useId();
    const [commentList, setCommentList] = useState<{ text: string; date: string; time: string }[]>([]);

    // Internal ref for auto-height calculation
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);

    // Auto-height adjustment
    useEffect(() => {
        if (showTextarea && textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
        }
    }, [value, showTextarea]);

    const renderTemplate = (template: string, data: Record<string, string>) => {
        return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => data[key] ?? '');
    };

    const validateLink = async (validationUrl: string, value: string, label: string) => {
        if (!validationUrl.trim() || !value.trim()) return;
        if (label === 'Tracking ID') {
            setValidating(true);
            setValidated(false);
            const trackingNumber = state?.objectFields?.shipping?.tracking_id?.value || '';
            const carrierName = state?.objectFields?.shipping?.carrier?.value || '';
            const recordId = state.record._id;
            try {
                const response = await httpRequest('POST', `${config.nodeApiUrl}/idp/history/tracking_id`, {
                    tracking_number: trackingNumber,
                    carrier_name: carrierName,
                    recordId: recordId
                });
                if (response?.data?.validationStatus) {
                    setState(prev => ({
                        ...prev,
                        objectFields: {
                            ...prev.objectFields,
                            shipping: {
                                ...prev.objectFields.shipping,
                                validation: {
                                    ...(prev.objectFields.shipping?.validation || {}),
                                    value: response.data.validationStatus
                                }
                            }
                        }
                    }));
                    setValidated(true);
                    // console.log('Validation status:', response.data.validationStatus);
                    const finalUrl = renderTemplate(validationUrl, { value });
                    window.open(finalUrl, '_blank');
                }
            } catch (err) {
                console.error('Tracking ID validation error:', err);
            } finally {
                setValidating(false);
            }
            return;
        }
        const finalUrl = renderTemplate(validationUrl, { value });
        window.open(finalUrl, '_blank');
    };

    return (
        <div className={`group relative w-full min-w-0 rounded-sm p-2 pt-1`} data-tour-id={dataTourId} onClick={() => onMouseAction?.()}>
            {label && (
                <label htmlFor={id} className="flex items-center justify-between pl-1 text-gray-900 group-hover:text-[#2563eb]">
                    {label}
                    <div className="flex items-center gap-4">
                        {showRegenButton && (
                            <span
                                onClick={handleRegenerateField}
                                className="text-xs text-gray-600 cursor-pointer border px-2 py-0.5 rounded-md hover:bg-sky-50 hover:border-gray-500"
                            >
                                Regenerate
                            </span>
                        )}
                        {validationUrl && (
                            <span
                                onClick={async () => await validateLink(validationUrl, value, label)}
                                className={`text-xs border px-2 py-0.5 rounded-md cursor-pointer flex items-center gap-1
                                    ${validating
                                        ? 'text-gray-400 border-gray-300 bg-gray-50 cursor-wait'
                                        : validated
                                            ? 'text-green-600 border-green-500 bg-green-50'
                                            : 'text-gray-600 border-gray-500 hover:bg-sky-50 hover:border-gray-500'}
                                `}
                                style={{ minWidth: 60, justifyContent: 'center' }}
                            >
                                {validating ? <Spinner size={16} /> : 'Validate'}
                            </span>
                        )}
                        {confidence && <ConfidenceScore confidence={confidence} />}
                    </div>
                </label>
            )}

            <div
                className={`mt-0.5 flex w-full items-center justify-between overflow-hidden rounded-sm border ${
                    checked ? 'border border-green-500' : 'border-gray-400'
                } bg-white group-hover:border-[#2563eb] focus-within:border-[#2563eb] ${showTextarea ? 'h-auto py-2' : 'h-10.5'}`}
            >
                {showTextarea ? (
                    <textarea
                        data-gramm="false"
                        rows={1}
                        onFocus={() => onMouseAction?.()}
                        onKeyDown={e => {
                            if (e.key === 'Enter') {
                                checkClickHandler?.(true);
                            }
                        }}
                        // 3. Merging Refs Logic
                        ref={element => {
                            // Set internal ref
                            textareaRef.current = element;

                            // Handle external ref
                            if (typeof ref === 'function') {
                                ref(element);
                            } else if (ref) {
                                (ref as any).current = element;
                            }
                        }}
                        className="min-w-0 flex-1 p-3 text-gray-900 focus:outline-none border mx-1 resize-none overflow-hidden"
                        value={value ? value : ''}
                        onChange={onchange}
                        {...props}
                        disabled={disabled}
                        id={id}
                    />
                ) : (
                    <input
                        onFocus={() => onMouseAction?.()}
                        onKeyDown={e => {
                            if (e.key === 'Enter') {
                                checkClickHandler?.(true);
                            }
                        }}
                        ref={ref}
                        className="min-w-0 flex-1 px-3 text-gray-900 focus:outline-none"
                        value={value ? value : ''}
                        onChange={onchange}
                        {...props}
                        disabled={disabled}
                        id={id}
                    />
                )}

                <div className="mr-1 h-full flex items-center">
                    {checked ? (
                        <CircleCheck
                            onClick={e => {
                                e.stopPropagation();
                                checkClickHandler?.(false);
                            }}
                            className="cursor-pointer text-green-500 hover:text-green-600"
                            size={16}
                        />
                    ) : (
                        <Eye onClick={e => checkClickHandler?.(true)} className="cursor-pointer text-orange-400 hover:text-orange-500" size={16} />
                    )}
                </div>

                <div
                    onClick={() => setCommentDialog(true)}
                    className="relative flex h-full min-h-[40px] w-10 cursor-pointer items-center justify-center rounded-r-sm border-l border-gray-300 hover:bg-gray-100"
                >
                    {commentList.length > 0 && <span className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-green-600"></span>}
                    <MessageSquareText size={20} strokeWidth={1.3} />
                </div>
            </div>

            {errorMessage && <p className="mt-1 pl-1 text-xs text-red-500">{errorMessage}</p>}
            <CommentDialog
                commentList={commentList}
                setCommentList={setCommentList}
                jsonKey={jsonKey || ''}
                isOpen={commentDialog}
                closeDialog={() => setCommentDialog(false)}
            />
        </div>
    );
};
