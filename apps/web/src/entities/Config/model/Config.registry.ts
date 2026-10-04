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
 * Реестр типов форка: из него секция берёт типы своих узлов. Значения — имена
 * реестров генератора, те же, что ключи `BUILD_TAG_OF_TYPE`.
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

/** Дискриминированный по `type` union реестра в сгенерированной схеме. */
const REGISTRY_SCHEMA: Readonly<Record<NodeRegistry, z.core.$ZodType>> = {
  [NODE_REGISTRY.Inbound]: InboundSchema,
  [NODE_REGISTRY.Outbound]: OutboundSchema,
  [NODE_REGISTRY.Endpoint]: EndpointSchema,
  [NODE_REGISTRY.Provider]: ProviderSchema,
  [NODE_REGISTRY.Service]: ServiceSchema,
  [NODE_REGISTRY.CertificateProvider]: CertificateProviderSchema,
  [NODE_REGISTRY.Dns]: DnsSchema,
};

/** Секция документа и реестр форка, из которого она берёт типы. */
export const SECTION_REGISTRY: readonly { section: GenericSection; registry: NodeRegistry }[] = [
  { section: CONFIG_SECTION.Inbounds, registry: NODE_REGISTRY.Inbound },
  { section: CONFIG_SECTION.Outbounds, registry: NODE_REGISTRY.Outbound },
  { section: CONFIG_SECTION.Endpoints, registry: NODE_REGISTRY.Endpoint },
  { section: CONFIG_SECTION.Providers, registry: NODE_REGISTRY.Provider },
  { section: CONFIG_SECTION.Services, registry: NODE_REGISTRY.Service },
  { section: CONFIG_SECTION.CertificateProviders, registry: NODE_REGISTRY.CertificateProvider },
  { section: CONFIG_SECTION.Dns, registry: NODE_REGISTRY.Dns },
];

/** Варианты разбираются при первом обращении: экрану без форм они не нужны. */
const VARIANTS = new Map<NodeRegistry, readonly SchemaVariant[]>();

/** Реестр, из которого секция берёт типы; `null` — у узлов секции типа нет. */
export function registryOfSection(section: GenericSection): NodeRegistry | null {
  return SECTION_REGISTRY.find((entry) => entry.section === section)?.registry ?? null;
}

/** Типы реестра в порядке схемы, каждый со своей схемой узла. */
export function nodeVariants(registry: NodeRegistry): readonly SchemaVariant[] {
  const cached = VARIANTS.get(registry);

  if (cached !== undefined) {
    return cached;
  }

  const variants = toVariants(REGISTRY_SCHEMA[registry]);

  VARIANTS.set(registry, variants);

  return variants;
}

/** Схема узла типа; `null` — реестр такого типа не знает. */
export function nodeSchemaOf(registry: NodeRegistry, type: string): z.core.$ZodType | null {
  return nodeVariants(registry).find((variant) => variant.type === type)?.schema ?? null;
}

/**
 * Узел, который схема его типа принимает целиком. Незнакомое поле, неверное
 * значение или тип, которого реестр не знает, — не распознан: такой узел
 * правится текстом, а форма его не открывает (ADR-0018).
 */
export function isNodeRecognized(registry: NodeRegistry, node: unknown): boolean {
  const type: unknown = typeof node === 'object' && node !== null ? Reflect.get(node, 'type') : undefined;
  const schema = typeof type === 'string' ? nodeSchemaOf(registry, type) : null;

  return schema !== null && z.safeParse(schema, node).success;
}

/** Build-тег, без которого бинарь не запустит тип; `null` — тип есть в любой сборке. */
export function buildTagOfType(registry: NodeRegistry, type: string): string | null {
  return BUILD_TAG_OF_TYPE[registry]?.[type] ?? null;
}

/**
 * Новый узел секции: только тип и тег. Остальные поля необязательны по схеме,
 * а дописанные дефолты попали бы в диф правкой, которой пользователь не делал.
 */
export function newSectionNode(type: string, tag: string): { type: string; tag: string } {
  return { type, tag };
}

/**
 * Теги узлов всех секций с реестром. Новый узел не повторяет ни один из них:
 * по тегу на узел ссылаются правила, `detour` и DNS, и одинаковое имя в двух
 * секциях делало бы такую ссылку двусмысленной для читающего конфиг.
 */
export function readNodeTags(text: string): string[] {
  return SECTION_REGISTRY.flatMap(({ section }) => readSectionNodes(text, section))
    .map((node): unknown => (typeof node === 'object' && node !== null ? Reflect.get(node, 'tag') : undefined))
    .filter((tag): tag is string => typeof tag === 'string' && tag.length > 0);
}
