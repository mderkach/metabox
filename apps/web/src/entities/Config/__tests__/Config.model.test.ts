import { describe, expect, it } from 'vitest';

import { OptionsSchema } from '@shared/api/generated';

import { parseConfig } from '../api/Config.query';
import {
  CONFIG_SECTION,
  GENERIC_SECTIONS,
  findValue,
  insertValue,
  moveValue,
  readSectionNodes,
  removeValue,
  sectionNodePath,
  sectionSize,
  setValue,
  toFinalOutbound,
  toOutboundTypes,
  type ConfigDocument,
} from '../model/Config.model';
import { CONFIG_FIXTURE } from './Config.fixture';

const TEXT = JSON.stringify(CONFIG_FIXTURE, null, 2);

/**
 * Lines added plus removed: the same number `diff` would show. A naive
 * index comparison lies here: inserting one line shifts the whole tail.
 */
function changedLines(before: string, after: string): number {
  const left = before.split('\n');
  const right = after.split('\n');
  const lcs = Array.from({ length: left.length + 1 }, () => Array.from({ length: right.length + 1 }, () => 0));

  for (let i = 1; i <= left.length; i++) {
    for (let j = 1; j <= right.length; j++) {
      lcs[i][j] = left[i - 1] === right[j - 1] ? lcs[i - 1][j - 1] + 1 : Math.max(lcs[i - 1][j], lcs[i][j - 1]);
    }
  }

  const common = lcs[left.length][right.length];

  return left.length - common + (right.length - common);
}

/**
 * Top-level keys are read from the text, not from the parsed model: Zod
 * lays out fields in schema order, and a check against the model would show the order
 * of the schema instead of the file order, exactly what editing by text protects against.
 */
function topLevelKeys(text: string): string[] {
  return [...text.matchAll(/^ {2}"([^"]+)":/gm)].map((match) => match[1]);
}

describe('setValue', () => {
  it('editing an existing field changes exactly one line of the device config', () => {
    const after = setValue(TEXT, ['route', 'default_mark'], 200);

    expect(changedLines(TEXT, after)).toBe(2);
    expect(parseConfig(after).config?.route?.default_mark).toBe(200);
  });

  it('a new field touches only itself and the comma on its neighbor', () => {
    const after = setValue(TEXT, ['route', 'final'], 'direct');

    expect(changedLines(TEXT, after)).toBe(3);
    expect(parseConfig(after).config?.route?.final).toBe('direct');
  });

  it('does not reorder keys: the section order in the text stays as it was', () => {
    const after = setValue(TEXT, ['route', 'final'], 'direct');

    expect(topLevelKeys(after)).toEqual(topLevelKeys(TEXT));
    expect(topLevelKeys(TEXT)).toEqual(Object.keys(CONFIG_FIXTURE));
  });

  it('does not touch nodes the schema does not know', () => {
    const text = JSON.stringify({ route: { final: 'proxy' }, unknown_section: { a: [1, 2] } }, null, 2);
    const after = setValue(text, ['route', 'final'], 'direct');

    expect(Reflect.get(parseConfig(after).config ?? {}, 'unknown_section')).toEqual({ a: [1, 2] });
  });

  it('an insert repeats the indent of a file indented with tabs', () => {
    const text = '{\n\t"route": {\n\t\t"final": "proxy"\n\t}\n}';
    const after = setValue(text, ['route', 'default_mark'], 100);

    expect(after).toContain('\n\t\t"default_mark": 100');
  });

  it('an insert repeats the indent of a file indented with four spaces', () => {
    const text = '{\n    "route": {\n        "final": "proxy"\n    }\n}';
    const after = setValue(text, ['route', 'default_mark'], 100);

    expect(after).toContain('\n        "default_mark": 100');
  });

  it('an insert keeps Windows line endings', () => {
    const text = '{\r\n  "route": {\r\n    "final": "proxy"\r\n  }\r\n}';
    const after = setValue(text, ['route', 'default_mark'], 100);

    expect(after).toContain('\r\n    "default_mark": 100');
    expect(after).not.toContain('\n\n');
  });
});

describe('removeValue', () => {
  it('deletes a rule, leaving neighboring lines as they were', () => {
    const rules = CONFIG_FIXTURE.route?.rules ?? [];
    const after = removeValue(TEXT, ['route', 'rules', 0]);
    const left = parseConfig(after ?? '').config?.route?.rules ?? [];

    expect(left).toHaveLength(rules.length - 1);
    expect(left[0]).toEqual(rules[1]);
  });
});

describe('insertValue', () => {
  it('inserts a rule in place, not over a neighboring one', () => {
    const rules = CONFIG_FIXTURE.route?.rules ?? [];
    const after = insertValue(TEXT, ['route', 'rules', 1], { action: 'route', outbound: 'direct' });
    const left = parseConfig(after ?? '').config?.route?.rules ?? [];

    expect(left).toHaveLength(rules.length + 1);
    expect(left[1]).toEqual({ action: 'route', outbound: 'direct' });
    expect(left[2]).toEqual(rules[1]);
  });
});

describe('array edit refusals', () => {
  it.each(['{"r":[1,2],"broken":}', '{"r":[1, // first\n 2],"broken":}', '{"r":[],"broken":}', '{"broken":}'])(
    'refuses array inserts and removals in malformed surrounding text: %s',
    (text) => {
      expect(removeValue(text, ['r', 1])).toBeNull();
      expect(insertValue(text, ['r', 1], 3)).toBeNull();
    }
  );

  it('deletes an object member without changing sibling values or comments', () => {
    const after = removeValue('{"keep":[1,/* keep this comment */2],"remove":3}', ['remove']);

    expect(findValue(after ?? '', [])).toEqual({ keep: [1, 2] });
    expect(after).toContain('/* keep this comment */');
  });
});

