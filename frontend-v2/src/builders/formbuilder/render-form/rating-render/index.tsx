import { useState } from 'react';
import { FieldConfigIF, InputFieldRenderPropsIF } from '../../interface';
import { InputWrapper } from '../input-wrapper';
import { CustomStarRating } from './custom-star-rating';

export const RatingRender: React.FC<InputFieldRenderPropsIF> = ({ index, fields, setFields, inputWrapperClassName }) => {
    const field = fields[index];
    const { config, value, errorMessage } = field;
    const [focus, setFocus] = useState(false);

    const onBlurHandler = () => {
        setFields(prev => {
            const updatedFields = [...prev];
            updatedFields[index] = {
                ...field,
                errorMessage: validateRating(value, config)
            };
            return updatedFields;
        });
        setFocus(false);
    };

    const handleRatingChange = (newValue: number) => {
        setFields(prev => {
            const updatedFields = [...prev];
            updatedFields[index] = {
                ...field,
                value: newValue,
                errorMessage: validateRating(newValue, config)
            };
            return updatedFields;
        });
    };

    return (
        <InputWrapper className={inputWrapperClassName} field={field} error={errorMessage || ''} focus={focus}>
            <CustomStarRating onPointerLeave={onBlurHandler} rating={value} totalStars={5} onRatingChange={handleRatingChange} />
        </InputWrapper>
    );
};

export const validateRating = (value: number, config: FieldConfigIF): string => {
    if (config.mandatory && value < 1) {
        return `Please give rating`;
    }
    return '';
};
