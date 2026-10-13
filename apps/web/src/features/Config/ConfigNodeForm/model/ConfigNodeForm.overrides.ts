import type { NodeRegistry } from '@entities/Config';
import { FIELD_KIND } from '@shared/lib/schemaShape';

/** Failure codes of override checks on top of the schema: the `ui` substitutes the text by them. */
export const NODE_OVERRIDE_ERROR = {
  Required: 'required',
  RealityPublicKey: 'realityPublicKey',
  RealityShortId: 'realityShortId',
} as const;

export type NodeOverrideError = (typeof NODE_OVERRIDE_ERROR)[keyof typeof NODE_OVERRIDE_ERROR];

/** Override check failure: dotted field path and code. */
export interface NodeOverrideIssue {
  name: string;
  code: NodeOverrideError;
}

/** Field kind with which an override replaces the schema kind. */
export interface NodeOverrideWidget {
  kind: typeof FIELD_KIND.Enum;
  /** Select values; `''` is the empty item, "no key". */
  options: string[];
}

/**
 * Handwritten type form setup on top of the autoform (ADR-0035): the fields and
 * the write are the same, while the order, the kind of individual fields and
 * requiredness change.
 */
export interface NodeOverride {
  /**
   * Fields at the top of the form, in order; a dotted path. The other type
   * fields go into the collapsed "Advanced" group.
   */
  primary: string[];
  /** Field to the kind it is drawn with instead of the schema kind. */
  widgets?: Readonly<Partial<Record<string, NodeOverrideWidget>>>;
  /** Fields without which a node of the type does not work although the schema does not require them. */
  required?: string[];
  /** New node of the type: what it cannot be built without is already filled in. */
  preset?: (tag: string) => Record<string, unknown>;
  /**
   * Checks the schema does not know, verified against the fork sources.
   * `before` is the node before the edit: a value the user did not touch is not
   * rechecked for format, since its arbiter is `sing-box check` (ADR-0035), and
   * the form does not stop editing a neighboring field of a node saved by
   * another tool.
   */
  refine?: (node: NodeValue, before: NodeValue) => NodeOverrideIssue[];
}

/** Node value as the check sees it: fields as is, empty ones dropped. */
type NodeValue = Readonly<Record<string, unknown>>;

/** Override table key: the registry and the node type. */
export type NodeOverrideKey = `${NodeRegistry}/${string}`;

/**
 * Reality public key: base64url without padding, 32 bytes, 43 characters
 * (`base64.RawURLEncoding` and the length check in
 * `common/tls/reality_client.go` of the fork).
 */
const REALITY_PUBLIC_KEY = /^[\w-]{43}$/;

/** Reality short ID: hex, at most 8 bytes; empty is allowed (`hex.Decode` into `[8]byte`). */
const REALITY_SHORT_ID = /^(?:[\da-f]{2}){0,8}$/i;

/** uTLS fingerprints known to the fork (`uTLSClientHelloID` in `common/tls/utls_client.go`). */
const UTLS_FINGERPRINTS = [
  'chrome',
  'chrome_psk',
  'chrome_psk_shuffle',
  'chrome_padding_psk_shuffle',
  'chrome_pq',
  'chrome_pq_psk',
  'firefox',
  'edge',
  'safari',
  '360',
  'qq',
  'ios',
  'android',
  'random',
  'randomized',
];

/** Node field value by a dotted path; `undefined` means no field. */
export function readField(node: NodeValue, name: string): unknown {
  let value: unknown = node;

  for (const key of name.split('.')) {
    value = typeof value === 'object' && value !== null ? Reflect.get(value, key) : undefined;
  }

  return value;
}

/** Empty field: its value is "no key" (`compactNode`). */
function isEmpty(value: unknown): boolean {
  return value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0);
}

function requireFields(node: NodeValue, names: readonly string[]): NodeOverrideIssue[] {
  return names
    .filter((name) => isEmpty(readField(node, name)))
    .map((name) => ({ name, code: NODE_OVERRIDE_ERROR.Required }));
}

/** Field string does not match the pattern; a value equal to the previous one is not rechecked. */
function checkPattern(
  node: NodeValue,
  before: NodeValue,
  name: string,
  pattern: RegExp,
  code: NodeOverrideError
): NodeOverrideIssue[] {
  const value = readField(node, name);

  return typeof value === 'string' && value !== readField(before, name) && !pattern.test(value) ? [{ name, code }] : [];
}

/**
 * VLESS with Reality is the AC-6 scenario. Without the field order the form
 * would open with twenty dial fields; Reality keys are checked the same way the
 * fork client parses them, otherwise the error would surface only on `sing-box
 * check`.
 */
