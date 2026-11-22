import type { AxiosRequestConfig } from 'axios';

import { ApiClientInstance } from '@shared/api';
import type { OutboundMetadataEditWire, OutboundsWire } from '@shared/api/daemon.generated';

import { PROXY_ENDPOINT } from './Proxy.endpoints';

export async function getOutboundMetadata(config?: AxiosRequestConfig): Promise<OutboundsWire> {
  return ApiClientInstance.get<OutboundsWire>(PROXY_ENDPOINT.outbounds(), config);
}

export async function saveOutboundMetadata(
  { tag, entry }: { tag: string; entry: OutboundMetadataEditWire },
  config?: AxiosRequestConfig
): Promise<OutboundsWire> {
  return ApiClientInstance.put<OutboundsWire>(PROXY_ENDPOINT.outbound(tag), entry, config);
}
