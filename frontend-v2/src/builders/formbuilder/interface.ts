// types.ts
export interface SelectInputIF {
    label: string;
    value: string;
}

export interface FieldConfigIF {
    mandatory?: boolean;
    letters?: boolean;
    numbers?: boolean;
    emptySpace?: boolean;
    comma?: boolean;
    positiveNumbers?: boolean;
    negativeNumbers?: boolean;
    decimals?: boolean;
    capitalLetter?: boolean;
    specialCharacters?: boolean;
    hidden?: boolean;
    disabled?: boolean;
    PDF?: boolean;
    ZIP?: boolean;
    PNG?: boolean;
    JPEG?: boolean;
    shrink?: boolean;

    minimum?: number;
    maximum?: number;
    minimumLength?: number;
    maximumLength?: number;
    minimumDigits?: number;
    maximumDigits?: number;
    textRows?: number;

    allowedSpecialCharacters?: string;
    textTransform?: string;
    exceptDomains?: string;
    onlyDomains?: string;
    minimumDate?: string;
    maximumDate?: string;
    minimumTime?: string;
    maximumTime?: string;
    minimumSize?: string;
    maximumSize?: string;
    placeholder?: string;
    redirectUrl?: string;
    text?: string;
    gradientType?: string;
    regularExpression?: string;
    dynamicKey?: string;
    optionSourceType?: 'static' | 'from code' | 'from API';
    apiEndpoint?: string;
    defaultValue?: string;

    defaultChecked?: boolean;
    expectUnchecked?: boolean;

    colums?: string; // For table fields
    rows?: string; // For table fields
    hoverAnimation?: boolean; // For link fields
    step?: number; // For rating fields

    options?: SelectInputIF[]; // Used for select-type fields
}

export type FieldConfigKeysIF = keyof FieldConfigIF;

export interface FieldIF {
    label: string;
    type:
        | 'plain_text'
        | 'number'
        | 'multiline_text'
        | 'phone_number'
        | 'email'
        | 'password'
        | 'url'
        | 'image'
        | 'color'
        | 'rating'
        | 'checkbox'
        | 'single_select'
        | 'multi_select'
        | 'date'
        | 'time'
        | 'file'
        | 'signature'
        | 'multi_string'
        | 'section_header';
    key: string;
    description: string;
    value: any;
    initialValue: any;
    errorMessage?: string;
    icon?: string;
    config: FieldConfigIF;
}

export interface InputFieldRenderPropsIF {
    index: number;
    inputWrapperClassName?: string;
    fields: FieldIF[];
    setFields: React.Dispatch<React.SetStateAction<FieldIF[]>>;
}

export interface FormSettingsIF {
    columns: number;
}

export interface FormBuilderContextType {
    loading: boolean;
    showInputType: boolean;
    setShowInputType: (state: boolean) => void;
    showChatbot: boolean;
    setShowChatbot: (state: boolean) => void;
    showSettings: number;
    setShowSettings: (state: number) => void;
    showFieldInputError: boolean;
    setShowFieldInputError: (state: boolean) => void;
    fields: FieldIF[];
    setFields: React.Dispatch<React.SetStateAction<FieldIF[]>>;
    formSettings: FormSettingsIF;
    setFormSettings: React.Dispatch<React.SetStateAction<FormSettingsIF>>;
    createForm: (name: string) => void;
    updateForm: (name: string) => void;
    getFormbuilderByIdApi: () => Promise<string>;
}
