export const updatedFields: UpdatedFieldsIF[] = [
    {
        comment: 'PO is a 6 digit number',
        projectName: "Rehab_mart_private_PO's",
        fieldName: 'PO Number',
        jsonKey: 'po_number',
        extractedData: '12345678',
        updatedData: '123456',
        fieldAccuracy: '100%',
        createdAt: '2025-04-22T16:58:36.482Z',
        extractedBy: 'ram admin',
        pdfFileName: 'PO_Private_00114126882.pdf',
        presentSchema: {
            name: 'PO Number',
            dataType: 'str',
            jsonKey: 'po_number',
            required: false,
            excludeExtraction: false,
            description: 'Purchase Order Number',
            instruction:
                "Look for labels such as 'PO Number', 'PO #', 'Purchase Order #','Service Authorization Number' or similar. Extract the full alphanumeric identifier without any prefixes.",
            subFields: []
        }
    }
];

export interface UpdatedFieldsIF {
    comment: string;
    projectName: string;
    fieldName: string;
    jsonKey: string;
    presentSchema: PromptFieldIF;
    extractedData: string;
    updatedData: string;
    fieldAccuracy: string;
    createdAt: string;
    extractedBy: string;
    pdfFileName: string;
}
[];

interface SubFieldsIF {
    name: string;
    dataType: string;
    jsonKey: string;
    required: boolean;
    excludeExtraction: boolean;
    description: string;
    instruction: string;
}

export interface PromptFieldIF {
    name: string;
    dataType: string;
    jsonKey: string;
    required: boolean;
    excludeExtraction: boolean;
    description: string;
    instruction: string;
    subFields: SubFieldsIF[];
}
