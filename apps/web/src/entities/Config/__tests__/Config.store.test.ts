import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { parseConfig } from '../api/Config.query';
import { ConfigDocumentState, useConfigLeaveGuard } from '../model/Config.store';
import { CONFIG_FIXTURE } from './Config.fixture';

const TEXT = JSON.stringify(CONFIG_FIXTURE, null, 2);

function state() {
  return ConfigDocumentState.getState();
}

describe('ConfigDocumentState', () => {
  beforeEach(() => {
    ConfigDocumentState.getState().reset();
  });

  it('до чтения конфига править нечего', () => {
    state().edit(['route', 'final'], 'direct');

    expect(state().draft).toBeNull();
    expect(state().current()).toBeNull();
  });

  it('без правок черновика нет, а показывается применённый конфиг', () => {
    state().load(TEXT);

    expect(state().draft).toBeNull();
    expect(state().isDirty()).toBe(false);
    expect(state().current()).toBe(TEXT);
  });

  it('запоминает отпечаток файла и снимает его на сбросе', () => {
    state().load(TEXT, '"abc"');

    expect(state().appliedEtag).toBe('"abc"');

    state().reset();

    expect(state().appliedEtag).toBeNull();
  });

  it('без отпечатка база пуста: применение пойдёт без сверки', () => {
    state().load(TEXT);

    expect(state().appliedEtag).toBeNull();
  });

  it('новый отпечаток того же текста ревизию не двигает', () => {
    state().load(TEXT, '"a"');

    const { revision } = state();

    state().load(TEXT, '"b"');

    expect(state().appliedEtag).toBe('"b"');
    expect(state().revision).toBe(revision);
  });

  it('правка уходит в черновик, применённый конфиг остаётся прежним', () => {
    state().load(TEXT);
    state().edit(['route', 'default_mark'], 200);

    expect(state().applied).toBe(TEXT);
    expect(state().isDirty()).toBe(true);
    expect(parseConfig(state().current() ?? '').config?.route?.default_mark).toBe(200);
  });

  it('вторая правка ложится на первую, а не на применённый конфиг', () => {
    state().load(TEXT);
    state().edit(['route', 'default_mark'], 200);
    state().edit(['route', 'final'], 'direct');

    const config = parseConfig(state().current() ?? '').config;

    expect(config?.route?.default_mark).toBe(200);
    expect(config?.route?.final).toBe('direct');
  });

  it('пачка правок ложится одним обновлением стора', () => {
    state().load(TEXT);

    let updates = 0;
    const unsubscribe = ConfigDocumentState.subscribe(() => {
      updates += 1;
    });

    state().editMany([
      { path: ['route', 'default_mark'], value: 200 },
      { path: ['route', 'final'], value: 'direct' },
    ]);
    unsubscribe();

    const config = parseConfig(state().current() ?? '').config;

    expect(updates).toBe(1);
    expect(config?.route?.default_mark).toBe(200);
    expect(config?.route?.final).toBe('direct');
  });

  it('правка пачкой без значения удаляет ключ', () => {
    state().load(TEXT);
    expect(parseConfig(TEXT).config?.route).toHaveProperty('default_domain_resolver');

    state().editMany([{ path: ['route', 'default_domain_resolver'], value: undefined }]);

    expect(parseConfig(state().current() ?? '').config?.route).not.toHaveProperty('default_domain_resolver');
  });

  it('пустая пачка черновика не заводит', () => {
    state().load(TEXT);
    state().editMany([]);

    expect(state().draft).toBeNull();
  });

  it('отмена возвращает применённый конфиг', () => {
    state().load(TEXT);
    state().edit(['route', 'final'], 'direct');
    state().discard();

    expect(state().isDirty()).toBe(false);
    expect(state().current()).toBe(TEXT);
  });

  it('перестановка меняет порядок правил и не трогает остальные', () => {
    const rules = CONFIG_FIXTURE.route?.rules ?? [];

    state().load(TEXT);
    state().move(['route', 'rules'], 0, 1);

    const left = parseConfig(state().current() ?? '').config?.route?.rules ?? [];

    expect(left).toHaveLength(rules.length);
    expect(left[0]).toEqual(rules[1]);
    expect(left[1]).toEqual(rules[0]);
    expect(left.slice(2)).toEqual(rules.slice(2));
  });

  it('перестановка не переписывает текст: набор строк остаётся прежним', () => {
    state().load(TEXT);
    state().move(['route', 'rules'], 0, 1);

    const before = TEXT.split('\n').sort();
    const after = (state().current() ?? '').split('\n').sort();

    expect(after).toEqual(before);
  });

  it('перестановка на то же место конфиг не трогает', () => {
    state().load(TEXT);
    state().move(['route', 'rules'], 3, 3);

    expect(state().isDirty()).toBe(false);
  });

  it('перестановка несуществующего правила конфиг не трогает', () => {
    state().load(TEXT);
    state().move(['route', 'rules'], 999, 0);

    expect(state().isDirty()).toBe(false);
  });

  it('перестановка последнего шага кладёт правило в конец списка', () => {
    const rules = CONFIG_FIXTURE.route?.rules ?? [];
    const last = rules.length - 1;

    state().load(TEXT);
    state().move(['route', 'rules'], last - 1, last);

    const left = parseConfig(state().current() ?? '').config?.route?.rules ?? [];

    expect(left.at(-1)).toEqual(rules[last - 1]);
    expect(left.at(-2)).toEqual(rules[last]);
    expect((state().current() ?? '').split('\n').sort()).toEqual(TEXT.split('\n').sort());
  });

  it('вставка в конфиг без route.rules создаёт список и не трогает остальной текст', () => {
    const text = JSON.stringify(
      { outbounds: [{ type: 'direct', tag: 'direct' }], route: { final: 'direct' } },
      null,
      2
    );

    state().load(text);
    state().insert(['route', 'rules', 0], { outbound: 'direct' });

    const rules = ['    "rules": [', '      {', '        "outbound": "direct"', '      }', '    ]'].join('\n');

    // Прежние строки стоят как были; у `final` только запятая перед новым ключом.
    expect(state().current()).toBe(text.replace('"final": "direct"', `"final": "direct",\n${rules}`));
  });

  it('удаление и вставка правила идут тем же черновиком', () => {
    const rules = CONFIG_FIXTURE.route?.rules ?? [];

    state().load(TEXT);
    state().remove(['route', 'rules', 0]);
    state().insert(['route', 'rules', 0], { action: 'route', outbound: 'direct' });

    const left = parseConfig(state().current() ?? '').config?.route?.rules ?? [];

    expect(left).toHaveLength(rules.length);
    expect(left[0]).toEqual({ action: 'route', outbound: 'direct' });
    expect(left[1]).toEqual(rules[1]);
  });
});

