import { describe, expect, it } from 'vitest';

import { advanceConnectionsSnapshot, CONNECTIONS_FIXTURE, makeConnectionsSnapshot } from './Connection.fixture';

/** Frames per hour of a dev session at a one-second stream step: that is what we check. */
const FRAMES = 50;
const SNAPSHOT_SIZE = 64;

describe('live connection stream frames', () => {
  it('does not let a frame be advanced on the reference: it is frozen', () => {
    expect(() => advanceConnectionsSnapshot(CONNECTIONS_FIXTURE, 1)).toThrow(TypeError);
    expect(CONNECTIONS_FIXTURE.upload_total).toBe(12376739);
  });

  it('grows counters instead of recomputing them from live connections', () => {
    const snapshot = makeConnectionsSnapshot(SNAPSHOT_SIZE, { vary: true });
    const before = { upload: snapshot.upload_total, download: snapshot.download_total };

    advanceConnectionsSnapshot(snapshot, 1);

    expect(snapshot.upload_total).toBeGreaterThan(before.upload);
    expect(snapshot.download_total).toBeGreaterThan(before.download);
  });

  it('keeps the identifier length: the sample is taken from the reference, not from the previous frame', () => {
    const snapshot = makeConnectionsSnapshot(SNAPSHOT_SIZE, { vary: true });
    const longest = () => Math.max(...snapshot.connections.map((row) => row.id.length));
    const start = longest();

    for (let seq = 1; seq <= FRAMES; seq += 1) {
      advanceConnectionsSnapshot(snapshot, seq);
    }

    // Margin for the frame suffix: it is two-digit, not growing with each frame.
    expect(longest()).toBeLessThan(start + 10);
  });

  it('closes and opens connections, otherwise the panel will not collect closed ones', () => {
    const snapshot = makeConnectionsSnapshot(SNAPSHOT_SIZE, { vary: true });
    const before = new Set(snapshot.connections.map((row) => row.id));

    advanceConnectionsSnapshot(snapshot, 1);

    const gone = [...before].filter((id) => !snapshot.connections.some((row) => row.id === id));

    expect(gone.length).toBeGreaterThan(0);
  });
});
