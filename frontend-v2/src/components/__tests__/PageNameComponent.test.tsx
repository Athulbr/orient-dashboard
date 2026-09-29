import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import PageNameComponent from '../PageName';
import * as router from 'react-router-dom';

// Mock useNavigate from react-router-dom
vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual<typeof router>('react-router-dom');
    return {
        ...actual,
        useNavigate: vi.fn()
    };
});

describe('PageNameComponent', () => {
    const mockedUseNavigate = router.useNavigate as unknown as ReturnType<typeof vi.fn>;

    it('renders the page name correctly without back button', () => {
        render(<PageNameComponent name="Dashboard" />);

        expect(screen.getByText('Dashboard')).toBeInTheDocument();
        expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });

    it('renders the back button when showBackButton is true', () => {
        render(<PageNameComponent name="Profile" showBackButton />);

        const button = screen.getByRole('button');
        expect(button).toBeInTheDocument();
        expect(screen.getByText('Profile')).toBeInTheDocument();
    });

    it('calls customGoBackFunction when provided and back button is clicked', async () => {
        const customBack = vi.fn();
        const user = userEvent.setup();

        render(<PageNameComponent name="Settings" showBackButton customGoBackFunction={customBack} />);

        const button = screen.getByRole('button');
        await user.click(button);

        expect(customBack).toHaveBeenCalledOnce();
    });

    it('calls navigate(-1) when no customGoBackFunction is provided', async () => {
        const mockNavigate = vi.fn();
        mockedUseNavigate.mockReturnValue(mockNavigate);

        const user = userEvent.setup();
        render(<PageNameComponent name="Reports" showBackButton />);

        const button = screen.getByRole('button');
        await user.click(button);

        expect(mockNavigate).toHaveBeenCalledWith(-1);
        expect(mockNavigate).toHaveBeenCalledOnce();
    });
});
