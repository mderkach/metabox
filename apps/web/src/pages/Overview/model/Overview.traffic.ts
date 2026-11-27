import type { TrafficShare } from '@entities/Daemon';

const PERCENT = 100;

export function toTrafficShares({ link, split }: TrafficShare) {
  const proxy = split.proxy;
  // The split and outbound rows use the same accounting snapshot. Blocked traffic never reaches WAN.
  const bypass = Math.max(0, link - proxy - split.direct);
  const direct = split.direct + bypass;
  const total = proxy + direct;
  const proxyRatio = total === 0 ? 0 : proxy / total;
  const proxyPercent = Math.round(proxyRatio * PERCENT);

  return {
    proxy,
    direct,
    bypass,
    total,
    proxyRatio,
    proxyPercent,
    directPercent: total === 0 ? 0 : PERCENT - proxyPercent,
  };
}
