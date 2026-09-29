import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min?url';
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

export const formatFieldLabel = (fieldId: string): string => {
    return fieldId
        .split('_')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
};

export const convertPdfToImages = async (
    file: File,
    options?: {
        quality?: 'standard' | 'high';
        maxPages?: number;
    }
): Promise<string[]> => {
    try {
        const arrayBuffer = await file.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument(arrayBuffer);
        const pdf = await loadingTask.promise;

        const totalPages = pdf.numPages;
        const maxPages = options?.maxPages || 5;
        const pagesToRender = Math.min(totalPages, maxPages);

        if (totalPages > maxPages) {
            alert(`PDF has ${totalPages} pages. Only rendering the first ${maxPages} for performance.`);
        }

        const imagePromises: Promise<string>[] = [];
        const renderFunction = options?.quality === 'standard' ? renderPageToImage : renderPageToImageHighQuality;

        for (let i = 1; i <= pagesToRender; i++) {
            imagePromises.push(renderFunction(pdf, i));
        }
        const images = await Promise.all(imagePromises);
        return images;
    } catch (error: any) {
        console.error('Error converting PDF to images:', error?.message);
        return Promise.reject(error);
    }
};

const renderPageToImage = async (pdf: any, pageNumber: number): Promise<string> => {
    return new Promise(async (resolve, reject) => {
        try {
            const page = await pdf.getPage(pageNumber);

            // Increase scale for better quality (from 1.5 to 2.5)
            const scale = 2.5;
            const viewport = page.getViewport({ scale });

            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');

            if (!context) {
                return reject(new Error('Could not create canvas context'));
            }

            // Set canvas dimensions with high DPI support
            canvas.height = viewport.height;
            canvas.width = viewport.width;

            // Improve rendering quality
            context.imageSmoothingEnabled = true;
            context.imageSmoothingQuality = 'high';

            await page.render({
                canvasContext: context,
                viewport: viewport
            }).promise;

            canvas.toBlob(
                blob => {
                    if (blob) {
                        resolve(URL.createObjectURL(blob));
                    } else {
                        reject(new Error('Failed to create Blob from canvas'));
                    }
                },
                'image/png',
                1.0
            ); // Set quality to maximum (1.0)
        } catch (error) {
            reject(error);
        }
    });
};

// High-quality rendering with device pixel ratio support
const renderPageToImageHighQuality = async (pdf: any, pageNumber: number): Promise<string> => {
    return new Promise(async (resolve, reject) => {
        try {
            const page = await pdf.getPage(pageNumber);

            // Get device pixel ratio for high-DPI displays
            const devicePixelRatio = window.devicePixelRatio || 1;
            const baseScale = 2.5;
            const scale = baseScale * devicePixelRatio;

            const viewport = page.getViewport({ scale });

            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');

            if (!context) {
                return reject(new Error('Could not create canvas context'));
            }

            // Set canvas dimensions accounting for device pixel ratio
            canvas.height = viewport.height;
            canvas.width = viewport.width;

            // Improve rendering quality
            context.imageSmoothingEnabled = true;
            context.imageSmoothingQuality = 'high';

            await page.render({
                canvasContext: context,
                viewport: viewport
            }).promise;

            canvas.toBlob(
                blob => {
                    if (blob) {
                        resolve(URL.createObjectURL(blob));
                    } else {
                        reject(new Error('Failed to create Blob from canvas'));
                    }
                },
                'image/png',
                1.0
            );
        } catch (error) {
            reject(error);
        }
    });
};

export const filterExtractedDataForInvoiceGeneration = (input: any): any => {
    try {
        function extractValues(obj: any): any {
            if (Array.isArray(obj)) {
                return obj.map(item => extractValues(item));
            }

            if (obj && typeof obj === 'object') {
                if (obj.hasOwnProperty('value')) {
                    return obj.value;
                }

                const result: any = {};
                for (const key in obj) {
                    result[key] = extractValues(obj[key]);
                }
                return result;
            }

            return obj;
        }

        return extractValues(input);
    } catch (error: any) {
        console.error('Error processing data:', error.message);
        return null;
    }
};
