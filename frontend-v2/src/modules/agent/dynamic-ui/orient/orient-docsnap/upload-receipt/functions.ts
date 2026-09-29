export interface DocumentDetail {
    documentName: string;
    documentPages: string[];
    ignored?: boolean;
    ignoredPages?: number[];
}

function getDocumentPriority(documentName: string): number {
    const name = documentName.toLowerCase();

    if (name.includes('passport')) return 0;
    if (name.includes('ticket')) return 2;
    // if (name.includes('visa')) return 3;

    return 1;
}

export function rearrangeDocuments(documents: DocumentDetail[]): DocumentDetail[] {
    return documents
        .map((doc, originalIndex) => ({
            doc,
            originalIndex,
            priority: getDocumentPriority(doc.documentName),
            pageCount: doc.documentPages.length
        }))
        .sort((a, b) => {
            if (a.priority !== b.priority) {
                return a.priority - b.priority;
            }

            if (a.pageCount !== b.pageCount) {
                return a.pageCount - b.pageCount;
            }

            return a.originalIndex - b.originalIndex;
        })
        .map(item => item.doc);
}
