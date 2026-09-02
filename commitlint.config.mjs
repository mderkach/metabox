// Конвенция описана в CONTRIBUTING.md; здесь её исполняемая часть.
// Проверку запускает хук commit-msg (lefthook.yml) и шаг CI на PR.
export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "type-enum": [
      2,
      "always",
      [
        "feat",
        "fix",
        "refactor",
        "perf",
        "test",
        "docs",
        "build",
        "ci",
        "chore",
        "revert",
      ],
    ],
    "scope-enum": [
      2,
      "always",
      ["daemon", "schema", "fe", "docs", "ci", "infra", "deps", "ai"],
    ],
    "header-max-length": [2, "always", 72],
  },
}
