import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { SingleSelect, SelectOption } from '../SingleSelect';

const options: SelectOption[] = [
    { value: 'one', label: 'One' },
    { value: 'two', label: 'Two' },
    { value: 'three', label: 'Three' }
];

describe('SingleSelect', () => {
    it('renders with label and placeholder', () => {
        render(<SingleSelect label="Test Label" value="" options={options} onValueChange={() => {}} placeholder="Pick one" />);
        expect(screen.getByText('Test Label')).toBeInTheDocument();
        expect(screen.getByText('Pick one')).toBeInTheDocument();
    });

    it('shows options when clicked and calls onValueChange', () => {
        const onValueChange = vi.fn();
        render(<SingleSelect value="" options={options} onValueChange={onValueChange} />);
        const button = screen.getByRole('button');
        fireEvent.click(button);
        expect(screen.getByRole('listbox')).toBeInTheDocument();
        const option = screen.getByText('Two');
        fireEvent.click(option);
        expect(onValueChange).toHaveBeenCalledWith('two');
    });

    it('displays selected option label', () => {
        render(<SingleSelect value="three" options={options} onValueChange={() => {}} />);
        expect(screen.getByText('Three')).toBeInTheDocument();
    });

    it('closes dropdown when clicking outside', () => {
        render(
            <div>
                <SingleSelect value="" options={options} onValueChange={() => {}} />
                <button role="button-1" data-testid="outside">
                    Outside
                </button>
            </div>
        );
        fireEvent.click(screen.getByRole('button'));
        expect(screen.getByRole('listbox')).toBeInTheDocument();
        fireEvent.mouseDown(screen.getByTestId('outside'));
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });

    it('is disabled when disabled prop is true', () => {
        render(<SingleSelect value="" options={options} onValueChange={() => {}} disabled />);
        const button = screen.getByRole('button');
        expect(button).toBeDisabled();
    });
});
