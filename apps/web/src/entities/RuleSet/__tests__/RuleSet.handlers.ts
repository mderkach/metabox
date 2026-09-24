import { http, HttpResponse } from 'msw';

import { RULE_SET_ENDPOINT } from '../api/RuleSet.endpoints';
import { RULE_SET_CATALOG_FIXTURE } from './RuleSet.fixture';

export const ruleSetHandlers = [
  http.get(RULE_SET_ENDPOINT.catalog(), () => HttpResponse.json(RULE_SET_CATALOG_FIXTURE)),
];
