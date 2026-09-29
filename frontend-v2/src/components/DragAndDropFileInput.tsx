import { FileUp } from 'lucide-react';
import React, { useCallback, useState, useRef } from 'react';
import { cn } from '../global-utils/twMerge';

interface FileInputProps {
    /** Callback function called when files are selected/dropped */
    onFilesChange: (files: File[]) => void;

    /** Callback function for file validation errors */
    onError?: (message: string, files: File[]) => void;

    /** Array of allowed file types (MIME types) */
    allowedTypes?: string[];

    /** Array of allowed file extensions (e.g., ['.pdf', '.jpg', '.png']) */
    allowedExtensions?: string[];

    /** Maximum file size in bytes */
    maxFileSize?: number;

    /** Maximum number of files allowed */
    maxFiles?: number;

    /** Whether to allow multiple file selection */
    multiple?: boolean;

    /** Accept attribute for the file input (fallback if allowedTypes not provided) */
    accept?: string;

    /** Custom validation function */
    customValidator?: (file: File) => { isValid: boolean; errorMessage?: string };

    /** Whether the component is disabled */
    disabled?: boolean;

    /** Custom class name for the container */
    className?: string;

    /** Custom content for the drop zone */
    children?: React.ReactNode;

    /** Text displayed in the drop zone */
    dropText?: string;

    /** Text for the browse link */
    browseText?: string;

    /** Icon component to display */
    icon?: React.ReactNode;

    /** Icon size */
    iconSize?: number;
}

