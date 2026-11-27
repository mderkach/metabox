import { applyEdits, createScanner, findNodeAtLocation, parseTree, type Edit, type JSONPath } from 'jsonc-parser';

import { insertValue, removeValue } from '@entities/Config';
import { detectIndent } from '@shared/lib/jsonc';

const COMMA_TOKEN = 5;

/** Changes only the requested member's tokens. Formatting a whole line would rewrite compact imports and adjacent comments. */
export function editDnsProperty(text: string, path: JSONPath, name: string | null, value?: unknown): string | null {
  const root = parseTree(text);
  if (!root) return null;
  const parentPath = path.slice(0, -1);
  const owner = findNodeAtLocation(root, parentPath);
  const key = path.at(-1);
  if (typeof key !== 'string') return null;
  if (!owner) {
    const parentKey = parentPath.at(-1);
    return typeof parentKey === 'string' && name !== null
      ? editDnsProperty(text, parentPath, parentKey, { [name]: value })
      : null;
  }
  if (owner.type !== 'object') return null;
  const props = owner.children ?? [];
  const prop = props.find((p) => p.children?.[0]?.value === key);
  const end = owner.offset + owner.length - 1;
  const edits: Edit[] = [];
  if (prop && name === null) {
    const index = props.indexOf(prop);
    // Skip trivia: a comma inside a neighboring comment is not a separator.
    const scanner = createScanner(text, true);
    scanner.setPosition(prop.offset + prop.length);
    const commaAfter = scanner.scan() === COMMA_TOKEN ? scanner.getTokenOffset() : null;
    if (commaAfter === null && index > 0) {
      const previous = props[index - 1];
      scanner.setPosition(previous.offset + previous.length);
      if (scanner.scan() !== COMMA_TOKEN) return null;
      edits.push({ offset: scanner.getTokenOffset(), length: 1, content: '' });
    }
    const lineStart = text.lastIndexOf('\n', prop.offset - 1) + 1;
    const propEnd = prop.offset + prop.length;
    const lineEnd = text.indexOf('\n', propEnd);
    const after = text.slice(propEnd, lineEnd);
    if (lineEnd !== -1 && /^[\t ]*$/.test(text.slice(lineStart, prop.offset)) && /^[\t ]*,?[\t ]*\r?$/.test(after)) {
      edits.push({ offset: lineStart, length: lineEnd + 1 - lineStart, content: '' });
      if (commaAfter !== null && commaAfter > lineEnd) edits.push({ offset: commaAfter, length: 1, content: '' });
    } else {
      edits.push({ offset: prop.offset, length: prop.length, content: '' });
      if (commaAfter !== null) edits.push({ offset: commaAfter, length: 1, content: '' });
    }
  } else if (name !== null && prop?.children !== undefined) {
    const [keyNode, valueNode] = prop.children;
    if (name !== key) edits.push({ offset: keyNode.offset, length: keyNode.length, content: JSON.stringify(name) });
    if (value !== undefined)
      edits.push({ offset: valueNode.offset, length: valueNode.length, content: JSON.stringify(value) });
  } else if (name !== null && value !== undefined) {
    const last = props.at(-1);
    const scanner = createScanner(text, true);
    scanner.setPosition(last ? last.offset + last.length : end);
    const trailingComma = scanner.scan() === COMMA_TOKEN;
    const property = JSON.stringify(name) + ': ' + JSON.stringify(value);
    const lineStart = text.lastIndexOf('\n', end - 1) + 1;
    const indent = text.slice(lineStart, end);
    if (/^[\t ]*$/.test(indent)) {
      const format = detectIndent(text);
      const step = format.insertSpaces ? ' '.repeat(format.tabSize) : '\t';
      const newline = text.includes('\r\n') ? '\r\n' : '\n';
      edits.push({
        offset: lineStart,
        length: 0,
        content: indent + step + property + (trailingComma ? ',' : '') + newline,
      });
    } else {
      edits.push({
        offset: end,
        length: 0,
        content:
          (last && !trailingComma && end === last.offset + last.length ? ',' : '') +
          property +
          (trailingComma ? ',' : ''),
      });
    }
    if (last && !trailingComma && end !== last.offset + last.length)
      edits.push({ offset: last.offset + last.length, length: 0, content: ',' });
  } else return null;
  return applyEdits(text, edits);
}

/** The common ends retain their exact tokens, including comments, when a list grows or shrinks in the middle. */
export function editHostAddresses(text: string, path: JSONPath, before: string[], after: string[]): string | null {
  const root = parseTree(text);
  const array = root && findNodeAtLocation(root, path);
  if (array?.type !== 'array') return null;
  if (!before.length) {
    return applyEdits(text, [
      { offset: array.offset + array.length - 1, length: 0, content: after.map((v) => JSON.stringify(v)).join(', ') },
    ]);
  }
  let start = 0;
  while (start < before.length && before[start] === after[start]) start++;
  let oldEnd = before.length;
  let newEnd = after.length;
  while (oldEnd > start && newEnd > start && before[oldEnd - 1] === after[newEnd - 1]) {
    oldEnd--;
    newEnd--;
  }
  const overlap = Math.min(oldEnd, newEnd);
  const edits: Edit[] = [];
  for (let index = start; index < overlap; index++) {
    if (before[index] === after[index]) continue;
    const token = array.children?.[index];
    if (!token) return null;
    edits.push({ offset: token.offset, length: token.length, content: JSON.stringify(after[index]) });
  }
  let result: string | null = applyEdits(text, edits);
  for (let index = oldEnd - 1; index >= overlap && result !== null; index--)
    result = removeValue(result, [...path, index]);
  for (let index = overlap; index < newEnd && result !== null; index++)
    result = insertValue(result, [...path, index], after[index]);
  return result;
}
