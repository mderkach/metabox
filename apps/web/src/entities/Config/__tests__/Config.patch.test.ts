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
  it('an untouched node yields no edits', () => {
    expect(diffNode(PATH, NODE, structuredClone(NODE))).toEqual([]);
  });

  it('a touched field yields one edit at its path', () => {
    expect(diffNode(PATH, NODE, { ...NODE, server: 'b.example' })).toEqual([
      { path: ['outbounds', 1, 'server'], value: 'b.example' },
    ]);
  });

  it('a field in a nested object is addressed by the leaf, not the whole object', () => {
    const after = { ...NODE, tls: { ...NODE.tls, server_name: 'b.example' } };

    expect(diffNode(PATH, NODE, after)).toEqual([{ path: ['outbounds', 1, 'tls', 'server_name'], value: 'b.example' }]);
  });

  it.each([
    ['with an empty string', ''],
    ['with null', null],
    ['with no value', undefined],
  ])('a field cleared %s is removed', (_, value) => {
    expect(diffNode(PATH, NODE, { ...NODE, server: value })).toEqual([
      { path: ['outbounds', 1, 'server'], value: undefined },
    ]);
  });

  it('an empty list removes the key instead of writing []', () => {
    expect(diffNode(PATH, { ...NODE, network: ['tcp'] }, { ...NODE, network: [] })).toEqual([
      { path: ['outbounds', 1, 'network'], value: undefined },
    ]);
  });

  it('a field that did not exist and stayed empty yields no edit', () => {
    expect(diffNode(PATH, NODE, { ...NODE, uuid: '', flow: undefined })).toEqual([]);
  });

  it('a one-string listable that the form returned as a string stays a string', () => {
    expect(diffNode(PATH, NODE, { ...NODE, tls: { ...NODE.tls, alpn: 'h2' } })).toEqual([]);
  });

  it('an array is compared as a whole: a new order is one list edit', () => {
    const before = { ...NODE, network: ['tcp', 'udp'] };

    expect(diffNode(PATH, before, { ...NODE, network: ['udp', 'tcp'] })).toEqual([
      { path: ['outbounds', 1, 'network'], value: ['udp', 'tcp'] },
    ]);
  });

  it('a new nested object is written without empty keys', () => {
    const after = { ...NODE, multiplex: { enabled: true, protocol: '', padding: undefined } };

    expect(diffNode(PATH, NODE, after)).toEqual([{ path: ['outbounds', 1, 'multiplex'], value: { enabled: true } }]);
  });

  it('a nested object of only empty fields is not appended', () => {
    expect(diffNode(PATH, NODE, { ...NODE, multiplex: { protocol: '' } })).toEqual([]);
  });

  it('edits land on the text precisely: a comment inside the node is intact', () => {
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
