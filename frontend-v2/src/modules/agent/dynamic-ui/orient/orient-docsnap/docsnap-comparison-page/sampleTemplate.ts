const sampleTemplate = {
    _id: '69e388888737182ab6ead30c',
    name: 'Orient Document Extractor V1',
    settings: {
        llmProvider: 'gemini',
        llmModel: 'gemini-2.5-pro',
        extractionLimit: 10,
        disableBoundingBox: false,
        alignmentCorrection: false,
        includeOcrTextForExtraction: false
    },
    sections: [
        {
            id: 'e8be5885-5082-4e52-a4ca-161a8958371d',
            type: 'group',
            key: 'passport',
            label: 'Passport',
            instruction: 'All the field values must be extracted from passport, not from any other document.',
            fields: [
                {
                    id: '8124b2c2-86a1-4ff6-8481-88c7e2f95941',
                    key: 'passport_number',
                    label: 'Passport Number',
                    instruction: "Example: 'R1905362', hint: Extract passport number from passport.",
                    enums: [],
                    validationScript: '',
                    excludeExtraction: false,
                    hidden: false,
                    isTextarea: false,
                    required: false,
                    regularExpression: ''
                },
                {
                    id: '3d4701b4-c342-411a-af94-8d3f5aa06f92',
                    key: 'passport_issued_from',
                    label: 'Passport Issued From',
                    instruction: 'hint: Extract passport issued location from passport.',
                    enums: [],
                    validationScript: '',
                    excludeExtraction: false,
                    hidden: false,
                    isTextarea: false,
                    required: false,
                    regularExpression: ''
                },
                {
                    id: '230d6829-7d68-428a-a724-c394cffcb1dc',
                    key: 'passport_issue_date',
                    label: 'Passport Issue Date',
                    instruction: 'Format: DD-MMM-YYYYY, hint: Extract issue date from passport',
                    enums: [],
                    validationScript: '',
                    excludeExtraction: false,
                    hidden: false,
                    isTextarea: false,
                    required: false,
                    regularExpression: ''
                },
                {
                    id: '4d50c02a-8a06-4799-94e8-b94125282048',
                    key: 'passport_expiry_date',
                    label: 'Passport Expiry Date',
                    instruction: 'Format: DD-MMM-YYYYY, hint: Extract expiry date from passport',
                    enums: [],
                    validationScript: '',
                    excludeExtraction: false,
                    hidden: false,
                    isTextarea: false,
                    required: false,
                    regularExpression: ''
                },
                {
                    id: '942a31e4-7e31-4876-9979-7e0330d567a8',
                    key: 'date_of_birth',
                    label: 'Date of Birth',
                    instruction: 'Format: DD-MMM-YYYYY, hint: Extract date of birth from passport',
                    enums: [],
                    validationScript: '',
                    excludeExtraction: false,
                    hidden: false,
                    isTextarea: false,
                    required: false,
                    regularExpression: ''
                },
                {
                    id: 'ad665918-842e-4204-b03f-019b9f63f592',
                    key: 'gender',
                    label: 'Gender',
                    instruction: "Enums: 'MALE', 'FEMALE', 'OTHER', hint: Extract gender from Passport.",
                    enums: ['MALE', 'FEMALE', 'OTHER'],
                    validationScript: '',
                    excludeExtraction: false,
                    hidden: false,
                    isTextarea: false,
                    required: false,
                    regularExpression: ''
                },
                {
                    id: 'ced1e2e7-1220-463a-8efa-9db592d0e0ff',
                    key: 'nationality',
                    label: 'Nationality',
                    instruction: "Eg: 'INDIAN', hint: Extract nationality from passport",
                    enums: ['INDIAN'],
                    validationScript: '',
                    excludeExtraction: false,
                    hidden: false,
                    isTextarea: false,
                    required: false,
                    regularExpression: ''
                },
                {
                    id: 'fd9a9dc2-c904-43db-b5b9-2c89bf2ac002',
                    key: 'first_name',
                    label: 'First Name',
                    instruction: 'hint: Extract first name from passport',
                    enums: [],
                    validationScript: '',
                    excludeExtraction: false,
                    hidden: false,
                    isTextarea: false,
                    required: false,
                    regularExpression: ''
                },
                {
                    id: '12a50675-8ff4-4624-9d94-8fff212293c5',
                    key: 'last_name',
                    label: 'Last Name',
                    instruction: 'hint: Extract first last from passport',
                    enums: [],
                    validationScript: '',
                    excludeExtraction: false,
                    hidden: false,
                    isTextarea: false,
                    required: false,
                    regularExpression: ''
                }
            ]
        },
        {
            id: '7fc56d05-0f22-46da-a9b3-54aae042830b',
            type: 'table',
            key: 'receipts',
            label: 'Receipts',
            instruction: 'Extract all fileds',
            fields: [
                // Columns
                {
                    id: '1f422a31-e1cf-4475-a1d2-91be887e4736',
                    key: 'payment_type',
                    label: 'Payment Type',
                    instruction: 'Extract payment type, hint: Extract from receipt',
                    enums: [],
                    validationScript: '',
                    excludeExtraction: false,
                    hidden: false,
                    isTextarea: false,
                    required: false,
                    regularExpression: ''
                }, // column 1
                {
                    id: '86a220b1-4a32-445c-af7f-53b78558f27f',
                    key: 'amount',
                    label: 'Amount',
                    instruction: 'Extract amount, hint: Extract from receipt',
                    enums: [],
                    validationScript: '',
                    excludeExtraction: false,
                    hidden: false,
                    isTextarea: false,
                    required: false,
                    regularExpression: ''
                } // column 2
            ]
        }
    ],
    deleted: false,
    createdAt: '2026-04-18T13:35:04.246Z',
    updatedAt: '2026-04-19T05:27:44.400Z',
    __v: 0
};
