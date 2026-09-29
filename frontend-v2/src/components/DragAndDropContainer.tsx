import { ReactNode, useState, useRef, useEffect } from 'react';

interface DragAndDropContainerProps<T> {
    items: T[];
    onDragEnd: (items: T[]) => void;
    children: (item: T, index: number) => ReactNode;
    className?: string;
    disableDrag?: boolean;
}

export const DragAndDropContainer = <T,>({ items, onDragEnd, children, className = '', disableDrag = false }: DragAndDropContainerProps<T>) => {
    const [draggedItem, setDraggedItem] = useState<number | null>(null);
    const [dragOverItem, setDragOverItem] = useState<number | null>(null);
    const dragItem = useRef<number | null>(null);
    const dragOverItemRef = useRef<number | null>(null);

    const handleDragStart = (position: number) => {
        dragItem.current = position;
        setDraggedItem(position);
    };

    const handleDragEnter = (position: number) => {
        dragOverItemRef.current = position;
        setDragOverItem(position);
    };

    const handleDragEnd = () => {
        if (dragItem.current === null || dragOverItemRef.current === null) return;

        const itemsCopy = [...items];
        const draggedItemContent = itemsCopy[dragItem.current];
        itemsCopy.splice(dragItem.current, 1);
        itemsCopy.splice(dragOverItemRef.current, 0, draggedItemContent);

        dragItem.current = null;
        dragOverItemRef.current = null;
        setDraggedItem(null);
        setDragOverItem(null);

        onDragEnd(itemsCopy);
    };

    return (
        <div className={`flex flex-col gap-2 ${className}`}>
            {items.map((item, index) => (
                <div
                    key={index}
                    draggable={!disableDrag}
                    onDragStart={() => handleDragStart(index)}
                    onDragEnter={() => handleDragEnter(index)}
                    onDragOver={e => e.preventDefault()}
                    onDragEnd={handleDragEnd}
                    className={`transition-transform duration-200 ${draggedItem === index ? 'opacity-50' : ''} ${
                        dragOverItem === index ? 'translate-x-2' : ''
                    }`}
                >
                    {children(item, index)}
                </div>
            ))}
        </div>
    );
};
