import { expect, it } from 'vitest';

import { nodePreset } from '../model/Config.nodePreset';
import { NODE_REGISTRY } from '../model/Config.registry';

it('a new service listens on loopback and gets a random secret, the port is not filled in', () => {
  const first = nodePreset(NODE_REGISTRY.Service, 'api', 'api');
  const second = nodePreset(NODE_REGISTRY.Service, 'api', 'api');

  expect({ ...first, secret: null }).toEqual({ type: 'api', tag: 'api', listen: '127.0.0.1', secret: null });
  const secret: unknown = Reflect.get(first, 'secret');

  expect(secret).toMatch(/^[\w-]{32}$/);
  expect(first).not.toEqual(second);
});
