import { describe, expect, it } from 'vitest';

import { makeNodeAddSchema, NODE_ADD_ERROR } from '../model/ConfigNodeAdd.schema';

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
