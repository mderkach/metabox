#!/usr/bin/env python3
"""Checks the links between requirements, their checks and the code.

Requirements point at the checks that confirm them through docs/Verification.md; code does not
point at documents. A failure names the file, the line and how to fix it.
"""
import argparse
from pathlib import Path
import re
import subprocess
import sys


ROOT = Path(__file__).resolve().parents[2]
PRD = "docs/PRD.md"
INDEX = "docs/Verification.md"
# A requirement in the main specs is built; one in a change's delta is still in progress.
SPECS = "openspec/specs"
CHANGES = "openspec/changes"

ID = r"(?:AC|NFR|UX)-\d+"
AC_LINE = re.compile(r"^- \[( |x)\] \*\*(AC-\d+)\.\*\*")
TABLE_ID = re.compile(r"^\| ((?:NFR|UX)-\d+) +\|")
SPEC_REQUIREMENT = re.compile(rf"^### Requirement: ({ID})\b")
ROW = re.compile(rf"^\| *({ID}) *\|")
CODE = re.compile(r"`([^`]+)`")
DOC_REFERENCE = re.compile(rf"\b(?:ADR-\d{{4}}|{ID}|PRD)\b")

# The Markdown lint config names documents as examples of a Markdown style; this script and its
# test name the requirements document and need requirement IDs in their fixtures.
NOT_CODE = {
    ".markdownlint.jsonc",
    ".github/scripts/trace-check.py",
    ".github/tests/test_trace_check.py",
    "openspec/config.yaml",
}

KINDS = {"go-test", "bench", "vitest", "e2e", "script", "ci", "make", "manual"}
# A benchmark reports a number and fails no threshold; a manual check is a scenario for a person.
BY_HAND = {"bench", "manual"}


class Report:
    def __init__(self):
        self.errors = []
        self.warnings = []

    def error(self, where, message, fix=None):
        self.errors.append(f"{where}: {message}" + (f"\n  fix: {fix}" if fix else ""))

    def warning(self, message):
        self.warnings.append(message)


def spec_files(root, folder):
    return sorted(p for p in (root / folder).rglob("*.md") if "archive" not in p.relative_to(root / folder).parts)


def read_requirements(root, report):
    ticked, known = set(), set()
    nfr = []
    homes = {}

    def define(requirement, where):
        if requirement in homes:
            report.error(where, f"{requirement} is already defined in {homes[requirement]}", "give the new requirement the next free ID")
            return
        homes[requirement] = where
        known.add(requirement)

    for number, line in enumerate((root / PRD).read_text(encoding="utf-8").splitlines(), 1):
        if match := AC_LINE.match(line):
            define(match[2], f"{PRD}:{number}")
            if match[1] == "x":
                ticked.add(match[2])
        elif match := TABLE_ID.match(line):
            define(match[1], f"{PRD}:{number}")
            if match[1].startswith("NFR-"):
                nfr.append(match[1])
    for folder, built in ((SPECS, True), (CHANGES, False)):
        for path in spec_files(root, folder):
            for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
                if match := SPEC_REQUIREMENT.match(line):
                    where = f"{path.relative_to(root)}:{number}"
                    # A delta that modifies a built requirement repeats its header on purpose.
                    if not built and match[1] in homes and homes[match[1]].startswith(SPECS):
                        continue
                    define(match[1], where)
                    if built:
                        if match[1].startswith("NFR-"):
                            nfr.append(match[1])
                        else:
                            ticked.add(match[1])
    return known, ticked, nfr


def read_rows(root):
    rows = []
    for number, line in enumerate((root / INDEX).read_text(encoding="utf-8").splitlines(), 1):
        if not ROW.match(line):
            continue
        cells = [cell.strip() for cell in line.strip().strip("|").split("|")]
        rows.append((number, cells))
    return rows


