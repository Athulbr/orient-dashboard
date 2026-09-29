export interface Message {
    text: string;
    source?: string[];
    userMessage: boolean;
}

export interface Keyword {
    keyword: string;
    source: string;
    selected?: boolean;
}

export interface ExtractedDataIF {
    title?: string;
    // author?: string;
    primaryImageUrl?: string;
    rowData?: Record<string, any>;
    [key: string]: any;
}

/** CSS property map for a single blog element class, e.g. { 'font-size': '1.5rem' } */
export type StyleMap = Record<string, string>;

/** Full theme: maps blog classnames (blog-h2, blog-p, …) to their StyleMap */
export type Theme = Record<string, StyleMap>;

export interface ContentCreationEditorStateIF {
    keywords?: Keyword[];
    extractedData?: ExtractedDataIF;
    content?: string;
    record?: Record<string, any> | null;
    extractionPrompt?: string;
    loadingData?: boolean;
    /** Raw CSS string from the template; injected as a <style> tag in the preview. */
    blogCss?: string;
    blogCssWrapperClass?: string;
}
