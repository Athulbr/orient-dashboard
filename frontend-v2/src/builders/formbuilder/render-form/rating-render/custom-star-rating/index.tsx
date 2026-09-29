import React, { useState } from 'react';
import styles from './star-rating.module.css';

interface StarRatingProps {
    totalStars?: number;
    rating?: number;
    onRatingChange: (rating: number) => void;
    onPointerLeave: () => void;
}

export const CustomStarRating: React.FC<StarRatingProps> = ({ totalStars = 5, rating = 0, onRatingChange, onPointerLeave }) => {
    const [hoveredStar, setHoveredStar] = useState<number | null>(null);

    const handleClick = (star: number) => {
        onRatingChange(star);
    };

    const handleMouseEnter = (star: number) => {
        setHoveredStar(star);
    };

    const handleMouseLeave = () => {
        setHoveredStar(null);
    };

    return (
        <div className={styles.starRating} onMouseLeave={() => onPointerLeave()}>
            {Array.from({ length: totalStars }, (_, index) => {
                const starNumber = index + 1;
                const isFilled = hoveredStar ? starNumber <= hoveredStar : starNumber <= rating;
                return (
                    <span
                        key={starNumber}
                        className={`${styles.star} ${isFilled ? styles.filled : styles.empty}`}
                        onClick={() => handleClick(starNumber)}
                        onMouseEnter={() => handleMouseEnter(starNumber)}
                        onMouseLeave={handleMouseLeave}
                    >
                        ★
                    </span>
                );
            })}
        </div>
    );
};
