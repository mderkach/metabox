import { NODE_REGISTRY, type NodeRegistry } from '@entities/Config';

/** Откуда у узла реестра форма. */
export const FORM_POLICY = {
  /** Любой тип реестра открывается автоформой по схеме. */
  Auto: 'auto',
  /** Форма только у типов с рукописной формой; остальные правятся текстом. */
  OverridesOnly: 'overridesOnly',
} as const;

export type FormPolicy = (typeof FORM_POLICY)[keyof typeof FORM_POLICY];

/**
 * Политика форм по реестрам. У служб форма положена только `api` (PRD, раздел
 * 8): она открывается своим оверрайдом, остальные службы правятся текстом.
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
