import type { DataplaneWire } from '../api/Dataplane.schema';

/**
 * Model of the `listed` mode on the device fixture addresses: device 192.168.1.120
 * goes through sing-box by MAC, written in uppercase as the owner could have entered it,
 * 192.168.1.180 by an address without a prefix.
 */
export const DATAPLANE_FIXTURE: DataplaneWire = {
  model: {
    enabled: true,
    redirect_port: 5331,
    tproxy_port: 5332,
    dns_port: 5333,
    dns_hijack: true,
    self_mark: 100,
    tproxy_mark: 101,
    route_table: 100,
    acl_mode: 'listed',
    source_ip: ['192.168.1.180'],
    source_mac: ['AA:BB:CC:00:01:04'],
    lan_interface: ['br-lan'],
    wan_proxy_cidr: [],
    wan_direct_cidr: [],
    ipv6: false,
  },
  applied: true,
};
