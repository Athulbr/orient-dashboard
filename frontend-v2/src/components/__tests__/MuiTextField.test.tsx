import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MuiTextField } from '../MuiTextField';

describe('MuiTextField', () => {
    it('renders with label', () => {
        render(<MuiTextField label="Username" value="" onChange={() => {}} />);
        expect(screen.getByText('Username')).toBeInTheDocument();
    });

    it('renders with value and calls onChange', () => {
        const handleChange = vi.fn();
        render(<MuiTextField label="Email" value="test@example.com" onChange={handleChange} />);
        const input = screen.getByRole('textbox');
        expect(input).toHaveValue('test@example.com');
        fireEvent.change(input, { target: { value: 'new@example.com' } });
        expect(handleChange).toHaveBeenCalled();
    });

    it('shows error message', () => {
        render(<MuiTextField label="Password" value="" onChange={() => {}} errorMessage="Required" />);
        expect(screen.getByRole('alert')).toHaveTextContent('Required');
    });

    it('focuses input when label is clicked', () => {
        render(<MuiTextField label="FocusTest" value="" onChange={() => {}} />);
        const input = screen.getByRole('textbox');
        const label = screen.getByText('FocusTest');
        fireEvent.click(label);
        expect(document.activeElement).toBe(input);
    });
});
