import type { TaggedResponse } from '@shared/api';

import type { DataplaneChangeWire, DataplaneModelWire, DataplaneWire } from '../api/Dataplane.schema';
import type { Dataplane, DataplaneModel } from './Dataplane.model';

function toModel(wire: DataplaneModelWire): DataplaneModel {
  return {
    enabled: wire.enabled,
    redirectPort: wire.redirect_port,
    tproxyPort: wire.tproxy_port,
    dnsPort: wire.dns_port,
    dnsHijack: wire.dns_hijack,
    selfMark: wire.self_mark,
    tproxyMark: wire.tproxy_mark,
    routeTable: wire.route_table,
    aclMode: wire.acl_mode,
    sourceIp: wire.source_ip,
    sourceMac: wire.source_mac,
    lanInterface: wire.lan_interface,
    wanProxyCidr: wire.wan_proxy_cidr,
    wanDirectCidr: wire.wan_direct_cidr,
    ipv6: wire.ipv6,
  };
}

export function toDataplane({ body, etag }: TaggedResponse<DataplaneWire>): Dataplane {
  return { model: toModel(body.model), etag, foreignService: body.foreign_service === true };
}

/**
 * Тело `PUT /api/dataplane`. Тип ответа демона заставляет перечислить каждое
 * поле: новое поле контракта без строки здесь — ошибка компиляции, а не ноль,
 * молча записанный в UCI.
 */
export function toDataplaneChange(model: DataplaneModel): DataplaneChangeWire {
  return {
    model: {
      enabled: model.enabled,
      redirect_port: model.redirectPort,
      tproxy_port: model.tproxyPort,
      dns_port: model.dnsPort,
      dns_hijack: model.dnsHijack,
      self_mark: model.selfMark,
      tproxy_mark: model.tproxyMark,
      route_table: model.routeTable,
      acl_mode: model.aclMode,
      source_ip: [...model.sourceIp],
      source_mac: [...model.sourceMac],
      lan_interface: [...model.lanInterface],
      wan_proxy_cidr: [...model.wanProxyCidr],
      wan_direct_cidr: [...model.wanDirectCidr],
      ipv6: model.ipv6,
    },
  };
}
