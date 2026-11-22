export const WALK_TERMS = ['device', 'service', 'rule', 'outbound', 'group', 'server', 'subscription', 'core'] as const;

export type WalkTerm = (typeof WALK_TERMS)[number];
