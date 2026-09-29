import { ExcelSheetConfig } from '../builder';

export const sampleExcelTemplate: ExcelSheetConfig[] = [
    {
        id: '',
        sheetName: 'Sheet 1 (Games)',
        columns: [
            { id: '', columnName: 'Name', jsonPath: 'name', javascript: '' },
            { id: '', columnName: 'Email', jsonPath: 'email', javascript: '' },
            // ADDED: New JavaScript column
            {
                id: '',
                columnName: 'Name with Email',
                jsonPath: '', // jsonPath is ignored when javascript is present
                javascript: 'function(data){ return data?.name +"_"+(data?.email || "N/A"); }'
            },
            { id: '', columnName: 'Game Name', jsonPath: 'extra.hobbies[*].name.value', javascript: '' },
            { id: '', columnName: 'Game Type', jsonPath: 'extra.hobbies[*].type.value', javascript: '' }
        ]
    },
    {
        id: '',
        sheetName: 'Sheet 2 (Hobbies)',
        columns: [
            { id: '', columnName: 'Name', jsonPath: 'name', javascript: '' },
            { id: '', columnName: 'Age', jsonPath: 'age', javascript: '' },
            { id: '', columnName: 'Hobby Name', jsonPath: 'hobbies[*].name.value', javascript: '' },
            { id: '', columnName: 'Hobby Type', jsonPath: 'hobbies[*].type.value', javascript: '' }
        ]
    }
];
