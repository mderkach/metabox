import type { ConnectionWire, ConnectionsSnapshotWire } from '../api/Connection.schema';

/**
 * Снапшот потока соединений с рабочего роутера, снятый 2026-09-10.
 *
 * Данные владельца вычищены: домены — зоны `.example` (RFC 2606). Адреса
 * источника оставлены в `192.168.1.0/24`: экран показывает устройство в LAN, а
 * приватный адрес сам по себе ничего о владельце не сообщает.
 *
 * Форма — контракт демона, а не Clash API: панель получает соединения уже
 * сведёнными к одной модели (ADR-0006).
 */

const CAPTURED_AT = '2026-09-10T19:25:31.264867247Z';

/** Порт назначения у всех соединений снимка один: снято на https-трафике. */
const PORT = '443';

interface ConnectionInput {
  host: string;
  sourceIP: string;
  chains: string[];
  /** Условия сработавшего правила; пусто у правила без условий. */
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

/** Снапшот топика `connections`: то же тело, что приходит раз в секунду. */
export const CONNECTIONS_FIXTURE: ConnectionsSnapshotWire = {
  connections: CONNECTIONS,
  upload_total: 12376739,
  download_total: 109672289,
  memory: 51380224,
};

/**
 * Снапшот произвольного размера для проверки NFR-2: соединения размножаются из
 * образцов, а не хранятся файлом. Размножается именно снапшот целиком — поток
 * отдаёт полный список, и разбор этого списка и есть стоимость.
 *
 * `vary` разводит хост, устройство и счётчики по индексу. Без него все копии
 * одного образца совпадают, и отбор с сортировкой работают на восьми разных
 * значениях — для замера разбора это неважно, а для ручной проверки списка под
 * нагрузкой даёт неправдоподобно однородную картину. Тесты зовут генератор без
 * него, чтобы не зависеть от распределения.
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

/** Сколько разных имён и устройств разводит `vary`: у домашнего роутера столько и бывает. */
const VARIED_HOSTS = 64;
const VARIED_DEVICES = 24;
