import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';

import { CACHE_TIME, decodeResponse } from '@shared/api';
import { OutboundMetadataSchema } from '@shared/api/daemon.generated';

import { toOutboundMetadata, type OutboundMetadata } from '../model/Proxy.metadata';
import { getOutboundMetadata, saveOutboundMetadata } from './Proxy.metadata.api';
import { PROXY_QUERY } from './Proxy.query';

const OutboundRecordSchema = z.custom<Record<string, unknown>>(
  (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
);
const OutboundEntriesSchema = z.array(z.tuple([z.string(), OutboundMetadataSchema]));

function decodeMetadata(value: unknown) {
  const record = decodeResponse(OutboundRecordSchema, value, 'outbound metadata');

  // Zod's record parser drops the valid tag "__proto__".
  return decodeResponse(OutboundEntriesSchema, Object.entries(record), 'outbound metadata');
}

function getOutboundMetadataOptions() {
  return queryOptions({
    queryKey: PROXY_QUERY.outbounds(),
    queryFn: async (context) => decodeMetadata(await getOutboundMetadata(context)),
    staleTime: CACHE_TIME.Minute,
    retry: false,
  });
}

export function useOutboundMetadata() {
  return useQuery({ ...getOutboundMetadataOptions(), select: toOutboundMetadata });
}

export function useSaveOutboundMetadata() {
  const client = useQueryClient();

  return useMutation({
    scope: { id: 'outbound-metadata' },
    mutationFn: async ({ tag, entry }: { tag: string; entry: OutboundMetadata }) =>
      decodeMetadata(
        await saveOutboundMetadata({
          tag,
          entry: {
            ...(entry.label === undefined ? {} : { label: entry.label }),
            ...(entry.normMs === undefined ? {} : { norm_ms: entry.normMs }),
          },
        })
      ),
    meta: { showError: true, errorMessageKey: 'toast.outboundMetadata.failed' },
    onSuccess: async (entries) => {
      await client.cancelQueries({ queryKey: PROXY_QUERY.outbounds() });
      client.setQueryData(PROXY_QUERY.outbounds(), entries);
      void client.invalidateQueries({ queryKey: PROXY_QUERY.latency() });
    },
  });
}
