/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vite.dev/config/
export default defineConfig({
    plugins: [react(), tailwindcss()],
    preview: {
        allowedHosts: [
            'devapi.makez.ai',
            'dev.makez.ai',
            'app.makez.ai',
            '[IP_ADDRESS]',
            'frontend-v2'
        ]
    },
    test: {
        globals: true,
        environment: 'jsdom',
        setupFiles: './src/test/setup.ts',
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html'],
            exclude: [
                'node_modules/',
                'src/test/setup.ts',
                '**/*.d.ts',
                '**/*.config.{js,ts}',
                '**/vite.config.ts',
                'dist/',
                'coverage/',
                '**/*.test.{js,ts,jsx,tsx}',
                '**/*.spec.{js,ts,jsx,tsx}',
                '**/main.tsx',
                '**/index.tsx'
            ],
            include: ['src/**/*.{js,ts,jsx,tsx}'],
            thresholds: {
                global: {
                    branches: 80,
                    functions: 80,
                    lines: 80,
                    statements: 80
                }
            }
        }
    }
});
