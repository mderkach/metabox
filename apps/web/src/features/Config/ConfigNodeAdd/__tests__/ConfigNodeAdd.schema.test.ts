import { describe, expect, it } from 'vitest';

import { NODE_LINK_ERROR } from '../model/ConfigNodeAdd.link';
import { makeNodeAddSchema, NODE_ADD_ERROR, NodeLinkFormSchema } from '../model/ConfigNodeAdd.schema';

function issues(data: { type: string; tag: string }, taken: readonly string[] = []) {
  const result = makeNodeAddSchema(taken).safeParse(data);

  return result.success ? [] : result.error.issues.map((issue) => [issue.path.join('.'), issue.message]);
}

describe('makeNodeAddSchema', () => {
  it('accepts a type and a free tag', () => {
    expect(issues({ type: 'direct', tag: 'direct-out' }, ['proxy'])).toEqual([]);
  });

  it('requires choosing a type', () => {
    expect(issues({ type: '', tag: 'direct-out' })).toEqual([['type', NODE_ADD_ERROR.TypeRequired]]);
  });

  it('rejects an empty tag and a tag of only spaces', () => {
    expect(issues({ type: 'direct', tag: '   ' })).toEqual([['tag', NODE_ADD_ERROR.TagRequired]]);
  });

  it('rejects a tag taken by another node, also after trimming spaces', () => {
    expect(issues({ type: 'direct', tag: ' proxy ' }, ['proxy'])).toEqual([['tag', NODE_ADD_ERROR.TagTaken]]);
  });
});

describe('NodeLinkFormSchema', () => {
  function linkIssues(link: string) {
    const result = NodeLinkFormSchema.safeParse({ link });

    return result.success ? [] : result.error.issues.map((issue) => [issue.path.join('.'), issue.message]);
  }

  it('accepts a link the parser reads', () => {
    expect(linkIssues('trojan://secret@example.com:443')).toEqual([]);
  });

  it('requires a link', () => {
    expect(linkIssues('  ')).toEqual([['link', NODE_ADD_ERROR.LinkRequired]]);
  });

  it('fails with the parser code', () => {
    expect(linkIssues('https://example.com')).toEqual([['link', NODE_LINK_ERROR.Scheme]]);
    expect(linkIssues('trojan://secret@example.com')).toEqual([['link', NODE_LINK_ERROR.Server]]);
  });
});
