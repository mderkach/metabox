import type { OutboundMetadataWire } from '@shared/api/daemon.generated';

export interface OutboundMetadata {
  label?: string;
  normMs?: number;
  unused?: boolean;
}

export type OutboundMetadataMap = ReadonlyMap<string, OutboundMetadata>;

export function toOutboundMetadata(
  entries: ReadonlyArray<readonly [string, OutboundMetadataWire]>
): OutboundMetadataMap {
  return new Map(
    entries.map(([tag, entry]) => [
      tag,
      {
        ...(entry.label === undefined ? {} : { label: entry.label }),
        ...(entry.norm_ms === undefined ? {} : { normMs: entry.norm_ms }),
        ...(entry.unused === undefined ? {} : { unused: entry.unused }),
      },
    ])
  );
}
