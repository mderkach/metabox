from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest


SCRIPT = Path(__file__).resolve().parents[2] / ".github/scripts/trace-check.py"

PRD = """\
- [x] **AC-1.** A config loads.
- [ ] **AC-2.** A wizard runs.

| ID    | Requirement |
| ----- | ----------- |
| NFR-1 | The panel starts without sing-box |
| UX-1  | GUI is the main path |
"""

GO_TEST = """\
package config

func TestLoad(t *testing.T) {}

func BenchmarkLoad(b *testing.B) {}
"""

WORKFLOW = """\
jobs:
  integration:
    runs-on: ubuntu-latest
"""

ROWS = """\
| ID    | Kind    | File                         | Check        |
| ----- | ------- | ---------------------------- | ------------ |
| AC-1  | go-test | `internal/config/load_test.go` | `TestLoad`   |
| NFR-1 | ci      | `.github/workflows/ci.yml`   | `integration` |
"""

ON_PURPOSE = """
## Checked by hand on purpose

| ID | Scenario | Why by hand |
| --- | --- | --- |
"""


class TraceCheckTest(unittest.TestCase):
    def setUp(self):
        self.root = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.root)
        self.write("docs/PRD.md", PRD)
        self.write("internal/config/load_test.go", GO_TEST)
        self.write(".github/workflows/ci.yml", WORKFLOW)
        self.write("docs/Verification.md", ROWS)

    def write(self, name, text):
        path = self.root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")

    def run_check(self, *args):
        subprocess.run(["git", "init", "-q"], cwd=self.root, check=True)
        subprocess.run(["git", "add", "-A"], cwd=self.root, check=True)
        return subprocess.run(
            [sys.executable, "-I", str(SCRIPT), "--root", str(self.root), *args],
            capture_output=True,
            text=True,
        )

    def test_passes_when_every_row_resolves(self):
        result = self.run_check()
        self.assertEqual(result.returncode, 0, result.stdout)
        self.assertIn("coverage: 2 of 2", result.stdout)

    def test_open_criteria_and_principles_are_not_required(self):
        result = self.run_check("--strict-coverage")
        self.assertEqual(result.returncode, 0, result.stdout)

    def test_fails_on_an_id_the_prd_does_not_define(self):
        self.write("docs/Verification.md", ROWS + "| AC-9 | manual | | open the panel |\n")
        result = self.run_check()
        self.assertEqual(result.returncode, 1)
        self.assertIn("AC-9 is not defined", result.stdout)

    def test_fails_when_the_named_test_is_missing(self):
        self.write("docs/Verification.md", ROWS.replace("`TestLoad`", "`TestSave`"))
        result = self.run_check()
        self.assertEqual(result.returncode, 1)
        self.assertIn("'TestSave' is not found", result.stdout)

    def test_fails_when_the_file_is_missing(self):
        self.write("docs/Verification.md", ROWS.replace("load_test.go", "save_test.go"))
        result = self.run_check()
        self.assertEqual(result.returncode, 1)
        self.assertIn("does not exist", result.stdout)

    def test_fails_when_the_job_is_missing(self):
        self.write("docs/Verification.md", ROWS.replace("`integration`", "`release`"))
        result = self.run_check()
        self.assertEqual(result.returncode, 1)

    def test_fails_on_an_unknown_kind(self):
        self.write("docs/Verification.md", ROWS.replace("| go-test |", "| unit    |"))
        result = self.run_check()
        self.assertEqual(result.returncode, 1)
        self.assertIn("unknown kind 'unit'", result.stdout)

    def test_a_manual_check_has_no_file(self):
        self.write("docs/Verification.md", ROWS + "| AC-2 | manual | `docs/PRD.md` | open the panel |\n")
        result = self.run_check()
        self.assertEqual(result.returncode, 1)

    def test_reports_a_missing_check_and_fails_only_when_strict(self):
        self.write("docs/Verification.md", ROWS.replace("| NFR-1 |", "| UX-1  |"))
        result = self.run_check()
        self.assertEqual(result.returncode, 0, result.stdout)
        self.assertIn("without a check: NFR-1", result.stdout)
        self.assertEqual(self.run_check("--strict-coverage").returncode, 1)

    def test_reports_requirements_checked_only_by_hand(self):
        self.write("docs/Verification.md", ROWS.replace("| go-test |", "| bench   |").replace("`TestLoad`", "`BenchmarkLoad`"))
        result = self.run_check()
        self.assertEqual(result.returncode, 0, result.stdout)
        self.assertIn("checked only by hand, not in CI: AC-1", result.stdout)

    def test_a_manual_row_in_the_table_is_reported_as_owed(self):
        self.write("docs/Verification.md", ROWS + "| AC-1 | manual | | open the panel |\n")
        result = self.run_check()
        self.assertEqual(result.returncode, 0, result.stdout)
        self.assertIn("manual checks owed outside the section on purpose: AC-1", result.stdout)

    def test_a_check_by_hand_on_purpose_covers_the_requirement(self):
        rows = ROWS.replace("| NFR-1 | ci      | `.github/workflows/ci.yml`   | `integration` |\n", "")
        self.write("docs/Verification.md", rows + ON_PURPOSE + "| NFR-1 | cut the power | the bench has no flash |\n")
        result = self.run_check("--strict-coverage")
        self.assertEqual(result.returncode, 0, result.stdout)
        self.assertIn("checked by hand on purpose: NFR-1", result.stdout)
        self.assertNotIn("owed", result.stdout)

    def test_a_check_by_hand_on_purpose_names_the_reason(self):
        self.write("docs/Verification.md", ROWS + ON_PURPOSE + "| NFR-1 | cut the power | |\n")
        result = self.run_check()
        self.assertEqual(result.returncode, 1)
        self.assertIn("names the scenario and the reason", result.stdout)

    def test_a_row_of_the_table_layout_is_refused_on_purpose(self):
        self.write("docs/Verification.md", ROWS + ON_PURPOSE + "| NFR-1 | manual | | cut the power |\n")
        result = self.run_check()
        self.assertEqual(result.returncode, 1)
        self.assertIn("the row has 4 cells", result.stdout)

    def test_fails_on_a_broken_relative_link_in_the_main_specs(self):
        self.write("docs/adr/ADR-0002-x.md", "# ADR-0002\n")
        # The depth of a delta in a change folder, copied into the main specs by an archive.
        self.write("openspec/specs/access/spec.md", "Decision in [ADR-0002](../../../../../docs/adr/ADR-0002-x.md).\n")
        result = self.run_check()
        self.assertEqual(result.returncode, 1)
        self.assertIn("openspec/specs/access/spec.md:1: the link ../../../../../docs/adr/ADR-0002-x.md points at nothing", result.stdout)

    def test_a_relative_link_that_resolves_passes(self):
        self.write("docs/adr/ADR-0002-x.md", "# ADR-0002\n")
        self.write(
            "openspec/specs/access/spec.md",
            "[ADR-0002](../../../docs/adr/ADR-0002-x.md#context), [site](https://example.com), [below](#scenario).\n",
        )
        self.write(
            "openspec/changes/add-x/specs/access/spec.md",
            "[ADR-0002](../../../../../docs/adr/ADR-0002-x.md)\n",
        )
        result = self.run_check()
        self.assertEqual(result.returncode, 0, result.stdout)

    def test_fails_on_a_document_reference_in_code(self):
        self.write("internal/config/load.go", "// Writes atomically (ADR-0002).\n")
        result = self.run_check()
        self.assertEqual(result.returncode, 1)
        self.assertIn("internal/config/load.go:1: code refers to the document ADR-0002", result.stdout)

    def test_fails_on_a_requirement_id_in_a_test(self):
        self.write("internal/config/load_test.go", GO_TEST + "// Holds the AC-1 scenario.\n")
        self.assertEqual(self.run_check().returncode, 1)

    def test_markdown_may_reference_documents(self):
        self.write("internal/config/README.md", "See ADR-0002 and AC-1 in the PRD.\n")
        result = self.run_check()
        self.assertEqual(result.returncode, 0, result.stdout)

    def test_a_requirement_in_the_main_specs_is_built(self):
        self.write("openspec/specs/dataplane/spec.md", "### Requirement: AC-5 Interception\n")
        result = self.run_check()
        self.assertEqual(result.returncode, 0, result.stdout)
        self.assertIn("without a check: AC-5", result.stdout)
        self.assertEqual(self.run_check("--strict-coverage").returncode, 1)

    def test_a_requirement_in_a_change_is_known_but_not_required(self):
        self.write("openspec/changes/add-wizard/specs/setup/spec.md", "## ADDED Requirements\n\n### Requirement: AC-6 Wizard\n")
        self.write("docs/Verification.md", ROWS + "| AC-6 | manual | | run the wizard |\n")
        result = self.run_check("--strict-coverage")
        self.assertEqual(result.returncode, 0, result.stdout)

    def test_a_modified_delta_repeats_a_built_requirement(self):
        self.write("openspec/specs/dataplane/spec.md", "### Requirement: AC-5 Interception\n")
        self.write("openspec/changes/tune/specs/dataplane/spec.md", "## MODIFIED Requirements\n\n### Requirement: AC-5 Interception\n")
        result = self.run_check()
        self.assertEqual(result.returncode, 0, result.stdout)

    def test_archived_changes_are_not_read(self):
        self.write("openspec/specs/dataplane/spec.md", "### Requirement: AC-5 Interception\n")
        self.write("openspec/changes/archive/2026-11-14-x/specs/dataplane/spec.md", "## ADDED Requirements\n\n### Requirement: AC-5 Interception\n")
        result = self.run_check()
        self.assertEqual(result.returncode, 0, result.stdout)

    def test_fails_when_two_places_define_one_id(self):
        self.write("openspec/specs/dataplane/spec.md", "### Requirement: AC-1 Interception\n")
        result = self.run_check()
        self.assertEqual(result.returncode, 1)
        self.assertIn("AC-1 is already defined in docs/PRD.md:1", result.stdout)

    def test_untracked_files_are_not_checked(self):
        subprocess.run(["git", "init", "-q"], cwd=self.root, check=True)
        subprocess.run(["git", "add", "-A"], cwd=self.root, check=True)
        self.write("scratch.go", "// ADR-0002\n")
        result = subprocess.run(
            [sys.executable, "-I", str(SCRIPT), "--root", str(self.root)], capture_output=True, text=True
        )
        self.assertEqual(result.returncode, 0, result.stdout)


if __name__ == "__main__":
    unittest.main()
