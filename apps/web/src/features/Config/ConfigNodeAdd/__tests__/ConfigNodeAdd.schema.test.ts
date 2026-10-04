import { describe, expect, it } from 'vitest';

import { makeNodeAddSchema, NODE_ADD_ERROR } from '../model/ConfigNodeAdd.schema';

function issues(data: { type: string; tag: string }, taken: readonly string[] = []) {
  const result = makeNodeAddSchema(taken).safeParse(data);

  return result.success ? [] : result.error.issues.map((issue) => [issue.path.join('.'), issue.message]);
}

describe('makeNodeAddSchema', () => {
  it('принимает тип и свободный тег', () => {
    expect(issues({ type: 'direct', tag: 'direct-out' }, ['proxy'])).toEqual([]);
  });

  it('требует выбрать тип', () => {
    expect(issues({ type: '', tag: 'direct-out' })).toEqual([['type', NODE_ADD_ERROR.TypeRequired]]);
  });

  it('отклоняет пустой тег и тег из одних пробелов', () => {
    expect(issues({ type: 'direct', tag: '   ' })).toEqual([['tag', NODE_ADD_ERROR.TagRequired]]);
  });

  it('отклоняет тег, занятый другим узлом, и после обрезки пробелов', () => {
    expect(issues({ type: 'direct', tag: ' proxy ' }, ['proxy'])).toEqual([['tag', NODE_ADD_ERROR.TagTaken]]);
  });
});
