import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DialogComponent } from '../DialogComponent';

// Mock the custom hook
vi.mock('../hooks/useEscapeKey', () => ({
    useEscapeKey: vi.fn()
}));

// Mock the components - fix the import path
vi.mock('../ButtonBox', () => ({
    ButtonBox: ({ children, className }: { children: React.ReactNode; className?: string }) => (
        <div data-testid="button-box" className={className}>
            {children}
        </div>
    )
}));

vi.mock('../Button', () => ({
    Button: ({ children, onClick, outlined }: { children: React.ReactNode; onClick?: () => void; outlined?: boolean }) => (
        <button data-testid={outlined ? 'secondary-button' : 'primary-button'} onClick={onClick}>
            {children}
        </button>
    )
}));

// Mock lucide-react
vi.mock('lucide-react', () => ({
    X: ({ size }: { size?: number }) => (
        <div data-testid="close-icon" data-size={size}>
            X
        </div>
    )
}));

describe('DialogComponent', () => {
    const mockCloseDialog = vi.fn();
    const mockOnPrimaryAction = vi.fn();
    const mockOnSecondaryAction = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        // Reset body overflow style
        document.body.style.overflow = '';
    });

    afterEach(() => {
        // Clean up body overflow style
        document.body.style.overflow = '';
    });

    describe('Rendering', () => {
        it('should not render when isOpen is false', () => {
            render(<DialogComponent isOpen={false} closeDialog={mockCloseDialog} />);

            expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        });

        it('should not render when isOpen is undefined', () => {
            render(<DialogComponent closeDialog={mockCloseDialog} />);

            expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        });

        it('should render when isOpen is true', () => {
            render(<DialogComponent isOpen={true} closeDialog={mockCloseDialog} />);

            expect(screen.getByRole('dialog')).toBeInTheDocument();
        });

        it('should render with default dialog title', () => {
            render(<DialogComponent isOpen={true} closeDialog={mockCloseDialog} />);

            expect(screen.getByText('Dialog Title')).toBeInTheDocument();
        });

        it('should render with custom dialog title', () => {
            render(<DialogComponent isOpen={true} name="Custom Dialog" closeDialog={mockCloseDialog} />);

            expect(screen.getByText('Custom Dialog')).toBeInTheDocument();
        });

        it('should render children content', () => {
            render(
                <DialogComponent isOpen={true} closeDialog={mockCloseDialog}>
                    <div>Dialog content</div>
                </DialogComponent>
            );

            expect(screen.getByText('Dialog content')).toBeInTheDocument();
        });

        it('should render close button with X icon', () => {
            render(<DialogComponent isOpen={true} closeDialog={mockCloseDialog} />);

            expect(screen.getByLabelText('Close dialog')).toBeInTheDocument();
            expect(screen.getByTestId('close-icon')).toBeInTheDocument();
        });

        it('should apply custom className', () => {
            render(<DialogComponent isOpen={true} className="custom-class" closeDialog={mockCloseDialog} />);

            const dialog = screen.getByRole('dialog');
            expect(dialog).toHaveClass('custom-class');
        });
    });

    describe('Buttons', () => {
        it('should not render button box when no button text is provided', () => {
            render(<DialogComponent isOpen={true} closeDialog={mockCloseDialog} />);

            expect(screen.queryByTestId('button-box')).not.toBeInTheDocument();
        });

        it('should render primary button when primaryButtonText is provided', () => {
            render(<DialogComponent isOpen={true} primaryButtonText="Save" closeDialog={mockCloseDialog} />);

            expect(screen.getByTestId('button-box')).toBeInTheDocument();
            expect(screen.getByTestId('primary-button')).toBeInTheDocument();
            expect(screen.getByText('Save')).toBeInTheDocument();
        });

        it('should render secondary button when secondaryButtonText is provided', () => {
            render(<DialogComponent isOpen={true} secondaryButtonText="Cancel" closeDialog={mockCloseDialog} />);

            expect(screen.getByTestId('button-box')).toBeInTheDocument();
            expect(screen.getByTestId('secondary-button')).toBeInTheDocument();
            expect(screen.getByText('Cancel')).toBeInTheDocument();
        });

        it('should render both buttons when both button texts are provided', () => {
            render(<DialogComponent isOpen={true} primaryButtonText="Save" secondaryButtonText="Cancel" closeDialog={mockCloseDialog} />);

            expect(screen.getByTestId('primary-button')).toBeInTheDocument();
            expect(screen.getByTestId('secondary-button')).toBeInTheDocument();
        });
    });

    describe('Event Handlers', () => {
        it('should call closeDialog when close button is clicked', () => {
            render(<DialogComponent isOpen={true} closeDialog={mockCloseDialog} />);

            fireEvent.click(screen.getByLabelText('Close dialog'));
            expect(mockCloseDialog).toHaveBeenCalledTimes(1);
        });

        it('should call onPrimaryAction when primary button is clicked', () => {
            render(<DialogComponent isOpen={true} primaryButtonText="Save" onPrimaryAction={mockOnPrimaryAction} closeDialog={mockCloseDialog} />);

            fireEvent.click(screen.getByTestId('primary-button'));
            expect(mockOnPrimaryAction).toHaveBeenCalledTimes(1);
        });

        it('should call closeDialog when primary button is clicked and no onPrimaryAction is provided', () => {
            render(<DialogComponent isOpen={true} primaryButtonText="Save" closeDialog={mockCloseDialog} />);

            fireEvent.click(screen.getByTestId('primary-button'));
            expect(mockCloseDialog).toHaveBeenCalledTimes(1);
        });

        it('should call onSecondaryAction when secondary button is clicked', () => {
            render(<DialogComponent isOpen={true} secondaryButtonText="Cancel" onSecondaryAction={mockOnSecondaryAction} closeDialog={mockCloseDialog} />);

            fireEvent.click(screen.getByTestId('secondary-button'));
            expect(mockOnSecondaryAction).toHaveBeenCalledTimes(1);
        });

        it('should call closeDialog when secondary button is clicked and no onSecondaryAction is provided', () => {
            render(<DialogComponent isOpen={true} secondaryButtonText="Cancel" closeDialog={mockCloseDialog} />);

            fireEvent.click(screen.getByTestId('secondary-button'));
            expect(mockCloseDialog).toHaveBeenCalledTimes(1);
        });
    });

    describe('Click Outside', () => {
        it('should call closeDialog when clicking outside the dialog', async () => {
            render(<DialogComponent isOpen={true} closeDialog={mockCloseDialog} />);

            // Click on the backdrop (outside the dialog content)
            const backdrop = screen.getByRole('dialog').parentElement;
            if (backdrop) {
                fireEvent.mouseDown(backdrop);
            }

            await waitFor(() => {
                expect(mockCloseDialog).toHaveBeenCalledTimes(1);
            });
        });

        it('should not call closeDialog when clicking inside the dialog', async () => {
            render(
                <DialogComponent isOpen={true} closeDialog={mockCloseDialog}>
                    <div data-testid="dialog-content">Content</div>
                </DialogComponent>
            );

            // Click inside the dialog
            fireEvent.mouseDown(screen.getByTestId('dialog-content'));

            // Wait a bit to ensure no call is made
            await new Promise(resolve => setTimeout(resolve, 100));
            expect(mockCloseDialog).not.toHaveBeenCalled();
        });

        it('should not add event listener when dialog is closed', () => {
            const addEventListenerSpy = vi.spyOn(document, 'addEventListener');

            render(<DialogComponent isOpen={false} closeDialog={mockCloseDialog} />);

            expect(addEventListenerSpy).not.toHaveBeenCalledWith('mousedown', expect.any(Function));

            addEventListenerSpy.mockRestore();
        });
    });

    describe('Body Scroll Management', () => {
        it('should set body overflow to hidden when dialog is open', () => {
            render(<DialogComponent isOpen={true} closeDialog={mockCloseDialog} />);

            expect(document.body.style.overflow).toBe('hidden');
        });

        it('should restore body overflow when dialog is closed', () => {
            const { rerender } = render(<DialogComponent isOpen={true} closeDialog={mockCloseDialog} />);

            expect(document.body.style.overflow).toBe('hidden');

            rerender(<DialogComponent isOpen={false} closeDialog={mockCloseDialog} />);

            expect(document.body.style.overflow).toBe('');
        });

        it('should restore body overflow on unmount', () => {
            const { unmount } = render(<DialogComponent isOpen={true} closeDialog={mockCloseDialog} />);

            expect(document.body.style.overflow).toBe('hidden');

            unmount();

            expect(document.body.style.overflow).toBe('');
        });
    });

    describe('Accessibility', () => {
        it('should have proper ARIA attributes', () => {
            render(<DialogComponent isOpen={true} name="Test Dialog" closeDialog={mockCloseDialog} />);

            const dialog = screen.getByRole('dialog');
            expect(dialog).toHaveAttribute('aria-modal', 'true');
            expect(dialog).toHaveAttribute('aria-labelledby', 'dialog-title');

            const title = screen.getByText('Test Dialog');
            expect(title).toHaveAttribute('id', 'dialog-title');
        });

        it('should have accessible close button', () => {
            render(<DialogComponent isOpen={true} closeDialog={mockCloseDialog} />);

            const closeButton = screen.getByLabelText('Close dialog');
            expect(closeButton).toHaveAttribute('type', 'button');
            expect(closeButton).toHaveAttribute('aria-label', 'Close dialog');
        });
    });

    describe('Default Props', () => {
        it('should use default closeDialog function when not provided', () => {
            // This test ensures the component doesn't crash when closeDialog is not provided
            expect(() => {
                render(<DialogComponent isOpen={true} />);
            }).not.toThrow();
        });

        it('should render empty fragment as default children', () => {
            render(<DialogComponent isOpen={true} />);

            // Should render without children content
            const dialog = screen.getByRole('dialog');
            expect(dialog).toBeInTheDocument();
        });
    });
});
