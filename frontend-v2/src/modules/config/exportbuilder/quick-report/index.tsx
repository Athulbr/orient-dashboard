import { useState } from 'react';
import { ExcelExportDialogNew } from '../../../../builders/excelbuilder/preview';
import BackButton from '../../../../components/BackButton';
import { Button } from '../../../../components/Button';
import Spinner from '../../../../components/Spinner';
import { ExcelExportBuilder, ExcelSheetConfig } from '../../../../builders/excelbuilder/builder';
import { cn } from '../../../../global-utils/twMerge';
import { ChatWindow } from './ChatWindow';

interface ExportQuickReportPageIF {
    test?: string;
}

const ExportQuickReportPage: React.FC<ExportQuickReportPageIF> = () => {
    const [sheets, setSheets] = useState<ExcelSheetConfig[]>([{ id: '1', sheetName: 'Sheet 1', columns: [{ id: '1', columnName: 'Name', jsonPath: 'name' }] }]);
    const [records, setRecords] = useState<any[]>([]);
    return (
        <div className="absolute top-0 left-0 w-screen h-screen bg-white max-h-screen flex flex-col">
            <header className="flex items-center gap-4 p-3 justify-between">
                <div className="flex items-center gap-2">
                    <BackButton />
                    <div className=" w-full text-xl font-semibold text-gray-800">Quick Report</div>
                </div>
            </header>
            <ExcelExportDialogNew template={sheets} inputData={records} />
            <ChatWindow setRecords={setRecords} />
        </div>
    );
};

export default ExportQuickReportPage;
