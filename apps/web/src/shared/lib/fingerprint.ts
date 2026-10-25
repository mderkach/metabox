const FNV_OFFSET_BASIS = 0x81_1c_9d_c5;
const FNV_PRIME = 0x01_00_01_93;
const HEX_RADIX = 16;
const HEX_DIGITS_IN_UINT32 = 8;

/**
 * FNV-1a over the UTF-16 code units of `text`, as eight hex digits. It tells
 * whether a text changed, nothing more: it is not a hash to compare with the
 * daemon or to resist a forged collision. `crypto.subtle` would give SHA-256,
 * but it exists only in a secure context, and the panel is opened over
 * `http://` at the router address.
 */
export function fingerprint(text: string): string {
  let hash = FNV_OFFSET_BASIS;

  for (let index = 0; index < text.length; index += 1) {
    hash = Math.imul(hash ^ text.charCodeAt(index), FNV_PRIME);
  }

  return (hash >>> 0).toString(HEX_RADIX).padStart(HEX_DIGITS_IN_UINT32, '0');
}
