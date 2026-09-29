import React, { useState } from 'react';

const DragAndDropBidirectional: React.FC = () => {
    const [box1Items, setBox1Items] = useState<string[]>(['Item 1', 'Item 2', 'Item 3']);
    const [box2Items, setBox2Items] = useState<string[]>(['Item A', 'Item B']);

    // Track where the item came from
    const handleDragStart = (event: React.DragEvent<HTMLDivElement>, index: number, fromBox: 'box1' | 'box2') => {
        event.dataTransfer.setData('index', index.toString());
        event.dataTransfer.setData('fromBox', fromBox);
    };

    const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
        event.preventDefault(); // Allow dropping
    };

    const handleDrop = (event: React.DragEvent<HTMLDivElement>, toBox: 'box1' | 'box2') => {
        event.preventDefault();

        const indexStr = event.dataTransfer.getData('index');
        const fromBox = event.dataTransfer.getData('fromBox') as 'box1' | 'box2';
        const index = parseInt(indexStr, 10);

        if (isNaN(index)) return;
        if (fromBox === toBox) return; // Prevent dropping into the same box

        // Get the correct source and destination arrays
        const fromArray = fromBox === 'box1' ? box1Items : box2Items;
        const toArray = toBox === 'box1' ? box1Items : box2Items;

        const item = fromArray[index];
        if (!item) return;

        // Remove from source and add to destination
        const newFromArray = [...fromArray];
        newFromArray.splice(index, 1);
        const newToArray = [...toArray, item];

        // Update state
        if (fromBox === 'box1') {
            setBox1Items(newFromArray);
            setBox2Items(newToArray);
        } else {
            setBox2Items(newFromArray);
            setBox1Items(newToArray);
        }
    };

    return (
        <div style={{ display: 'flex', gap: '40px', padding: '20px', fontFamily: 'Arial' }}>
            {/* Box 1 */}
            <div
                onDragOver={handleDragOver}
                onDrop={e => handleDrop(e, 'box1')}
                style={{
                    border: '2px dashed #666',
                    padding: '10px',
                    minHeight: '200px',
                    width: '200px'
                }}
            >
                <h3>Box 1</h3>
                {box1Items.map((item, index) => (
                    <div
                        key={index}
                        draggable
                        onDragStart={e => handleDragStart(e, index, 'box1')}
                        style={{
                            padding: '8px',
                            backgroundColor: '#eef',
                            marginBottom: '5px',
                            borderRadius: '4px',
                            cursor: 'grab'
                        }}
                    >
                        {item}
                    </div>
                ))}
            </div>

            {/* Box 2 */}
            <div
                onDragOver={handleDragOver}
                onDrop={e => handleDrop(e, 'box2')}
                style={{
                    border: '2px dashed #666',
                    padding: '10px',
                    minHeight: '200px',
                    width: '200px'
                }}
            >
                <h3>Box 2</h3>
                {box2Items.map((item, index) => (
                    <div
                        key={index}
                        draggable
                        onDragStart={e => handleDragStart(e, index, 'box2')}
                        style={{
                            padding: '8px',
                            backgroundColor: '#efe',
                            marginBottom: '5px',
                            borderRadius: '4px',
                            cursor: 'grab'
                        }}
                    >
                        {item}
                    </div>
                ))}
            </div>
        </div>
    );
};

export default DragAndDropBidirectional;
