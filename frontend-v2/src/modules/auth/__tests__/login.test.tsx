import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useState } from 'react';
import { LoginInputs } from '../login/components/LoginInputs';
import { LoginPageStateProvider } from '../login/hooks/LoginPageStateProvider';
import { LoginPageStateIF } from '../login';

// Mock dependencies
vi.mock('react-router-dom', () => ({
    useNavigate: () => vi.fn(),
    useParams: () => ({})
}));

vi.mock('../../../../components/toast/ToastStore', () => ({
    useToastStore: () => ({
        success: vi.fn(),
        error: vi.fn()
    })
}));

vi.mock('../../../../zustand-store/PermissionStore', () => ({
    usePermissionStore: () => ({
        settings: {},
        checkPermission: vi.fn(),
        setPermissions: vi.fn()
    })
}));

// Mock window.location
const mockReplace = vi.fn();
Object.defineProperty(window, 'location', {
    value: { replace: mockReplace },
    writable: true
});

// Mock sessionStorage
const mockSessionStorage: Record<string, string> = {};
Object.defineProperty(window, 'sessionStorage', {
    value: {
        getItem: (key: string) => mockSessionStorage[key] || null,
        setItem: (key: string, value: string) => {
            mockSessionStorage[key] = value;
        },
        removeItem: (key: string) => {
            delete mockSessionStorage[key];
        },
        clear: () => {
            Object.keys(mockSessionStorage).forEach(key => delete mockSessionStorage[key]);
        }
    },
    writable: true
});

// Helper to create initial state
const createInitialState = (overrides: Partial<LoginPageStateIF> = {}): LoginPageStateIF => ({
    email: '',
    password: '',
    loading: false,
    oAuthLoading: false,
    authError: '',
    fieldError: {
        email: '',
        password: ''
    },
    isSubmitClicked: false,
    ...overrides
});

// Wrapper component for testing with state
const LoginInputsWrapper = ({ initialState = createInitialState() }: { initialState?: LoginPageStateIF }) => {
    const [state, setState] = useState<LoginPageStateIF>(initialState);

    return (
        <LoginPageStateProvider value={{ state, setState }}>
            <LoginInputs />
        </LoginPageStateProvider>
    );
};

// Mock fetch globally
const mockFetch = vi.fn();

describe('LoginInputs Component', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockReplace.mockReset();
        Object.keys(mockSessionStorage).forEach(key => delete mockSessionStorage[key]);
    });

    describe('Rendering', () => {
        it('should render email and password fields', () => {
            render(<LoginInputsWrapper />);

            const emailInput = document.querySelector('input[name="email"]');
            expect(emailInput).toBeInTheDocument();

            expect(screen.getByRole('textbox', { name: /password/i })).toBeInTheDocument();
        });

        it('should render email label text', () => {
            render(<LoginInputsWrapper />);
            expect(screen.getByText('Email')).toBeInTheDocument();
        });

        it('should render password label text', () => {
            render(<LoginInputsWrapper />);
            expect(screen.getByText('Password')).toBeInTheDocument();
        });

        it('should render sign in button', () => {
            render(<LoginInputsWrapper />);
            expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
        });

        it('should render forgot password link', () => {
            render(<LoginInputsWrapper />);
            expect(screen.getByText(/forgot password/i)).toBeInTheDocument();
        });

        it('should show loading state when loading is true', () => {
            render(<LoginInputsWrapper initialState={createInitialState({ loading: true })} />);
            expect(screen.getByRole('button', { name: /signing in/i })).toBeInTheDocument();
        });

        it('should disable button when loading', () => {
            render(<LoginInputsWrapper initialState={createInitialState({ loading: true })} />);
            expect(screen.getByRole('button', { name: /signing in/i })).toBeDisabled();
        });
    });

    describe('User Input', () => {
        it('should update email value on input', async () => {
            const user = userEvent.setup();
            render(<LoginInputsWrapper />);

            const emailInput = document.querySelector('input[name="email"]') as HTMLInputElement;
            await user.type(emailInput, 'test@example.com');

            expect(emailInput).toHaveValue('test@example.com');
        });

        it('should update password value on input', async () => {
            const user = userEvent.setup();
            render(<LoginInputsWrapper />);

            const passwordInput = screen.getByRole('textbox', { name: /password/i });
            await user.type(passwordInput, 'password123');

            expect(passwordInput).toHaveValue('password123');
        });
    });

    describe('Field Errors', () => {
        it('should display email error message', () => {
            render(
                <LoginInputsWrapper
                    initialState={createInitialState({
                        fieldError: { email: 'Email is required', password: '' }
                    })}
                />
            );

            expect(screen.getByRole('alert')).toHaveTextContent('Email is required');
        });

        it('should display password error message', () => {
            render(
                <LoginInputsWrapper
                    initialState={createInitialState({
                        fieldError: { email: '', password: 'Password is required' }
                    })}
                />
            );

            expect(screen.getByRole('alert')).toHaveTextContent('Password is required');
        });

        it('should display both error messages', () => {
            render(
                <LoginInputsWrapper
                    initialState={createInitialState({
                        fieldError: { email: 'Email is required', password: 'Password is required' }
                    })}
                />
            );

            const alerts = screen.getAllByRole('alert');
            expect(alerts).toHaveLength(2);
            expect(alerts[0]).toHaveTextContent('Email is required');
            expect(alerts[1]).toHaveTextContent('Password is required');
        });
    });
});

