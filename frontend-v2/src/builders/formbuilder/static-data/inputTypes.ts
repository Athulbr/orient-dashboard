import { FieldIF } from '../interface';

export const inputTypes: FieldIF[] = [
    {
        type: 'plain_text',
        label: 'Plain text',
        key: 'plain_text',
        description: 'A single-line text input field that accepts plain text and supports customizable validation rules.',
        value: '',
        initialValue: '',
        config: {
            mandatory: true,
            letters: true,
            numbers: true,
            emptySpace: true,
            comma: true,
            minimumLength: 0,
            maximumLength: 1000,
            allowedSpecialCharacters: 'all', // empty space and comma not included
            textTransform: 'none',
            placeholder: '',
            regularExpression: '',
            hidden: false,
            disabled: false,
            defaultValue: ''
        }
    },
    {
        type: 'multiline_text',
        label: 'Multiline Text',
        key: 'multiline_text',
        description: 'A multi-line text input field rendered as a textarea, ideal for longer text entries.',
        value: '',
        initialValue: '',
        config: {
            mandatory: true,
            letters: true,
            numbers: true,
            emptySpace: true,
            comma: true,
            allowedSpecialCharacters: 'all', // empty space and comma not included
            minimumLength: 0,
            maximumLength: 2000,
            textRows: 1,
            placeholder: '',
            regularExpression: '',
            hidden: false,
            disabled: false
        }
    },
    {
        type: 'number',
        label: 'Number',
        key: 'number',
        description: 'A numeric input field for entering positive or negative numbers with optional range restrictions.',
        value: 0,
        initialValue: 0,
        config: {
            mandatory: true,
            positiveNumbers: true,
            negativeNumbers: true,
            minimum: 0,
            maximum: 1000,
            minimumDigits: 0,
            maximumDigits: 1000,
            placeholder: '',
            regularExpression: '',
            hidden: false,
            disabled: false
        }
    },
    {
        type: 'phone_number',
        label: 'Phone Number',
        key: 'phone_number',
        description: 'An input field for entering phone numbers with validation for formats.',
        value: '',
        initialValue: '',
        config: {
            mandatory: true,
            minimumLength: 10,
            maximumLength: 15,
            placeholder: '',
            regularExpression: '',
            hidden: false,
            disabled: false
        }
    },
    {
        type: 'email',
        label: 'Email',
        key: 'email',
        description: 'An input field for entering valid email addresses.',
        value: '',
        initialValue: '',
        config: {
            mandatory: true,
            exceptDomains: '',
            onlyDomains: '',
            placeholder: '',
            regularExpression: '',
            hidden: false,
            disabled: false
        }
    },
    {
        type: 'password',
        label: 'Password',
        key: 'password',
        description: 'A secure input field for entering passwords with customizable rules.',
        value: '',
        initialValue: '',
        config: {
            mandatory: true,
            letters: true,
            numbers: true,
            capitalLetter: true,
            specialCharacters: true,
            minimumLength: 8,
            maximumLength: 128,
            placeholder: '',
            regularExpression: '',
            hidden: false,
            disabled: false
        }
    },
    {
        type: 'url',
        label: 'Url',
        key: 'url',
        description: 'An input field for entering valid URLs.',
        value: '',
        initialValue: '',
        config: {
            mandatory: true,
            exceptDomains: '',
            onlyDomains: '',
            placeholder: '',
            regularExpression: '',
            hidden: false,
            disabled: false
        }
    },
    {
        type: 'date',
        label: 'Date',
        key: 'date',
        description: 'An input field for selecting dates.',
        value: '',
        initialValue: '',
        config: {
            mandatory: true,
            minimumDate: '',
            maximumDate: '',
            hidden: false,
            disabled: false
        }
    },
    {
        type: 'time',
        label: 'Time',
        key: 'time',
        description: 'An input field for selecting time.',
        value: '',
        initialValue: '',
        config: {
            mandatory: true,
            minimumTime: '',
            maximumTime: '',
            hidden: false,
            disabled: false
        }
    },
    {
        type: 'image',
        label: 'Image',
        key: 'image',
        description: 'An input field for uploading images.',
        value: null,
        initialValue: null,
        config: {
            mandatory: true,
            PNG: true,
            JPEG: true,
            minimumSize: '',
            maximumSize: '',
            placeholder: '',
            hidden: false,
            disabled: false
        }
    },
    {
        type: 'file',
        label: 'File',
        key: 'file',
        description: 'An input field for uploading files.',
        value: null,
        initialValue: null,
        config: {
            mandatory: true,
            PDF: true,
            ZIP: true,
            PNG: true,
            JPEG: true,
            minimumSize: '',
            maximumSize: '',
            placeholder: '',
            hidden: false,
            disabled: false
        }
    },
    {
        type: 'color',
        label: 'Color',
        key: 'color',
        description: 'An input field for selecting colors. user can select gradient color',
        value: ['#ff0000', '#008000', '#0000ff'], // multiple colors for gradient color
        initialValue: ['#ff0000', '#008000', '#0000ff'],
        config: {
            mandatory: true,
            gradientType: 'to right',
            hidden: false,
            disabled: false
        }
    },
    {
        type: 'rating',
        label: 'Rating',
        key: 'rating',
        description: 'A field to provide a star rating or similar scale input.',
        value: 0,
        initialValue: 0,
        config: {
            mandatory: true,
            hidden: false,
            disabled: false
        }
    },
    {
        type: 'checkbox',
        label: 'Checkbox',
        key: 'checkbox',
        description: 'A field for selecting true/false or multiple options.',
        value: false,
        initialValue: false,
        config: {
            mandatory: true,
            expectUnchecked: false,
            defaultChecked: false,
            hidden: false,
            disabled: false,
            shrink: false
        }
    },
    {
        type: 'single_select',
        label: 'Single Select',
        key: 'single_select',
        description: 'A dropdown field to select one option from a predefined list. options are comma seperated strings',
        value: '',
        initialValue: '',
        config: {
            mandatory: true,
            dynamicKey: '',
            apiEndpoint: '',
            optionSourceType: 'static',
            options: [], // Ex: [{label:"Apple", value:"apple"}]
            hidden: false,
            disabled: false,
            defaultValue: ''
        }
    },
    {
        type: 'multi_select',
        label: 'Multi Select',
        key: 'multi_select',
        description: 'A dropdown field to select multiple options from a predefined list. options are comma seperated strings',
        value: '',
        initialValue: '',
        config: {
            mandatory: true,
            dynamicKey: '',
            apiEndpoint: '',
            optionSourceType: 'static',
            options: [], // Ex: [{label:"Apple", value:"apple"}]
            minimum: 0,
            maximum: 1000,
            hidden: false,
            disabled: false
        }
    },
    {
        type: 'signature',
        label: 'Signature',
        key: 'signature',
        description: 'A field for capturing digital signatures.',
        value: null,
        initialValue: null,
        config: {
            mandatory: true,
            hidden: false,
            disabled: false
        }
    },
    {
        type: 'multi_string',
        label: 'Multi String',
        key: 'multi_string',
        description: 'A field for entering multiple strings, array of strings',
        value: [],
        initialValue: [],
        config: {
            mandatory: true,
            minimum: 0,
            maximum: 10,
            placeholder: '',
            hidden: false,
            disabled: false
        }
    },
    {
        type: 'section_header',
        label: 'Section Header',
        key: 'section_header',
        description: 'A non-input field used to display a section header.',
        value: '',
        initialValue: '',
        config: {}
    }
];

// {
//   type: 'table',
//   label: '',
//   key: '',
//   description: 'A field for tabular data entry.',
//   value: [],
//   initialValue: [],
//   config: {
//     mandatory: true,
//     letters: true,
//     numbers: true,
//     colums: '',
//     rows: '',
//     hidden: false,
//     disabled: false,
//   },
// },
// {
//   type: 'link',
//   label: '',
//   key: '',
//   description: 'A field for displaying hyperlinks or redirect links',
//   value: '',
//   initialValue: '',
//   config: {
//     mandatory: true,
//     hoverAnimation: true,
//     text: '',
//     redirectUrl: '',
//     hidden: false,
//     disabled: false,
//   },
// {
//   type: 'camera',
//   label: '',
//   key: '',
//   description: 'A field to capture images using the device camera.',
//   value: null,
//   initialValue: null,
//   config: {
//     mandatory: true,
//     placeholder: '',
//     hidden: false,
//     disabled: false,
//   },
// },
// },
