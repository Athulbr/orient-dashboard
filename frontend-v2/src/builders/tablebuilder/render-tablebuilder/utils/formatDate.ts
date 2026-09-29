export const formatDate = (iso: string, onlyDate?: boolean): string => {
    try {
        if (iso === '') return '-';
        if (!iso || typeof iso !== 'string' || !iso.trim()) return 'Error';
        const date = new Date(iso.trim());
        if (isNaN(date.getTime())) return 'Error';

        const day = date.getDate();
        const month = date.getMonth() + 1;
        const year = date.getFullYear();
        const hours = date.getHours();
        const minutes = date.getMinutes();
        const seconds = date.getSeconds();

        const pad = (num: number): string => num.toString().padStart(2, '0');

        return onlyDate ? `${pad(day)}/${pad(month)}/${year}` : `${pad(day)}/${pad(month)}/${year} ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
    } catch {
        return 'Error';
    }
};
