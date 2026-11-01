import { describe, expect, it } from 'vitest';

import { DEVICE_ROUTE_ERROR, DeviceRouteSubnetsSchema } from '../model';

describe('DeviceRouteSubnetsSchema', () => {
  it('accepts addresses, subnets and an empty list', () => {
    expect(DeviceRouteSubnetsSchema.safeParse({ sourceIp: ['192.168.1.20', '10.0.0.0/8'] }).success).toBe(true);
    expect(DeviceRouteSubnetsSchema.safeParse({ sourceIp: [] }).success).toBe(true);
  });

  it('rejects host bits, IPv6 and garbage with the failure code', () => {
    for (const entry of ['192.168.1.5/24', 'fd00::/8', 'router']) {
      const result = DeviceRouteSubnetsSchema.safeParse({ sourceIp: ['192.168.1.20', entry] });

      expect(result.error?.issues[0]?.message).toBe(DEVICE_ROUTE_ERROR.SourceIpInvalid);
    }
  });
});
