export function isTruncated(target: HTMLElement | null): boolean {
  return target !== null && [...target.children].some((line) => line.scrollWidth > line.clientWidth);
}
