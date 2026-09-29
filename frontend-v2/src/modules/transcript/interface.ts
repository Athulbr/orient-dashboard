export interface TranscriptionData {
    filename: string;
    content: string;
}

export default interface PaginationPropsIF {
    currentPage: number;
    totalPages: number;
    loading?: boolean;
    onPageChange: (pageNumber: number) => void;
}