import { compactNode } from '@entities/Config';

/** Failure codes of share link parsing: the `ui` substitutes the text by them. */
export const NODE_LINK_ERROR = {
  Scheme: 'scheme',
  Malformed: 'malformed',
  Server: 'server',
  Credential: 'credential',
  Transport: 'transport',
} as const;

export type NodeLinkError = (typeof NODE_LINK_ERROR)[keyof typeof NODE_LINK_ERROR];

/** Outbound node read from a share link. */
export interface ShareLink {
  type: string;
  /** Node name the link carries (the fragment, `ps` in VMess); `''` means none. */
  name: string;
  server: string;
  /** Node fields other than `type` and `tag`, empty ones dropped. */
  fields: Record<string, unknown>;
}

export type ShareLinkResult = { link: ShareLink; error: null } | { link: null; error: NodeLinkError };

/** Address part of a URL-shaped link: `userinfo@host:port?query#name`. */
interface LinkParts {
  /** Percent-decoded; `null` means the link has no `@`. */
  userinfo: string | null;
  host: string;
  /** Port as written; `''` means none. */
  port: string;
  params: URLSearchParams;
  name: string;
}

const LINK_PATTERN = /^([\d+.a-z-]+):\/\/(.*)$/is;
const BODY_PATTERN = /^([^#?]*)(?:\?([^#]*))?(?:#(.*))?$/s;
const PORT_PATTERN = /^\d{1,5}$/;
const MAX_PORT = 65_535;
const HYSTERIA2_DEFAULT_PORT = 443;
const MBPS_PATTERN = /^\d+$/;
/** Base64 encodes in groups of four characters: a shorter tail is padded with `=`. */
const BASE64_GROUP = 4;
/** The first taken tag gets `-2`: the original counts as the first. */
const FIRST_COPY_NUMBER = 2;

/** Reality is not built by the fork client without uTLS: the same fingerprint as in the VLESS template. */
const REALITY_FINGERPRINT = 'chrome';

/** Header the fork sends WebSocket early data in when the path carries `?ed=` (`parser/link/utils.go`). */
const EARLY_DATA_HEADER = 'Sec-WebSocket-Protocol';
const EARLY_DATA_PATTERN = /^(.*?)\?ed=(\d+)$/;

const SECURITY = { Tls: 'tls', Reality: 'reality' } as const;

function fail(error: NodeLinkError): ShareLinkResult {
  return { link: null, error };
}

function decode(text: string): string | null {
  try {
    return decodeURIComponent(text);
  } catch {
    return null;
  }
}

/** Standard or URL-safe base64, with or without padding, as UTF-8 text; `null` means not base64. */
function decodeBase64(text: string): string | null {
  const normalized = text.replaceAll(/\s/g, '').replaceAll('-', '+').replaceAll('_', '/');

  try {
    const binary = atob(normalized.padEnd(Math.ceil(normalized.length / BASE64_GROUP) * BASE64_GROUP, '='));

    return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
  } catch {
    return null;
  }
}

function splitHostPort(authority: string): { host: string; port: string } | null {
  if (authority.startsWith('[')) {
    const end = authority.indexOf(']');
    const rest = authority.slice(end + 1);

    return end === -1 || (rest !== '' && !rest.startsWith(':'))
      ? null
      : { host: authority.slice(1, end), port: rest.slice(1) };
  }

  const colon = authority.lastIndexOf(':');

  if (colon === -1) {
    return { host: authority, port: '' };
  }

  const host = authority.slice(0, colon);

  return host.includes(':') ? null : { host, port: authority.slice(colon + 1) };
}

function splitLink(body: string): LinkParts | null {
  const match = BODY_PATTERN.exec(body);

  if (match === null) {
    return null;
  }

  const [, address = '', query = '', fragment = ''] = match;
  const at = address.lastIndexOf('@');
  const userinfo = at === -1 ? null : decode(address.slice(0, at));
  // The path is not part of any supported scheme: `vless://id@host:443/?type=ws` is the same link.
  const hostPort = splitHostPort(address.slice(at + 1).split('/', 1)[0] ?? '');

  if ((at !== -1 && userinfo === null) || hostPort === null) {
    return null;
  }

  return { userinfo, ...hostPort, params: new URLSearchParams(query), name: decode(fragment) ?? fragment };
}

function parsePort(port: string): number | null {
  const value = Number(port);

  return PORT_PATTERN.test(port) && value > 0 && value <= MAX_PORT ? value : null;
}

function isTrue(value: string | null): boolean {
  return value === '1' || value === 'true';
}

/** Comma list as the fork schema takes it: one value is written as a string, not as an array of one. */
function toListable(value: string | null): string | string[] | undefined {
  const items = (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item !== '');

  return items.length > 1 ? items : items[0];
}

function toLink(type: string, name: string, server: string, fields: Record<string, unknown>): ShareLinkResult {
  const compact = compactNode(fields);

  return {
    link: {
      type,
      name: name.trim(),
      server,
      fields: typeof compact === 'object' && compact !== null ? Object.fromEntries(Object.entries(compact)) : {},
    },
    error: null,
  };
}

/** TLS block by the `security` parameter; `undefined` means the link goes without TLS. */
function toTls(security: string, host: string, params: URLSearchParams): Record<string, unknown> | undefined {
  if (security !== SECURITY.Tls && security !== SECURITY.Reality) {
    return undefined;
  }

  const reality = security === SECURITY.Reality;
  const fp = params.get('fp') ?? '';
  const fingerprint = fp === '' && reality ? REALITY_FINGERPRINT : fp;

  return {
    enabled: true,
    server_name: params.get('sni') ?? params.get('peer') ?? host,
    insecure: isTrue(params.get('allowInsecure') ?? params.get('insecure')) || undefined,
    alpn: toListable(params.get('alpn')),
    utls: fingerprint === '' ? undefined : { enabled: true, fingerprint },
    reality: reality ? { enabled: true, public_key: params.get('pbk'), short_id: params.get('sid') } : undefined,
  };
}

function toWebSocket(params: URLSearchParams): Record<string, unknown> {
  const path = params.get('path') ?? '';
  const host = params.get('host');
  const early = EARLY_DATA_PATTERN.exec(path);

  return {
    type: 'ws',
    path: early === null ? path : early[1],
    headers: host === null || host === '' ? undefined : { Host: host },
    max_early_data: early === null ? undefined : Number(early[2]),
    early_data_header_name: early === null ? undefined : EARLY_DATA_HEADER,
  };
}

function toHttp(params: URLSearchParams): Record<string, unknown> {
  return { type: 'http', host: toListable(params.get('host')), path: params.get('path') };
}

/**
 * Transport by the link `type` (`net` in VMess). `undefined` means plain TCP,
 * `null` means a transport the fork does not have.
 */
function toTransport(kind: string, params: URLSearchParams): Record<string, unknown> | undefined | null {
  switch (kind) {
    case '':
    case 'tcp':
    case 'raw':
    case 'none':
      return params.get('headerType') === 'http' ? toHttp(params) : undefined;
    case 'ws':
      return toWebSocket(params);
    case 'http':
    case 'h2':
      return toHttp(params);
    case 'grpc':
      return { type: 'grpc', service_name: params.get('serviceName') ?? params.get('grpc-service-name') };
    case 'httpupgrade':
      return { type: 'httpupgrade', host: params.get('host'), path: params.get('path') };
    case 'xhttp':
    case 'splithttp':
      return { type: 'xhttp', host: params.get('host'), path: params.get('path'), mode: params.get('mode') };
    case 'quic':
      return { type: 'quic' };
    default:
      return null;
  }
}

/**
 * URL link in the Xray format: the credential in userinfo, TLS and transport in
 * parameters. VLESS and Trojan differ only in the node fields built from it.
 */
function parseXrayLink(
  body: string,
  type: string,
  toFields: (credential: string, host: string, params: URLSearchParams) => Record<string, unknown>
): ShareLinkResult {
  const parts = splitLink(body);

  if (parts === null) {
    return fail(NODE_LINK_ERROR.Malformed);
  }

  const { userinfo, host, port, params, name } = parts;
  const serverPort = parsePort(port);
  const transport = toTransport(params.get('type') ?? '', params);

  if (host === '' || serverPort === null) {
    return fail(NODE_LINK_ERROR.Server);
  }

  if (userinfo === null || userinfo === '') {
    return fail(NODE_LINK_ERROR.Credential);
  }

  if (transport === null) {
    return fail(NODE_LINK_ERROR.Transport);
  }

  return toLink(type, name, host, {
    server: host,
    server_port: serverPort,
    ...toFields(userinfo, host, params),
    transport,
  });
}

function parseVless(body: string): ShareLinkResult {
  return parseXrayLink(body, 'vless', (uuid, host, params) => ({
    uuid,
    flow: params.get('flow'),
    packet_encoding: params.get('packetEncoding'),
    tls: toTls(params.get('security') ?? '', host, params),
  }));
}

/** Trojan does not work without TLS: it is on even when the link does not say so. */
function parseTrojan(body: string): ShareLinkResult {
  return parseXrayLink(body, 'trojan', (password, host, params) => ({
    password,
    tls: toTls(params.get('security') === SECURITY.Reality ? SECURITY.Reality : SECURITY.Tls, host, params),
  }));
}

/** VMess link fields (the v2rayN format): a JSON object in base64. */
interface VmessLink {
  ps?: unknown;
  add?: unknown;
  port?: unknown;
  id?: unknown;
  aid?: unknown;
  scy?: unknown;
  net?: unknown;
  type?: unknown;
  host?: unknown;
  path?: unknown;
  tls?: unknown;
  sni?: unknown;
  alpn?: unknown;
  fp?: unknown;
}

function readVmess(body: string): VmessLink | null {
  const text = decodeBase64(body.split('#', 1)[0] ?? '');

  if (text === null) {
    return null;
  }

  try {
    const value: unknown = JSON.parse(text);

    return typeof value === 'object' && value !== null && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

/** JSON field as text: v2rayN writes `port` and `aid` both as a string and as a number. */
function textOf(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
}

function parseVmess(body: string): ShareLinkResult {
  const vmess = readVmess(body);

  if (vmess === null) {
    return fail(NODE_LINK_ERROR.Malformed);
  }

  const host = textOf(vmess.add);
  const serverPort = parsePort(textOf(vmess.port));
  const uuid = textOf(vmess.id);
  const alterId = Number(textOf(vmess.aid));
  const security = textOf(vmess.scy);
  // Parameter names of the URL links, so that TLS and transport are read by the same code.
  const params = new URLSearchParams(
    Object.entries({
      host: textOf(vmess.host),
      path: textOf(vmess.path),
      serviceName: textOf(vmess.path),
      headerType: textOf(vmess.type),
      sni: textOf(vmess.sni),
      alpn: textOf(vmess.alpn),
      fp: textOf(vmess.fp),
    }).filter(([, value]) => value !== '')
  );
  const transport = toTransport(textOf(vmess.net), params);

  if (host === '' || serverPort === null) {
    return fail(NODE_LINK_ERROR.Server);
  }

  if (uuid === '') {
    return fail(NODE_LINK_ERROR.Credential);
  }

  if (transport === null) {
    return fail(NODE_LINK_ERROR.Transport);
  }

  return toLink('vmess', textOf(vmess.ps), host, {
    server: host,
    server_port: serverPort,
    uuid,
    security: security === '' || security === 'auto' ? undefined : security,
    alter_id: Number.isInteger(alterId) && alterId > 0 ? alterId : undefined,
    tls: toTls(textOf(vmess.tls), host, params),
    transport,
  });
}

/** `method:password`: plain (SIP002 for 2022 ciphers) or in base64. */
function readShadowsocksUser(userinfo: string): { method: string; password: string } | null {
  const plain = userinfo.includes(':') ? userinfo : decodeBase64(userinfo);
  const colon = plain?.indexOf(':') ?? -1;

  return plain === null || colon <= 0 || colon === plain.length - 1
    ? null
    : { method: plain.slice(0, colon), password: plain.slice(colon + 1) };
}

/**
 * Shadowsocks: SIP002 `ss://userinfo@host:port?plugin=…#name`, and the legacy
 * form where everything before the name is base64 of `method:password@host:port`.
 */
function parseShadowsocks(body: string): ShareLinkResult {
  const address = /^[^#?]*/.exec(body)?.[0] ?? '';
  const legacy = address.includes('@') ? null : decodeBase64(address);
  const parts = splitLink(legacy === null ? body : `${legacy}${body.slice(address.length)}`);

  if (parts === null) {
    return fail(NODE_LINK_ERROR.Malformed);
  }

  const { userinfo, host, port, params, name } = parts;
  const serverPort = parsePort(port);
  const user = userinfo === null ? null : readShadowsocksUser(userinfo);
  const [plugin = '', ...pluginOptions] = (params.get('plugin') ?? '').split(';');

  if (host === '' || serverPort === null) {
    return fail(NODE_LINK_ERROR.Server);
  }

  if (user === null) {
    return fail(NODE_LINK_ERROR.Credential);
  }

  return toLink('shadowsocks', name, host, {
    server: host,
    server_port: serverPort,
    method: user.method,
    password: user.password,
    plugin,
    plugin_opts: pluginOptions.join(';'),
  });
}

function parseMbps(value: string | null): number | undefined {
  return value !== null && MBPS_PATTERN.test(value) ? Number(value) : undefined;
}

/**
 * Hysteria 2: the password in userinfo, TLS always on, port 443 by default.
 * A port-hopping range in place of the port is not read: it is a different
 * field of the node.
 */
function parseHysteria2(body: string): ShareLinkResult {
  const parts = splitLink(body);

  if (parts === null) {
    return fail(NODE_LINK_ERROR.Malformed);
  }

  const { userinfo, host, port, params, name } = parts;
  const serverPort = port === '' ? HYSTERIA2_DEFAULT_PORT : parsePort(port);
  const obfs = params.get('obfs');

  if (host === '' || serverPort === null) {
    return fail(NODE_LINK_ERROR.Server);
  }

  return toLink('hysteria2', name, host, {
    server: host,
    server_port: serverPort,
    password: userinfo,
    up_mbps: parseMbps(params.get('up')),
    down_mbps: parseMbps(params.get('down')),
    obfs: obfs === null || obfs === '' ? undefined : { type: obfs, password: params.get('obfs-password') },
    tls: toTls(SECURITY.Tls, host, params),
  });
}

/** Link parser by scheme: a new scheme is added by an entry. */
const LINK_PARSER: ReadonlyMap<string, (body: string) => ShareLinkResult> = new Map([
  ['vless', parseVless],
  ['vmess', parseVmess],
  ['trojan', parseTrojan],
  ['ss', parseShadowsocks],
  ['hysteria2', parseHysteria2],
  ['hy2', parseHysteria2],
]);

/** Share link of a proxy provider into an outbound node; spaces around the link are ignored. */
export function parseShareLink(text: string): ShareLinkResult {
  const match = LINK_PATTERN.exec(text.trim());

  if (match === null) {
    return fail(NODE_LINK_ERROR.Scheme);
  }

  const parser = LINK_PARSER.get(match[1].toLowerCase());

  return parser === undefined ? fail(NODE_LINK_ERROR.Scheme) : parser(match[2]);
}

/**
 * Tag of the node from a link: the link name, without it type and server; a
 * taken one gets a number, since a tag is the reference by which rules point
 * to a node.
 */
export function shareLinkTag(link: ShareLink, takenTags: readonly string[]): string {
  const base = link.name === '' ? `${link.type}-${link.server}` : link.name;
  const taken = new Set(takenTags);
  let tag = base;

  for (let index = FIRST_COPY_NUMBER; taken.has(tag); index += 1) {
    tag = `${base}-${String(index)}`;
  }

  return tag;
}

/** Node to insert into `outbounds`: `type` and `tag` first, as in a node added by type. */
export function shareLinkNode(link: ShareLink, tag: string): Record<string, unknown> {
  return { type: link.type, tag, ...link.fields };
}
