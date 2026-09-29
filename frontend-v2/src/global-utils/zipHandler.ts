import JSZip from 'jszip';
import { TranscriptionData } from '../modules/transcript/interface';

/**
 * Processes a ZIP file response containing text files
 * @param zipBlob The ZIP file as a Blob
 * @returns Array of TranscriptionData objects with filename and content
 */
export const processZipResponse = async (zipBlob: Blob): Promise<TranscriptionData[]> => {
  try {
    const zip = new JSZip();
    const loadedZip = await zip.loadAsync(zipBlob);
    const result: TranscriptionData[] = [];

    const filePromises = Object.keys(loadedZip.files).map(async (filename) => {
      const file = loadedZip.files[filename];
      // Skip directories and non-text files
      if (file.dir || !filename.endsWith('.txt')) {
        return;
      }

      // Extract text content from the file
      const content = await file.async('text');

      // Add to result array
      result.push({
        filename,
        content,
      });
    });

    // Wait for all files to be processed
    await Promise.all(filePromises);

    // Sort files by name for consistent display
    return result.sort((a, b) => a.filename.localeCompare(b.filename));
  } catch (error) {
    console.error('Error processing ZIP file:', error);
    throw new Error('Failed to process the response ZIP file');
  }
};

export const downloadZipTxtFiles = async (zipBlob: Blob, fileName: string): Promise<void> => {
  try {
    const zip = new JSZip();
    const loadedZip = await zip.loadAsync(zipBlob);
    const file = loadedZip.files[fileName];

    if (!file || file.dir || !fileName.endsWith('.txt')) {
      console.warn(`File "${fileName}" not found or invalid.`);
      return;
    }

    const content = await file.async('blob');
    const blobUrl = URL.createObjectURL(content);

    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(blobUrl);
  } catch (error) {
    console.error('Error downloading .txt file from ZIP:', error);
    throw new Error('Failed to extract and download the specified .txt file from ZIP');
  }
};

