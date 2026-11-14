import { describe, expect, it } from 'vitest';

import { checkBudget, initialScripts } from './bundleBudget.js';

const HTML = `
  <script type="module" crossorigin src="/assets/index-a1.js"></script>
  <link rel="modulepreload" crossorigin href="/assets/react-b2.js">
  <link rel="stylesheet" crossorigin href="/assets/index-c3.css">
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
`;

describe('initialScripts', () => {
  it('takes the entry script and the modulepreload links, not styles or icons', () => {
    expect(initialScripts(HTML)).toEqual(['assets/index-a1.js', 'assets/react-b2.js']);
  });
});

describe('checkBudget', () => {
  const files = [
    { path: 'assets/index-a1.js', bytes: 60 },
    { path: 'assets/react-b2.js', bytes: 40 },
  ];
  const total = files[0].bytes + files[1].bytes;

  it('passes a first page within the budget', () => {
    expect(checkBudget(files, total)).toEqual([]);
  });

  it('fails a first page over the budget', () => {
    expect(checkBudget(files, total - 1)).toEqual([
      `entry plus preloads take ${total} bytes, over the budget of ${total - 1}`,
    ]);
  });

  it('fails a preloaded fork schema chunk whatever the total', () => {
    expect(checkBudget([...files, { path: 'assets/generated-d4.js', bytes: 1 }], total + 1)).toEqual([
      'assets/generated-d4.js must not be preloaded by the first page',
    ]);
  });

  it('does not take the daemon contract chunk for the fork schema', () => {
    expect(checkBudget([{ path: 'assets/daemon.generated-e5.js', bytes: 1 }], total)).toEqual([]);
  });
});
