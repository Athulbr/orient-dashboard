import { renderHook } from '@testing-library/react';
import { fireEvent } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { useEscapeKey } from '../useEscapeKey';

describe('useEscapeKey', () => {
    const mockCallback = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should call callback when Escape key is pressed', () => {
        renderHook(() => useEscapeKey(mockCallback));

        fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });

        expect(mockCallback).toHaveBeenCalledTimes(1);
    });

    it('should not call callback when other keys are pressed', () => {
        renderHook(() => useEscapeKey(mockCallback));

        fireEvent.keyDown(document, { key: 'Enter', code: 'Enter' });
        fireEvent.keyDown(document, { key: 'Space', code: 'Space' });
        fireEvent.keyDown(document, { key: 'a', code: 'KeyA' });

        expect(mockCallback).not.toHaveBeenCalled();
    });

    it('should call callback multiple times for multiple Escape presses', () => {
        renderHook(() => useEscapeKey(mockCallback));

        fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });
        fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });
        fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });

        expect(mockCallback).toHaveBeenCalledTimes(3);
    });

    it('should remove event listener on unmount', () => {
        const addEventListenerSpy = vi.spyOn(document, 'addEventListener');
        const removeEventListenerSpy = vi.spyOn(document, 'removeEventListener');

        const { unmount } = renderHook(() => useEscapeKey(mockCallback));

        expect(addEventListenerSpy).toHaveBeenCalledWith('keydown', expect.any(Function));

        unmount();

        expect(removeEventListenerSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
    });

    it('should update event listener when callback changes', () => {
        const mockCallback1 = vi.fn();
        const mockCallback2 = vi.fn();

        const { rerender } = renderHook(({ callback }) => useEscapeKey(callback), { initialProps: { callback: mockCallback1 } });

        fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });
        expect(mockCallback1).toHaveBeenCalledTimes(1);
        expect(mockCallback2).not.toHaveBeenCalled();

        // Change the callback
        rerender({ callback: mockCallback2 });

        fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });
        expect(mockCallback1).toHaveBeenCalledTimes(1); // Still 1, not called again
        expect(mockCallback2).toHaveBeenCalledTimes(1); // New callback called
    });

    it('should handle case-sensitive key comparison', () => {
        renderHook(() => useEscapeKey(mockCallback));

        // Test various cases that shouldn't trigger
        fireEvent.keyDown(document, { key: 'escape', code: 'Escape' }); // lowercase
        fireEvent.keyDown(document, { key: 'ESCAPE', code: 'Escape' }); // uppercase
        fireEvent.keyDown(document, { key: 'Esc', code: 'Escape' }); // shortened

        expect(mockCallback).not.toHaveBeenCalled();

        // Only exact match should work
        fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });
        expect(mockCallback).toHaveBeenCalledTimes(1);
    });
});
