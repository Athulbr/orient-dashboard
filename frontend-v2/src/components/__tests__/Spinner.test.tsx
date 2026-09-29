import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import Spinner from '../Spinner';

describe('Spinner', () => {
    it('renders the Loader icon with animate-spin class', () => {
        render(<Spinner />);
        const icon = screen.getByRole('img');

        expect(icon).toBeInTheDocument();
        expect(icon).toHaveClass('animate-spin');
    });

    it('applies custom className correctly', () => {
        render(<Spinner className="text-red-500" />);
        const icon = screen.getByRole('img');

        expect(icon).toHaveClass('animate-spin', 'text-red-500');
    });

    it('applies size prop to Loader component', () => {
        render(<Spinner size={32} />);
        const icon = screen.getByRole('img');

        expect(icon).toHaveAttribute('width', '32');
        expect(icon).toHaveAttribute('height', '32');
    });

    it('renders with default size if not provided', () => {
        render(<Spinner />);
        const icon = screen.getByRole('img');

        // Lucide defaults to 24 if no size is passed
        expect(icon).toHaveAttribute('width', '24');
        expect(icon).toHaveAttribute('height', '24');
    });

    it('uses svg tag with proper accessibility role', () => {
        render(<Spinner />);
        const icon = screen.getByRole('img');

        expect(icon.tagName).toBe('svg');
        expect(icon).toHaveAttribute('role', 'img');
    });
});
