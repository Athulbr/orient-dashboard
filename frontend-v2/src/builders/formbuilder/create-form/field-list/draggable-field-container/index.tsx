import { useFormBuilder } from '../../formbuilder-context/useFormBuilder';
import style from './draggable.module.css';
import { MutableRefObject, ReactNode } from 'react';

interface PropsIF {
    index: number;
    dragItem: MutableRefObject<number>;
    dragOverItem: MutableRefObject<number>;
    children: ReactNode;
}

const DraggableFieldContainer: React.FC<PropsIF> = ({ index, dragItem, dragOverItem, children }) => {
    const { fields, setFields, setShowSettings, showSettings } = useFormBuilder();
    const handleSort = () => {
        const allFields = [...fields];
        const draggedItemContent = allFields.splice(dragItem.current, 1)[0];
        allFields.splice(dragOverItem.current, 0, draggedItemContent);
        if (showSettings !== -1) setShowSettings(dragOverItem.current);
        dragItem.current = 0;
        dragOverItem.current = 0;
        setFields(allFields);
    };
    return (
        <div
            className={style.container}
            key={index}
            draggable
            onDragStart={() => (dragItem.current = index)}
            onDragEnter={() => (dragOverItem.current = index)}
            onDragEnd={handleSort}
            onDragOver={e => e.preventDefault()}
        >
            {children}
        </div>
    );
};
export default DraggableFieldContainer;
