import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import useToggle from '../useToggleHook';

describe('useToggle', () => {
    it('should initialize with false by default', () => {
        const { result } = renderHook(() => useToggle());
        expect(result.current[0]).toBe(false);
    });

    it('should initialize with true if passed as initial value', () => {
        const { result } = renderHook(() => useToggle(true));
        expect(result.current[0]).toBe(true);
    });

    it('should toggle value when toggle is called', () => {
        const { result } = renderHook(() => useToggle());
        act(() => {
            result.current[1]();
        });
        expect(result.current[0]).toBe(true);
        act(() => {
            result.current[1]();
        });
        expect(result.current[0]).toBe(false);
    });

    it('should set value when setToggle is called', () => {
        const { result } = renderHook(() => useToggle());
        act(() => {
            result.current[2](true);
        });
        expect(result.current[0]).toBe(true);
        act(() => {
            result.current[2](false);
        });
        expect(result.current[0]).toBe(false);
    });
});
