import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ButtonBox } from '../ButtonBox';

describe('ButtonBox', () => {
    it('renders the ButtonBox with default alignment (end)', () => {
        render(
            <ButtonBox>
                <span>Child</span>
            </ButtonBox>
        );

        const group = screen.getByRole('group');
        expect(group).toBeInTheDocument();
        expect(group).toHaveClass('flex', 'flex-wrap', 'items-center', 'gap-3', 'justify-end');
    });

    it('renders with start alignment when start=true', () => {
        render(
            <ButtonBox start>
                <span>Child</span>
            </ButtonBox>
        );

        const group = screen.getByRole('group');
        expect(group).toHaveClass('justify-start');
        expect(group).not.toHaveClass('justify-center');
        expect(group).not.toHaveClass('justify-end');
    });

    it('renders with center alignment when center=true', () => {
        render(
            <ButtonBox center>
                <span>Child</span>
            </ButtonBox>
        );

        const group = screen.getByRole('group');
        expect(group).toHaveClass('justify-center');
        expect(group).not.toHaveClass('justify-start');
        expect(group).not.toHaveClass('justify-end');
    });

    it('applies custom className correctly', () => {
        render(
            <ButtonBox className="custom-class">
                <span>Child</span>
            </ButtonBox>
        );

        const group = screen.getByRole('group');
        expect(group).toHaveClass('custom-class');
    });

    it('renders children correctly', () => {
        render(
            <ButtonBox>
                <button>Click me</button>
            </ButtonBox>
        );

        const childButton = screen.getByRole('button');
        expect(childButton).toBeInTheDocument();
        expect(childButton).toHaveTextContent('Click me');
    });

    it('does not add multiple justify-* classes', () => {
        render(
            <ButtonBox start center end={false}>
                <span>Child</span>
            </ButtonBox>
        );

        const group = screen.getByRole('group');
        const classes = group.className.split(' ');
        const justifyClasses = classes.filter(cls => cls.startsWith('justify-'));

        expect(justifyClasses).toEqual(['justify-start']);
    });

    it('uses justify-end as fallback when no alignment prop is true', () => {
        render(
            <ButtonBox start={false} center={false} end={false}>
                <span>Child</span>
            </ButtonBox>
        );

        const group = screen.getByRole('group');
        expect(group).toHaveClass('justify-end');
    });
});
