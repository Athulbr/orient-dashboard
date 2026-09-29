import { DialogComponent } from '../../../../../components/DialogComponent';
import { FC } from 'react';
import { useViewRecordState } from '../hooks/viewRecordContext';
import { XCircle } from 'lucide-react';
import { ImageTile } from './ImageTile';

export const SelectAdditionalImagesDialog: FC<any> = () => {
    const { state, setState } = useViewRecordState();

    const onImageClickHandler = (image: string) => {
        const isSelected = state.additionalImages.some(item => item.path === image);
        if (isSelected) {
            setState(prev => ({ ...prev, additionalImages: prev.additionalImages.filter(item => item.path !== image) }));
        } else {
            setState(prev => ({ ...prev, additionalImages: [...prev.additionalImages, { path: image, caption: '' }] }));
        }
    };

    const images = state.dataEntryWebImages?.filter(
        item => !item.includes('logo') && !item.includes('flag') && !item.includes('Logo') && !item.includes('width=150')
    ) ?? [];

    return (
        <DialogComponent
            className="w-[95%] p-1"
            isOpen={true}
            closeDialog={() => setState(prev => ({ ...prev, showSelectAdditionalImagesDialog: false }))}
            primaryButtonText="Done"
            onPrimaryAction={() => setState(prev => ({ ...prev, showSelectAdditionalImagesDialog: false }))}
        >
            <div className="flex h-[90vh] w-full flex-col">
                <div className="flex shrink-0 items-center justify-between p-3">
                    <div className="text-2xl font-semibold">
                        Select Additional Images
                        {state.additionalImages.length > 0 && (
                            <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-sm font-normal text-blue-700">
                                {state.additionalImages.length} selected
                            </span>
                        )}
                    </div>
                    <XCircle
                        tabIndex={-1}
                        onClick={() => setState(prev => ({ ...prev, showSelectAdditionalImagesDialog: false }))}
                        className="cursor-pointer text-gray-500 hover:text-red-500"
                    />
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border bg-white p-3">
                    <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-5">
                        {images.map((image, index) => (
                            <ImageTile
                                key={index}
                                src={image}
                                selected={state.additionalImages.some(item => item.path === image)}
                                onClick={() => onImageClickHandler(image)}
                            />
                        ))}
                    </div>
                </div>
            </div>
        </DialogComponent>
    );
};
