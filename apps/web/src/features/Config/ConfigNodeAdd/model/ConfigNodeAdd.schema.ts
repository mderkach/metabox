import { z } from 'zod';

import { parseShareLink } from './ConfigNodeAdd.link';
import { parseServerImport, SERVER_ERROR, SERVER_GROUP } from './ConfigNodeAdd.server';
import {
  MAX_INTERVAL,
  SUBSCRIPTION_AGENT_PROFILES,
  SUBSCRIPTION_ERROR,
  SUBSCRIPTION_GROUP,
  SUBSCRIPTION_INTERVALS,
  SUBSCRIPTION_INTERVAL_UNITS,
  subscriptionUrl,
} from './ConfigNodeAdd.subscription';

/** Failure codes of the node add form: the `ui` substitutes the text by them. */
export const NODE_ADD_ERROR = {
  TypeRequired: 'typeRequired',
  TagRequired: 'tagRequired',
  TagTaken: 'tagTaken',
  LinkRequired: 'linkRequired',
} as const;

/** What the add form asks: the other fields are edited by the node form. */
export const NodeAddSchema = z.object({
  /** Node type from the section registry */
  type: z.string(),
  /** Node name: rules and other nodes refer to the node by it */
  tag: z.string(),
});

export type NodeAddModel = z.infer<typeof NodeAddSchema>;

/** The form opens without a type: choosing the type is the first conscious step, not a default value. */
export const NODE_ADD_DEFAULTS: NodeAddModel = { type: '', tag: '' };

/**
 * Schema with a check that depends on the document: taken tags come from
 * outside. A tag is the reference by which rules and `detour` point to a node,
 * and a second node with the same name would make it ambiguous.
 */
export function makeNodeAddSchema(takenTags: readonly string[]) {
  const taken = new Set(takenTags);

  return NodeAddSchema.superRefine((data, ctx) => {
    if (data.type === '') {
      ctx.addIssue({ code: 'custom', path: ['type'], message: NODE_ADD_ERROR.TypeRequired });
    }

    const tag = data.tag.trim();

    if (tag === '') {
      ctx.addIssue({ code: 'custom', path: ['tag'], message: NODE_ADD_ERROR.TagRequired });
    } else if (taken.has(tag)) {
      ctx.addIssue({ code: 'custom', path: ['tag'], message: NODE_ADD_ERROR.TagTaken });
    }
  });
}

/** Node from a share link: the link alone, the tag is taken from it. */
export const NodeLinkSchema = z.object({
  /** Share link of a proxy provider: `vless://`, `vmess://`, `trojan://`, `ss://`, `hysteria2://` */
  link: z.string(),
});

export type NodeLinkModel = z.infer<typeof NodeLinkSchema>;

export const NODE_LINK_DEFAULTS: NodeLinkModel = { link: '' };

/** A link that does not parse fails with the parser code (`NODE_LINK_ERROR`). */
function refineNodeLink(data: NodeLinkModel, ctx: z.RefinementCtx, allowSubscriptions = false) {
  if (data.link.trim() === '') {
    ctx.addIssue({ code: 'custom', path: ['link'], message: NODE_ADD_ERROR.LinkRequired });

    return;
  }

  const { error } = allowSubscriptions ? parseServerImport(data.link) : parseShareLink(data.link);
  const message =
    allowSubscriptions && error !== SERVER_ERROR.MultipleLinks && /^https:/i.test(data.link.trim())
      ? SUBSCRIPTION_ERROR.InvalidLink
      : error;

  if (message !== null) {
    ctx.addIssue({ code: 'custom', path: ['link'], message });
  }
}

export const NodeLinkFormSchema = NodeLinkSchema.superRefine((data, ctx) => {
  refineNodeLink(data, ctx);
});

const ConnectionLinkSchema = NodeLinkSchema.extend({
  tag: z.string(),
  serverTag: z.string().nullable(),
  serverGroup: z.string(),
  serverGroupName: z.string(),
  serverSeparate: z.boolean(),
  group: z.string(),
  groupName: z.string(),
  interval: z.enum(SUBSCRIPTION_INTERVALS),
  intervalValue: z.string(),
  intervalUnit: z.enum(SUBSCRIPTION_INTERVAL_UNITS),
  agent: z.enum(SUBSCRIPTION_AGENT_PROFILES),
  agentValue: z.string(),
});

export type ConnectionLinkModel = z.infer<typeof ConnectionLinkSchema>;

export const CONNECTION_LINK_DEFAULTS: ConnectionLinkModel = {
  ...NODE_LINK_DEFAULTS,
  tag: '',
  serverTag: null,
  serverGroup: SERVER_GROUP.None,
  serverGroupName: '',
  serverSeparate: false,
  group: SUBSCRIPTION_GROUP.None,
  groupName: '',
  interval: '5m',
  intervalValue: '',
  intervalUnit: 'm',
  agent: 'defaultAgent',
  agentValue: '',
};

export function makeConnectionLinkSchema(allowSubscriptions: boolean, reservedTags: ReadonlySet<string>) {
  return ConnectionLinkSchema.superRefine((data, ctx) => {
    if (!allowSubscriptions || subscriptionUrl(data.link) === null) {
      refineNodeLink(data, ctx, allowSubscriptions);
      return;
    }

    if (data.tag.trim() === '') {
      ctx.addIssue({ code: 'custom', path: ['tag'], message: SUBSCRIPTION_ERROR.TagRequired });
    } else if (reservedTags.has(data.tag.trim())) {
      ctx.addIssue({ code: 'custom', path: ['tag'], message: SUBSCRIPTION_ERROR.TagTaken });
    }
    if (data.group === SUBSCRIPTION_GROUP.New && data.groupName.trim() === '') {
      ctx.addIssue({ code: 'custom', path: ['groupName'], message: NODE_ADD_ERROR.TagRequired });
    }
    const interval = Number(data.intervalValue);
    if (
      data.interval === 'custom' &&
      (!/^\d+$/.test(data.intervalValue) || interval < 1 || interval > MAX_INTERVAL[data.intervalUnit])
    ) {
      ctx.addIssue({ code: 'custom', path: ['intervalValue'], message: SUBSCRIPTION_ERROR.Interval });
    }
    if (data.agent !== 'defaultAgent' && (data.agentValue.trim() === '' || /[\p{Cc}]/u.test(data.agentValue))) {
      ctx.addIssue({ code: 'custom', path: ['agentValue'], message: SUBSCRIPTION_ERROR.Agent });
    }
  });
}