describe('файлы списков в черновике', () => {
  beforeEach(() => {
    ConfigDocumentState.getState().reset();
    state().load(TEXT);
    state().loadLists({ 'my.json': '{"version":1}' }, 'etag-1');
  });

  it('изменения сводятся к реальным: то же содержимое и чужое удаление выпадают', () => {
    state().editList('my.json', '{"version":1}');
    state().removeList('absent.json');

    expect(state().listChanges()).toEqual({ put: {}, remove: [] });
    expect(state().isDirty()).toBe(false);
  });

  it('правка и удаление файлов делают документ черновиком без правки текста', () => {
    state().editList('new.json', '{"version":1,"rules":[]}');
    state().removeList('my.json');

    expect(state().listChanges()).toEqual({
      put: { 'new.json': '{"version":1,"rules":[]}' },
      remove: ['my.json'],
    });
    expect(state().isDirty()).toBe(true);
    expect(state().draft).toBeNull();
  });

  it('отмена правок снимает и файлы', () => {
    state().editList('new.json', '{}');
    state().discard();

    expect(state().listChanges()).toEqual({ put: {}, remove: [] });
    expect(state().isDirty()).toBe(false);
  });
});

/** Тот же конфиг, переписанный на устройстве: уровень лога другой. */
const CHANGED = TEXT.replace('"error"', '"debug"');

