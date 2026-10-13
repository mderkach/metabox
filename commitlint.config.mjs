// The convention is described in CONTRIBUTING.md; this is its executable part.
// The commit-msg hook (lefthook.yml) and the CI step on PRs run the check.
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [2, 'always', ['feat', 'fix', 'refactor', 'perf', 'test', 'docs', 'build', 'ci', 'chore', 'revert']],
    'scope-enum': [2, 'always', ['daemon', 'schema', 'fe', 'docs', 'ci', 'infra', 'deps', 'ai']],
    'header-max-length': [2, 'always', 72],
  },
};
