import React, { ReactNode } from 'react';
import style from './table.module.css';
import Spinner from '../Spinner';

interface TablePropsIF {
    children: ReactNode;
    autoWidth?: boolean;
    loading?: boolean;
    noData?: boolean;
}

const Table: React.FC<TablePropsIF> = ({ children, loading, autoWidth, noData }) => {
    // Convert children to an array safely
    const childrenArray = React.Children.toArray(children);

    return (
        <div className={`${style.tableContainer} ${autoWidth ? style.autoWidth : ''}`}>
            <table className={style.table}>
                {childrenArray[0] ? childrenArray[0] : null}
                {!loading && childrenArray[1] ? childrenArray[1] : null}
            </table>
            {loading ? (
                <div className={style.loaderBox}>
                    <Spinner />
                </div>
            ) : noData ? (
                <div className={style.loaderBox}>No data found</div>
            ) : (
                <></>
            )}
        </div>
    );
};

export default Table;
