import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import JoditEditor from 'jodit-react';

export interface SelectionData {
    text: string;
    html: string;
    rect: DOMRect;
}

export interface RichTextEditorHandle {
    saveSelection: () => void;
    replaceSelection: (html: string) => void;
}

interface CssRule {
    selector: string;
    props: Record<string, string>;
}

/** Parse a flat CSS string into an array of { selector, props } entries.
 *  Splits comma-grouped selectors and skips @-rules. */
const parseCssRules = (css: string): CssRule[] => {
    const rules: CssRule[] = [];
    if (!css?.trim()) return rules;
    const ruleRe = /([^{@][^{]*)\{([^}]*)\}/g;
    let m: RegExpExecArray | null;
    while ((m = ruleRe.exec(css)) !== null) {
        const selectorGroup = m[1].trim();
        if (!selectorGroup || selectorGroup.startsWith('@')) continue;
        const props: Record<string, string> = {};
        m[2].split(';').forEach(decl => {
            const idx = decl.indexOf(':');
            if (idx === -1) return;
            const p = decl.slice(0, idx).trim();
            const v = decl.slice(idx + 1).trim();
            if (p && v) props[p] = v;
        });
        if (Object.keys(props).length === 0) continue;
        selectorGroup.split(',').forEach(sel => {
            const s = sel.trim();
            if (s) rules.push({ selector: s, props });
        });
    }
    return rules;
};

const TOOLTIP_ID = 'blog-css-hover-tooltip';

interface RichTextEditorProps {
    value: string;
    onChange: (content: string) => void;
    placeholder?: string;
    height?: string;
    onSelectionChange?: (data: SelectionData | null) => void;
    editorHandle?: React.RefObject<RichTextEditorHandle | null>;
    /** When provided, hovering over content elements shows matching CSS class names and styles. */
    blogCss?: string;
}

export const RichTextEditor: React.FC<RichTextEditorProps> = ({
    value,
    onChange,
    placeholder = 'Start typing...',
    height = '400px',
    onSelectionChange,
    editorHandle,
    blogCss,
}) => {
    // Keep latest callbacks in refs so stable callbacks below don't go stale
    const onSelectionChangeRef = useRef(onSelectionChange);
    onSelectionChangeRef.current = onSelectionChange;

    const editorHandleRef = useRef(editorHandle);
    editorHandleRef.current = editorHandle;

    // Keep parsed CSS rules in a ref so the stable handleEditorReady closure always
    // reads the latest version without needing to be re-created.
    const cssRulesRef = useRef<CssRule[]>([]);
    useEffect(() => {
        cssRulesRef.current = parseCssRules(blogCss || '');
    }, [blogCss]);

    // Tooltip DOM element ref — cleaned up on unmount
    const tooltipElRef = useRef<HTMLDivElement | null>(null);

    // Keep value and jodit instance in refs to avoid stale closures and manage placeholder
    const valueRef = useRef(value);
    valueRef.current = value;
    const joditInstanceRef = useRef<any>(null);
    useEffect(() => {
        return () => {
            tooltipElRef.current?.remove();
            tooltipElRef.current = null;
            document.getElementById(TOOLTIP_ID)?.remove();
        };
    }, []);

    /**
     * jodit-react v5 calls `editorRef(joditInstance)` once the editor is
     * ready. `joditInstance` is the Jodit class instance (NOT a wrapper) so:
     *   - joditInstance.s          → selection module
     *   - joditInstance.s.save()   → bookmark save
     *   - joditInstance.s.restore()→ bookmark restore
     *   - joditInstance.s.insertHTML(html) → replace selection
     *   - joditInstance.editor     → the contenteditable DOM element
     */
    const handleEditorReady = useCallback((joditInstance: any) => {
        if (!joditInstance) return;
        joditInstanceRef.current = joditInstance;

        // Expose save/replace to the parent via editorHandle
        const outerRef = editorHandleRef.current;
        if (outerRef) {
            (outerRef as React.MutableRefObject<RichTextEditorHandle | null>).current = {
                saveSelection: () => {
                    joditInstance.s?.save?.();
                },
                replaceSelection: (html: string) => {
                    joditInstance.s?.restore?.();
                    joditInstance.s?.insertHTML?.(html);
                }
            };
        }

        // Jodit 4 uses contenteditable (iframe:false by default).
        // Attach directly to joditInstance.editor – the live contenteditable div.
        const attachEvents = () => {
            const editorEl: HTMLElement | undefined = joditInstance.editor;
            if (!editorEl) return;

            // Sync placeholder visibility initially when editor is ready
            const currentVal = valueRef.current;
            const hasContent = currentVal && typeof currentVal === 'string' && currentVal.trim() !== '' && currentVal !== '<p><br></p>' && currentVal !== '<p></p>';
            const placeholderEl = joditInstance.container?.querySelector('.jodit-placeholder, .jodit_placeholder');
            if (placeholderEl) {
                placeholderEl.style.display = hasContent ? 'none' : '';
            }

            // ── Selection events (existing) ───────────────────────────────────
            const handleSelectionEvent = () => {
                const cb = onSelectionChangeRef.current;
                if (!cb) return;

                // Use the native browser Selection API – works because the
                // editor is a contenteditable div in the main document.
                const sel = window.getSelection();
                const text = sel?.toString() ?? '';

                if (!text.trim()) {
                    cb(null);
                    return;
                }

                if (!sel || sel.rangeCount === 0) {
                    cb(null);
                    return;
                }

                const range = sel.getRangeAt(0);
                const rect = range.getBoundingClientRect();

                // Serialize the selected HTML
                const fragment = range.cloneContents();
                const tmp = document.createElement('div');
                tmp.appendChild(fragment);
                const html = tmp.innerHTML;

                cb({ text, html, rect });
            };

            editorEl.addEventListener('mouseup', handleSelectionEvent);
            editorEl.addEventListener('keyup', handleSelectionEvent);

            // ── CSS class hover tooltip ───────────────────────────────────────
            // Re-use or create the singleton tooltip div in document.body.
            document.getElementById(TOOLTIP_ID)?.remove();
            const tooltip = document.createElement('div');
            tooltip.id = TOOLTIP_ID;
            Object.assign(tooltip.style, {
                position: 'fixed',
                zIndex: '99999',
                display: 'none',
                maxWidth: '380px',
                maxHeight: '320px',
                overflowY: 'auto',
                background: '#0f172a',
                color: '#e2e8f0',
                fontFamily: 'monospace',
                fontSize: '12px',
                lineHeight: '1.6',
                padding: '8px 12px',
                borderRadius: '6px',
                boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
                pointerEvents: 'none',
                whiteSpace: 'pre',
            });
            document.body.appendChild(tooltip);
            tooltipElRef.current = tooltip;

            const hideTooltip = () => { tooltip.style.display = 'none'; };

            const showTooltip = (e: MouseEvent) => {
                const target = e.target as Element;
                if (!target || target === editorEl || target.tagName === 'BODY') {
                    hideTooltip();
                    return;
                }

                const rules = cssRulesRef.current;
                if (rules.length === 0) { hideTooltip(); return; }

                // Find all CSS rules whose selector matches this element
                // Strip pseudo-classes before matching so :hover / :focus don't fail
                const matched: CssRule[] = [];
                for (const rule of rules) {
                    const cleanSel = rule.selector.replace(/:[a-zA-Z-]+(\([^)]*\))?/g, '');
                    try {
                        if (target.matches(cleanSel)) matched.push(rule);
                    } catch { /* invalid selector */ }
                }

                if (matched.length === 0) { hideTooltip(); return; }

                // Build tooltip text
                const tag = target.tagName.toLowerCase();
                const classes = typeof target.className === 'string' ? target.className.trim() : '';
                const classStr = classes ? '.' + classes.split(/\s+/).join('.') : '';

                const lines: string[] = [`${tag}${classStr}`, ''];
                matched.forEach(rule => {
                    lines.push(`  ${rule.selector}`);
                    Object.entries(rule.props).forEach(([p, v]) => {
                        lines.push(`    ${p}: ${v};`);
                    });
                    lines.push('');
                });

                tooltip.textContent = lines.join('\n').trimEnd();
                tooltip.style.display = 'block';
            };

            const moveTooltip = (e: MouseEvent) => {
                if (tooltip.style.display === 'none') return;
                const x = e.clientX + 14;
                const y = e.clientY - 10;
                // Flip left if overflowing viewport right edge
                const tw = tooltip.offsetWidth;
                tooltip.style.left = `${x + tw > window.innerWidth ? x - tw - 28 : x}px`;
                tooltip.style.top = `${y}px`;
            };

            editorEl.addEventListener('mouseover', showTooltip);
            editorEl.addEventListener('mousemove', moveTooltip);
            editorEl.addEventListener('mouseleave', hideTooltip);

            // ── Drag and Drop replacement for dummy images ────────────────────
            // Utilizing Jodit's native event hooks so we can return false to cancel its own internal dom pasting entirely
            if (joditInstance.events && typeof joditInstance.events.on === 'function') {
                joditInstance.events.on('drop', (e: DragEvent) => {
                    const target = e.target as Element;
                    if (target && target.tagName === 'IMG') {
                        const currentSrc = target.getAttribute('src') || '';
                        if (currentSrc.includes('placehold.co')) {
                            const html = e.dataTransfer?.getData('text/html');
                            if (html) {
                                const tmp = document.createElement('div');
                                tmp.innerHTML = html;
                                const img = tmp.querySelector('img');
                                if (img && img.src) {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    
                                    target.setAttribute('src', img.src);
                                    
                                    target.removeAttribute('width');
                                    target.removeAttribute('height');
                                    (target as HTMLElement).style.width = '100%';
                                    (target as HTMLElement).style.minHeight = '';
                                    
                                    if (typeof joditInstance.setEditorValue === 'function') {
                                        joditInstance.setEditorValue();
                                    } else {
                                        joditInstance.value = editorEl.innerHTML;
                                    }
                                    
                                    // Kill Jodit's default insertion logic by explicitly returning false 
                                    return false;
                                }
                            }
                        }
                    }
                });
            }
        };

        if (joditInstance.isReady) {
            attachEvents();
        } else {
            joditInstance.waitForReady().then(attachEvents);
        }
    }, []); // stable – all deps accessed via refs

    // Force placeholder to hide/show correctly based on React state updates
    useEffect(() => {
        const jodit = joditInstanceRef.current;
        if (jodit) {
            const hasContent = value && typeof value === 'string' && value.trim() !== '' && value !== '<p><br></p>' && value !== '<p></p>';
            const placeholderEl = jodit.container?.querySelector('.jodit-placeholder, .jodit_placeholder');
            if (placeholderEl) {
                placeholderEl.style.display = hasContent ? 'none' : '';
            }
        }
    }, [value]);

    const config = useMemo(
        () => ({
            placeholder,
            height,
            toolbarAdaptive: false,
            toolbarSticky: false,
            showCharsCounter: false,
            showWordsCounter: false,
            showXPathInStatusbar: false,
            askBeforePasteHTML: false,
            askBeforePasteFromWord: false,
            defaultActionOnPaste: 'insert_clear_html',

            usePlugins: ['lineHeight', 'font', 'fontsize', 'paragraph', 'justify', 'image'],

            uploader: {
                insertImageAsBase64URI: true
            },
            imageDefaultWidth: 300,
            resizer: {
                showSize: true
            },

            buttons: [
                'bold',
                'italic',
                'underline',
                '|',
                'font',
                'fontsize',
                'brush',
                'lineHeight',
                '|',
                'align',
                'ul',
                'ol',
                '|',
                'table',
                'link',
                'image',
                '|',
                'undo',
                'redo',
                '|',
                'print',
                'fullsize'
            ],

            removeButtons: ['source', 'about'],
            lineHeight: ['1', '1.15', '1.5', '2', '2.5', '3'],

            extraButtons: [
                {
                    name: 'Insert Header',
                    icon: 'header',
                    exec: (editor: any) => {
                        editor.s.insertHTML('<h2 style="font-size:24px; font-weight:bold; text-align:center;">REHABMART</h2>');
                    }
                },
                {
                    name: 'Insert Footer',
                    icon: 'footer',
                    exec: (editor: any) => {
                        editor.s.insertHTML(
                            '<footer style="text-align:center; font-size:14px; color:#666; margin-top:20px;">© Rehabmart 2026</footer>'
                        );
                    }
                }
            ]
        }),
        [placeholder, height]
    );

    return (
        <JoditEditor
            // @ts-ignore – editorRef is a valid jodit-react v5 prop
            editorRef={handleEditorReady}
            value={value}
            // @ts-ignore
            config={config}
            onBlur={newContent => onChange(newContent)}
            onChange={newContent => onChange(newContent)}
            className="w-full h-full"
        />
    );
};
