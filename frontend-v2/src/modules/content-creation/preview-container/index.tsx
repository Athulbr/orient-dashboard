import { useRef, useState, useEffect } from 'react';
import { Sparkles } from 'lucide-react';
import { RichTextEditor, SelectionData, RichTextEditorHandle } from '../../../components/RichTextEditor';
import BackButton from '../../../components/BackButton';
import { useContentCreationEditorState } from '../hooks/DocumentCreationEditorContext';
import AIContentEditDialog from '../components/AIContentEditDialog';
import { themeToCSS } from '../hooks/useBlogTheme';
import type { Theme } from '../types';

export default function PreviewContainer() {
    const { state, setState } = useContentCreationEditorState();
    const editorHandle = useRef<RichTextEditorHandle | null>(null);

    // Inject a scoped <style> tag into <head> that reflects the record's current theme.
    // StyleEditor keeps this tag live while editing; here we seed it on initial load and
    // whenever the record's theme/themeOverrides change (e.g. after a regenerate).
    useEffect(() => {
        const record = state.record;
        if (!record) return;

        const base: Theme = record.theme || {};
        const overrides: Theme = record.themeOverrides || {};
        const merged: Theme = {};
        const allCls = new Set([...Object.keys(base), ...Object.keys(overrides)]);
        allCls.forEach(cls => {
            merged[cls] = { ...(base[cls] || {}), ...(overrides[cls] || {}) };
        });

        const STYLE_TAG_ID = 'blog-theme-styles';
        let styleTag = document.getElementById(STYLE_TAG_ID) as HTMLStyleElement | null;
        if (!styleTag) {
            styleTag = document.createElement('style');
            styleTag.id = STYLE_TAG_ID;
            document.head.appendChild(styleTag);
        }
        // Only overwrite if StyleEditor is not already managing the tag
        if (!styleTag.textContent?.trim()) {
            styleTag.textContent = themeToCSS(merged);
        }
    }, [state.record?.theme, state.record?.themeOverrides]);

    // Inject client-provided CSS (from template.settings.blogCss) as a <style> tag
    // so the rich text editor preview renders with the correct class-based styles.
    useEffect(() => {
        const CLIENT_CSS_TAG_ID = 'blog-client-css';
        let styleTag = document.getElementById(CLIENT_CSS_TAG_ID) as HTMLStyleElement | null;

        if (state.blogCss) {
            if (!styleTag) {
                styleTag = document.createElement('style');
                styleTag.id = CLIENT_CSS_TAG_ID;
                document.head.appendChild(styleTag);
            }
            styleTag.textContent = state.blogCss;
        } else if (styleTag) {
            styleTag.textContent = '';
        }

        return () => {
            const tag = document.getElementById(CLIENT_CSS_TAG_ID);
            if (tag) tag.textContent = '';
        };
    }, [state.blogCss]);

    const [selection, setSelection] = useState<SelectionData | null>(null);
    const [dialogOpen, setDialogOpen] = useState(false);

    const handleSelectionChange = (data: SelectionData | null) => {
        setSelection(data);
    };

    const handleOpenAIEdit = () => {
        if (!selection) return;
        // Save the current selection before the dialog steals focus
        editorHandle.current?.saveSelection();
        setDialogOpen(true);
    };

    const handleAcceptEdit = (newHtml: string) => {
        // Restore saved selection and replace with AI-generated content
        editorHandle.current?.replaceSelection(newHtml);
        setSelection(null);
        setDialogOpen(false);
    };

    const handleDialogClose = () => {
        setDialogOpen(false);
    };

    // Position the floating toolbar above the selection
    const floatingStyle: React.CSSProperties = selection
        ? {
              position: 'fixed',
              top: selection.rect.top - 44,
              left: selection.rect.left + selection.rect.width / 2,
              transform: 'translateX(-50%)',
              zIndex: 9999
          }
        : { display: 'none' };

    return (
        <div className="px-4">
            <div className="py-3 flex items-center gap-3">
                <BackButton />
                <p className="text-xl font-semibold">Content Preview: {state.extractedData?.name}</p>
            </div>

            {/* Floating AI edit button — appears above any text selection */}
            {selection && !dialogOpen && (
                <div style={floatingStyle}>
                    <button
                        onMouseDown={e => {
                            // Prevent the click from clearing the editor selection
                            e.preventDefault();
                            handleOpenAIEdit();
                        }}
                        className="flex items-center gap-1.5 rounded-full bg-gray-900 px-3 py-1.5 text-xs font-medium text-white shadow-lg hover:bg-gray-700 transition-colors"
                    >
                        <Sparkles size={12} className="text-amber-400" />
                        Edit with AI
                    </button>
                </div>
            )}

            <RichTextEditor
                height="calc(100vh - 56px)"
                value={state.content || ''}
                onChange={value => setState(prev => ({ ...prev, content: value }))}
                onSelectionChange={handleSelectionChange}
                editorHandle={editorHandle}
                blogCss={state.blogCss}
            />

            {dialogOpen && selection && (
                <AIContentEditDialog
                    isOpen={dialogOpen}
                    onClose={handleDialogClose}
                    selectedText={selection.text}
                    onAccept={handleAcceptEdit}
                />
            )}
        </div>
    );
}
