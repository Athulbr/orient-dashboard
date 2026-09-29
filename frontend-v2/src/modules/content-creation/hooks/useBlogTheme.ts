import { useState, useEffect, useCallback } from 'react';
import httpRequest from '../../../global-utils/httpRequest';
import { config } from '../../../config/default';
import type { Theme } from '../types';

const STYLE_TAG_ID = 'blog-theme-styles';

// Only text-content classes are injected as CSS.
// Layout/interactive elements (a, table, td, th) keep their AI-generated inline styles
// and must NOT be overridden here — this also fixes stale themes saved before this rule.
const CONTENT_CLASSES = new Set([
    'blog-h2', 'blog-h3', 'blog-h4',
    'blog-p',
    'blog-ul', 'blog-ol', 'blog-li',
    'blog-blockquote',
]);

// Layout resets for blog-table/td classes that older saved records may have on product-card
// tables. These are non-visual fixes: collapse spacing, pin content to the top of the cell,
// and clear any border/padding the earlier transformer accidentally injected.
const BASE_LAYOUT_CSS = `
.blog-table { border-collapse: collapse; width: 100%; }
.blog-td, .blog-th { vertical-align: top; padding: 0; border: none; }
`.trim();

export function themeToCSS(theme: Theme): string {
    const themeCss = Object.entries(theme)
        .filter(([cls]) => CONTENT_CLASSES.has(cls))
        .map(([cls, styles]) => {
            const decls = Object.entries(styles)
                .map(([prop, val]) => `  ${prop}: ${val};`)
                .join('\n');
            return `.${cls} {\n${decls}\n}`;
        })
        .join('\n\n');

    return [BASE_LAYOUT_CSS, themeCss].filter(Boolean).join('\n\n');
}

function getOrCreateStyleTag(): HTMLStyleElement {
    let el = document.getElementById(STYLE_TAG_ID) as HTMLStyleElement | null;
    if (!el) {
        el = document.createElement('style');
        el.id = STYLE_TAG_ID;
        document.head.appendChild(el);
    }
    return el;
}

function computeMerged(base: Theme | undefined, overrides: Theme): Theme {
    const merged: Theme = {};
    const allCls = new Set([...Object.keys(base || {}), ...Object.keys(overrides)]);
    allCls.forEach(cls => {
        merged[cls] = { ...(base?.[cls] || {}), ...(overrides[cls] || {}) };
    });
    return merged;
}

/**
 * Manages blog theme state, persists overrides via API, and injects a
 * scoped <style> tag into the document head whenever the theme changes.
 */
export function useBlogTheme(
    recordId: string | undefined,
    baseTheme: Theme | undefined,
    initialOverrides: Theme | undefined
) {
    const [overrides, setOverrides] = useState<Theme>(initialOverrides || {});

    const merged = computeMerged(baseTheme, overrides);

    // Keep the shared style tag in sync with the current merged theme
    useEffect(() => {
        const styleTag = getOrCreateStyleTag();
        styleTag.textContent = themeToCSS(merged);
    });

    // Cleanup the style tag when the component that owns this hook unmounts
    useEffect(() => {
        return () => {
            document.getElementById(STYLE_TAG_ID)?.remove();
        };
    }, []);

    // Re-sync if parent loads new overrides from the server (e.g. after fetchRecord)
    useEffect(() => {
        setOverrides(initialOverrides || {});
    }, [initialOverrides]);

    const updateStyle = useCallback(
        async (className: string, property: string, value: string) => {
            const newOverrides: Theme = {
                ...overrides,
                [className]: { ...(overrides[className] || {}), [property]: value },
            };
            // Optimistic DOM update
            setOverrides(newOverrides);
            const styleTag = getOrCreateStyleTag();
            styleTag.textContent = themeToCSS(computeMerged(baseTheme, newOverrides));

            if (recordId) {
                try {
                    await httpRequest(
                        'PATCH',
                        `${config.mlServiceNodejs}/content-creation/records/${recordId}/theme`,
                        { themeOverrides: newOverrides }
                    );
                } catch {
                    console.error('Failed to persist theme override');
                }
            }
        },
        [recordId, baseTheme, overrides]
    );

    const resetTheme = useCallback(async () => {
        setOverrides({});
        const styleTag = getOrCreateStyleTag();
        styleTag.textContent = themeToCSS(baseTheme || {});

        if (recordId) {
            try {
                await httpRequest(
                    'PATCH',
                    `${config.mlServiceNodejs}/content-creation/records/${recordId}/theme/reset`,
                    {}
                );
            } catch {
                console.error('Failed to reset theme');
            }
        }
    }, [recordId, baseTheme]);

    return { merged, overrides, updateStyle, resetTheme };
}
