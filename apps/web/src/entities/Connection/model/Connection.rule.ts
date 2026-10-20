/** A piece of the matched rule text: `key=value` gives a condition, the rest stays as is. */
export interface RuleTextPart {
  key: string | null;
  text: string;
}

const CONDITION = /([a-z_]+)=/g;

const ROUTE_ACTION = /^route\((.+)\)$/;

/** Splits sing-box rule text (`rule_set=github port=443`) at its condition keys. */
export function toRuleTextParts(rule: string): RuleTextPart[] {
  const parts: RuleTextPart[] = [];
  let key: string | null = null;
  let from = 0;

  for (const match of rule.matchAll(CONDITION)) {
    if (match.index > from || key !== null) {
      parts.push({ key, text: rule.slice(from, match.index).trim() });
    }

    key = match[1];
    from = match.index + match[0].length;
  }

  parts.push({ key, text: rule.slice(from).trim() });

  return parts.filter((part) => part.key !== null || part.text.length > 0);
}

/** The outbound of `route(proxy)`, `null` for any other action. */
export function routeOutboundOf(action: string): string | null {
  return ROUTE_ACTION.exec(action)?.[1] ?? null;
}

/** Rule text with named conditions: `nameOf` gives a condition its interface name or `null`. */
export function toRuleText(rule: string, nameOf: (key: string) => string | null): string {
  return toRuleTextParts(rule)
    .map((part) => {
      const name = part.key === null ? null : nameOf(part.key);

      if (part.key === null) {
        return part.text;
      }

      return name === null ? `${part.key}=${part.text}` : `${name}: ${part.text}`;
    })
    .join(', ');
}

/** Action text: `route(x)` through `via`, a named action through `nameOf`, the rest as is. */
export function toActionText(
  action: string,
  via: (outbound: string) => string,
  nameOf: (action: string) => string | null
): string {
  const outbound = routeOutboundOf(action);

  return outbound === null ? (nameOf(action) ?? action) : via(outbound);
}
