import type { ParseKeys } from 'i18next';

import { NODE_REGISTRY, type NodeRegistry } from '@entities/Config';

/** Where a registry node gets its form from. */
export const FORM_POLICY = {
  /** Any registry type opens as an auto-form from the schema. */
  Auto: 'auto',
  /** A form only for types with a handwritten form; the rest are edited as text. */
  OverridesOnly: 'overridesOnly',
} as const;

export type FormPolicy = (typeof FORM_POLICY)[keyof typeof FORM_POLICY];

/**
 * Form policy per registry. Among services only `api` is entitled to a form (PRD, section
 * 8): it opens with its own override, the other services are edited as text.
 */
export const NODE_FORM_POLICY: Readonly<Record<NodeRegistry, FormPolicy>> = {
  [NODE_REGISTRY.Inbound]: FORM_POLICY.Auto,
  [NODE_REGISTRY.Outbound]: FORM_POLICY.Auto,
  [NODE_REGISTRY.Endpoint]: FORM_POLICY.Auto,
  [NODE_REGISTRY.Provider]: FORM_POLICY.Auto,
  [NODE_REGISTRY.Service]: FORM_POLICY.OverridesOnly,
  [NODE_REGISTRY.CertificateProvider]: FORM_POLICY.Auto,
  [NODE_REGISTRY.Dns]: FORM_POLICY.Auto,
};

/** Outbound group types named in words, the same as on the proxies screen. */
export const GROUP_TYPE_LABEL: Readonly<Record<string, ParseKeys<'shared'> | undefined>> = {
  selector: 'groupType.selector',
  urltest: 'groupType.urltest',
  fallback: 'groupType.fallback',
};