const VLESS_OVERRIDE: NodeOverride = {
  primary: [
    'tag',
    'server',
    'server_port',
    'uuid',
    'flow',
    'tls.server_name',
    'tls.utls.fingerprint',
    'tls.reality.public_key',
    'tls.reality.short_id',
  ],
  widgets: {
    // The fork enables Vision by the `xtls-rprx-vision` prefix (`protocol/vless/outbound.go`).
    flow: { kind: FIELD_KIND.Enum, options: ['', 'xtls-rprx-vision'] },
    'tls.utls.fingerprint': { kind: FIELD_KIND.Enum, options: UTLS_FINGERPRINTS },
  },
  // Without a server, port and UUID the node cannot be built. Server name and
  // the Reality key are needed only for Reality: VLESS with ordinary TLS opens
  // with the same form.
  required: ['server', 'server_port', 'uuid'],
  // Reality without uTLS is not created by the fork client: `uTLS is required by reality client`.
  preset: (tag) => ({
    type: 'vless',
    tag,
    tls: { enabled: true, utls: { enabled: true, fingerprint: 'chrome' }, reality: { enabled: true } },
  }),
  refine: (node, before) => [
    ...(readField(node, 'tls.reality.enabled') === true
      ? requireFields(node, ['tls.server_name', 'tls.reality.public_key'])
      : []),
    ...checkPattern(node, before, 'tls.reality.public_key', REALITY_PUBLIC_KEY, NODE_OVERRIDE_ERROR.RealityPublicKey),
    ...checkPattern(node, before, 'tls.reality.short_id', REALITY_SHORT_ID, NODE_OVERRIDE_ERROR.RealityShortId),
  ],
};

/** Length of the `api` service secret in bytes: 24 bytes is 32 base64url characters. */
const API_SECRET_BYTES = 24;

/**
 * Random secret: base64url without padding from a cryptographic generator. An
 * empty `secret` would leave the fork gRPC service open to anyone who reaches
 * the port.
 */
function randomSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(API_SECRET_BYTES));

  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
}

/**
 * The `api` service is the fork gRPC service, the only service with a form
 * (PRD, section 8; ADR-0006). It listens on loopback: the daemon does not open
 * it outward and itself goes to it from the same machine. The port is not
 * substituted: 9090 is taken by the Clash API by default (the daemon
 * `-clash-port` flag), and the form does not know a free port on the device, so
 * it is required. `dashboard` stays in "Advanced" as JSON text.
 */
const API_OVERRIDE: NodeOverride = {
  primary: ['tag', 'listen', 'listen_port', 'secret', 'access_control_allow_origin', 'tls'],
  required: ['listen_port'],
  preset: (tag) => ({ type: 'api', tag, listen: '127.0.0.1', secret: randomSecret() }),
};

/**
 * Form overrides by type. A type without an entry opens with the autoform if
 * the registry policy allows it; an entry is added here, not as a branch in the
 * renderer.
 */
export const NODE_OVERRIDE: Readonly<Partial<Record<NodeOverrideKey, NodeOverride>>> = {
  'outbound/vless': VLESS_OVERRIDE,
  'service/api': API_OVERRIDE,
};

/** How a secret field hides its value: entirely or everything after the URL host. */
export const SECRET_MASK = {
  Whole: 'whole',
  AfterHost: 'afterHost',
} as const;

export type SecretMask = (typeof SECRET_MASK)[keyof typeof SECRET_MASK];

/**
 * Secret fields by key name, in a node of any type and at any depth: the form
 * shows them masked and reveals them on a button. For a URL the scheme and host
 * are visible, they show whose subscription it is, while the token lies in the
 * path or in the query. `uuid` is not hidden: it is a user identifier, not a
 * password.
 */
const SECRET_FIELD: Readonly<Partial<Record<string, SecretMask>>> = {
  secret: SECRET_MASK.Whole,
  password: SECRET_MASK.Whole,
  private_key: SECRET_MASK.Whole,
  pre_shared_key: SECRET_MASK.Whole,
  psk: SECRET_MASK.Whole,
  token: SECRET_MASK.Whole,
  auth_str: SECRET_MASK.Whole,
  access_key_secret: SECRET_MASK.Whole,
  url: SECRET_MASK.AfterHost,
  download_url: SECRET_MASK.AfterHost,
};

/** Field mask by the last key of its path; `null` means the field is not a secret. */
export function secretMaskOf(path: readonly string[]): SecretMask | null {
  const key = path.at(-1);

  return key === undefined ? null : (SECRET_FIELD[key] ?? null);
}

/** Type override; `null` means the type opens with the autoform as is. */
export function nodeOverrideOf(registry: NodeRegistry, type: string): NodeOverride | null {
  return NODE_OVERRIDE[`${registry}/${type}`] ?? null;
}

/** Whether a type has a handwritten override: registries without an autoform open the form by it. */
export function hasNodeOverride(registry: NodeRegistry, type: string): boolean {
  return nodeOverrideOf(registry, type) !== null;
}

/**
 * New node of a type: the override template, and without it `fallback`, a node
 * of the type and tag. The template fills in only what the type cannot be built
 * without.
 */
export function nodePreset(
  registry: NodeRegistry,
  type: string,
  tag: string,
  fallback: (type: string, tag: string) => object
): object {
  return nodeOverrideOf(registry, type)?.preset?.(tag) ?? fallback(type, tag);
}

/**
 * Override check failures on a node value: required fields and `refine`. `node`
 * is what will go into the document, with empty fields dropped; `before` is the
 * node before the edit.
 */
export function overrideIssues(override: NodeOverride | null, node: NodeValue, before: NodeValue): NodeOverrideIssue[] {
  if (override === null) {
    return [];
  }

  return [...requireFields(node, override.required ?? []), ...(override.refine?.(node, before) ?? [])];
}
