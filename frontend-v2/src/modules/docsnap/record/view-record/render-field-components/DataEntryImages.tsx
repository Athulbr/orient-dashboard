import { FC, useState } from 'react';
import { useViewRecordState } from '../hooks/viewRecordContext';
import { SquareMousePointer, Trash2 } from 'lucide-react';

interface SelectedImageProps {
    src: string;
}

const SelectedImage: FC<SelectedImageProps> = ({ src }) => {
    const [error, setError] = useState(false);

    if (error) {
        return (
            <div className="flex h-32 w-full items-center justify-center rounded-md border border-dashed border-gray-300 bg-gray-50 text-xs text-gray-400">
                Image unavailable
            </div>
        );
    }

    return (
        <img
            src={src}
            alt=""
            referrerPolicy="no-referrer"
            onError={() => setError(true)}
            className="max-h-48 w-full rounded-md object-contain"
        />
    );
};

export const DataEntryImages: FC = () => {
    const { state, setState } = useViewRecordState();

    if (state.dataEntryWebImages?.length === 0) return null;

    return (
        <div className="flex flex-col gap-2 rounded-lg border bg-white p-3 hover:border-blue-400">
            {/* Primary Image */}
            <div className="flex flex-col gap-3 rounded-lg border py-3 pr-3 pl-6 hover:border-blue-400">
                <label className="border-b pb-3 text-lg font-semibold">Primary Image</label>

                {state.primaryImage?.path && (
                    <div className="flex items-start justify-between gap-3">
                        <SelectedImage src={state.primaryImage.path} />
                        <Trash2
                            size={20}
                            className="mt-1 shrink-0 cursor-pointer text-gray-300 hover:text-red-400"
                            onClick={() => setState(prev => ({ ...prev, primaryImage: null }))}
                        />
                    </div>
                )}

                <div className="flex flex-col gap-1">
                    <label className="pl-1 text-sm">Primary Image Caption</label>
                    <input
                        onChange={e =>
                            setState(prev => ({ ...prev, primaryImage: { path: prev.primaryImage?.path || '', caption: e.target.value } }))
                        }
                        type="text"
                        value={state.primaryImage?.caption || ''}
                        placeholder="Enter caption…"
                        className="rounded-lg border py-2.5 pr-3 pl-6 focus:outline-none hover:border-blue-500"
                    />
                </div>

                <button
                    tabIndex={-1}
                    onClick={() => setState(prev => ({ ...prev, showSelectPrimaryImageDialog: true }))}
                    className="flex w-full cursor-pointer items-center gap-2 rounded-lg border py-3 pr-3 pl-6 hover:border-blue-300 hover:bg-blue-50"
                >
                    <SquareMousePointer size={16} />
                    {state.primaryImage?.path ? 'Change Primary Image' : 'Select Primary Image'}
                </button>
            </div>

            {/* Additional Images */}
            <div className="flex flex-col gap-4 rounded-lg border py-3 pr-3 pl-6 hover:border-blue-400">
                <label className="border-b pb-3 text-lg font-semibold">Additional Images</label>

                {state.additionalImages?.map((image: any, index: number) => (
                    <div key={index} className="flex flex-col gap-2 rounded-lg border p-4 hover:border-gray-400">
                        <div className="flex items-start justify-between gap-3">
                            <SelectedImage src={image.path} />
                            <Trash2
                                size={20}
                                className="mt-1 shrink-0 cursor-pointer text-gray-300 hover:text-red-400"
                                onClick={() =>
                                    setState(prev => ({
                                        ...prev,
                                        additionalImages: prev.additionalImages.filter((_: any, idx: number) => idx !== index)
                                    }))
                                }
                            />
                        </div>
                        <div className="flex flex-col gap-1 pt-2">
                            <label className="pl-1 text-sm">Image Caption</label>
                            <input
                                onChange={e =>
                                    setState(prev => ({
                                        ...prev,
                                        additionalImages: prev.additionalImages.map((item: any, idx: number) =>
                                            idx === index ? { ...item, caption: e.target.value } : item
                                        )
                                    }))
                                }
                                type="text"
                                value={image?.caption || ''}
                                placeholder="Enter caption…"
                                className="rounded-lg border py-2.5 pr-3 pl-6 focus:outline-none hover:border-blue-500"
                            />
                        </div>
                    </div>
                ))}

                <button
                    tabIndex={-1}
                    onClick={() => setState(prev => ({ ...prev, showSelectAdditionalImagesDialog: true }))}
                    className="flex w-full cursor-pointer items-center gap-2 rounded-lg border py-3 pr-3 pl-6 hover:border-blue-300 hover:bg-blue-50"
                >
                    <SquareMousePointer size={16} />
                    Add Additional Images
                </button>
            </div>
        </div>
    );
};
