import { useState, useEffect } from 'react';
import { Sparkles, Trash2 } from 'lucide-react';
import { Button } from '../../../components/Button';
import CreateNewImageDialog from './CreateNewImageDialog';
import { useContentCreationEditorState } from '../hooks/DocumentCreationEditorContext';
import { useToastStore } from '../../../components/toast/ToastStore';

export default function ImagesTab() {
    const [createModalOpen, setCreateModalOpen] = useState(false);
    const { state, setState } = useContentCreationEditorState();
    const toast = useToastStore();
    const [images, setImages] = useState<{ id: string; title: string; src: string }[]>([]);

    // -------------------------------------------------------------------------
    // Delete an image from the gallery and revert its position in the editor
    // -------------------------------------------------------------------------
    const handleDeleteImage = (imgObj: any) => {
        setImages(prev => prev.filter(i => i.id !== imgObj.id));

        if (state.extractedData?.rowData) {
            const updatedImageList = images
                .filter(i => i.id !== imgObj.id)
                .map(img => ({ url: img.src, title: img.title }));
            state.extractedData.rowData.imageList = updatedImageList;
        }

        if (state.content) {
            const parser = new DOMParser();
            const doc = parser.parseFromString(state.content, 'text/html');
            const imgTags = Array.from(doc.querySelectorAll('img'));
            let replaced = false;

            for (const domImg of imgTags) {
                const currentSrc = domImg.getAttribute('src') || domImg.src;
                if (currentSrc === imgObj.src) {
                    domImg.setAttribute('src', 'https://placehold.co/600x400/f0f2f5/8b949e?text=Supporting+Image');
                    replaced = true;
                }
            }

            if (replaced) {
                setState(prev => ({ ...prev, content: doc.body.innerHTML }));
                toast.success('Image removed from gallery.');
            } else {
                toast.success('Image removed from gallery.');
            }
        }
    };

    // -------------------------------------------------------------------------
    // Sync gallery from the imageList stored in rowData
    // -------------------------------------------------------------------------
    useEffect(() => {
        const imageList = state.extractedData?.rowData?.imageList;

        if (imageList && Array.isArray(imageList) && imageList.length > 0) {
            const mappedImages = imageList
                .map((img: any, idx: number) => ({
                    id: `row-img-${idx}`,
                    title: img.title || `Supporting Image ${idx + 1}`,
                    src: img.url || '',
                }))
                .filter(img => img.src);
            setImages(mappedImages);
        } else if (Array.isArray(imageList)) {
            // imageList exists but is empty — so the gallery is cleared
            setImages([]);
        }
    }, [state.extractedData?.rowData?.imageList]);

    // -------------------------------------------------------------------------
    // Replace a single image in-place (regenerate mode)
    // -------------------------------------------------------------------------
    const handleImageReplaced = (oldImage: { id: string; src: string }, newUrl: string) => {
        setImages(prev => {
            const updated = prev.map(i => i.id === oldImage.id ? { ...i, src: newUrl } : i);

            if (state.extractedData?.rowData) {
                state.extractedData.rowData.imageList = updated.map(img => ({ url: img.src, title: img.title }));
                setState(s => ({ ...s, extractedData: state.extractedData }));
            }

            return updated;
        });

        // Also swap the src in the editor content if it exists there
        if (state.content) {
            const parser = new DOMParser();
            const doc = parser.parseFromString(state.content, 'text/html');
            doc.querySelectorAll('img').forEach(domImg => {
                if ((domImg.getAttribute('src') || domImg.src) === oldImage.src) {
                    domImg.setAttribute('src', newUrl);
                }
            });
            setState(prev => ({ ...prev, content: doc.body.innerHTML }));
        }

        toast.success('Supporting image regenerated successfully.');
    };

    const handleImagesGenerated = (urls: string[], titles?: string[]) => {
        const newImages = urls.map((url, idx) => ({
            id: `new-gen-${Date.now()}-${idx}`,
            title: titles?.[idx] || `Supporting Image ${idx + 1}`,
            src: url,
        }));

        setImages(prev => {
            const updated = [...prev, ...newImages];

            if (state.extractedData) {
                if (!state.extractedData.rowData) state.extractedData.rowData = {};
                state.extractedData.rowData.imageList = updated.map(img => ({ url: img.src, title: img.title }));
                setState(s => ({ ...s, extractedData: state.extractedData }));
            }

            return updated;
        });
    };

    return (
        <div className="flex flex-col h-full min-h-0 w-full bg-white">
            {/* Header */}
            <div className="p-4 border-b flex flex-col gap-3">
                <div className="flex flex-col gap-1">
                    <h3 className="text-lg font-semibold text-gray-900">Supporting Images</h3>
                    <p className="text-sm text-gray-500">
                        AI-generated images that visually represent the problem or scenario in your article.
                        Drag &amp; drop into the editor.
                    </p>
                </div>
                <div className="flex items-center gap-3 mt-1">
                    <button
                        onClick={() => setCreateModalOpen(true)}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700 transition-colors border border-blue-600 shadow-sm"
                    >
                        <Sparkles size={16} />
                        Create New Image
                    </button>
                </div>
            </div>

            {/* Gallery */}
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 bg-gray-50/30">
                {images.length > 0 ? (
                    <div className="grid grid-cols-2 gap-4">
                        {images.map(img => (
                            <div
                                key={img.id}
                                className="border border-gray-200 rounded-lg overflow-hidden bg-white shadow-sm flex flex-col group hover:border-gray-300"
                            >
                                <div
                                    className="relative aspect-video bg-gray-100 flex items-center justify-center cursor-grab active:cursor-grabbing border-b border-gray-100 overflow-hidden"
                                    draggable
                                    onDragStart={(e) => {
                                        e.dataTransfer.setData(
                                            'text/html',
                                            `<img src="${img.src}" alt="${img.title}">`
                                        );
                                    }}
                                >
                                    <img src={img.src} alt={img.title} className="w-full h-full object-cover rounded-sm shadow-sm" />
                                </div>
                                <div className="p-3 flex flex-col gap-2.5">
                                    <p className="text-sm font-semibold text-gray-800 line-clamp-1" title={img.title}>
                                        {img.title}
                                    </p>
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                        <button
                                            onClick={() => handleDeleteImage(img)}
                                            className="flex items-center justify-center p-1.5 border border-red-200 rounded text-red-500 hover:bg-red-50 transition-colors bg-white ml-auto"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center flex-1 text-gray-400 gap-2 min-h-[200px]">
                        <p className="text-sm text-center">
                            No supporting images yet. Click <strong>Create New Image</strong> to generate one based on your blog content.
                        </p>
                    </div>
                )}
            </div>

            <CreateNewImageDialog
                isOpen={createModalOpen}
                onClose={() => setCreateModalOpen(false)}
                onImagesGenerated={handleImagesGenerated}
                blogTitle={state.extractedData?.rowData?.title || ''}
                blogContent={state.content || ''}
            />
        </div>
    );
}
