/**
 * How a secret field hides its value: entirely, everything after the URL host, or the
 * same only for a URL that carries userinfo or a query string.
 */
export const SECRET_MASK = {
  Whole: 'whole',
  AfterHost: 'afterHost',
  UrlCredentials: 'urlCredentials',
} as const;

export type SecretMask = (typeof SECRET_MASK)[keyof typeof SECRET_MASK];

/** Characters in place of a hidden secret or of the part of a URL after the host. */
export const MASK = '••••••';

/**
 * URL with everything after the host masked: credentials, path, query, anchor.
 * `null` means there is nothing to hide, the URL is just a host.
 */
export function maskUrl(text: string, mask: SecretMask): string | null {
  if (!URL.canParse(text)) {
    return MASK;
  }

  const url = new URL(text);
  const credentials = `${url.username}${url.password}${url.search}`;
  const tail =
    mask === SECRET_MASK.UrlCredentials
      ? credentials
      : `${url.username}${url.password}${url.pathname === '/' ? '' : url.pathname}${url.search}${url.hash}`;

  return tail === '' ? null : `${url.protocol}//${url.host}/${MASK}`;
}