/** Перезагрузка страницы: модуль стора исполняется заново и читает браузер. */
async function reloadStore() {
  vi.resetModules();

  const reloaded = await import('../model/Config.store');

  return reloaded.ConfigDocumentState;
}

function leavePage(): Event {
  const event = new Event('beforeunload', { cancelable: true });

  globalThis.dispatchEvent(event);

  return event;
}

describe('ConfigDocumentState: черновик в браузере', () => {
  beforeEach(() => {
    ConfigDocumentState.getState().reset();
    globalThis.localStorage.clear();
  });

  it('правки переживают перезагрузку и ложатся на тот же конфиг молча', async () => {
    state().load(TEXT);
    state().edit(['route', 'final'], 'direct');
    const draft = state().draft;

    const reloaded = (await reloadStore()).getState();

    expect(reloaded.draft).toBe(draft);

    reloaded.load(TEXT);

    expect(reloaded.isDirty()).toBe(true);
    expect(reloaded.isStale()).toBe(false);
  });

  it('файлы списков в черновике тоже переживают перезагрузку', async () => {
    state().load(TEXT);
    state().loadLists({}, null);
    state().editList('ads.json', '{"version":3,"rules":[]}');

    const reloaded = (await reloadStore()).getState();

    reloaded.loadLists({}, null);

    expect(reloaded.listChanges()).toEqual({ put: { 'ads.json': '{"version":3,"rules":[]}' }, remove: [] });
  });

  it('предупреждает, когда конфиг на устройстве сменился с момента черновика', async () => {
    state().load(TEXT);
    state().edit(['route', 'final'], 'direct');

    const reloaded = await reloadStore();

    reloaded.getState().load(CHANGED);

    expect(reloaded.getState().isStale()).toBe(true);
    expect(reloaded.getState().applied).toBe(CHANGED);
  });

  it('предупреждение держится до отказа от черновика, и отказ снимает запись в браузере', async () => {
    state().load(TEXT);
    state().edit(['route', 'final'], 'direct');

    const store = await reloadStore();

    store.getState().load(CHANGED);
    store.getState().edit(['route', 'final'], 'block');

    expect(store.getState().isStale()).toBe(true);

    store.getState().discard();

    expect(store.getState().isStale()).toBe(false);
    expect((await reloadStore()).getState().draft).toBeNull();
  });

  it('конфиг, сменившийся на устройстве посреди сессии, тоже даёт предупреждение', () => {
    state().load(TEXT);
    state().edit(['route', 'final'], 'direct');
    state().load(CHANGED);

    expect(state().isStale()).toBe(true);
  });

  it('чужая запись в хранилище читается как отсутствие черновика', async () => {
    state().load(TEXT);
    state().edit(['route', 'final'], 'direct');

    for (let index = 0; index < globalThis.localStorage.length; index += 1) {
      const key = globalThis.localStorage.key(index);

      if (key !== null) globalThis.localStorage.setItem(key, '{"draft":1}');
    }

    expect((await reloadStore()).getState().draft).toBeNull();
  });
});

describe('useConfigLeaveGuard', () => {
  beforeEach(() => {
    ConfigDocumentState.getState().reset();
    ConfigDocumentState.getState().load(TEXT);
  });

  it('при неприменённых правках просит браузер подтвердить уход', () => {
    state().edit(['route', 'final'], 'direct');
    renderHook(useConfigLeaveGuard);

    expect(leavePage().defaultPrevented).toBe(true);
  });

  it('без правок уходу не мешает', () => {
    renderHook(useConfigLeaveGuard);

    expect(leavePage().defaultPrevented).toBe(false);
  });

  it('после отказа от черновика подтверждение снимается', () => {
    state().edit(['route', 'final'], 'direct');
    renderHook(useConfigLeaveGuard);

    act(() => {
      state().discard();
    });

    expect(leavePage().defaultPrevented).toBe(false);
  });
});
