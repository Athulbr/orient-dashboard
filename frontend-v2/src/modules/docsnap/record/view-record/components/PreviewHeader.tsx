import { ZoomOut, ZoomIn, Expand, Shrink, Download } from 'lucide-react';
import BackButton from '../../../../../components/BackButton';
import { cn } from '../../../../../global-utils/twMerge';
import { useNavigate } from 'react-router-dom';
import { useViewRecordState } from '../hooks/viewRecordContext';
import { useToastStore } from '../../../../../components/toast/ToastStore';
import { useS3Storage } from '../../../../../zustand-store/S3Storage';
import { jsPDF } from 'jspdf';
import { useState } from 'react';
import Spinner from '../../../../../components/Spinner';

interface PreviewHeaderComponentProps {
    zoom: number;
    zoomOut: () => void;
    zoomIn: () => void;
    handleZoomChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    shrinked: boolean;
    shrinkExpandHandler: () => void;
    name?: string;
}

export const PreviewHeaderComponent = ({ zoom, name, zoomOut, zoomIn, handleZoomChange, shrinked, shrinkExpandHandler }: PreviewHeaderComponentProps) => {
    const navigate = useNavigate();
    const { getS3File } = useS3Storage();
    const { state } = useViewRecordState();
    const [downloading, setDownloading] = useState(false);
    const toast = useToastStore();

    const exportToPDF = async () => {
        const images = state.images;
        if (images.length === 0) {
            alert('Please add images first');
            return;
        }

        const pdf = new jsPDF();
        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();

        for (let i = 0; i < images.length; i++) {
            if (i > 0) {
                pdf.addPage();
            }

            await new Promise((resolve, reject) => {
                const img = new Image();

                img.onload = () => {
                    const imgWidth = img.width;
                    const imgHeight = img.height;

                    // Fit to page width, maintain aspect ratio
                    const width = pageWidth;
                    const height = (imgHeight / imgWidth) * pageWidth;

                    // Start from top-left corner
                    const x = 0;
                    const y = 0;

                    pdf.addImage(images[i], 'JPEG', x, y, width, height);
                    resolve(true);
                };

                img.onerror = () => {
                    reject(new Error(`Failed to load image ${i}`));
                };

                img.src = images[i];
            });
            setDownloading(false);
        }

        pdf.save('images.pdf');
    };
    const handleDownload = async () => {
        setDownloading(true);
        try {
            if (state.record?.imageFileNames?.length > 0) {
                exportToPDF();
                return;
            }
            if (!state.record?.pdfFileName) {
                toast.error('No file to download');
                setDownloading(false);
                return;
            }

            const s3Response: any = await getS3File(state.record.pdfFileName);

            if (!s3Response?.Body?.data) {
                toast.error('File not found or invalid response');
                setDownloading(false);
                return;
            }

            // Convert the number array to Uint8Array
            const fileDataArray = s3Response.Body.data;
            const fileData = new Uint8Array(fileDataArray);

            // Determine MIME type
            const fileName = state.record.pdfFileName.split('/').pop() || 'document';
            const mimeType = fileName.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream';

            // Create blob
            const blob = new Blob([fileData], { type: mimeType });

            // Create download link
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');

            link.href = url;
            link.download = fileName;
            link.style.display = 'none';

            // Trigger download
            document.body.appendChild(link);
            link.click();

            // Cleanup with delay
            setTimeout(() => {
                window.URL.revokeObjectURL(url);
                if (document.body.contains(link)) {
                    document.body.removeChild(link);
                }
            }, 100);

            toast.success('Download started');
        } catch (error) {
            console.error('Error downloading file:', error);
            toast.error(`Download failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
            setDownloading(false);
        }
    };

    return (
        <div className="flex h-16 items-center justify-between border border-r-0 bg-white px-4">
            <div className="flex items-center gap-2">
                <BackButton />
                <span title={name} className="max-w-80 truncate text-lg">
                    {name}
                </span>
            </div>
            <div className="flex items-center gap-2 rounded-md border bg-white p-1">
                <LightIconButton Icon={ZoomOut} onClick={zoomOut} title="Zoom Out" />
                <input
                    type="range"
                    min="30"
                    max="250"
                    step="0.002"
                    value={zoom}
                    onChange={handleZoomChange}
                    className="w-36 cursor-pointer"
                    style={{
                        accentColor: '#2563eb'
                    }}
                />
                <span className="w-8 text-sm font-light text-gray-500">{zoom.toFixed(0)}%</span>
                <LightIconButton Icon={ZoomIn} onClick={zoomIn} title="Zoom In" />
                {shrinked ? <LightIconButton Icon={Expand} onClick={shrinkExpandHandler} title="Expand" /> : <LightIconButton Icon={Shrink} onClick={shrinkExpandHandler} title="Shrink" />}
            </div>
            {downloading ? <Spinner size={16} className="text-gray-400 m-2" /> : <LightIconButton Icon={Download} onClick={handleDownload} title="Download" />}
        </div>
    );
};

const LightIconButton = ({ onClick, Icon, title, iconClassName, className }: { onClick: (e: any) => void; Icon: any; title?: string; iconClassName?: string; className?: string }) => {
    const onClickHandler = (e: any) => {
        e.stopPropagation();
        onClick(e);
    };
    return (
        <span translate="no" className={cn('group relative cursor-pointer rounded-md border border-gray-50 p-1.5 hover:border-gray-200', className)} onClick={onClickHandler} unselectable="on">
            <Icon translate="no" strokeWidth={1} size={18} className={iconClassName} />
            <div
                unselectable="on"
                translate="no"
                className="absolute top-10 left-1/2 z-10 -translate-x-1/2 transform rounded bg-gray-400 px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap text-white opacity-0 transition-opacity group-hover:opacity-100"
            >
                {title}
            </div>
        </span>
    );
};

const s3Response = {
    success: true,
    data: {
        AcceptRanges: 'bytes',
        LastModified: '2025-07-17T11:13:36.000Z',
        ContentLength: 134959,
        ETag: '"784bd5509cdd559d55e74f8d6444dff8"',
        ContentType: 'application/octet-stream',
        ServerSideEncryption: 'AES256',
        Metadata: {},
        Body: {
            type: 'Buffer',
            data: [37, 80, 68, 70, 45, 49, 46, 51, 10] // removed remaining numbers
        }
    },
    message: 'File Get Successfully',
    error: null
};