describe('moveValue', () => {
  it('refuses to move an array when another part of the document is malformed', () => {
    expect(moveValue('{"rules":[1,2],"broken":}', ['rules'], 0, 1)).toBeNull();
  });

  it('validates a document whose root is an array', () => {
    expect(moveValue('[1,2]', [], 0, 1)).toBe('[2,1]');
  });
});

describe('toOutboundTypes', () => {
  it('reduces an outbound tag to its type', () => {
    const types = toOutboundTypes(CONFIG_FIXTURE);

    expect(types.get('node-a-vless-reality')).toBe('vless');
    expect(types.get('proxy')).toBe('urltest');
    expect(types.get('alt-fallback')).toBe('selector');
    expect(types.get('direct')).toBe('direct');
  });

  it('an outbound without a tag does not get into the map: there is nothing to refer to it by', () => {
    const types = toOutboundTypes({ ...CONFIG_FIXTURE, outbounds: [{ type: 'direct' }] });

    expect(types.size).toBe(0);
  });

  it('no config: the map is empty', () => {
    expect(toOutboundTypes(null).size).toBe(0);
  });
});

describe('toFinalOutbound', () => {
  const OUTBOUNDS: ConfigDocument['outbounds'] = [
    { type: 'direct', tag: 'direct' },
    { type: 'direct', tag: 'isp' },
  ];

  it('takes route.final if it is set', () => {
    expect(toFinalOutbound({ outbounds: OUTBOUNDS, route: { final: 'isp' } })).toBe('isp');
  });

  it('without route.final the first outbound, as sing-box decides', () => {
    expect(toFinalOutbound({ outbounds: OUTBOUNDS, route: {} })).toBe('direct');
    expect(toFinalOutbound({ outbounds: OUTBOUNDS })).toBe('direct');
  });

  it('without route.final and outbounds there is no outbound', () => {
    expect(toFinalOutbound({})).toBeNull();
    expect(toFinalOutbound(null)).toBeNull();
  });
});

describe('readSectionNodes', () => {
  const DNS_TEXT = `{
  "dns": {
    "servers": [{ "type": "local", "tag": "local" }],
    "rules": [{ "domain": ["a.example"], "server": "local" }, { "query_type": ["AAAA"], "action": "reject" }],
  },
}`;

  it('DNS rules are read from dns.rules, not from the server list', () => {
    expect(readSectionNodes(DNS_TEXT, CONFIG_SECTION.DnsRules)).toEqual([
      { domain: ['a.example'], server: 'local' },
      { query_type: ['AAAA'], action: 'reject' },
    ]);
  });

  it('a DNS rule path leads to dns.rules by position', () => {
    expect(sectionNodePath(CONFIG_SECTION.DnsRules, 1)).toEqual(['dns', 'rules', 1]);
  });

  it('ntp is an object section: one node, a path without position', () => {
    const text = '{ "ntp": { "enabled": true, "server": "time.example" } }';

    expect(readSectionNodes(text, CONFIG_SECTION.Ntp)).toEqual([{ enabled: true, server: 'time.example' }]);
    expect(sectionNodePath(CONFIG_SECTION.Ntp, 0)).toEqual(['ntp']);
  });

  it('a section that is not in the file has no nodes', () => {
    expect(readSectionNodes('{}', CONFIG_SECTION.Ntp)).toEqual([]);
    expect(readSectionNodes('{}', CONFIG_SECTION.Endpoints)).toEqual([]);
  });
});

describe('sectionSize', () => {
  it('counts list items by its path in the document', () => {
    const config: ConfigDocument = {
      dns: { servers: [{ type: 'local', tag: 'local' }], rules: [{ server: 'local' }, { server: 'local' }] },
    };

    expect(sectionSize(config, CONFIG_SECTION.Dns)).toBe(1);
    expect(sectionSize(config, CONFIG_SECTION.DnsRules)).toBe(2);
  });

  it('a missing list section is zero', () => {
    expect(sectionSize({}, CONFIG_SECTION.Endpoints)).toBe(0);
    expect(sectionSize({}, CONFIG_SECTION.NetworkNamespaces)).toBe(0);
  });

  it('an object section has no count', () => {
    expect(sectionSize({ ntp: { enabled: true } }, CONFIG_SECTION.Ntp)).toBeNull();
    expect(sectionSize({}, CONFIG_SECTION.Certificate)).toBeNull();
  });

  it('without a document there is no count', () => {
    expect(sectionSize(null, CONFIG_SECTION.Services)).toBeNull();
  });
});

describe('GENERIC_SECTIONS', () => {
  // A guard test: a section the fork adds to the schema, without an entry here,
  // would be left without a tab and be editable only by the text of the whole file.
  // `route` is edited by its own screens, `$schema` is not a section.
  it('covers every top-level section of the schema', () => {
    const covered = new Set<string>(Object.values(GENERIC_SECTIONS).map((shape) => shape.path[0]));
    const sections = Object.keys(OptionsSchema.shape).filter((key) => key !== '$schema' && key !== 'route');

    expect(sections.filter((key) => !covered.has(key))).toEqual([]);
  });
});
