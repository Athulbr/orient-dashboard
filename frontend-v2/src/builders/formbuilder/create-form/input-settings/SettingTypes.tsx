import { BooleanInput } from './boolean-input';
import { DateInput } from './date-input';
import { NumberInput } from './number-input';
import { OptionInput } from './option-input';
import { SingleSelectInput } from './single-select-input';
import { TextInput } from './text-input';
import { TimeInput } from './time-input';

const settingTypes = new Map<string, React.FC<any>>([
    // Boolean Inputs
    ['mandatory', BooleanInput],
    ['letters', BooleanInput],
    ['numbers', BooleanInput],
    ['emptySpace', BooleanInput],
    ['comma', BooleanInput],
    ['quotes', BooleanInput],
    ['positiveNumbers', BooleanInput],
    ['negativeNumbers', BooleanInput],
    ['capitalLetter', BooleanInput],
    ['specialCharacters', BooleanInput],
    ['dynamicOptions', BooleanInput],
    ['defaultChecked', BooleanInput],
    ['expectUnchecked', BooleanInput],
    ['hoverAnimation', BooleanInput],
    ['hidden', BooleanInput],
    ['disabled', BooleanInput],
    ['PDF', BooleanInput],
    ['ZIP', BooleanInput],
    ['PNG', BooleanInput],
    ['JPEG', BooleanInput],
    ['shrink', BooleanInput],

    // Number Inputs
    ['minimumLength', NumberInput],
    ['maximumLength', NumberInput],
    ['minimumDigits', NumberInput],
    ['maximumDigits', NumberInput],
    ['minimumSize', NumberInput],
    ['maximumSize', NumberInput],
    ['minimum', NumberInput],
    ['maximum', NumberInput],
    ['textRows', NumberInput],

    // Text Inputs
    ['allowedSpecialCharacters', TextInput],
    ['colums', TextInput], // For table configurations
    ['rows', TextInput], // For table configurations
    ['text', TextInput], // For link fields
    ['exceptDomains', TextInput], // For link fields
    ['onlyDomains', TextInput],
    ['placeholder', TextInput],
    ['redirectUrl', TextInput],
    ['regularExpression', TextInput],
    ['defaultValue', TextInput],

    //Date input
    ['minimumDate', DateInput],
    ['maximumDate', DateInput],

    //Time input
    ['minimumTime', TimeInput],
    ['maximumTime', TimeInput],

    // Single Select Inputs
    ['textTransform', SingleSelectInput],
    ['gradientType', SingleSelectInput],
    ['optionSourceType', SingleSelectInput],

    // Options
    ['options', OptionInput]
]);

export default settingTypes;
