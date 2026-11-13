import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

import { describe, expect, it } from 'vitest';

const html = readFileSync(path.join(import.meta.dirname, '../index.html'), 'utf8');
const script = /<script>([\s\S]*?)<\/script>/u.exec(html)?.[1] ?? '';

function firstFrame({ stored, systemDark }) {
  const root = { className: 'dark', style: {} };
  const context = {
    document: { documentElement: root },
    localStorage: { getItem: () => stored },
    matchMedia: () => ({ matches: systemDark }),
  };

  vm.runInNewContext(script, context);

  return { className: root.className, colorScheme: root.style.colorScheme };
}

describe('index.html theme script', () => {
  it('has an inline script', () => {
    expect(script).not.toBe('');
  });

  it('paints the stored theme on the first frame', () => {
    expect(firstFrame({ stored: 'light', systemDark: true })).toEqual({ className: 'light', colorScheme: 'light' });
    expect(firstFrame({ stored: 'dark', systemDark: false })).toEqual({ className: 'dark', colorScheme: 'dark' });
  });

  it('follows the system for the system choice', () => {
    expect(firstFrame({ stored: 'system', systemDark: false }).className).toBe('light');
    expect(firstFrame({ stored: 'system', systemDark: true }).className).toBe('dark');
  });

  it('defaults to dark without a stored choice', () => {
    expect(firstFrame({ stored: null, systemDark: false }).className).toBe('dark');
  });
});
