import { useEffect, useState } from 'react';
import { DialogComponent } from '../../../components/DialogComponent';
import DragAndDropFileInput from '../../../components/DragAndDropFileInput';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../../components/Button';
import { UseFormbuilder } from '../../../builders/formbuilder/use-formbuilder';
import httpRequest from '../../../global-utils/httpRequest';
import { useToastStore } from '../../../components/toast/ToastStore';
import { config } from '../../../config/default';
import { useDocumentExtractor } from './useDocumentExtractor';
import { excelFileToArrayOfObjects } from '../../../global-utils/excelFileToArrayOfObjects';
import { groupVariationsByPageCount } from './functions/groupVariationsByPageCount';
import { createProductWithVariationGroups } from './functions/createProductWithVariationGroups';
import { SegregatedData, SegregatedDocuments } from './SegregatedDocuments';
import * as XLSX from 'xlsx';
import { Download } from 'lucide-react';
import Spinner from '../../../components/Spinner';

import { KeywordItem, KeywordGroup, KeywordSelectionDialog } from './KeywordSelectionDialog';
import { useExtractionStore } from '../../../zustand-store/extractionStore';

interface UploadDocumentComponentIF {
    template?: any;
    closeDialog: () => void;
    showManualInputForm?: boolean;
    setShowManualInputForm?: (value: boolean) => void;
}

