import React, { ReactNode } from 'react';

interface TableBodyPropsIF {
    tableBody: ReactNode;
}

const TableBody: React.FC<TableBodyPropsIF> = ({ tableBody }) => {
    return <tbody>{tableBody}</tbody>;
};

export default TableBody;
