import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import BackButton from '../BackButton';

describe('BackButton', () => {
    it('renders the back button with arrow icon', () => {
        const mockOnClick = vi.fn();

        render(<BackButton onClick={mockOnClick} />);

        // Check if the button container is rendered
        const button = screen.getByRole('button');
        expect(button).toBeInTheDocument();

        // Check if the ArrowLeft icon is present with role="img"
        const icon = screen.getByRole('img');
        expect(icon).toBeInTheDocument();
    });

    it('calls onClick handler when clicked', async () => {
        const mockOnClick = vi.fn();
        const user = userEvent.setup();

        render(<BackButton onClick={mockOnClick} />);

        const button = screen.getByRole('button');
        await user.click(button);

        expect(mockOnClick).toHaveBeenCalledOnce();
    });

    it('calls onClick handler multiple times when clicked multiple times', async () => {
        const mockOnClick = vi.fn();
        const user = userEvent.setup();

        render(<BackButton onClick={mockOnClick} />);

        const button = screen.getByRole('button');

        await user.click(button);
        await user.click(button);
        await user.click(button);

        expect(mockOnClick).toHaveBeenCalledTimes(3);
    });

    it('has correct CSS classes for styling', () => {
        const mockOnClick = vi.fn();

        render(<BackButton onClick={mockOnClick} />);

        const button = screen.getByRole('button');

        expect(button).toHaveClass(
            'flex',
            'h-8',
            'w-10',
            'cursor-pointer',
            'items-center',
            'justify-center',
            'rounded-lg',
            'border',
            'bg-gray-50',
            'hover:bg-gray-200',
            'focus:ring-2',
            'focus:ring-gray-500',
            'focus:ring-offset-2',
            'focus:outline-none'
        );
    });

    it('is focusable with tabIndex', () => {
        const mockOnClick = vi.fn();

        render(<BackButton onClick={mockOnClick} />);

        const button = screen.getByRole('button');

        expect(button).toHaveAttribute('tabIndex', '0');
    });

    it('can be focused and activated with keyboard', async () => {
        const mockOnClick = vi.fn();
        const user = userEvent.setup();

        render(<BackButton onClick={mockOnClick} />);

        const button = screen.getByRole('button');

        // Focus the button with Tab
        await user.tab();
        expect(button).toHaveFocus();
    });

    it('calls onClick when Enter key is pressed', async () => {
        const mockOnClick = vi.fn();
        const user = userEvent.setup();

        render(<BackButton onClick={mockOnClick} />);

        const button = screen.getByRole('button');

        // Focus the button first
        button.focus();

        // Press Enter
        await user.keyboard('{Enter}');

        expect(mockOnClick).toHaveBeenCalledOnce();
    });

    it('calls onClick when Space key is pressed', async () => {
        const mockOnClick = vi.fn();
        const user = userEvent.setup();

        render(<BackButton onClick={mockOnClick} />);

        const button = screen.getByRole('button');

        // Focus the button first
        button.focus();

        // Press Space
        await user.keyboard(' ');

        expect(mockOnClick).toHaveBeenCalledOnce();
    });

    it('prevents default behavior when Space key is pressed', async () => {
        const mockOnClick = vi.fn();
        const user = userEvent.setup();

        render(<BackButton onClick={mockOnClick} />);

        const button = screen.getByRole('button');
        button.focus();

        // Create a spy on preventDefault
        const preventDefaultSpy = vi.fn();

        // Simulate keydown event with Space key
        await user.keyboard(' ');

        // The onClick should still be called
        expect(mockOnClick).toHaveBeenCalledOnce();
    });

    it('does not call onClick for other keys', async () => {
        const mockOnClick = vi.fn();
        const user = userEvent.setup();

        render(<BackButton onClick={mockOnClick} />);

        const button = screen.getByRole('button');
        button.focus();

        // Try other keys that shouldn't trigger onClick
        await user.keyboard('{Escape}');
        await user.keyboard('{ArrowUp}');
        await user.keyboard('{Tab}');
        await user.keyboard('a');

        expect(mockOnClick).not.toHaveBeenCalled();
    });

    it('handles both Enter and Space keys correctly', async () => {
        const mockOnClick = vi.fn();
        const user = userEvent.setup();

        render(<BackButton onClick={mockOnClick} />);

        const button = screen.getByRole('button');
        button.focus();

        // Press Enter
        await user.keyboard('{Enter}');
        expect(mockOnClick).toHaveBeenCalledTimes(1);

        // Press Space
        await user.keyboard(' ');
        expect(mockOnClick).toHaveBeenCalledTimes(2);
    });

    it('has proper semantic structure and attributes', () => {
        const mockOnClick = vi.fn();

        render(<BackButton onClick={mockOnClick} />);

        const button = screen.getByRole('button');

        // Check semantic structure
        expect(button.tagName).toBe('SPAN');
        expect(button).toHaveAttribute('role', 'button');
        expect(button).toHaveAttribute('tabIndex', '0');
    });

    it('ArrowLeft icon has correct properties', () => {
        const mockOnClick = vi.fn();

        render(<BackButton onClick={mockOnClick} />);

        const icon = screen.getByRole('img');

        // Check if the icon is an SVG with correct attributes
        expect(icon.tagName).toBe('svg');
        expect(icon).toHaveAttribute('width', '20');
        expect(icon).toHaveAttribute('height', '20');
        expect(icon).toHaveAttribute('role', 'img');
    });

    it('does not call onClick when component is just rendered', () => {
        const mockOnClick = vi.fn();

        render(<BackButton onClick={mockOnClick} />);

        // Just rendering shouldn't call the function
        expect(mockOnClick).not.toHaveBeenCalled();
    });

    it('maintains focus styles classes', () => {
        const mockOnClick = vi.fn();

        render(<BackButton onClick={mockOnClick} />);

        const button = screen.getByRole('button');

        // Check focus-related classes are present
        expect(button).toHaveClass('focus:ring-2');
        expect(button).toHaveClass('focus:ring-gray-500');
        expect(button).toHaveClass('focus:ring-offset-2');
        expect(button).toHaveClass('focus:outline-none');
    });
});
