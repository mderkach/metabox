import type { NodeRegistry } from '@entities/Config';

import { isSameValue, isUnset, listToText } from './ConfigNodeForm.model';
import { SECRET_MASK, secretMaskOf, type SecretMask } from './ConfigNodeForm.overrides';

/** Indent of a sub-node JSON: the same as the config file's. */
const JSON_INDENT = 2;

export function isUrlMask(mask: SecretMask): boolean {
  return mask !== SECRET_MASK.Whole;
}

/** Characters in place of a hidden secret or of the part of a URL after the host. */
const MASK = '••••••';

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

/**
 * Value of a secret field with every non-empty string inside masked: sing-box
 * accepts a key as a list of PEM lines and a header as a list of values.
 */
function maskValue(value: unknown, mask: SecretMask): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => maskValue(item, mask));
  }

  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, maskValue(item, mask)]));
  }

  if (typeof value !== 'string' || value === '') {
    return value;
  }

  return mask === SECRET_MASK.Whole ? MASK : (maskUrl(value, mask) ?? value);
}

/**
 * JSON value with secret keys masked at any depth, by the same names and rule
 * as `ConfigNodeFormSecretField`.
 */
function maskSecrets(value: unknown, registry: NodeRegistry | null): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => maskSecrets(item, registry));
  }

  if (typeof value !== 'object' || value === null) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => {
      const mask = secretMaskOf([key], registry);

      return [key, mask === null ? maskSecrets(item, registry) : maskValue(item, mask)];
    })
  );
}

/**
 * Field JSON text with secrets masked; `null` means there is nothing to hide.
 * `mask` is the mask of the field itself: then everything inside it is hidden.
 */
export function maskedJsonText(value: unknown, mask: SecretMask | null, registry: NodeRegistry | null): string | null {
  const masked = mask === null ? maskSecrets(value, registry) : maskValue(value, mask);

  return isSameValue(masked, value) ? null : toJsonText(masked);
}

/** List field text with every item masked; `null` means there is nothing to hide. */
export function maskedListText(value: unknown, mask: SecretMask): string | null {
  const masked = maskValue(value, mask);

  return isSameValue(masked, value) ? null : listToText(masked);
}

export function toJsonText(value: unknown): string {
  return isUnset(value) ? '' : JSON.stringify(value, null, JSON_INDENT);
}
