import { create } from 'zustand';

interface UserIF {
    firstName: string;
}

interface AuthStore {
    user: UserIF | null; // Define user as UserIF or null
    setUser: (user: UserIF | null) => void; // Specify setUser to accept UserIF or null
}

export const useAuthStore = create<AuthStore>(set => ({
    user: null,
    setUser: user => set({ user }) // Update setUser to directly set the user
}));
