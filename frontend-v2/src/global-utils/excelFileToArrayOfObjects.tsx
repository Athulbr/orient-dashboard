import * as XLSX from 'xlsx';

export async function excelFileToArrayOfObjects(file: File): Promise<any[]> {
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    // If a cell has a hyperlink, replace its value with the actual target URL
    const rangeStr = sheet['!ref'];
    if (rangeStr) {
        const range = XLSX.utils.decode_range(rangeStr);
        for (let R = range.s.r; R <= range.e.r; ++R) {
            for (let C = range.s.c; C <= range.e.c; ++C) {
                const cellAddress = XLSX.utils.encode_cell({ c: C, r: R });
                const cell = sheet[cellAddress];
                if (cell && cell.l && cell.l.Target) {
                    cell.v = cell.l.Target;
                    cell.w = cell.l.Target;
                }
            }
        }
    }
    const json = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    return json;
}
