import React from 'react';
import style from './pagination.module.css';
import PaginationPropsIF from '../../modules/transcript/interface';
import Spinner from '../Spinner';
import { ArrowLeft } from 'lucide-react';
import { ArrowRight } from 'lucide-react';

const Pagination: React.FC<PaginationPropsIF> = ({ currentPage, totalPages, onPageChange, loading }) => {
    if (currentPage < 1 || totalPages < 1 || currentPage > totalPages) {
        return null; // Don't render if currentPage or totalPages are not valid
    }

    const handlePageChange = (pageNumber: number) => {
        if (pageNumber !== currentPage) {
            onPageChange(pageNumber);
        }
    };

    const renderPageNumbers = () => {
        const pageNumbers = [];
        const maxVisiblePages = 5; // Adjust this number based on your preference for visible pages

        if (totalPages <= maxVisiblePages) {
            // Show all pages if totalPages is less than or equal to maxVisiblePages
            for (let i = 1; i <= totalPages; i++) {
                pageNumbers.push(
                    <li key={i} className={currentPage === i ? style.active : ''} onClick={() => handlePageChange(i)}>
                        {currentPage === i && loading ? (
                            <span style={{ position: 'relative', top: 2, left: 0.5 }}>
                                <Spinner />
                            </span>
                        ) : (
                            i
                        )}
                    </li>
                );
            }
        } else {
            // Always show the first page
            pageNumbers.push(
                <li key={1} className={currentPage === 1 ? style.active : ''} onClick={() => handlePageChange(1)}>
                    {currentPage === 1 && loading ? <Spinner /> : 1}
                </li>
            );

            const startPage = Math.max(2, currentPage - 1);
            const endPage = Math.min(totalPages - 1, currentPage + 1);

            // Add "..." before the start of the range
            if (startPage > 2) {
                pageNumbers.push(
                    <li key="start-ellipsis" className={style.ellipsis}>
                        ...
                    </li>
                );
            }

            // Display pages around the currentPage
            for (let i = startPage; i <= endPage; i++) {
                pageNumbers.push(
                    <li key={i} className={currentPage === i ? style.active : ''} onClick={() => handlePageChange(i)}>
                        {i}
                    </li>
                );
            }

            // Add "..." after the end of the range
            if (endPage < totalPages - 1) {
                pageNumbers.push(
                    <li key="end-ellipsis" className={style.ellipsis}>
                        ...
                    </li>
                );
            }

            // Always show the last page
            pageNumbers.push(
                <li key={totalPages} className={currentPage === totalPages ? style.active : ''} onClick={() => handlePageChange(totalPages)}>
                    {totalPages}
                </li>
            );
        }

        return pageNumbers;
    };

    const handleLeftArrowClick = () => {
        if (currentPage > 1) {
            onPageChange(currentPage - 1);
        }
    };

    const handleRightArrowClick = () => {
        if (currentPage < totalPages) {
            onPageChange(currentPage + 1);
        }
    };

    return (
        <ul className={style.pagination}>
            <div className={style.actionButton} onClick={handleLeftArrowClick}>
                <ArrowLeft />
            </div>
            {renderPageNumbers()}
            <div className={style.actionButton} onClick={handleRightArrowClick}>
                <ArrowRight />
            </div>
        </ul>
    );
};

export default Pagination;
