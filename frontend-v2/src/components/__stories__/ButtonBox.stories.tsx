import React from 'react';
import { ButtonBox } from '../ButtonBox';
import { Button } from '../Button';

export default {
    title: 'Components/ButtonBox',
    component: ButtonBox,
    argTypes: {
        start: { control: 'boolean' },
        end: { control: 'boolean' },
        center: { control: 'boolean' },
        className: { control: 'text' }
    }
};

import { StoryFn } from '@storybook/react';

const Template: StoryFn = args => (
    <div>
        <ButtonBox {...args}>
            <Button>Button 1</Button>
            <Button>Button 2</Button>
            <Button>Button 3</Button>
        </ButtonBox>
    </div>
);

export const Default = Template.bind({});
Default.args = {
    end: true
};

export const Start = Template.bind({});
Start.args = {
    start: true,
    end: false
};

export const Center = Template.bind({});
Center.args = {
    center: true,
    end: false
};

export const CustomClass = Template.bind({});
CustomClass.args = {
    className: 'bg-gray-100 p-4 border border-gray-500 rounded-lg'
};
