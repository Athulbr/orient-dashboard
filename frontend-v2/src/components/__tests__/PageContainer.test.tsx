import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import PageContainer from '../PageContainer';

describe('PageContainer', () => {
    it('renders children correctly', () => {
        render(
            <PageContainer>
                <p>Test Content</p>
            </PageContainer>
        );
        expect(screen.getByText('Test Content')).toBeInTheDocument();
    });

    it('applies custom className when provided', () => {
        const { container } = render(
            <PageContainer className="bg-red-500">
                <p>Content</p>
            </PageContainer>
        );

        const wrapper = container.firstChild as HTMLElement;
        expect(wrapper).toHaveClass('bg-red-500');
    });

    it('has default layout classes applied', () => {
        const { container } = render(
            <PageContainer>
                <p>Test</p>
            </PageContainer>
        );

        const wrapper = container.firstChild as HTMLElement;
        expect(wrapper).toHaveClass('flex', 'flex-1', 'flex-col', 'overflow-y-auto', 'p-6');
    });
});
