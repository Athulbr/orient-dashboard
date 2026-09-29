import { CheckboxRender } from './checkbox-render';
import { ColorRender } from './color-render';
import { DateRender } from './date-render';
import { EmailRender } from './email-render';
import { FileRender } from './file-render';
import { ImageRender } from './image-render';
import { MultiSelectRender } from './multi-select-render';
import { MultiStringRender } from './multi-string-render';
import { MultilineTextRender } from './multiline-text-render';
import { NumberRender } from './number-render';
import { PasswordRender } from './password-render';
import { PhoneNumberRender } from './phone-number-render';
import { PlainTextRender } from './plain-text-render';
import { RatingRender } from './rating-render';
import { SectionHeaderRender, validateSectionHeader } from './section-header-render';
import { SignatureRender } from './signature-render';
import { SingleSelectRender } from './single-select-render';
import { TimeRender } from './time-render';
import { UrlRender } from './url-render';

// validation
import { Dispatch, SetStateAction } from 'react';
import { FieldIF } from '../interface';
import { validateNumber } from './number-render';
import { validatePlainText } from './plain-text-render';
import { validateEmail } from './email-render';
import { validateUrl } from './url-render';
import { validateMultiSelect } from './multi-select-render';
import { validateMultiString } from './multi-string-render';
import { validateSingleSelect } from './single-select-render';
import { validatePassword } from './password-render';
import { validatePhoneNumber } from './phone-number-render';
import { validateDate } from './date-render';
import { validateTime } from './time-render';
import { validateColor } from './color-render';
import { validateRating } from './rating-render';
import { validateCheckbox } from './checkbox-render';
import { validateImage } from './image-render';
import { validateFile } from './file-render';
import { validateSignature } from './signature-render';

export const mapRenderComponents: { [key: string]: React.FC<any> } = {
    plain_text: PlainTextRender,
    number: NumberRender,
    email: EmailRender,
    password: PasswordRender,
    phone_number: PhoneNumberRender,
    multiline_text: MultilineTextRender,
    date: DateRender,
    time: TimeRender,
    color: ColorRender,
    rating: RatingRender,
    checkbox: CheckboxRender,
    url: UrlRender,
    image: ImageRender,
    file: FileRender,
    signature: SignatureRender,
    single_select: SingleSelectRender,
    multi_select: MultiSelectRender,
    multi_string: MultiStringRender,
    section_header: SectionHeaderRender
};

const validationFunctionsMap: { [key: string]: (value: any, config: any) => string | undefined } = {
    plain_text: validatePlainText,
    multiline_text: validatePlainText,
    number: validateNumber,
    email: validateEmail,
    password: validatePassword,
    url: validateUrl,
    phone_number: validatePhoneNumber,
    date: validateDate,
    time: validateTime,
    color: validateColor, // No validation
    rating: validateRating,
    checkbox: validateCheckbox,
    image: validateImage,
    file: validateFile,
    signature: validateSignature,
    single_select: validateSingleSelect,
    multi_select: validateMultiSelect,
    multi_string: validateMultiString,
    section_header: validateSectionHeader // No validation
};

export const validateAllFields = (fields: FieldIF[], setFields: Dispatch<SetStateAction<FieldIF[]>>): boolean => {
    // Validate all fields first and create a new array with validation results
    const validatedFields = fields.map(field => ({
        ...field,
        errorMessage: validationFunctionsMap[field.type](field.value, field.config)
    }));

    // Update the state once with all validations applied
    setFields(validatedFields);

    // Return whether all fields are valid
    return validatedFields.every(field => field.errorMessage === '');
};