describe('Login Flow', () => {
    const originalFetch = global.fetch;

    beforeEach(() => {
        vi.clearAllMocks();
        mockFetch.mockReset();
        mockReplace.mockReset();
        Object.keys(mockSessionStorage).forEach(key => delete mockSessionStorage[key]);
        global.fetch = mockFetch;
    });

    afterEach(() => {
        global.fetch = originalFetch;
    });

    // Helper to create mock fetch response
    const createMockResponse = (data: any, ok = true, status = 200) => ({
        ok,
        status,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve(data)
    });

    describe('Form Submission', () => {
        it('should call login API with correct credentials', async () => {
            const user = userEvent.setup();

            const mockLoginResponse = {
                data: {
                    accessToken: 'mock-token',
                    user: { firstName: 'John', role: { _id: 'role-1' } },
                    permissions: ['read', 'write']
                }
            };

            mockFetch
                .mockResolvedValueOnce(createMockResponse(mockLoginResponse))
                .mockResolvedValueOnce(createMockResponse({ data: [] }))
                .mockResolvedValueOnce(createMockResponse({ data: [] }))
                .mockResolvedValueOnce(createMockResponse({ data: [] }))
                .mockResolvedValueOnce(createMockResponse({ data: [] }));

            render(
                <LoginInputsWrapper
                    initialState={createInitialState({
                        email: 'test@example.com',
                        password: 'password123'
                    })}
                />
            );

            const signInButton = screen.getByRole('button', { name: /sign in/i });
            await user.click(signInButton);

            await waitFor(() => {
                expect(mockFetch).toHaveBeenCalled();
                const firstCall = mockFetch.mock.calls[0];
                expect(firstCall[0]).toContain('/auth/login');
                const body = JSON.parse(firstCall[1].body);
                expect(body.email).toBe('test@example.com');
                expect(body.password).toBe('password123');
            });
        });

        it('should store tokens in sessionStorage on successful login', async () => {
            const user = userEvent.setup();

            const mockLoginResponse = {
                data: {
                    accessToken: 'mock-token-123',
                    user: { firstName: 'John', role: { _id: 'role-1' } },
                    permissions: ['read', 'write']
                }
            };

            mockFetch
                .mockResolvedValueOnce(createMockResponse(mockLoginResponse))
                .mockResolvedValueOnce(createMockResponse({ data: [] }))
                .mockResolvedValueOnce(createMockResponse({ data: [] }))
                .mockResolvedValueOnce(createMockResponse({ data: [] }))
                .mockResolvedValueOnce(createMockResponse({ data: [] }));

            render(
                <LoginInputsWrapper
                    initialState={createInitialState({
                        email: 'test@example.com',
                        password: 'password123'
                    })}
                />
            );

            const signInButton = screen.getByRole('button', { name: /sign in/i });
            await user.click(signInButton);

            await waitFor(() => {
                expect(mockSessionStorage['accessToken']).toBe(JSON.stringify('mock-token-123'));
                expect(mockSessionStorage['user']).toBe(JSON.stringify({ firstName: 'John', role: { _id: 'role-1' } }));
                expect(mockSessionStorage['permissions']).toBe(JSON.stringify(['read', 'write']));
            });
        });

        it('should redirect to home on successful login', async () => {
            const user = userEvent.setup();

            const mockLoginResponse = {
                data: {
                    accessToken: 'mock-token',
                    user: { firstName: 'John' },
                    permissions: []
                }
            };

            mockFetch
                .mockResolvedValueOnce(createMockResponse(mockLoginResponse))
                .mockResolvedValueOnce(createMockResponse({ data: [] }))
                .mockResolvedValueOnce(createMockResponse({ data: [] }))
                .mockResolvedValueOnce(createMockResponse({ data: [] }))
                .mockResolvedValueOnce(createMockResponse({ data: [] }));

            render(
                <LoginInputsWrapper
                    initialState={createInitialState({
                        email: 'test@example.com',
                        password: 'password123'
                    })}
                />
            );

            const signInButton = screen.getByRole('button', { name: /sign in/i });
            await user.click(signInButton);

            await waitFor(() => {
                expect(mockReplace).toHaveBeenCalledWith('/');
            });
        });

        it('should fetch additional data after successful login', async () => {
            const user = userEvent.setup();

            const mockLoginResponse = {
                data: {
                    accessToken: 'mock-token',
                    user: { firstName: 'John' },
                    permissions: []
                }
            };

            mockFetch
                .mockResolvedValueOnce(createMockResponse(mockLoginResponse))
                .mockResolvedValueOnce(createMockResponse({ data: [{ table: 1 }] }))
                .mockResolvedValueOnce(createMockResponse({ data: [{ form: 1 }] }))
                .mockResolvedValueOnce(createMockResponse({ data: [{ preTemplate: 1 }] }))
                .mockResolvedValueOnce(createMockResponse({ data: [{ template: 1 }] }));

            render(
                <LoginInputsWrapper
                    initialState={createInitialState({
                        email: 'test@example.com',
                        password: 'password123'
                    })}
                />
            );

            const signInButton = screen.getByRole('button', { name: /sign in/i });
            await user.click(signInButton);

            await waitFor(() => {
                const calls = mockFetch.mock.calls.map((c: any[]) => c[0]);
                expect(calls.some((url: string) => url.includes('/builder/tablebuilder/query'))).toBe(true);
                expect(calls.some((url: string) => url.includes('/builder/formbuilder/query'))).toBe(true);
            });
        });
    });

    describe('Validation', () => {
        it('should not submit with empty email', async () => {
            const user = userEvent.setup();

            render(
                <LoginInputsWrapper
                    initialState={createInitialState({
                        email: '',
                        password: 'password123'
                    })}
                />
            );

            const signInButton = screen.getByRole('button', { name: /sign in/i });
            await user.click(signInButton);

            // Wait a bit to ensure no API call was made
            await new Promise(resolve => setTimeout(resolve, 100));
            expect(mockFetch).not.toHaveBeenCalled();
        });

        it('should not submit with empty password', async () => {
            const user = userEvent.setup();

            render(
                <LoginInputsWrapper
                    initialState={createInitialState({
                        email: 'test@example.com',
                        password: ''
                    })}
                />
            );

            const signInButton = screen.getByRole('button', { name: /sign in/i });
            await user.click(signInButton);

            await new Promise(resolve => setTimeout(resolve, 100));
            expect(mockFetch).not.toHaveBeenCalled();
        });

        it('should not submit with invalid email format', async () => {
            const user = userEvent.setup();

            render(
                <LoginInputsWrapper
                    initialState={createInitialState({
                        email: 'invalid-email',
                        password: 'password123'
                    })}
                />
            );

            const signInButton = screen.getByRole('button', { name: /sign in/i });
            await user.click(signInButton);

            await new Promise(resolve => setTimeout(resolve, 100));
            expect(mockFetch).not.toHaveBeenCalled();
        });

        it('should not submit with short password', async () => {
            const user = userEvent.setup();

            render(
                <LoginInputsWrapper
                    initialState={createInitialState({
                        email: 'test@example.com',
                        password: '12345'
                    })}
                />
            );

            const signInButton = screen.getByRole('button', { name: /sign in/i });
            await user.click(signInButton);

            await new Promise(resolve => setTimeout(resolve, 100));
            expect(mockFetch).not.toHaveBeenCalled();
        });
    });

    describe('Error Handling', () => {
        it('should handle invalid credentials error', async () => {
            const user = userEvent.setup();

            mockFetch.mockResolvedValueOnce(
                createMockResponse({ message: 'Invalid password' }, false, 403)
            );

            render(
                <LoginInputsWrapper
                    initialState={createInitialState({
                        email: 'test@example.com',
                        password: 'wrongpassword'
                    })}
                />
            );

            const signInButton = screen.getByRole('button', { name: /sign in/i });
            await user.click(signInButton);

            await waitFor(() => {
                expect(mockFetch).toHaveBeenCalled();
                expect(mockReplace).not.toHaveBeenCalled();
            });
        });

        it('should handle network error', async () => {
            const user = userEvent.setup();

            mockFetch.mockRejectedValueOnce(new Error('Network error'));

            render(
                <LoginInputsWrapper
                    initialState={createInitialState({
                        email: 'test@example.com',
                        password: 'password123'
                    })}
                />
            );

            const signInButton = screen.getByRole('button', { name: /sign in/i });
            await user.click(signInButton);

            await waitFor(() => {
                expect(mockFetch).toHaveBeenCalled();
                expect(mockReplace).not.toHaveBeenCalled();
            });
        });

        it('should handle missing access token in response', async () => {
            const user = userEvent.setup();

            mockFetch.mockResolvedValueOnce(
                createMockResponse({
                    data: {
                        user: { firstName: 'John' }
                        // No accessToken
                    }
                })
            );

            render(
                <LoginInputsWrapper
                    initialState={createInitialState({
                        email: 'test@example.com',
                        password: 'password123'
                    })}
                />
            );

            const signInButton = screen.getByRole('button', { name: /sign in/i });
            await user.click(signInButton);

            await waitFor(() => {
                expect(mockFetch).toHaveBeenCalled();
                expect(mockReplace).not.toHaveBeenCalled();
            });
        });
    });

    describe('Keyboard Navigation', () => {
        it('should submit form on Enter key in email field', async () => {
            const user = userEvent.setup();

            const mockLoginResponse = {
                data: {
                    accessToken: 'mock-token',
                    user: { firstName: 'John' },
                    permissions: []
                }
            };

            mockFetch
                .mockResolvedValueOnce(createMockResponse(mockLoginResponse))
                .mockResolvedValueOnce(createMockResponse({ data: [] }))
                .mockResolvedValueOnce(createMockResponse({ data: [] }))
                .mockResolvedValueOnce(createMockResponse({ data: [] }))
                .mockResolvedValueOnce(createMockResponse({ data: [] }));

            render(
                <LoginInputsWrapper
                    initialState={createInitialState({
                        email: 'test@example.com',
                        password: 'password123'
                    })}
                />
            );

            const emailInput = document.querySelector('input[name="email"]') as HTMLInputElement;
            emailInput.focus();
            await user.keyboard('{Enter}');

            await waitFor(() => {
                expect(mockFetch).toHaveBeenCalled();
                expect(mockFetch.mock.calls[0][0]).toContain('/auth/login');
            });
        });

        it('should submit form on Enter key in password field', async () => {
            const user = userEvent.setup();

            const mockLoginResponse = {
                data: {
                    accessToken: 'mock-token',
                    user: { firstName: 'John' },
                    permissions: []
                }
            };

            mockFetch
                .mockResolvedValueOnce(createMockResponse(mockLoginResponse))
                .mockResolvedValueOnce(createMockResponse({ data: [] }))
                .mockResolvedValueOnce(createMockResponse({ data: [] }))
                .mockResolvedValueOnce(createMockResponse({ data: [] }))
                .mockResolvedValueOnce(createMockResponse({ data: [] }));

            render(
                <LoginInputsWrapper
                    initialState={createInitialState({
                        email: 'test@example.com',
                        password: 'password123'
                    })}
                />
            );

            const passwordInput = screen.getByRole('textbox', { name: /password/i });
            passwordInput.focus();
            await user.keyboard('{Enter}');

            await waitFor(() => {
                expect(mockFetch).toHaveBeenCalled();
                expect(mockFetch.mock.calls[0][0]).toContain('/auth/login');
            });
        });
    });
});
