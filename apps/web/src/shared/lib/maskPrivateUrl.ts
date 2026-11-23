const MASK = '••••••';

/** Credentials may be in the userinfo, path, query, or fragment. */
export function maskPrivateUrl(value: string): string {
  if (!URL.canParse(value)) return MASK;

  const url = new URL(value);
  const host = `${url.protocol}//${url.host}`;

  if (url.host === '') return MASK;

  return value === host || value === `${host}/` ? value : `${host}/${MASK}`;
}

/** Mask links embedded in command diagnostics while preserving the surrounding message. */
export function maskPrivateUrls(message: string): string {
  return message.replace(/https?:\/\/[^\s"]+/gi, (url) => maskPrivateUrl(url));
}
