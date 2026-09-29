import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import FullScreenLoader from '../FullScreenLoader';

describe('FullScreenLoader', () => {
    it('renders the Loader icon with animate-spin class', () => {
        render(<FullScreenLoader />);
        const icon = screen.getByRole('img');

        expect(icon).toBeInTheDocument();
        expect(icon).toHaveClass('animate-spin');
    });

    it('displays the "Loading..." text', () => {
        render(<FullScreenLoader />);
        const loadingText = screen.getByText(/loading.../i);

        expect(loadingText).toBeInTheDocument();
        expect(loadingText).toHaveClass('text-sm');
    });

    it('Loader icon has correct size attribute', () => {
        render(<FullScreenLoader />);
        const icon = screen.getByRole('img');

        expect(icon).toHaveAttribute('width', '26');
        expect(icon).toHaveAttribute('height', '26');
    });

    it('renders wrapper divs with proper layout classes', () => {
        render(<FullScreenLoader />);
        const outerDiv = screen.getByText('Loading...').closest('div')?.parentElement;

        expect(outerDiv).toHaveClass('flex', 'flex-col', 'items-center', 'justify-center');
    });
});
