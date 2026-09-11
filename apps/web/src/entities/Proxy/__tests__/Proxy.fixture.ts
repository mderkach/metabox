import type { ClashDelay, ClashProviders, ClashProxies } from '../api/Proxy.dto';

/**
 * Прокси с рабочего роутера, снятые 2026-09-10: 4 группы, 6 узлов VLESS,
 * 3 подписки.
 *
 * Данные владельца вычищены: теги узлов и подписок обезличены. Реальный домен
 * или адрес здесь появиться не должен — файл лежит в git.
 */

export const CHECKED_AT = '2026-09-10T19:25:31.264867247Z';

/** Ответ на проверку задержки: замер того же прогона, что и история узлов. */
export const CLASH_DELAY_FIXTURE: ClashDelay = { time: CHECKED_AT, delay: 143 };

export const CLASH_PROXIES_FIXTURE: ClashProxies = {
  proxies: {
    GLOBAL: {
      type: 'Fallback',
      name: 'GLOBAL',
      udp: true,
      history: [{ time: CHECKED_AT, delay: 143 }],
      now: 'proxy',
      all: ['proxy', 'us', 'us-fallback', 'sub-eu/eu-reality', 'sub-eu/eu-xhttp', 'direct'],
    },
    direct: { type: 'Direct', name: 'direct', udp: true, history: [] },
    proxy: {
      type: 'URLTest',
      name: 'proxy',
      udp: true,
      history: [{ time: CHECKED_AT, delay: 143 }],
      now: 'sub-eu/eu-reality',
      all: ['sub-eu/eu-reality', 'sub-eu/eu-xhttp', 'sub-nl/nl-reality', 'sub-nl/nl-xhttp'],
    },
    us: {
      type: 'URLTest',
      name: 'us',
      udp: true,
      history: [{ time: CHECKED_AT, delay: 609 }],
      now: 'sub-us/us-reality',
      all: ['sub-us/us-reality', 'sub-us/us-xhttp'],
    },
    'us-fallback': {
      type: 'Selector',
      name: 'us-fallback',
      udp: true,
      history: [],
      now: 'us',
      all: ['us', 'proxy'],
    },
    'sub-eu/eu-reality': {
      type: 'VLESS',
      name: 'sub-eu/eu-reality',
      udp: true,
      history: [{ time: CHECKED_AT, delay: 143 }],
    },
    'sub-eu/eu-xhttp': {
      type: 'VLESS',
      name: 'sub-eu/eu-xhttp',
      udp: true,
      history: [{ time: CHECKED_AT, delay: 176 }],
    },
    'sub-nl/nl-reality': {
      type: 'VLESS',
      name: 'sub-nl/nl-reality',
      udp: true,
      history: [{ time: CHECKED_AT, delay: 854 }],
    },
    'sub-nl/nl-xhttp': {
      type: 'VLESS',
      name: 'sub-nl/nl-xhttp',
      udp: true,
      history: [{ time: CHECKED_AT, delay: 186 }],
    },
    'sub-us/us-reality': {
      type: 'VLESS',
      name: 'sub-us/us-reality',
      udp: true,
      history: [{ time: CHECKED_AT, delay: 609 }],
    },
    'sub-us/us-xhttp': {
      type: 'VLESS',
      name: 'sub-us/us-xhttp',
      udp: true,
      // Узел не ответил на проверку: 65535 — отказ, а не задержка.
      history: [{ time: CHECKED_AT, delay: 65535 }],
    },
  },
};

export const CLASH_PROVIDERS_FIXTURE: ClashProviders = {
  providers: {
    'sub-eu': {
      type: 'Proxy',
      vehicleType: 'Remote',
      name: 'sub-eu',
      updatedAt: '2026-09-10T12:27:02Z',
      subscriptionInfo: { Upload: 748287807, Download: 36519368345, Total: 0, Expire: 0 },
      proxies: [
        { type: 'VLESS', name: 'sub-eu/eu-reality', udp: true, history: [{ time: CHECKED_AT, delay: 143 }] },
        { type: 'VLESS', name: 'sub-eu/eu-xhttp', udp: true, history: [{ time: CHECKED_AT, delay: 176 }] },
      ],
    },
    'sub-nl': {
      type: 'Proxy',
      vehicleType: 'Remote',
      name: 'sub-nl',
      updatedAt: '2026-09-10T12:27:04Z',
      subscriptionInfo: { Upload: 12043221, Download: 904113355, Total: 0, Expire: 0 },
      proxies: [
        { type: 'VLESS', name: 'sub-nl/nl-reality', udp: true, history: [{ time: CHECKED_AT, delay: 854 }] },
        { type: 'VLESS', name: 'sub-nl/nl-xhttp', udp: true, history: [{ time: CHECKED_AT, delay: 186 }] },
      ],
    },
    'sub-us': {
      type: 'Proxy',
      vehicleType: 'Remote',
      name: 'sub-us',
      updatedAt: '2026-09-10T12:27:03Z',
      subscriptionInfo: { Upload: 91002133, Download: 4410882900, Total: 0, Expire: 0 },
      proxies: [
        { type: 'VLESS', name: 'sub-us/us-reality', udp: true, history: [{ time: CHECKED_AT, delay: 609 }] },
        { type: 'VLESS', name: 'sub-us/us-xhttp', udp: true, history: [{ time: CHECKED_AT, delay: 65535 }] },
      ],
    },
  },
};
