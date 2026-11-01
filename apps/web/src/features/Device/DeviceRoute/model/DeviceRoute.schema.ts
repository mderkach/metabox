import { z } from 'zod';

import { sourceIpError } from '@entities/Dataplane';

export const DEVICE_ROUTE_ERROR = {
  SourceIpInvalid: 'sourceIpInvalid',
} as const;

export const DeviceRouteSubnetsSchema = z.object({
  /** `source_ip` entries: IPv4 addresses and subnets without host bits */
  sourceIp: z
    .array(z.string())
    .refine((entries) => entries.every((entry) => sourceIpError(entry) === null), DEVICE_ROUTE_ERROR.SourceIpInvalid),
});

export type DeviceRouteSubnetsModel = z.infer<typeof DeviceRouteSubnetsSchema>;