def check_target(root, kind, path, target):
    """Returns the reason the check cannot be found, or None."""
    file = root / path
    if not file.is_file():
        return f"file {path} does not exist"
    text = file.read_text(encoding="utf-8")
    if kind in ("go-test", "bench"):
        found = re.search(rf"^func {re.escape(target)}\(", text, re.M)
    elif kind == "ci":
        found = re.search(rf"^  {re.escape(target)}:\s*$", text, re.M)
    elif kind == "make":
        found = re.search(rf"^{re.escape(target)}:", text, re.M)
    else:
        found = target in text
    return None if found else f"{target!r} is not found in {path}"


def check_rows(root, rows, known, report):
    covered, gated = set(), set()
    for number, cells in rows:
        where = f"{INDEX}:{number}"
        if len(cells) != 4:
            report.error(where, f"the row has {len(cells)} cells", "write `| ID | Kind | File | Check |`")
            continue
        requirement, kind, file_cell, check = cells
        if requirement not in known:
            report.error(where, f"{requirement} is not defined in {PRD} or {SPECS}", "fix the ID or remove the row")
            continue
        if kind not in KINDS:
            report.error(where, f"unknown kind {kind!r}", f"use one of {', '.join(sorted(KINDS))}")
            continue
        covered.add(requirement)
        if kind not in BY_HAND:
            gated.add(requirement)
        if kind == "manual":
            if file_cell or not check:
                report.error(where, "a manual check has no file and describes the scenario", "empty the File cell, describe the scenario in Check")
            continue
        path, target = CODE.fullmatch(file_cell), CODE.fullmatch(check)
        if not path or not target:
            report.error(where, "File and Check are written in backticks", "write `path` and `name`")
            continue
        if reason := check_target(root, kind, path[1], target[1]):
            report.error(where, reason, "point the row at the check that exists, or remove the row")
    return covered, gated


def check_coverage(covered, gated, ticked, nfr, report):
    missing = sorted(ticked - covered, key=lambda i: int(i.split("-")[1])) + [i for i in nfr if i not in covered]
    required = len(ticked) + len(nfr)
    report.warning(f"coverage: {required - len(missing)} of {required} ticked criteria and NFRs have a check in {INDEX}")
    if missing:
        report.warning(f"without a check: {', '.join(missing)}")
    if by_hand := sorted(covered - gated):
        report.warning(f"checked only by hand, not in CI: {', '.join(by_hand)}")
    return missing


def tracked_code(root):
    files = subprocess.run(["git", "ls-files", "-z"], cwd=root, capture_output=True, check=True).stdout
    for name in files.decode().split("\0"):
        if name and not name.endswith(".md") and name not in NOT_CODE:
            yield name


def check_code(root, report):
    found = False
    for name in tracked_code(root):
        try:
            text = (root / name).read_text(encoding="utf-8")
        except (UnicodeDecodeError, FileNotFoundError, IsADirectoryError):
            continue
        for number, line in enumerate(text.splitlines(), 1):
            if match := DOC_REFERENCE.search(line):
                found = True
                report.error(f"{name}:{number}", f"code refers to the document {match[0]}")
    if found:
        report.error(
            "code references above",
            "a document ID in code goes stale when the document changes and says nothing without opening it",
            f"say what breaks and why instead; a requirement links to its check in {INDEX}, a decision names the code in its ADR Validation section",
        )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=ROOT)
    parser.add_argument("--strict-coverage", action="store_true", help="fail when a ticked criterion or an NFR has no check")
    args = parser.parse_args()

    report = Report()
    known, ticked, nfr = read_requirements(args.root, report)
    covered, gated = check_rows(args.root, read_rows(args.root), known, report)
    missing = check_coverage(covered, gated, ticked, nfr, report)
    check_code(args.root, report)
    if args.strict_coverage and missing:
        report.error(INDEX, f"{len(missing)} requirements have no check", "add a row per requirement")

    for warning in report.warnings:
        print(warning)
    for error in report.errors:
        print(f"::error::{error}")
    return 1 if report.errors else 0


if __name__ == "__main__":
    sys.exit(main())
