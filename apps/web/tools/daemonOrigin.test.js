import { describe, expect, it } from 'vitest';

import { daemonOriginFor } from './daemonOrigin.ts';

const TARGET = 'http://127.0.0.1:8080';

describe('daemonOriginFor', () => {
  it("presents the panel's own origin as the daemon's", () => {
    expect(daemonOriginFor('http://localhost:5173', 'localhost:5173', TARGET)).toBe(TARGET);
    expect(daemonOriginFor('http://192.168.1.5:5173', '192.168.1.5:5173', TARGET)).toBe(TARGET);
  });

  it('leaves a foreign origin alone so the daemon refuses it', () => {
    expect(daemonOriginFor('https://evil.example', 'localhost:5173', TARGET)).toBeUndefined();
    expect(daemonOriginFor('http://localhost:9999', 'localhost:5173', TARGET)).toBeUndefined();
    expect(daemonOriginFor('null', 'localhost:5173', TARGET)).toBeUndefined();
  });

  it('keeps sending the daemon origin for a request without Origin, as a script does', () => {
    expect(daemonOriginFor(undefined, 'localhost:5173', TARGET)).toBe(TARGET);
  });
});
