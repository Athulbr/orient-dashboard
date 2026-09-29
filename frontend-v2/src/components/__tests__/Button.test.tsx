import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useRef } from 'react';
import { Button } from '../Button';

// Mock icons for testing
const MockStartIcon = () => <span data-testid="start-icon">▶</span>;
const MockEndIcon = () => <span data-testid="end-icon">◀</span>;

// Helper component to test ref functionality
const ButtonWithRef = ({ onClick }: { onClick?: () => void }) => {
    const buttonRef = useRef<HTMLButtonElement | null>(null);

    return (
        <div>
            <Button ref={buttonRef as React.RefObject<HTMLButtonElement>} onClick={onClick}>
                Test Button
            </Button>
            <button data-testid="focus-button" onClick={() => buttonRef.current?.focus()}>
                Focus Button
            </button>
        </div>
    );
};

describe('Button', () => {
    beforeEach(() => {
        // Clear any existing styles
        const existingStyles = document.querySelectorAll('style');
        existingStyles.forEach(style => {
            if (style.textContent?.includes('waves-ripple')) {
                style.remove();
            }
        });
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('Basic Rendering', () => {
        it('renders button with children', () => {
            render(<Button>Click me</Button>);

            const button = screen.getByRole('button', { name: /click me/i });
            expect(button).toBeInTheDocument();
            expect(button).toHaveTextContent('Click me');
        });

        it('renders as button element', () => {
            render(<Button>Test</Button>);

            const button = screen.getByRole('button');
            expect(button.tagName).toBe('BUTTON');
        });
    });

    describe('Click Functionality', () => {
        it('calls onClick when button is clicked', async () => {
            const handleClick = vi.fn();
            const user = userEvent.setup();

            render(<Button onClick={handleClick}>Click me</Button>);

            const button = screen.getByRole('button');
            await user.click(button);

            expect(handleClick).toHaveBeenCalledOnce();
        });

        it('calls onClick multiple times for multiple clicks', async () => {
            const handleClick = vi.fn();
            const user = userEvent.setup();

            render(<Button onClick={handleClick}>Click me</Button>);

            const button = screen.getByRole('button');
            await user.click(button);
            await user.click(button);
            await user.click(button);

            expect(handleClick).toHaveBeenCalledTimes(3);
        });

        it('does not call onClick when disabled', async () => {
            const handleClick = vi.fn();
            const user = userEvent.setup();

            render(
                <Button onClick={handleClick} disabled>
                    Click me
                </Button>
            );

            const button = screen.getByRole('button');
            await user.click(button);

            expect(handleClick).not.toHaveBeenCalled();
        });
    });

    describe('Disabled State', () => {
        it('applies disabled attribute when disabled prop is true', () => {
            render(<Button disabled>Disabled Button</Button>);

            const button = screen.getByRole('button');
            expect(button).toBeDisabled();
        });

        it('applies disabled styling classes', () => {
            render(<Button disabled>Disabled Button</Button>);

            const button = screen.getByRole('button');
            expect(button).toHaveClass('opacity-50', 'cursor-not-allowed');
        });

        it('does not have disabled styles when not disabled', () => {
            render(<Button>Enabled Button</Button>);

            const button = screen.getByRole('button');
            expect(button).toHaveClass('cursor-pointer');
            expect(button).not.toHaveClass('opacity-50', 'cursor-not-allowed');
        });
    });

    describe('Size Variants', () => {
        it('applies default size classes', () => {
            render(<Button>Default Button</Button>);

            const button = screen.getByRole('button');
            expect(button).toHaveClass('h-10', 'px-4');
        });

        it('applies small size classes', () => {
            render(<Button small>Small Button</Button>);

            const button = screen.getByRole('button');
            expect(button).toHaveClass('h-8', 'px-3', 'text-sm');
        });

        it('applies large size classes', () => {
            render(<Button large>Large Button</Button>);

            const button = screen.getByRole('button');
            expect(button).toHaveClass('h-12', 'px-6', 'text-lg');
        });

        it('small takes precedence over large when both are provided', () => {
            render(
                <Button small large>
                    Conflicted Button
                </Button>
            );

            const button = screen.getByRole('button');
            expect(button).toHaveClass('h-8', 'px-3', 'text-sm');
            expect(button).not.toHaveClass('h-12', 'px-6', 'text-lg');
        });
    });

    describe('Style Variants', () => {
        it('applies default (filled) styling', () => {
            render(<Button>Default Button</Button>);

            const button = screen.getByRole('button');
            expect(button).toHaveClass('bg-black', 'text-white', 'border', 'border-black', 'hover:bg-gray-800', 'hover:text-gray-200');
        });
    });

    describe('Icons', () => {
        it('renders start icon', () => {
            render(<Button startIcon={<MockStartIcon />}>Button with start icon</Button>);

            expect(screen.getByTestId('start-icon')).toBeInTheDocument();
            expect(screen.getByRole('button')).toHaveTextContent('▶Button with start icon');
        });

        it('renders end icon', () => {
            render(<Button endIcon={<MockEndIcon />}>Button with end icon</Button>);

            expect(screen.getByTestId('end-icon')).toBeInTheDocument();
            expect(screen.getByRole('button')).toHaveTextContent('Button with end icon◀');
        });

        it('renders both start and end icons', () => {
            render(
                <Button startIcon={<MockStartIcon />} endIcon={<MockEndIcon />}>
                    Button with both icons
                </Button>
            );

            expect(screen.getByTestId('start-icon')).toBeInTheDocument();
            expect(screen.getByTestId('end-icon')).toBeInTheDocument();
        });

        it('icon containers have correct classes', () => {
            render(
                <Button startIcon={<MockStartIcon />} endIcon={<MockEndIcon />}>
                    Test
                </Button>
            );

            const startIconContainer = screen.getByTestId('start-icon').parentElement;
            const endIconContainer = screen.getByTestId('end-icon').parentElement;

            expect(startIconContainer).toHaveClass('inline-flex', 'items-center');
            expect(endIconContainer).toHaveClass('inline-flex', 'items-center');
        });
    });

    describe('Custom Styling', () => {
        it('applies custom className', () => {
            render(<Button className="custom-class">Custom Button</Button>);

            const button = screen.getByRole('button');
            expect(button).toHaveClass('custom-class');
        });

        it('merges custom className with default classes', () => {
            render(<Button className="custom-class">Custom Button</Button>);

            const button = screen.getByRole('button');
            expect(button).toHaveClass('custom-class', 'relative', 'flex', 'items-center');
        });
    });

    describe('Common CSS Classes', () => {
        it('has base structural classes', () => {
            render(<Button>Test Button</Button>);

            const button = screen.getByRole('button');
            expect(button).toHaveClass(
                'relative',
                'flex',
                'items-center',
                'justify-center',
                'gap-2',
                'overflow-hidden',
                'rounded-md',
                'font-medium',
                'transition-colors',
                'duration-200'
            );
        });

        it('has focus classes', () => {
            render(<Button>Test Button</Button>);

            const button = screen.getByRole('button');
            expect(button).toHaveClass('focus:outline-none', 'focus:ring-2', 'focus:ring-gray-400', 'focus:ring-offset-2');
        });
    });

    describe('Ref Functionality', () => {
        it('ref can be used to focus the button', async () => {
            const user = userEvent.setup();

            render(<ButtonWithRef />);

            const button = screen.getByRole('button', { name: /test button/i });
            const focusButton = screen.getByTestId('focus-button');

            expect(button).not.toHaveFocus();

            await user.click(focusButton);

            expect(button).toHaveFocus();
        });
    });

    describe('Ripple Effect', () => {
        it('creates ripple effect on click by default', async () => {
            const user = userEvent.setup();

            render(<Button>Ripple Button</Button>);

            const button = screen.getByRole('button');
            await user.click(button);

            // Wait for ripple elements to be created
            await waitFor(() => {
                const ripples = button.querySelectorAll('.bg-current.opacity-20');
                expect(ripples.length).toBeGreaterThan(0);
            });
        });

        it('does not create ripple when disableRipple is true', async () => {
            const user = userEvent.setup();

            render(<Button disableRipple>No Ripple Button</Button>);

            const button = screen.getByRole('button');
            await user.click(button);

            // Wait a bit and check no ripples were created
            await new Promise(resolve => setTimeout(resolve, 100));
            const ripples = button.querySelectorAll('.bg-current.opacity-20');
            expect(ripples).toHaveLength(0);
        });

        it('does not create ripple when button is disabled', async () => {
            const user = userEvent.setup();

            render(<Button disabled>Disabled Button</Button>);

            const button = screen.getByRole('button');
            await user.click(button);

            // Wait a bit and check no ripples were created
            await new Promise(resolve => setTimeout(resolve, 100));
            const ripples = button.querySelectorAll('.bg-current.opacity-20');
            expect(ripples).toHaveLength(0);
        });
    });

    describe('Keyboard Accessibility', () => {
        it('is focusable with keyboard navigation', async () => {
            const user = userEvent.setup();

            render(<Button>Focusable Button</Button>);

            const button = screen.getByRole('button');

            await user.tab();
            expect(button).toHaveFocus();
        });

        it('can be activated with Enter key', async () => {
            const handleClick = vi.fn();
            const user = userEvent.setup();

            render(<Button onClick={handleClick}>Enter Button</Button>);

            const button = screen.getByRole('button');
            button.focus();

            await user.keyboard('{Enter}');
            expect(handleClick).toHaveBeenCalledOnce();
        });

        it('can be activated with Space key', async () => {
            const handleClick = vi.fn();
            const user = userEvent.setup();

            render(<Button onClick={handleClick}>Space Button</Button>);

            const button = screen.getByRole('button');
            button.focus();

            await user.keyboard(' ');
            expect(handleClick).toHaveBeenCalledOnce();
        });
    });

    describe('Additional Props', () => {
        it('passes through additional props to button element', () => {
            render(
                <Button data-testid="custom-button" aria-label="Custom label">
                    Test Button
                </Button>
            );

            const button = screen.getByTestId('custom-button');
            expect(button).toHaveAttribute('aria-label', 'Custom label');
        });

        it('handles type prop', () => {
            render(<Button type="submit">Submit Button</Button>);

            const button = screen.getByRole('button');
            expect(button).toHaveAttribute('type', 'submit');
        });
    });

    describe('Edge Cases', () => {
        it('handles onClick being undefined', async () => {
            const user = userEvent.setup();

            render(<Button>No onClick</Button>);

            const button = screen.getByRole('button');

            // Should not throw error
            await user.click(button);
            expect(button).toBeInTheDocument();
        });

        it('handles empty children', () => {
            render(<Button></Button>);

            const button = screen.getByRole('button');
            expect(button).toBeInTheDocument();
            expect(button).toHaveTextContent('');
        });

        it('handles multiple rapid clicks', async () => {
            const handleClick = vi.fn();
            const user = userEvent.setup();

            render(<Button onClick={handleClick}>Rapid Click</Button>);

            const button = screen.getByRole('button');

            // Rapid clicks
            await user.click(button);
            await user.click(button);
            await user.click(button);
            await user.click(button);

            expect(handleClick).toHaveBeenCalledTimes(4);
        });
    });
});
