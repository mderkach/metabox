import type { ConnectionWire, ConnectionsSnapshotWire } from '../api/Connection.schema';

/**
 * A connections stream snapshot from a working router, taken 2026-09-10.
 *
 * The owner's data is scrubbed: domains are in the `.example` zone (RFC 2606). Source
 * addresses are left in `192.168.1.0/24`: the screen shows a device on the LAN, and a
 * private address by itself says nothing about the owner.
 *
 * The shape is the daemon contract, not the Clash API: the panel receives connections already
 * reduced to one model.
 */

const CAPTURED_AT = '2026-09-10T19:25:31.264867247Z';

/** The destination port is the same for all snapshot connections: taken on https traffic. */
const PORT = '443';

interface ConnectionInput {
  host: string;
  sourceIP: string;
  chains: string[];
  /** Conditions of the matched rule; empty for a rule without conditions. */
  rule: string;
  action: string;
  final?: boolean;
  upload: number;
  download: number;
  startedSecondsAgo: number;
  network?: string;
}

function connection(id: string, input: ConnectionInput): ConnectionWire {
  const startedAt = new Date(Date.parse(CAPTURED_AT) - input.startedSecondsAgo * 1000);

  return {
    id,
    host: `${input.host}:${PORT}`,
    network: input.network ?? 'tcp',
    source: input.sourceIP,
    rule: input.rule,
    action: input.action,
    final: input.final ?? false,
    chain: input.chains,
    upload: input.upload,
    download: input.download,
    started_at: startedAt.toISOString(),
  };
}

const CONNECTIONS: ConnectionWire[] = [
  connection('962b2d06-f296-42bb-af39-b96f2fac2cee', {
    host: 'video.example',
    sourceIP: '192.168.1.120',
    chains: ['sub-us/us-reality', 'us', 'us-fallback'],
    rule: 'rule_set=google-ip',
    action: 'route(us-fallback)',
    upload: 37900,
    download: 358200,
    startedSecondsAgo: 64,
  }),
  connection('0a2c1de4-1f0b-4d5c-9a2c-2b7d5e8f1a01', {
    host: 'api.git.example',
    sourceIP: '192.168.1.60',
    chains: ['sub-eu/eu-reality', 'proxy'],
    rule: 'rule_set=github',
    action: 'route(proxy)',
    upload: 12800,
    download: 167800,
    startedSecondsAgo: 133,
  }),
  connection('3c9f0b71-5d43-4a1f-8c6e-9a1b2c3d4e5f', {
    host: 'clients.google.example',
    sourceIP: '192.168.1.60',
    chains: ['sub-us/us-reality', 'us', 'us-fallback'],
    rule: 'rule_set=google-ip',
    action: 'route(us-fallback)',
    upload: 5300,
    download: 7800,
    startedSecondsAgo: 12,
  }),
  connection('5e7a1c83-2b64-4f90-a1d3-7c8e9f0a1b2c', {
    host: 'photo.example',
    sourceIP: '192.168.1.74',
    chains: ['direct'],
    rule: '',
    action: 'route(direct)',
    upload: 11300,
    download: 0,
    network: 'udp',
    startedSecondsAgo: 8,
  }),
  connection('7b1d4e95-3c85-41a2-b3e4-8d9f0a1b2c3d', {
    host: 'cdn.games.example',
    sourceIP: '192.168.1.60',
    chains: ['direct'],
    rule: '',
    action: 'route(direct)',
    upload: 857,
    download: 5200,
    startedSecondsAgo: 187,
  }),
  connection('9d3f6a17-4e96-4b53-c5f6-9e0a1b2c3d4e', {
    host: 'chat.example',
    sourceIP: '192.168.1.180',
    chains: ['direct'],
    rule: '',
    action: 'route(direct)',
    upload: 1800,
    download: 4600,
    startedSecondsAgo: 20,
  }),
  connection('1f5a8c39-5f07-4c64-d7a8-0b1c2d3e4f50', {
    host: 'assistant.example',
    sourceIP: '192.168.1.36',
    chains: ['sub-eu/eu-reality', 'proxy'],
    rule: 'rule_set=openai',
    action: 'route(proxy)',
    upload: 8100,
    download: 92400,
    startedSecondsAgo: 44,
  }),
  connection('2a6b9d40-6018-4d75-e8b9-1c2d3e4f5061', {
    host: 'metrics.example',
    sourceIP: '192.168.1.190',
    chains: ['direct'],
    rule: '',
    action: 'route(direct)',
    upload: 2000,
    download: 4000,
    startedSecondsAgo: 11,
  }),
];

// The samples are frozen: live frames edit the snapshot in place, and a consumer
// that forgot to make a copy would corrupt the reference: counters would drift apart for everyone
// built from it. Freezing turns such an edit into an immediate
// `TypeError` instead of quietly diverging data.
for (const sample of CONNECTIONS) {
  Object.freeze(sample.chain);
  Object.freeze(sample);
}

