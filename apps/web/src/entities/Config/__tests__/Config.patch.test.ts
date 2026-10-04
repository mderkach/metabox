import { describe, expect, it } from 'vitest';

import { setValue } from '../model/Config.model';
import { diffNode } from '../model/Config.patch';

const PATH = ['outbounds', 1];

const NODE = {
  type: 'vless',
  tag: 'hk-01',
  server: 'a.example',
  server_port: 443,
  tls: { enabled: true, server_name: 'a.example', alpn: 'h2' },
};

describe('diffNode', () => {
  it('нетронутый узел правок не даёт', () => {
    expect(diffNode(PATH, NODE, structuredClone(NODE))).toEqual([]);
  });

  it('тронутое поле даёт одну правку по своему пути', () => {
    expect(diffNode(PATH, NODE, { ...NODE, server: 'b.example' })).toEqual([
      { path: ['outbounds', 1, 'server'], value: 'b.example' },
    ]);
  });

  it('поле во вложенном объекте адресуется листом, а не объектом целиком', () => {
    const after = { ...NODE, tls: { ...NODE.tls, server_name: 'b.example' } };

    expect(diffNode(PATH, NODE, after)).toEqual([{ path: ['outbounds', 1, 'tls', 'server_name'], value: 'b.example' }]);
  });

  it.each([
    ['пустой строкой', ''],
    ['через null', null],
    ['без значения', undefined],
  ])('очищенное %s поле удаляется', (_, value) => {
    expect(diffNode(PATH, NODE, { ...NODE, server: value })).toEqual([
      { path: ['outbounds', 1, 'server'], value: undefined },
    ]);
  });

  it('пустой список удаляет ключ, а не пишет []', () => {
    expect(diffNode(PATH, { ...NODE, network: ['tcp'] }, { ...NODE, network: [] })).toEqual([
      { path: ['outbounds', 1, 'network'], value: undefined },
    ]);
  });

  it('поле, которого не было и которое осталось пустым, правки не даёт', () => {
    expect(diffNode(PATH, NODE, { ...NODE, uuid: '', flow: undefined })).toEqual([]);
  });

  it('listable из одной строки, которую форма вернула строкой, остаётся строкой', () => {
    expect(diffNode(PATH, NODE, { ...NODE, tls: { ...NODE.tls, alpn: 'h2' } })).toEqual([]);
  });

  it('массив сравнивается целиком: новый порядок — одна правка списка', () => {
    const before = { ...NODE, network: ['tcp', 'udp'] };

    expect(diffNode(PATH, before, { ...NODE, network: ['udp', 'tcp'] })).toEqual([
      { path: ['outbounds', 1, 'network'], value: ['udp', 'tcp'] },
    ]);
  });

  it('новый вложенный объект пишется без пустых ключей', () => {
    const after = { ...NODE, multiplex: { enabled: true, protocol: '', padding: undefined } };

    expect(diffNode(PATH, NODE, after)).toEqual([{ path: ['outbounds', 1, 'multiplex'], value: { enabled: true } }]);
  });

  it('вложенный объект из одних пустых полей не дописывается', () => {
    expect(diffNode(PATH, NODE, { ...NODE, multiplex: { protocol: '' } })).toEqual([]);
  });

  it('правки ложатся на текст точечно: комментарий внутри узла цел', () => {
    const text = [
      '{',
      '  "outbounds": [',
      '    { "type": "direct", "tag": "direct" },',
      '    {',
      '      "type": "vless",',
      '      // узел в Гонконге',
      '      "tag": "hk-01",',
      '      "server": "a.example",',
      '    },',
      '  ],',
      '}',
    ].join('\n');
    const before = { type: 'vless', tag: 'hk-01', server: 'a.example' };
    const after = diffNode(PATH, before, { ...before, server: 'b.example' }).reduce(
      (next, edit) => setValue(next, edit.path, edit.value),
      text
    );
    const changed = after.split('\n').filter((line, index) => line !== text.split('\n')[index]);

    expect(changed).toEqual(['      "server": "b.example",']);
  });
});
