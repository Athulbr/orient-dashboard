import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TextAreaComponent } from '../Textarea';

describe('TextAreaComponent', () => {
    it('renders a basic textarea', () => {
        render(<TextAreaComponent />);
        const textarea = screen.getByRole('textbox');
        expect(textarea).toBeInTheDocument();
    });

    it('renders with label', () => {
        render(<TextAreaComponent label="Description" />);
        const label = screen.getByText('Description');
        const textarea = screen.getByRole('textbox', { name: /description/i });

        expect(label).toBeInTheDocument();
        expect(textarea).toBeInTheDocument();
        expect(label).toHaveAttribute('for', textarea.id);
    });

    it('shows required indicator when required is true', () => {
        render(<TextAreaComponent label="Description" required />);
        const requiredIndicator = screen.getByText('*');
        const textarea = screen.getByRole('textbox');

        expect(requiredIndicator).toBeInTheDocument();
        expect(textarea).toBeRequired();
    });

    it('renders with placeholder', () => {
        render(<TextAreaComponent placeholder="Enter your message" />);
        const textarea = screen.getByPlaceholderText('Enter your message');
        expect(textarea).toBeInTheDocument();
    });

    it('renders with custom rows', () => {
        render(<TextAreaComponent rows={6} />);
        const textarea = screen.getByRole('textbox');
        expect(textarea).toHaveAttribute('rows', '6');
    });

    it('renders with default rows when not specified', () => {
        render(<TextAreaComponent />);
        const textarea = screen.getByRole('textbox');
        expect(textarea).toHaveAttribute('rows', '4');
    });

    it('handles disabled state', () => {
        render(<TextAreaComponent label="Description" disabled />);
        const textarea = screen.getByRole('textbox');
        const label = screen.getByText('Description');

        expect(textarea).toBeDisabled();
        expect(label).toHaveClass('cursor-not-allowed', 'opacity-50');
    });

    it('displays error message', () => {
        render(<TextAreaComponent label="Description" error="This field is required" />);
        const errorMessage = screen.getByText('This field is required');
        const textarea = screen.getByRole('textbox');

        expect(errorMessage).toBeInTheDocument();
        expect(textarea).toHaveAttribute('aria-invalid', 'true');
        expect(textarea).toHaveAttribute('aria-describedby', expect.stringContaining('-error'));
    });

    it('displays helper text when no error', () => {
        render(<TextAreaComponent label="Description" helperText="Max 500 characters" />);
        const helperText = screen.getByText('Max 500 characters');
        const textarea = screen.getByRole('textbox');

        expect(helperText).toBeInTheDocument();
        expect(textarea).toHaveAttribute('aria-invalid', 'false');
        expect(textarea).toHaveAttribute('aria-describedby', expect.stringContaining('-helper'));
    });

    it('does not display helper text when error is present', () => {
        render(<TextAreaComponent label="Description" error="This field is required" helperText="Max 500 characters" />);

        const errorMessage = screen.getByText('This field is required');
        const helperText = screen.queryByText('Max 500 characters');

        expect(errorMessage).toBeInTheDocument();
        expect(helperText).not.toBeInTheDocument();
    });

    it('applies custom className', () => {
        render(<TextAreaComponent className="custom-class" />);
        const textarea = screen.getByRole('textbox');
        expect(textarea).toHaveClass('custom-class');
    });

    it('applies custom wrapperClassName', () => {
        render(<TextAreaComponent wrapperClassName="custom-wrapper" />);
        const wrapper = screen.getByRole('textbox').closest('div');
        expect(wrapper).toHaveClass('custom-wrapper');
    });

    it('applies custom labelClassName', () => {
        render(<TextAreaComponent label="Description" labelClassName="custom-label" />);
        const label = screen.getByText('Description');
        expect(label).toHaveClass('custom-label');
    });

    it('applies custom errorClassName', () => {
        render(<TextAreaComponent error="Error message" errorClassName="custom-error" />);
        const errorMessage = screen.getByText('Error message');
        expect(errorMessage).toHaveClass('custom-error');
    });

    it('applies custom helperTextClassName', () => {
        render(<TextAreaComponent helperText="Helper text" helperTextClassName="custom-helper" />);
        const helperText = screen.getByText('Helper text');
        expect(helperText).toHaveClass('custom-helper');
    });

    it('handles fullWidth prop correctly', () => {
        const { rerender } = render(<TextAreaComponent fullWidth />);
        let wrapper = screen.getByRole('textbox').closest('div');
        let textarea = screen.getByRole('textbox');

        expect(wrapper).toHaveClass('w-full');
        expect(textarea).toHaveClass('w-full');

        rerender(<TextAreaComponent fullWidth={false} />);
        wrapper = screen.getByRole('textbox').closest('div');
        textarea = screen.getByRole('textbox');

        expect(wrapper).not.toHaveClass('w-full');
        expect(textarea).not.toHaveClass('w-full');
    });

    it('uses custom id when provided', () => {
        render(<TextAreaComponent id="custom-id" label="Description" />);
        const textarea = screen.getByRole('textbox');
        const label = screen.getByText('Description');

        expect(textarea).toHaveAttribute('id', 'custom-id');
        expect(label).toHaveAttribute('for', 'custom-id');
    });

    it('generates unique id when not provided', () => {
        render(<TextAreaComponent label="Description" />);
        const textarea = screen.getByRole('textbox');
        const label = screen.getByText('Description');

        expect(textarea.id).toMatch(/^textarea-/);
        expect(label).toHaveAttribute('for', textarea.id);
    });

    it('handles user input', () => {
        render(<TextAreaComponent />);
        const textarea = screen.getByRole('textbox');

        fireEvent.change(textarea, { target: { value: 'Hello World' } });
        expect(textarea).toHaveValue('Hello World');
    });

    it('forwards additional props to textarea', () => {
        render(<TextAreaComponent data-testid="custom-textarea" maxLength={100} />);
        const textarea = screen.getByTestId('custom-textarea');

        expect(textarea).toHaveAttribute('maxLength', '100');
    });

    it('renders without label', () => {
        render(<TextAreaComponent placeholder="No label textarea" />);
        const textarea = screen.getByRole('textbox');
        const label = screen.queryByText(/label/i);

        expect(textarea).toBeInTheDocument();
        expect(label).not.toBeInTheDocument();
    });

    it('has correct error styling when error is present', () => {
        render(<TextAreaComponent error="Error message" />);
        const textarea = screen.getByRole('textbox');

        expect(textarea).toHaveClass('border-red-500', 'focus:border-red-500', 'focus:ring-red-500');
    });

    it('has default styling when no error', () => {
        render(<TextAreaComponent />);
        const textarea = screen.getByRole('textbox');

        expect(textarea).toHaveClass('border-gray-300');
        expect(textarea).not.toHaveClass('border-red-500');
    });

    it('has disabled styling when disabled', () => {
        render(<TextAreaComponent disabled />);
        const textarea = screen.getByRole('textbox');

        expect(textarea).toHaveClass('cursor-not-allowed', 'bg-gray-100', 'opacity-75');
    });
});