export const UploadDocumentComponentNew: React.FC<UploadDocumentComponentIF> = ({ closeDialog, template, showManualInputForm = false, setShowManualInputForm }) => {
    const toast = useToastStore();
    const [latestTemplate, setLatestTemplate] = useState<any>(null);
    const navigate = useNavigate();
    const { addToDocumentExtractor } = useDocumentExtractor();
    const { setShowFloatingWindow } = useExtractionStore();
    const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
    const [showSegregatedDocuments, setShowSegregatedDocuments] = useState(false);
    const module = sessionStorage.getItem('module');

    // Content-creation keyword state (bulk upload)
    const [keywordGroups, setKeywordGroups] = useState<KeywordGroup[]>([]);
    const [isFetchingKeywords, setIsFetchingKeywords] = useState(false);
    const [pendingRows, setPendingRows] = useState<any[]>([]);
    const [showBulkKeywordDialog, setShowBulkKeywordDialog] = useState(false);
    const [isSubmittingBulk, setIsSubmittingBulk] = useState(false);
    // Manual form keyword state
    const [showKeywordDialog, setShowKeywordDialog] = useState(false);
    const [pendingManualRow, setPendingManualRow] = useState<any>(null);
    const [isSubmittingManual, setIsSubmittingManual] = useState(false);


    useEffect(() => {
        if (!template._id) {
            toast.error('Template not found, Please select a template');
            closeDialog();
            return;
        }
        const getTemplate = async () => {
            const res = await httpRequest('GET', `${config.nodeApiUrl}/idp/template/${template._id}`);
            const templateSettings = res.data?.settings;
            if (!templateSettings) {
                toast.error('Template settings not found, Please update template settings');
                closeDialog();
                setTimeout(() => {
                    navigate(`/docsnap/template/settings/${template._id}`);
                }, 2000);
                return;
            }
            toast.info(`Selected Extraction engine: ${templateSettings?.extractionEngine}`, { duration: 2000 });
            setLatestTemplate(res.data);
        };
        getTemplate();
    }, []);

    const onFileDrop = async (files: File[]) => {
        if (template?.settings?.module === 'data-entry') {
            if (!files[0].name.endsWith('.xlsx')) {
                toast.error('Only .xlsx file type is supported');
                return;
            }

            const excelData = await excelFileToArrayOfObjects(files[0]);
            const groupedVariations = groupVariationsByPageCount(excelData);
            const products = createProductWithVariationGroups(groupedVariations);
            const selectedProducts = products.slice(0, Number(template?.settings?.extractionLimit) || 10);
            selectedProducts.forEach(product => {
                addToDocumentExtractor(latestTemplate, [], product);
            });
        } else if (template?.settings?.module === 'content-creation') {
            if (!files[0].name.endsWith('.xlsx')) {
                toast.error('Only .xlsx file type is supported');
                return;
            }

            const excelRows = await excelFileToArrayOfObjects(files[0]);

            // Filter out purely empty rows and the instructional row
            const validRows = excelRows.filter((row: any) => {
                const values = Object.values(row);
                return values.some((val: any) =>
                    val &&
                    String(val).trim() !== '' &&
                    !String(val).includes('links should be comma seperated')
                );
            });

            const selectedProducts = validRows.slice(0, Number(template?.settings?.extractionLimit) || 10);

            // Fetch SEO keywords for the uploaded rows
            setIsFetchingKeywords(true);
            setPendingRows(selectedProducts);
            setKeywordGroups([]);
            try {
                const res = await httpRequest('POST', `${config.mlServiceNodejs}/content-creation/get-keywords`, {
                    rows: selectedProducts
                });
                const fetched: KeywordGroup[] = (res.data || []).map((group: any, index: number) => ({
                    name: group?.name,
                    primary_keyword: group?.primary_keyword,
                    rowIndex: index,   // stamp the index so handlers don't rely on name-matching
                    rowName: selectedProducts[index]?.name || group?.name,
                    keywords: (group?.keywords || []).map((item: any) => ({
                        keyword: item?.keyword,
                        source: item?.source,
                        selected: true
                    }))
                }));
                setKeywordGroups(fetched);
                setShowBulkKeywordDialog(true);
            } catch (e) {
                toast.error('Failed to fetch SEO keywords');
                // Proceed without keywords on error
                selectedProducts.forEach((row: any) => {
                    addToDocumentExtractor(latestTemplate, [], row);
                });
                closeDialog();
            } finally {
                setIsFetchingKeywords(false);
            }
        } else if (template?.settings?.extractMultipleDocuments) {
            setSelectedFiles(files);
            setShowSegregatedDocuments(true);
        } else {
            addToDocumentExtractor(latestTemplate, files);
        }
    };


    const handleProceedWithKeywords = (groups: KeywordGroup[], comment?: string) => {
        if (!groups.length) {
            setShowBulkKeywordDialog(false);
            closeDialog();
            return;
        }
        setIsSubmittingBulk(true);
        groups.forEach((group) => {
            // Use rowIndex for precise lookup; fall back to name-match only if rowIndex missing
            const rowToProcess =
                group.rowIndex !== undefined
                    ? pendingRows[group.rowIndex]
                    : pendingRows.find((row: any) =>
                          row.name === group.name || row.primary_keyword === group.primary_keyword
                      ) ?? pendingRows[0];
            const selectedKeywords = group.keywords.filter(k => k.selected);
            addToDocumentExtractor(latestTemplate, [], { ...rowToProcess, selectedKeywords, userComment: comment }, undefined, true);
        });
        setIsSubmittingBulk(false);
        setShowBulkKeywordDialog(false);
        closeDialog();
        setShowFloatingWindow(true);
        navigate('/docsnap/record/list');
    };

    /** Per-group proceed for bulk flow — does NOT close the dialog */
    const handleProceedBulkGroup = (group: KeywordGroup, comment?: string) => {
        // Use rowIndex stamped at group-creation time — avoids the name-match
        // fallback that was silently re-uploading pendingRows[0] (Record 1)
        const rowToProcess =
            group.rowIndex !== undefined
                ? pendingRows[group.rowIndex]
                : pendingRows.find((row: any) =>
                      row.name === group.name || row.primary_keyword === group.primary_keyword
                  ) ?? pendingRows[0];
        const selectedKeywords = group.keywords.filter(k => k.selected);
        addToDocumentExtractor(latestTemplate, [], { ...rowToProcess, selectedKeywords, userComment: comment }, undefined, true);
    };

    let supportedFileTypes = ['application/pdf', 'image/*'];
    if (module === 'invoice-tracking') {
        supportedFileTypes.push('.xls');
    }
    if (module === 'data-entry' || module === 'content-creation') {
        supportedFileTypes = ['.xlsx'];
    }

    const addSegregatedDocumentsToExtraction = (files: SegregatedData) => {
        files.forEach(file => {
            file.forEach(doc => {
                const s3ImageNames = doc.pages.map(page => page.s3ImageName);
                addToDocumentExtractor(latestTemplate, selectedFiles, undefined, { documentNumber: doc.documentNumber, s3ImageNames });
            });
        });
    };

    const downloadSampleExcel = () => {
        const module = sessionStorage.getItem('module');

        if (module === 'data-entry') {
            const headers = [
                'Page Count',
                'Variation Style',
                'Product or Variation',
                'SKU',
                'Description',
                "Manufacturer's URL",
                'UOM',
                'Quantity',
                'Cost',
                'CSFP',
                'CSFP Fixed Margin',
                'Dealer Shipping Cost',
                'Additional Fees',
                'Price Method',
                'MAP',
                'Vendor Code',
                'Product Vendor',
                'Product Manufacturer',
                'Product Category',
            ];

            const rows = [
                ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
            ];

            const worksheetData = [headers, ...rows];
            const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, 'Sample');
            XLSX.writeFile(workbook, 'data_entry_sample.xlsx');
        } else {
            const headers1 = [
                'name',
                'description',
                'primary_keywords',
                // 'author',
                'product_links',
            ];

            const sampleRow1 = [
                '',
                '',
                '',
                // '',
                // '',
                'links should be comma seperated eg:-https://www.example_1.com,https://www.example_2.com/blogs.html,https://www.example_3.com/products.html'
            ];

            const worksheetData1 = [headers1, sampleRow1, Array(headers1.length).fill(''), Array(headers1.length).fill('')];
            const worksheet1 = XLSX.utils.aoa_to_sheet(worksheetData1);
            const workbook1 = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook1, worksheet1, 'Sample');
            XLSX.writeFile(workbook1, 'content_creation_sample.xlsx');
        }
    };

    const handleManualFormSubmit = async (formData: any) => {
        console.log('[Manual Form] Submitted, fetching keywords...', formData);
        // Normalize field names — form returns primaryKeyword (camelCase, possibly comma-separated)
        const rawKeyword = formData.primaryKeyword || formData.primary_keyword || formData.primary_keywords || '';
        const keywordsArray: string[] = Array.isArray(rawKeyword)
            ? rawKeyword.flatMap((k: string) => k.split(',').map((s: string) => s.trim()).filter(Boolean))
            : String(rawKeyword).split(',').map((s: string) => s.trim()).filter(Boolean);
        const normalizedFormData = {
            ...formData,
            primary_keywords: keywordsArray
        };
        setPendingManualRow(normalizedFormData);
        setIsFetchingKeywords(true);
        setShowKeywordDialog(true);
        setKeywordGroups([]);
        try {
            const res = await httpRequest('POST', `${config.mlServiceNodejs}/content-creation/get-keywords`, {
                rows: [normalizedFormData]
            });
            const fetched: KeywordGroup[] = (res.data || []).map((group: any) => ({
                name: group?.name,
                primary_keyword: group?.primary_keyword,
                rowName: normalizedFormData?.name || group?.name,
                keywords: (group?.keywords || []).map((item: any) => ({
                    keyword: item?.keyword,
                    source: item?.source,
                    selected: true
                }))
            }));
            setKeywordGroups(fetched);
        } catch (e) {
            toast.error('Failed to fetch SEO keywords, proceeding without keywords');
            addToDocumentExtractor(latestTemplate ?? template, [], formData);
            setShowKeywordDialog(false);
            setPendingManualRow(null);
        } finally {
            setIsFetchingKeywords(false);
        }
    };

    const handleManualKeywordProceed = async (groups: KeywordGroup[], comment?: string) => {
        setIsSubmittingManual(true);
        try {
            // Queue each group with skipNavigate=true, then navigate once
            groups.forEach(g => {
                const selectedKeywords = g.keywords.filter(k => k.selected);
                addToDocumentExtractor(latestTemplate ?? template, [], { ...pendingManualRow, selectedKeywords, userComment: comment }, undefined, true);
            });
            setShowKeywordDialog(false);
            setPendingManualRow(null);
            closeDialog();
            setShowManualInputForm && setShowManualInputForm(false);
            // Show floating window with all items then navigate
            setShowFloatingWindow(true);
            navigate('/docsnap/record/list');
        } finally {
            setIsSubmittingManual(false);
        }
    };

    /** Per-group proceed for manual flow — does NOT close the dialog */
    const handleManualKeywordProceedGroup = (group: KeywordGroup, comment?: string) => {
        const selectedKeywords = group.keywords.filter(k => k.selected);
        addToDocumentExtractor(latestTemplate ?? template, [], { ...pendingManualRow, selectedKeywords, userComment: comment }, undefined, true);
    };

    if (showManualInputForm) {
        return (
            <>
                <UseFormbuilder
                    isOpen={!showKeywordDialog}
                    title="Create Blog Form"
                    name="Create Blog Form"
                    className="w-230"
                    existingData={{}}
                    onSubmit={handleManualFormSubmit}
                    closeDialog={() => {
                        closeDialog();
                        setShowManualInputForm && setShowManualInputForm(false);
                    }}
                />
                <KeywordSelectionDialog
                    isOpen={showKeywordDialog}
                    keywordGroups={keywordGroups}
                    isFetching={isFetchingKeywords}
                    onClose={() => {
                        setShowKeywordDialog(false);
                        setPendingManualRow(null);
                    }}
                    onProceed={handleManualKeywordProceed}
                    onProceedGroup={handleManualKeywordProceedGroup}
                    isSubmitting={isSubmittingManual}
                />
            </>
        );
    }

    return (
        <>
            <DialogComponent
                className="flex max-h-[calc(100vh-200px)] min-h-[calc(100vh-200px)] w-[80vw] flex-col"
                name="Bulk Import"
                isOpen={!showBulkKeywordDialog}
                closeDialog={closeDialog}
                disableBlurCloseDialog
            >
                <div className="flex w-full min-h-0 flex-1 flex-col overflow-hidden p-10 pt-5">
                    {(module === 'content-creation' || module === 'data-entry') && (
                        <div className="flex w-full justify-end mb-4">
                            <Button startIcon={<Download size={14} className="text-gray-500" />} outlined onClick={downloadSampleExcel}>
                                Sample Input File
                            </Button>
                        </div>
                    )}

                    {showSegregatedDocuments && (
                        <SegregatedDocuments
                            selectedFiles={selectedFiles}
                            isOpen={showSegregatedDocuments}
                            closeDialog={closeDialog}
                            onSubmit={addSegregatedDocumentsToExtraction}
                        />
                    )}

                    {isFetchingKeywords && (
                        <div className="flex flex-col items-center justify-center gap-3 py-16">
                            <Spinner size={32} />
                            <p className="text-sm text-gray-500">Fetching SEO keywords for your content...</p>
                        </div>
                    )}

                    {!isFetchingKeywords && (
                        <DragAndDropFileInput accept={supportedFileTypes.join(', ')} onFilesChange={onFileDrop} />
                    )}
                </div>
            </DialogComponent>

            {/* Reuse KeywordSelectionDialog for bulk upload flow */}
            <KeywordSelectionDialog
                isOpen={showBulkKeywordDialog}
                keywordGroups={keywordGroups}
                isFetching={false}
                onClose={() => {
                    setShowBulkKeywordDialog(false);
                    setKeywordGroups([]);
                }}
                onProceed={handleProceedWithKeywords}
                onProceedGroup={handleProceedBulkGroup}
                isSubmitting={isSubmittingBulk}
            />
        </>
    );
};
