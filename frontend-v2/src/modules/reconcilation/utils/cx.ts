/** Combine CSS Module class names, filtering out falsy values. */
export const cx = (
  ...classes: (string | false | undefined | null | 0)[]
): string => classes.filter(Boolean).join(' ');
