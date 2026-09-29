import { FC, useState, useRef, useEffect } from 'react';
import { Download, Expand, Shrink, ZoomIn, ZoomOut } from 'lucide-react';
import FullScreenLoader from '../../../../../components/FullScreenLoader';
import { useUpdateTemplateState } from '../hooks/updateTemplateContext';
import { cn } from '../../../../../global-utils/twMerge';
import { useS3Storage } from '../../../../../zustand-store/S3Storage';
import { useUpdateTemplatePageApi } from '../hooks/useUpdateTemplateApi';
import { useParams } from 'react-router-dom';

interface ImageViewerProps {
    images: string[];
    name?: string;
}

export const ImageViewer: FC<ImageViewerProps> = ({ images, name = 'Document Name' }) => {
    const [zoom, setZoom] = useState(100);
    const [shrinked, setShrinked] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const { state } = useUpdateTemplateState();
    const { uploadS3File } = useS3Storage();
    const [uploadingFile, setUploadingFile] = useState(false);
    const { updateTemplateApi } = useUpdateTemplatePageApi();
    const { id } = useParams();

    const zoomIn = () => {
        const newZoom = Math.min(zoom + 10, 200);
        setZoom(newZoom);
    };

    const zoomOut = () => {
        const newZoom = Math.max(zoom - 10, 50);
        setZoom(newZoom);
    };

    const handleZoomChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newZoom = Number(e.target.value);
        setZoom(newZoom);
    };

    useEffect(() => {
        if (zoom > 100 && containerRef.current) {
            const container = containerRef.current;
            const scrollLeft = (container.scrollWidth - container.clientWidth) / 2;
            container.scrollTo({
                left: scrollLeft,
                behavior: 'smooth'
            });
        }
    }, [zoom]);

    const download = () => {
        const link = document.createElement('a');
        link.href = images[0];
        link.download = name;
        link.click();
    };

    const shrinkExpandHandler = () => {
        setZoom(shrinked ? 100 : 60);
        setShrinked(!shrinked);
    };

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setUploadingFile(true);
            const response = await uploadS3File(file);
            const requestBody = {
                s3FileName: response?.fileName
            };
            if (!id) return;
            updateTemplateApi(id, requestBody, true);
        }
    };

    return (
        <div className="flex h-full w-full flex-col">
            <div className="flex h-16 items-center justify-between border border-r-0 bg-white px-4">
                <span className="max-w-50 truncate text-lg">{name}</span>
                <div className="flex items-center gap-2 rounded-md border bg-white p-1">
                    <LightIconButton Icon={ZoomOut} onClick={zoomOut} title="Zoom Out" />
                    <input type="range" min="30" max="200" step={0.002} value={zoom} onChange={handleZoomChange} className="w-36 cursor-pointer" />
                    <span className="w-8 text-sm font-light text-gray-500">{zoom.toFixed(0)}%</span>
                    <LightIconButton Icon={ZoomIn} onClick={zoomIn} title="Zoom In" />
                    {shrinked ? (
                        <LightIconButton Icon={Expand} onClick={shrinkExpandHandler} title="Expand" />
                    ) : (
                        <LightIconButton Icon={Shrink} onClick={shrinkExpandHandler} title="Shrink" />
                    )}
                </div>
                <LightIconButton Icon={Download} onClick={download} title="Download" />
            </div>
            {state.loadingS3File ? (
                <FullScreenLoader className="relative bottom-10" text="Loading Document..." />
            ) : state.noS3File ? (
                <div className="flex h-full w-full items-center justify-center ">
                    <div className="flex items-center gap-2 flex-col">
                        {uploadingFile ? <FullScreenLoader text="Uploading Document..." /> : <FileInput handleUpload={handleUpload} />}
                    </div>
                </div>
            ) : (
                <div
                    ref={containerRef}
                    className={`relative flex h-full flex-col gap-6 overflow-auto bg-gray-50 pt-8 pb-50 shadow ${zoom > 100 ? 'items-start' : 'items-center'}`}
                >
                    {images.map((imgSrc, index) => (
                        <div
                            className="w-fit bg-green-500 shadow-xl shadow-gray-400"
                            style={{
                                width: `${zoom - 10}%`,
                                height: 'auto'
                            }}
                            key={index}
                        >
                            <img src={imgSrc} alt={`image-${index}`} className="h-full w-full transition-all duration-300" />
                        </div>
                    ))}
                    <FileInput handleUpload={handleUpload} />
                    <div className="absolute top-0 right-0 z-10 h-full w-1 shadow-2xl shadow-gray-500"></div>
                </div>
            )}
        </div>
    );
};

export const LightIconButton = ({
    onClick,
    Icon,
    title,
    iconClassName,
    className
}: {
    onClick: (e: any) => void;
    Icon: any;
    title?: string;
    iconClassName?: string;
    className?: string;
}) => {
    const onClickHandler = (e: any) => {
        e.stopPropagation();
        onClick(e);
    };
    return (
        <span className={cn('group relative cursor-pointer rounded-md border border-gray-50 p-1.5 hover:border-gray-200', className)} onClick={onClickHandler}>
            <Icon strokeWidth={1} size={18} className={iconClassName} />
            <div className="absolute bottom-9 left-1/2 z-10 -translate-x-1/2 transform rounded-md bg-gray-400 px-2 py-0.5 text-xs whitespace-nowrap text-white opacity-0 transition-opacity group-hover:opacity-100">
                {title}
            </div>
        </span>
    );
};

const FileInput = ({ handleUpload }: any) => {
    return (
        <label
            htmlFor="file-upload"
            className="
// Layout and Positioning
relative
mt-20
inline-block // Important: Makes the label size only around its content
cursor-pointer

// Appearance
text-sm
py-3
px-6
border
rounded-lg
shadow-md
transition
duration-300
ease-in-out


// Hover Effect
hover:bg-blue-100
hover:shadow-lg
// Focus for accessibility
focus:outline-none 
focus:ring-4 
focus:ring-blue-300
"
        >
            Choose File to Upload
            <input
                id="file-upload" // Link the label with 'htmlFor' to this ID
                type="file"
                onChange={handleUpload}
                // Visually Hides the default input but keeps it accessible and functional
                className="
  sr-only // Tailwind's screen-reader-only utility
"
            />
        </label>
    );
};
