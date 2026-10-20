import type { ParseKeys } from 'i18next';
import { useTranslation } from 'react-i18next';

const NS = 'features/Config/ConfigNodeForm';

/**
 * Human labels of frequent fields by the dotted path from the node root. A
 * field without an entry is labelled with its key; `url` has none, since the
 * rule set form labels the same widget on its own.
 */
const FIELD_LABEL_KEY: Readonly<Record<string, ParseKeys<typeof NS> | undefined>> = {
  tag: 'label.tag',
  server: 'label.server',
  server_port: 'label.serverPort',
  uuid: 'label.uuid',
  password: 'label.password',
  flow: 'label.flow',
  method: 'label.method',
  security: 'label.security',
  network: 'label.network',
  detour: 'label.detour',
  connect_timeout: 'label.connectTimeout',
  tls: 'label.tls',
  'tls.server_name': 'label.serverName',
  'tls.insecure': 'label.insecure',
  'tls.alpn': 'label.alpn',
  'tls.utls': 'label.utls',
  'tls.utls.fingerprint': 'label.fingerprint',
  'tls.reality': 'label.reality',
  'tls.reality.public_key': 'label.realityPublicKey',
  'tls.reality.short_id': 'label.realityShortId',
  transport: 'label.transport',
  multiplex: 'label.multiplex',
  obfs: 'label.obfs',
  up_mbps: 'label.upMbps',
  down_mbps: 'label.downMbps',
  plugin: 'label.plugin',
  plugin_opts: 'label.pluginOpts',
  outbounds: 'label.outbounds',
  default: 'label.default',
  interval: 'label.interval',
  listen: 'label.listen',
  listen_port: 'label.listenPort',
  secret: 'label.secret',
};

/** Human label of a field by its dotted path; `null` means the field is labelled with its key. */
export function useFieldLabel(name: string): string | null {
  const { t } = useTranslation(NS);
  const key = FIELD_LABEL_KEY[name];

  return key === undefined ? null : t(key);
}
