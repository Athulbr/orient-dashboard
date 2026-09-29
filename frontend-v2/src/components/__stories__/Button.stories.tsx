import React from 'react';
import { Button } from '../Button';
import { Beer } from 'lucide-react';
import { StoryFn } from '@storybook/react';
import { ReactNode } from 'react';
export default {
    title: 'Components/Button',
    component: Button,
    argTypes: {
        outlined: { control: 'boolean' },
        small: { control: 'boolean' },
        large: { control: 'boolean' },
        disabled: { control: 'boolean' },
        disableRipple: { control: 'boolean' },
        className: { control: 'text' },
        children: { control: 'text' }
    }
};

interface ButtonStoryArgs {
    outlined?: boolean;
    small?: boolean;
    large?: boolean;
    disabled?: boolean;
    disableRipple?: boolean;
    className?: string;
    children?: ReactNode;
    startIcon?: ReactNode;
    endIcon?: ReactNode;
}

const Template: StoryFn<ButtonStoryArgs> = (args: ButtonStoryArgs) => <Button {...args} />;

export const Default = Template.bind({});
Default.args = {
    children: 'Default Button'
};

export const Outlined = Template.bind({});
Outlined.args = {
    outlined: true,
    children: 'Outlined Button'
};

export const Small = Template.bind({});
Small.args = {
    small: true,
    children: 'Small Button'
};

export const Large = Template.bind({});
Large.args = {
    large: true,
    children: 'Large Button'
};

export const Disabled = Template.bind({});
Disabled.args = {
    disabled: true,
    children: 'Disabled Button'
};

export const WithStartIcon = Template.bind({});
WithStartIcon.args = {
    startIcon: <Beer />,
    children: 'Start Icon'
};

export const WithEndIcon = Template.bind({});
WithEndIcon.args = {
    endIcon: <Beer />,
    children: 'End Icon'
};

export const NoRipple = Template.bind({});
NoRipple.args = {
    disableRipple: true,
    children: 'No Ripple'
};
