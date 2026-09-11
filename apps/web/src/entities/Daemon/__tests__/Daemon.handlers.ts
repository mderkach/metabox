import { http, HttpResponse, ws } from 'msw';

import { API_ENDPOINT } from '@shared/api';

import {
  CLASH_CONFIGS_FIXTURE,
  CLASH_VERSION_FIXTURE,
  DAEMON_STATUS_FIXTURE,
  MEMORY_SAMPLES,
  SERVICE_RUNNING_FIXTURE,
} from './Daemon.fixture';

/** Шаг потоков на устройстве — замер 2026-09-10: сэмпл раз в секунду. */
const STREAM_INTERVAL = 1000;

/**
 * Адрес потока матчится регуляркой: хост панель берёт из `location`, а `ws.link`
 * принимает только точный URL или `RegExp` — звёздочки в строке он не понимает
 * и молча не совпадает.
 */
function toStreamPattern(path: string): RegExp {
  return new RegExp(`^wss?://[^/]+${path}$`);
}

const trafficStream = ws.link(toStreamPattern(API_ENDPOINT.clashTraffic()));
const memoryStream = ws.link(toStreamPattern(API_ENDPOINT.clashMemory()));

export const daemonHandlers = [
  http.get(API_ENDPOINT.status(), () => HttpResponse.json(DAEMON_STATUS_FIXTURE)),
  http.get(API_ENDPOINT.service(), () => HttpResponse.json(SERVICE_RUNNING_FIXTURE)),
  http.post(API_ENDPOINT.serviceAction(':action'), () => HttpResponse.json(SERVICE_RUNNING_FIXTURE)),
  http.get(API_ENDPOINT.clashVersion(), () => HttpResponse.json(CLASH_VERSION_FIXTURE)),
  http.get(API_ENDPOINT.clashConfigs(), () => HttpResponse.json(CLASH_CONFIGS_FIXTURE)),

  trafficStream.addEventListener('connection', ({ client }) => {
    const timer = setInterval(() => {
      client.send(JSON.stringify({ up: 8500, down: 43_400 }));
    }, STREAM_INTERVAL);

    client.addEventListener('close', () => {
      clearInterval(timer);
    });
  }),

  memoryStream.addEventListener('connection', ({ client }) => {
    let sample = 0;

    const timer = setInterval(() => {
      client.send(JSON.stringify({ inuse: MEMORY_SAMPLES[sample % MEMORY_SAMPLES.length], oslimit: 0 }));
      sample += 1;
    }, STREAM_INTERVAL);

    client.addEventListener('close', () => {
      clearInterval(timer);
    });
  }),
];
