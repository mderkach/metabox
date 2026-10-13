import { z } from 'zod';

import {
  BUILD_TAG_OF_TYPE,
  CertificateProviderSchema,
  DnsSchema,
  EndpointSchema,
  InboundSchema,
  OutboundSchema,
  ProviderSchema,
  ServiceSchema,
} from '@shared/api/generated';
import { toVariants, type SchemaVariant } from '@shared/lib/schemaShape';

import { CONFIG_SECTION, readSectionNodes, type GenericSection } from './Config.model';

/**
 * Fork type registry: a section takes the types of its nodes from it. The
 * values are generator registry names, the same as the `BUILD_TAG_OF_TYPE`
 * keys.
 */
export const NODE_REGISTRY = {
  Inbound: 'inbound',
  Outbound: 'outbound',
  Endpoint: 'endpoint',
  Provider: 'provider',
  Service: 'service',
  CertificateProvider: 'certificate_provider',
  Dns: 'dns',
} as const;

export type NodeRegistry = (typeof NODE_REGISTRY)[keyof typeof NODE_REGISTRY];

/** Registry union discriminated by `type` in the generated schema. */
const REGISTRY_SCHEMA: Readonly<Record<NodeRegistry, z.core.$ZodType>> = {
  [NODE_REGISTRY.Inbound]: InboundSchema,
  [NODE_REGISTRY.Outbound]: OutboundSchema,
  [NODE_REGISTRY.Endpoint]: EndpointSchema,
  [NODE_REGISTRY.Provider]: ProviderSchema,
  [NODE_REGISTRY.Service]: ServiceSchema,
  [NODE_REGISTRY.CertificateProvider]: CertificateProviderSchema,
  [NODE_REGISTRY.Dns]: DnsSchema,
};

/** Document section and the fork registry it takes types from. */
export const SECTION_REGISTRY: readonly { section: GenericSection; registry: NodeRegistry }[] = [
  { section: CONFIG_SECTION.Inbounds, registry: NODE_REGISTRY.Inbound },
  { section: CONFIG_SECTION.Outbounds, registry: NODE_REGISTRY.Outbound },
  { section: CONFIG_SECTION.Endpoints, registry: NODE_REGISTRY.Endpoint },
  { section: CONFIG_SECTION.Providers, registry: NODE_REGISTRY.Provider },
  { section: CONFIG_SECTION.Services, registry: NODE_REGISTRY.Service },
  { section: CONFIG_SECTION.CertificateProviders, registry: NODE_REGISTRY.CertificateProvider },
  { section: CONFIG_SECTION.Dns, registry: NODE_REGISTRY.Dns },
];

/** Variants are parsed on first access: a screen without forms does not need them. */
const VARIANTS = new Map<NodeRegistry, readonly SchemaVariant[]>();

/** Registry a section takes types from; `null` means the section nodes have no type. */
export function registryOfSection(section: GenericSection): NodeRegistry | null {
  return SECTION_REGISTRY.find((entry) => entry.section === section)?.registry ?? null;
}

/** Registry types in schema order, each with its own node schema. */
export function nodeVariants(registry: NodeRegistry): readonly SchemaVariant[] {
  const cached = VARIANTS.get(registry);

  if (cached !== undefined) {
    return cached;
  }

  const variants = toVariants(REGISTRY_SCHEMA[registry]);

  VARIANTS.set(registry, variants);

  return variants;
}

/** Node schema of a type; `null` means the registry does not know such a type. */
export function nodeSchemaOf(registry: NodeRegistry, type: string): z.core.$ZodType | null {
  return nodeVariants(registry).find((variant) => variant.type === type)?.schema ?? null;
}

/**
 * A node that its type schema accepts entirely. An unfamiliar field, a wrong
 * value or a type the registry does not know makes it unrecognized: such a node
 * is edited as text and the form does not open it (ADR-0018).
 */
export function isNodeRecognized(registry: NodeRegistry, node: unknown): boolean {
  const type: unknown = typeof node === 'object' && node !== null ? Reflect.get(node, 'type') : undefined;
  const schema = typeof type === 'string' ? nodeSchemaOf(registry, type) : null;

  return schema !== null && z.safeParse(schema, node).success;
}

/** Build tag without which the binary will not run the type; `null` means the type is in any build. */
export function buildTagOfType(registry: NodeRegistry, type: string): string | null {
  return BUILD_TAG_OF_TYPE[registry]?.[type] ?? null;
}

/**
 * A new section node: only the type and the tag. Other fields are optional by
 * the schema, and appended defaults would get into the diff as an edit the user
 * did not make.
 */
export function newSectionNode(type: string, tag: string): { type: string; tag: string } {
  return { type, tag };
}

/**
 * Node tags of all sections with a registry. A new node does not repeat any of
 * them: rules, `detour` and DNS refer to a node by tag, and the same name in
 * two sections would make such a reference ambiguous to someone reading the
 * config.
 */
export function readNodeTags(text: string): string[] {
  return SECTION_REGISTRY.flatMap(({ section }) => readSectionNodes(text, section))
    .map((node): unknown => (typeof node === 'object' && node !== null ? Reflect.get(node, 'tag') : undefined))
    .filter((tag): tag is string => typeof tag === 'string' && tag.length > 0);
}
