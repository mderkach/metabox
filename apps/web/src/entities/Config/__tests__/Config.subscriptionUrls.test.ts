import { describe, expect, it } from 'vitest';

import { maskPrivateUrls } from '@shared/lib/maskPrivateUrl';

import { maskSubscriptionUrlLines } from '../model/Config.subscriptionUrls';

describe('subscription URL masking', () => {
  it('hides credentials for several values on one JSONC line including an escaped URL', () => {
    const config = String.raw`{
      // imported
      "providers": [{"url":"https:\/\/mock:fake@sub.example/token'private?secret=value","tag":"one"},{"url":"https://sub.example/another","tag":"two"}],
    }`;

    expect(maskSubscriptionUrlLines(config).get(3)?.trim()).toBe(
      '"providers": [{"url":"https://sub.example/••••••","tag":"one"},{"url":"https://sub.example/••••••","tag":"two"}],'
    );
  });

  it('hides credentials and tokens embedded in core diagnostics', () => {
    expect(maskPrivateUrls('Get "https://fake:fake@sub.example/path?token=mock": timeout')).toBe(
      'Get "https://sub.example/••••••": timeout'
    );
  });
});
