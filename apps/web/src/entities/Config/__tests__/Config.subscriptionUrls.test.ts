import { describe, expect, it } from 'vitest';

import { maskPrivateUrls } from '@shared/lib/maskPrivateUrl';

import { maskConfigPreviewLines } from '../model/Config.preview';

describe('subscription URL masking', () => {
  it('hides credentials for several values on one JSONC line including an escaped URL', () => {
    const config = String.raw`{
      // imported
      "providers": [{"url":"https:\/\/mock:fake@sub.example/token'private?secret=value","tag":"one"},{"url":"https://sub.example/another","tag":"two"}],
    }`;

    expect(maskConfigPreviewLines(config).get(3)?.trim()).toBe(
      '"providers": [{"url":"https://sub.example/••••••","tag":"one"},{"url":"https://sub.example/••••••","tag":"two"}],'
    );
  });

  it('hides credentials and tokens embedded in core diagnostics', () => {
    expect(maskPrivateUrls('Get "https://fake:fake@sub.example/path?token=mock": timeout')).toBe(
      'Get "https://sub.example/••••••": timeout'
    );
  });
});

it('masks server credentials in the Apply text while leaving the endpoint and group settings visible', () => {
  const config =
    '{"outbounds":[{"server":"edge.example","uuid":"test-id","tls":{"reality":{"short_id":"fake-short-id"}},"transport":{"headers":{"Host":["fake-host-token"]}}},{"outbounds":["edge"]}]}';
  const masked = maskConfigPreviewLines(config).get(1);

  expect(masked).toContain('"server":"edge.example"');
  expect(masked).toContain('"outbounds":["edge"]');
  expect(masked).toContain('"uuid":"••••••"');
  expect(masked).not.toMatch(/test-id|fake-short-id|fake-host-token/);
});
