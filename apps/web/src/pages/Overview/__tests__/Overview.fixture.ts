export const OVERVIEW_ACTIVE_SERVER = 'sub-us/us-reality';

export const OVERVIEW_ROUTED_CONFIG = `{
  "outbounds": [
    { "type": "direct", "tag": "direct" },
    { "type": "selector", "tag": "us-fallback", "outbounds": ["us", "proxy"] },
    { "type": "urltest", "tag": "us", "outbounds": ["sub-us/us-reality"] },
    { "type": "urltest", "tag": "proxy", "outbounds": ["sub-eu/eu-reality"] }
  ],
  "route": {
    "rules": [
      // Work sites
      { "domain": ["work.example"], "outbound": "us-fallback" },
      { "domain": ["docs.example"], "outbound": "us-fallback" },
      { "domain": ["mail.example"], "outbound": "us-fallback" },
      { "domain": ["hidden.example"], "outbound": "us-fallback" },
      { "domain": ["video.example"], "outbound": "proxy" },
      { "domain": ["lan.example"], "outbound": "direct" }
    ],
    "final": "direct"
  }
}`;
