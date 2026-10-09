import type { EntryWire, LogsWire } from '../api/Log.schema';

/** Строки в формате демона: уровень разобран, время — метка logd в RFC 3339. */
export const LOG_ENTRIES_FIXTURE: EntryWire[] = [
  { time: '2026-10-09T10:00:01+03:00', level: 'info', message: 'router: updated default interface eth1, index 4' },
  { time: '2026-10-09T10:00:02+03:00', level: 'debug', message: 'dns: exchanged example.com A 93.184.215.14' },
  {
    time: '2026-10-09T10:00:03+03:00',
    level: 'warn',
    message: 'inbound/redirect[redirect-in]: process connection from 127.0.0.1:51514: get original destination',
  },
  { time: '2026-10-09T10:00:04+03:00', level: 'error', message: 'outbound/vless[proxy]: dial tcp: i/o timeout' },
  { message: '  goroutine 1 [running]:' },
];

export const LOGS_FIXTURE: LogsWire = {
  source: 'logread',
  entries: LOG_ENTRIES_FIXTURE,
};

/** Строки, которые мок дев-режима отдаёт потоком по кругу. */
export const LOG_STREAM_SAMPLES: EntryWire[] = [
  { level: 'info', message: 'inbound/tproxy[tproxy-in]: inbound packet connection from 192.168.1.20:5353' },
  { level: 'debug', message: 'router: match[3] rule_set=geosite-youtube => route(proxy)' },
  { level: 'info', message: 'outbound/vless[proxy]: outbound connection to www.youtube.com:443' },
  { level: 'warn', message: 'dns: lookup failed for broken.example: no such host' },
];
