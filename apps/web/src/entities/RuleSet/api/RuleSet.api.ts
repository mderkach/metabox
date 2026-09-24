import type { AxiosRequestConfig } from 'axios';

import { ApiClientInstance } from '@shared/api';

import { RULE_SET_ENDPOINT } from './RuleSet.endpoints';
import type { RuleSetCatalogWire } from './RuleSet.schema';

export async function getRuleSetCatalog(config?: AxiosRequestConfig): Promise<RuleSetCatalogWire> {
  return ApiClientInstance.get<RuleSetCatalogWire>(RULE_SET_ENDPOINT.catalog(), config);
}
