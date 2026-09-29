import { ReactNode, useState } from 'react';
import style from './tabelControlBox.module.css';
import { useNavigate } from 'react-router-dom';
import { ArrowLeftIcon } from 'lucide-react';
import Spinner from '../Spinner';
import { RefreshCcw } from 'lucide-react';

interface TableControlBoxPropsIF {
    children: ReactNode;
    tableName: string;
    showCacheMessage?: boolean;
    onRefresh?: () => void;
    showBackButton?: boolean;
    loading?: boolean;
}

const TableControlBox: React.FC<TableControlBoxPropsIF> = ({ children, tableName, onRefresh, showCacheMessage, showBackButton, loading }) => {
    const navigate = useNavigate();
    const refreshHandler = () => {
        if (onRefresh) {
            onRefresh();
        }
    };
    return (
        <div className={style.tableControlBox}>
            <div className={style.tableName}>
                {showBackButton && (
                    <span className={style.backButton} onClick={() => navigate(-1)}>
                        <ArrowLeftIcon />
                    </span>
                )}
                {tableName}
            </div>
            <div className={style.tableControl}>
                {showCacheMessage && (
                    <div className={style.refreshContainer}>
                        <span className={style.cacheMessage}>Showing Cache Data</span>
                        <span className={style.iconButton} onClick={refreshHandler}>
                            {loading ? <Spinner /> : <RefreshCcw />}
                        </span>
                    </div>
                )}
                {children}
            </div>
        </div>
    );
};

export default TableControlBox;
