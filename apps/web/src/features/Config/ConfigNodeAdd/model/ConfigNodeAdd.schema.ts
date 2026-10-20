import { z } from 'zod';

import { parseShareLink } from './ConfigNodeAdd.link';

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
export const NodeLinkFormSchema = NodeLinkSchema.superRefine((data, ctx) => {
  if (data.link.trim() === '') {
    ctx.addIssue({ code: 'custom', path: ['link'], message: NODE_ADD_ERROR.LinkRequired });

    return;
  }

  const { error } = parseShareLink(data.link);

  if (error !== null) {
    ctx.addIssue({ code: 'custom', path: ['link'], message: error });
  }
});
