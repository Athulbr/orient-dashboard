// hooks/useToggle.ts
import { useCallback, useState } from 'react';

const useToggle = (initialValue: boolean = false): [boolean, () => void, (value: boolean) => void] => {
    const [state, setState] = useState<boolean>(initialValue);

    const toggle = useCallback(() => {
        setState(prev => !prev);
    }, []);

    const setToggle = useCallback((value: boolean) => {
        setState(value);
    }, []);

    return [state, toggle, setToggle];
};

export default useToggle;
