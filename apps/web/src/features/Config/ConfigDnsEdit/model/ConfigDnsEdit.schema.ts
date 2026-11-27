import { z } from 'zod';

export const DnsServerSchema = z.object({
  tag: z.string().trim().min(1, 'tag'),
  address: z.ipv4('address'),
  detour: z.string(),
});

export type DnsServerForm = z.infer<typeof DnsServerSchema>;
