/** Field descriptions in one string: `aria-describedby` accepts identifiers separated by spaces. */
export function describedBy(...ids: (string | undefined)[]): string | undefined {
  const list = ids.filter((id) => id !== undefined);

  return list.length === 0 ? undefined : list.join(' ');
}