Object.freeze(CONNECTIONS);

/** Snapshot of the `connections` topic: the same body that arrives once a second. */
export const CONNECTIONS_FIXTURE: ConnectionsSnapshotWire = Object.freeze({
  connections: CONNECTIONS,
  upload_total: 12376739,
  download_total: 109672289,
  memory: 51380224,
});

/**
 * A snapshot of arbitrary size for checking the ceiling: connections are multiplied from
 * samples, not stored as a file. The whole snapshot is multiplied: the stream
 * serves the full list, and parsing that list is the cost.
 *
 * `vary` spreads the host, device and counters by index. Without it all copies
 * of one sample coincide, and filtering with sorting work on eight different
 * values: for measuring parse that does not matter, but for a manual check of the list under
 * load it gives an implausibly uniform picture. Tests call the generator without
 * it so as not to depend on the distribution.
 */
export function makeConnectionsSnapshot(count: number, { vary = false } = {}): ConnectionsSnapshotWire {
  const connections = Array.from({ length: count }, (_, index) => {
    const sample = CONNECTIONS[index % CONNECTIONS.length];
    const copy = { ...sample, id: `${sample.id}-${String(index)}` };

    if (!vary) {
      return copy;
    }

    const [name] = sample.host.split(':');

    return {
      ...copy,
      host: `${name}-${String(index % VARIED_HOSTS)}:${PORT}`,
      source: `192.168.1.${String((index % VARIED_DEVICES) + 2)}`,
      upload: sample.upload + index,
      download: sample.download + index * 3,
    };
  });

  return { ...CONNECTIONS_FIXTURE, connections };
}

/** How many different names and devices `vary` spreads: a home router has about that many. */
const VARIED_HOSTS = 64;
const VARIED_DEVICES = 24;

/** What share of connections gain bytes per second: the rest are silent. */
const ACTIVE_SHARE = 3;
/** How many connections close and open per frame for each thousand. */
const CHURN_PER_THOUSAND = 8;
const THOUSAND = 1000;
/** Byte gain spread: one connection gets from a kilobyte to a megabyte per second. */
const MIN_STEP = 1024;
const MAX_STEP = 1024 * 1024;

/**
 * The next stream frame: counters grow, some connections close, and new ones
 * open in their place.
 *
 * **The snapshot changes in place.** The caller passes its own instance here and
 * owns it alone afterwards. `CONNECTIONS_FIXTURE` must not be passed: it shares an
 * array with the samples that frames are built from, and is frozen: an attempt to
 * advance a frame directly on it throws `TypeError`.
 *
 * The list is not rebuilt: five thousand rows on every tick would cost more than
 * the panel itself, and the test bench would measure the generator. At the same time a motionless snapshot measures
 * the wrong branch: with unchanged counters the parse returns the previous rows whole and
 * builds none new.
 *
 * Connection turnover is needed not for plausibility: the panel builds closed ones itself,
 * comparing adjacent frames, and without turnover that branch never runs.
 */
export function advanceConnectionsSnapshot(snapshot: ConnectionsSnapshotWire, seq: number): ConnectionsSnapshotWire {
  const churn = Math.max(1, Math.round((snapshot.connections.length * CHURN_PER_THOUSAND) / THOUSAND));
  let addedUpload = 0;
  let addedDownload = 0;

  for (let index = 0; index < snapshot.connections.length; index += 1) {
    if ((index + seq) % ACTIVE_SHARE !== 0) {
      continue;
    }

    const current = snapshot.connections[index];
    const step = MIN_STEP + ((index * seq) % (MAX_STEP - MIN_STEP));

    current.upload += step;
    current.download += step * 2;
    addedUpload += step;
    addedDownload += step * 2;
  }

  // Departed ones are scattered across the list rather than going in a row from the start: the panel compares
  // frames by id, and swapping the id is enough for a connection to count as new, but
  // turnover in the first rows of a virtualized list would read as flicker of the
  // table, which does not exist on the device.
  const stride = Math.max(1, Math.floor(snapshot.connections.length / churn));

  for (let step = 0; step < churn; step += 1) {
    const index = (step * stride + seq) % snapshot.connections.length;
    const sample = CONNECTIONS[(step + seq) % CONNECTIONS.length];
    const [name] = sample.host.split(':');

    snapshot.connections[index] = {
      ...sample,
      id: `${sample.id}-${String(seq)}-${String(step)}`,
      host: `${name}-${String((index + seq) % VARIED_HOSTS)}:${PORT}`,
      source: `192.168.1.${String((index % VARIED_DEVICES) + 2)}`,
      started_at: new Date().toISOString(),
    };
  }

  // Counters grow rather than being recomputed from the list: in the snapshot this is the volume since
  // sing-box started, and it is larger than the sum over live connections.
  snapshot.upload_total += addedUpload;
  snapshot.download_total += addedDownload;

  return snapshot;
}