const GenericFileInput: React.FC<FileInputProps> = ({
    onFilesChange,
    onError,
    allowedTypes = [],
    allowedExtensions = [],
    maxFileSize,
    maxFiles = 10,
    multiple = true,
    accept,
    customValidator,
    disabled = false,
    className = '',
    children,
    dropText = 'Drag & drop files here',
    browseText = 'Browse',
    icon,
    iconSize = 70
}) => {
    const [isDragging, setIsDragging] = useState(false);
    const [dragCounter, setDragCounter] = useState(0);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Helper function to check file type
    const isFileTypeAllowed = useCallback(
        (file: File): boolean => {
            if (allowedTypes.length === 0 && allowedExtensions.length === 0) {
                return true; // No restrictions
            }

            // Check MIME type
            if (allowedTypes.length > 0) {
                const isTypeAllowed = allowedTypes.some(type => {
                    if (type.endsWith('/*')) {
                        return file.type.startsWith(type.slice(0, -1));
                    }
                    return file.type === type;
                });
                if (isTypeAllowed) return true;
            }

            // Check file extension
            if (allowedExtensions.length > 0) {
                const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
                const isExtensionAllowed = allowedExtensions.some(ext => ext.toLowerCase() === fileExtension);
                if (isExtensionAllowed) return true;
            }

            return false;
        },
        [allowedTypes, allowedExtensions]
    );

    // Helper function to format file size
    const formatFileSize = useCallback((bytes: number): string => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }, []);

    // Validate files
    const validateFiles = useCallback(
        (files: File[]): { validFiles: File[]; errors: string[] } => {
            const validFiles: File[] = [];
            const errors: string[] = [];

            // Check max files limit - but still process files up to the limit
            if (files.length > maxFiles) {
                errors.push(`Maximum ${maxFiles} files allowed. You selected ${files.length} files. Only the first ${maxFiles} will be processed.`);
            }

            // Process files up to maxFiles limit
            const filesToProcess = files.slice(0, maxFiles);

            for (const file of filesToProcess) {
                let isValid = true;
                let errorMessage = '';

                // Check file type
                if (!isFileTypeAllowed(file)) {
                    isValid = false;
                    const typesList = allowedTypes.length > 0 ? allowedTypes.join(', ') : allowedExtensions.join(', ');
                    errorMessage = `File type not allowed: ${file.name}. Allowed types: ${typesList}`;
                }

                // Check file size
                if (isValid && maxFileSize && file.size > maxFileSize) {
                    isValid = false;
                    errorMessage = `File too large: ${file.name} (${formatFileSize(file.size)}). Maximum size: ${formatFileSize(maxFileSize)}`;
                }

                // Custom validation
                if (isValid && customValidator) {
                    const customResult = customValidator(file);
                    if (!customResult.isValid) {
                        isValid = false;
                        errorMessage = customResult.errorMessage || `Custom validation failed for ${file.name}`;
                    }
                }

                if (isValid) {
                    validFiles.push(file);
                } else {
                    errors.push(errorMessage);
                }
            }

            return { validFiles, errors };
        },
        [allowedTypes, allowedExtensions, maxFileSize, maxFiles, customValidator, isFileTypeAllowed, formatFileSize]
    );

    // Handle files (common logic for drop and input change)
    const handleFiles = useCallback(
        (fileList: FileList) => {
            const files = Array.from(fileList);
            const { validFiles, errors } = validateFiles(files);

            if (validFiles.length > 0) {
                onFilesChange(validFiles);
            }

            if (errors.length > 0 && onError) {
                onError(
                    errors.join('\n'),
                    files.filter(f => !validFiles.includes(f))
                );
            }
        },
        [validateFiles, onFilesChange, onError]
    );

    // Drag event handlers
    const handleDragEnter = useCallback(
        (e: React.DragEvent<HTMLDivElement>) => {
            e.preventDefault();
            e.stopPropagation();

            setDragCounter(prev => prev + 1);
            if (!isDragging) {
                setIsDragging(true);
            }
        },
        [isDragging]
    );

    const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();

        setDragCounter(prev => {
            const newCounter = prev - 1;
            if (newCounter === 0) {
                setIsDragging(false);
            }
            return newCounter;
        });
    }, []);

    const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
    }, []);

    const handleDrop = useCallback(
        (e: React.DragEvent<HTMLDivElement>) => {
            e.preventDefault();
            e.stopPropagation();

            setIsDragging(false);
            setDragCounter(0);

            if (disabled) return;

            const files = e.dataTransfer.files;
            if (files.length > 0) {
                handleFiles(files);
            }
        },
        [disabled, handleFiles]
    );

    // Click handler
    const handleClick = useCallback(() => {
        if (disabled) return;
        fileInputRef.current?.click();
    }, [disabled]);

    // Input change handler
    const handleInputChange = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            const files = e.target.files;
            if (files && files.length > 0) {
                handleFiles(files);
            }
            // Reset input value to allow selecting the same file again
            e.target.value = '';
        },
        [handleFiles]
    );

    // Generate accept attribute
    const acceptAttribute =
        accept || (allowedTypes.length > 0 ? allowedTypes.join(',') : allowedExtensions.length > 0 ? allowedExtensions.join(',') : undefined);

    const baseClasses = `
    flex h-full w-full flex-1 cursor-pointer flex-col items-center justify-center gap-1 
    rounded-lg border-2 transition-all duration-200 ease-in-out
    ${disabled ? 'cursor-not-allowed opacity-50' : ''}
    ${isDragging ? 'border-blue-500 bg-blue-50 scale-[1.02]' : 'border-dashed border-gray-300 hover:border-sky-400 hover:bg-sky-50'}
    ${className}
  `
        .replace(/\s+/g, ' ')
        .trim();

    const defaultIcon = icon || (
        <FileUp strokeWidth={1.5} size={iconSize} className={`transition-colors duration-200 ${isDragging ? 'text-blue-600' : 'text-sky-600'}`} />
    );

    return (
        <div
            className={cn(baseClasses, 'p-4')}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onClick={handleClick}
            role="button"
            tabIndex={disabled ? -1 : 0}
            aria-label="File upload area"
            onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleClick();
                }
            }}
        >
            <input
                ref={fileInputRef}
                accept={acceptAttribute}
                type="file"
                className="hidden"
                multiple={multiple}
                onChange={handleInputChange}
                disabled={disabled}
                aria-hidden="true"
            />

            {children || (
                <>
                    {defaultIcon}
                    <p className={`mt-2 font-semibold transition-colors duration-200 ${isDragging ? 'text-blue-800' : 'text-gray-800'}`}>{dropText}</p>
                    <div className="text-gray-600">
                        or <span className={`underline transition-colors duration-200 ${isDragging ? 'text-blue-600' : 'text-sky-500'}`}>{browseText}</span>
                    </div>
                </>
            )}
        </div>
    );
};

export default GenericFileInput;
