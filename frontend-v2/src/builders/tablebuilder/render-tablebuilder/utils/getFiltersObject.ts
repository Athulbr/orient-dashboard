import { ActiveFilter } from './interface';

export const getFiltersObject = (filters: ActiveFilter[]): Record<string, string> => {
    return filters.reduce(
        (acc, filter) => {
            if (filter?.key && filter?.value) {
                acc[filter.key] = filter.value;
            }
            return acc;
        },
        {} as Record<string, string>
    );
};
