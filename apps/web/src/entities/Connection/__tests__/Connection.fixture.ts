import type { ClashConnection, ClashConnectionsSnapshot } from '../api/Connection.dto';

/**
 * Снапшот потока соединений с рабочего роутера, снятый 2026-09-10.
 *
 * Данные владельца вычищены: домены — зоны `.example` (RFC 2606), адреса
 * назначения — `198.51.100.0/24` (RFC 5737). Адреса источника оставлены в
 * `192.168.1.0/24`: экран показывает устройство в LAN, а приватный адрес сам по
 * себе ничего о владельце не сообщает.
 */

const CAPTURED_AT = '2026-09-10T19:25:31.264867247Z';

interface ConnectionInput {
  host: string;
  destinationIP: string;
  sourceIP: string;
  chains: string[];
  rule: string;
  upload: number;
  download: number;
  startedSecondsAgo: number;
  network?: string;
  type?: string;
}

function connection(id: string, input: ConnectionInput): ClashConnection {
  const startedAt = new Date(Date.parse(CAPTURED_AT) - input.startedSecondsAgo * 1000);

  return {
    id,
    chains: input.chains,
    rule: input.rule,
    rulePayload: '',
    upload: input.upload,
    download: input.download,
    start: startedAt.toISOString(),
    metadata: {
      network: input.network ?? 'tcp',
      type: input.type ?? 'redirect/redirect-in',
      sourceIP: input.sourceIP,
      sourcePort: '46860',
      destinationIP: input.destinationIP,
      destinationPort: '443',
      host: input.host,
      dnsMode: 'normal',
      processPath: '',
    },
  };
}

const CONNECTIONS: ClashConnection[] = [
  connection('962b2d06-f296-42bb-af39-b96f2fac2cee', {
    host: 'video.example',
    destinationIP: '198.51.100.21',
    sourceIP: '192.168.1.120',
    chains: ['sub-us/us-reality', 'us', 'us-fallback'],
    rule: 'rule_set=google-ip => route(us-fallback)',
    upload: 37900,
    download: 358200,
    startedSecondsAgo: 64,
  }),
  connection('0a2c1de4-1f0b-4d5c-9a2c-2b7d5e8f1a01', {
    host: 'api.git.example',
    destinationIP: '198.51.100.31',
    sourceIP: '192.168.1.60',
    chains: ['sub-eu/eu-reality', 'proxy'],
    rule: 'rule_set=github => route(proxy)',
    upload: 12800,
    download: 167800,
    startedSecondsAgo: 133,
  }),
  connection('3c9f0b71-5d43-4a1f-8c6e-9a1b2c3d4e5f', {
    host: 'clients.google.example',
    destinationIP: '198.51.100.44',
    sourceIP: '192.168.1.60',
    chains: ['sub-us/us-reality', 'us', 'us-fallback'],
    rule: 'rule_set=google-ip => route(us-fallback)',
    upload: 5300,
    download: 7800,
    startedSecondsAgo: 12,
  }),
  connection('5e7a1c83-2b64-4f90-a1d3-7c8e9f0a1b2c', {
    host: 'photo.example',
    destinationIP: '198.51.100.57',
    sourceIP: '192.168.1.74',
    chains: ['direct'],
    rule: ' => route(direct)',
    upload: 11300,
    download: 0,
    network: 'udp',
    type: 'tproxy/tproxy-in',
    startedSecondsAgo: 8,
  }),
  connection('7b1d4e95-3c85-41a2-b3e4-8d9f0a1b2c3d', {
    host: 'cdn.games.example',
    destinationIP: '198.51.100.68',
    sourceIP: '192.168.1.60',
    chains: ['direct'],
    rule: ' => route(direct)',
    upload: 857,
    download: 5200,
    startedSecondsAgo: 187,
  }),
  connection('9d3f6a17-4e96-4b53-c5f6-9e0a1b2c3d4e', {
    host: 'chat.example',
    destinationIP: '198.51.100.79',
    sourceIP: '192.168.1.180',
    chains: ['direct'],
    rule: ' => route(direct)',
    upload: 1800,
    download: 4600,
    startedSecondsAgo: 20,
  }),
  connection('1f5a8c39-5f07-4c64-d7a8-0b1c2d3e4f50', {
    host: 'assistant.example',
    destinationIP: '198.51.100.83',
    sourceIP: '192.168.1.36',
    chains: ['sub-eu/eu-reality', 'proxy'],
    rule: 'rule_set=openai => route(proxy)',
    upload: 8100,
    download: 92400,
    startedSecondsAgo: 44,
  }),
  connection('2a6b9d40-6018-4d75-e8b9-1c2d3e4f5061', {
    host: 'metrics.example',
    destinationIP: '198.51.100.91',
    sourceIP: '192.168.1.190',
    chains: ['direct'],
    rule: ' => route(direct)',
    upload: 2000,
    download: 4000,
    startedSecondsAgo: 11,
  }),
];

/** Снапшот из потока: то же тело, что приходит по WebSocket раз в секунду. */
export const CLASH_CONNECTIONS_FIXTURE: ClashConnectionsSnapshot = {
  connections: CONNECTIONS,
  uploadTotal: 12376739,
  downloadTotal: 109672289,
  memory: 51380224,
};

/**
 * Снапшот произвольного размера для проверки NFR-2: соединения размножаются из
 * образцов, а не хранятся файлом. Размножается именно снапшот целиком — поток
 * отдаёт полный список, и разбор этого списка и есть стоимость.
 */
export function makeConnectionsSnapshot(count: number): ClashConnectionsSnapshot {
  const connections = Array.from({ length: count }, (_, index) => {
    const sample = CONNECTIONS[index % CONNECTIONS.length];

    return {
      ...sample,
      id: `${sample.id}-${String(index)}`,
      metadata: { ...sample.metadata, sourcePort: String(40000 + (index % 20000)) },
    };
  });

  return { ...CLASH_CONNECTIONS_FIXTURE, connections };
}
