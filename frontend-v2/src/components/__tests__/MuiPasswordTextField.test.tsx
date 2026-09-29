import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MuiPasswordTextField } from '../MuiPasswordTextField';

describe('MuiPasswordTextField', () => {
    it('renders with label', () => {
        render(<MuiPasswordTextField label="Password" value="" onChange={() => {}} />);
        expect(screen.getByText('Password')).toBeInTheDocument();
    });

    //   it('renders with value and calls onChange', () => {
    //     const handleChange = vi.fn();
    //     render(<MuiPasswordTextField label="Password" value="secret" onChange={handleChange} />);
    //     const input = screen.getByRole('textbox');
    //     expect(input).toHaveValue('secret');
    //     fireEvent.change(input, { target: { value: 'newsecret' } });
    //     expect(handleChange).toHaveBeenCalled();
    //   });

    it('shows error message', () => {
        render(<MuiPasswordTextField label="Password" value="" onChange={() => {}} errorMessage="Required" />);
        expect(screen.getByRole('alert')).toHaveTextContent('Required');
    });

    it('toggles password visibility', () => {
        render(<MuiPasswordTextField label="Password" value="secret" onChange={() => {}} />);
        const input = screen.getByRole('textbox');
        expect(input).toHaveAttribute('type', 'password');
        const toggle = screen.getByTestId('toggle-visibility');
        fireEvent.click(toggle);
        expect(input).toHaveAttribute('type', 'text');
        fireEvent.click(toggle);
        expect(input).toHaveAttribute('type', 'password');
    });

    it('focuses input when label is clicked', () => {
        render(<MuiPasswordTextField label="FocusTest" value="" onChange={() => {}} />);
        const input = screen.getByRole('textbox');
        const label = screen.getByText('FocusTest');
        fireEvent.click(label);
        expect(document.activeElement).toBe(input);
    });
});
