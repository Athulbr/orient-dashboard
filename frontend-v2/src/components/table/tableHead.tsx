import React from 'react';
import style from './table.module.css';

interface TableHeadPropsIF {
    tableHead: string[];
}

const TableHead: React.FC<TableHeadPropsIF> = ({ tableHead }) => {
    return (
        <thead>
            <tr>
                {tableHead.map((item: string, index: number) => (
                    <th key={index}>
                        <div>{item}</div>
                    </th>
                ))}
            </tr>
        </thead>
    );
};

export default TableHead;
