import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / ".github/scripts/publish-release.sh"
BUNDLE_SCRIPT = ROOT / ".github/scripts/release-bundle.py"
TAG = "v0.1.0-rc.1"
PACKAGE = "metaboxd-0.1.0_rc1-r0.apk"
MOCK_GH = r'''#!/usr/bin/env python3
import fcntl
import json
import os
from pathlib import Path
import shutil
import sys
import time

args = sys.argv[1:]
root = Path(os.environ["FAKE_GH_DIR"])
if args[:2] == ["release", "create"]:
    time.sleep(float(os.environ.get("FAKE_CREATE_DELAY", "0")))
with (root / "lock").open("a") as lock:
    fcntl.flock(lock, fcntl.LOCK_EX)
    state = json.loads((root / "state.json").read_text())
    with (root / "calls.jsonl").open("a") as calls:
        calls.write(json.dumps(args) + "\n")
    release = state.get("release")
    code = 0
    if args[0] == "api":
        if os.environ.get("FAKE_API_FAILURE"):
            print("HTTP 403: forbidden", file=sys.stderr)
            sys.exit(1)
        if "/actions/runs/" in args[-1]:
            print(json.dumps([{"artifacts": state.get("artifacts", [])}]))
        else:
            print(json.dumps([[release] if release else []]))
    elif args[:2] == ["run", "download"]:
        destination = Path(args[args.index("--dir") + 1])
        shutil.copytree(root / "bundle", destination, dirs_exist_ok=True)
    elif args[:2] == ["release", "create"]:
        if release is not None:
            print("release already exists", file=sys.stderr)
            code = 1
        else:
            state["release"] = {
                "tag_name": args[2], "draft": "--draft" in args,
                "target_commitish": args[args.index("--target") + 1],
                "assets": [], "body": args[args.index("--notes") + 1],
            }
    elif args[:2] == ["release", "upload"]:
        asset = Path(args[3])
        name = asset.name
        if "--clobber" in args or any(a["name"] == name for a in release["assets"]):
            raise RuntimeError("attempted asset overwrite")
        if name == os.environ.get("FAKE_FAIL_UPLOAD") and not state.get("failed"):
            state["failed"] = True
            print("simulated upload failure", file=sys.stderr)
            code = 1
        else:
            shutil.copyfile(asset, root / "assets" / name)
            release["assets"].append({"name": name})
    elif args[:2] == ["release", "download"]:
        name = args[args.index("--pattern") + 1]
        destination = Path(args[args.index("--dir") + 1])
        shutil.copyfile(root / "assets" / name, destination / name)
    elif args[:2] == ["release", "edit"]:
        if "--draft=false" not in args:
            raise RuntimeError("unexpected release edit")
        if not release["draft"]:
            raise RuntimeError("attempted published release edit")
        release["draft"] = False
        state["published"] = state.get("published", 0) + 1
    else:
        raise RuntimeError("unexpected gh call: " + repr(args))
    (root / "state.json").write_text(json.dumps(state))
    sys.exit(code)
'''


class PublishReleaseTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.repo = self.root / "repo"
        self.repo.mkdir()
        self.fake = self.root / "gh"
        self.fake.mkdir()
        (self.fake / "assets").mkdir()
        (self.fake / "state.json").write_text("{}")
        (self.fake / "calls.jsonl").touch()
        bin_dir = self.root / "bin"
        bin_dir.mkdir()
        gh = bin_dir / "gh"
        gh.write_text(MOCK_GH)
        gh.chmod(0o755)
        self.env = {
            **os.environ, "PATH": str(bin_dir) + os.pathsep + os.environ["PATH"],
            "TAG": TAG, "PACKAGE": PACKAGE, "PUBLIC_KEY": "keys/metabox-release.pem",
            "GITHUB_REPOSITORY": "owner/metabox", "GITHUB_RUN_ID": "123", "FAKE_GH_DIR": str(self.fake),
            "GITHUB_OUTPUT": str(self.root / "output"),
        }
        self.git("init", "-q")
        self.git("-c", "user.name=test", "-c", "user.email=test@example.invalid",
                 "commit", "--allow-empty", "-qm", "test: fixture")
        self.commit = self.git("rev-parse", "HEAD").stdout.strip()
        self.git("tag", TAG)
        (self.repo / "dist").mkdir()
        (self.repo / "keys").mkdir()
        (self.repo / "dist" / PACKAGE).write_bytes(b"signed package fixture")
        digest = hashlib.sha256(b"signed package fixture").hexdigest()
        (self.repo / "dist" / (PACKAGE + ".sha256")).write_text(f"{digest}  {PACKAGE}\n")
        (self.repo / "keys/metabox-release.pem").write_text("public key fixture")
        (self.repo / "install.sh").write_text("installer fixture")

    def git(self, *args):
        return subprocess.run(["git", *args], cwd=self.repo, check=True,
                              text=True, capture_output=True)

    def run_publish(self, **env):
        return subprocess.run(["bash", str(SCRIPT)], cwd=self.repo,
                              env={**self.env, **env}, text=True, capture_output=True)

    def run_bundle(self, mode, **env):
        return subprocess.run(["python3", str(BUNDLE_SCRIPT), mode], cwd=self.repo,
                              env={**self.env, **env}, text=True, capture_output=True)

    def archive_bundle(self):
        created = self.run_bundle("create")
        self.assertEqual(created.returncode, 0, created.stderr)
        shutil.copytree(self.repo / "release-bundle", self.fake / "bundle")
        state = self.state()
        state["artifacts"] = [{"name": f"release-{TAG}-{self.commit}", "expired": False,
                               "workflow_run": {"head_sha": self.commit, "id": 123}}]
        (self.fake / "state.json").write_text(json.dumps(state))

    def state(self):
        return json.loads((self.fake / "state.json").read_text())

    def calls(self):
        return [json.loads(line) for line in (self.fake / "calls.jsonl").read_text().splitlines()]

    def draft(self, **overrides):
        state = {"release": {"tag_name": TAG, "draft": True,
                              "target_commitish": self.commit, "assets": [], **overrides}}
        (self.fake / "state.json").write_text(json.dumps(state))

    def test_first_run_uploads_complete_draft_before_publication(self):
        result = self.run_publish()
        self.assertEqual(result.returncode, 0, result.stderr)
        state = self.state()
        self.assertFalse(state["release"]["draft"])
        self.assertEqual(state["release"]["target_commitish"], self.commit)
        self.assertEqual(len(state["release"]["assets"]), 4)
        calls = self.calls()
        create = next(call for call in calls if call[:2] == ["release", "create"])
        self.assertIn("--draft", create)
        self.assertIn("--prerelease", create)
        self.assertEqual(calls[-1][:3], ["release", "edit", TAG])
        self.assertEqual(sum(call[:2] == ["release", "download"] for call in calls), 4)

    def test_stable_tag_is_not_marked_as_prerelease(self):
        self.git("tag", "v0.1.0")
        result = self.run_publish(TAG="v0.1.0")
        self.assertEqual(result.returncode, 0, result.stderr)
        create = next(call for call in self.calls() if call[:2] == ["release", "create"])
        self.assertNotIn("--prerelease", create)

    def test_partial_upload_resumes_without_replacing_assets(self):
        first = self.run_publish(FAKE_FAIL_UPLOAD=PACKAGE + ".sha256")
        self.assertNotEqual(first.returncode, 0)
        self.assertTrue(self.state()["release"]["draft"])
        self.assertEqual(len(self.state()["release"]["assets"]), 1)
        retry = self.run_publish()
        self.assertEqual(retry.returncode, 0, retry.stderr)
        self.assertEqual(self.state()["published"], 1)
        uploads = [call[3] for call in self.calls() if call[:2] == ["release", "upload"]]
        self.assertEqual(uploads.count("dist/" + PACKAGE), 1)

    def test_mismatching_existing_asset_is_not_replaced_or_published(self):
        self.draft(assets=[{"name": PACKAGE}])
        (self.fake / "assets" / PACKAGE).write_bytes(b"different package")
        result = self.run_publish()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("differs", result.stderr)
        self.assertEqual((self.fake / "assets" / PACKAGE).read_bytes(), b"different package")
        self.assertFalse(any(call[:2] in [["release", "upload"], ["release", "edit"]]
                             for call in self.calls()))

    def test_wrong_draft_commit_is_rejected_before_mutation(self):
        self.draft(target_commitish="other-commit")
        result = self.run_publish()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("commit", result.stderr)
        self.assertTrue(all(call[0] == "api" for call in self.calls()))

    def test_published_release_is_never_changed(self):
        self.draft(draft=False)
        before = self.state()
        result = self.run_publish()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("published", result.stderr)
        self.assertEqual(self.state(), before)
        self.assertTrue(all(call[0] == "api" for call in self.calls()))

    def test_api_failure_does_not_create_release(self):
        result = self.run_publish(FAKE_API_FAILURE="1")
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(any(call[:2] == ["release", "create"] for call in self.calls()))

    def test_bad_local_checksum_prevents_remote_mutation(self):
        (self.repo / "dist" / PACKAGE).write_bytes(b"broken package")
        result = self.run_publish()
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.calls(), [])

    def test_unexpected_existing_asset_is_rejected(self):
        self.draft(assets=[{"name": "unexpected.apk"}])
        result = self.run_publish()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("unexpected asset", result.stderr)
        self.assertTrue(all(call[0] == "api" for call in self.calls()))

    def test_concurrent_first_attempts_do_not_overwrite(self):
        env = {**self.env, "FAKE_CREATE_DELAY": "0.2"}
        attempts = [subprocess.Popen(["bash", str(SCRIPT)], cwd=self.repo, env=env,
                                     text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
                    for _ in range(2)]
        results = [attempt.communicate(timeout=15) for attempt in attempts]
        self.assertEqual(sorted(attempt.returncode for attempt in attempts), [0, 1], results)
        self.assertEqual(self.state()["published"], 1)
        self.assertEqual(len(self.state()["release"]["assets"]), 4)

    def test_tag_must_resolve_to_checked_out_commit(self):
        self.git("-c", "user.name=test", "-c", "user.email=test@example.invalid",
                 "commit", "--allow-empty", "-qm", "test: different commit")
        result = self.run_publish()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("does not point", result.stderr)
        self.assertEqual(self.calls(), [])

    def test_missing_local_asset_prevents_remote_mutation(self):
        (self.repo / "install.sh").unlink()
        result = self.run_publish()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("missing", result.stderr)
        self.assertEqual(self.calls(), [])

    def test_fresh_workspace_restores_original_bundle_after_partial_publication(self):
        self.archive_bundle()
        first = self.run_publish(FAKE_FAIL_UPLOAD=PACKAGE + ".sha256")
        self.assertNotEqual(first.returncode, 0)
        self.assertTrue(self.state()["release"]["draft"])
        original = (self.repo / "dist" / PACKAGE).read_bytes()
        fresh = self.root / "fresh-runner"
        shutil.copytree(self.repo, fresh, ignore=shutil.ignore_patterns("dist", "release-bundle"))
        self.repo = fresh
        restored = self.run_bundle("restore")
        self.assertEqual(restored.returncode, 0, restored.stderr)
        self.assertIn("restored=true", (self.root / "output").read_text())
        self.assertEqual((self.repo / "dist/metaboxd.apk").read_bytes(), original)
        (self.repo / "dist/metaboxd.apk").rename(self.repo / "dist" / PACKAGE)
        checksum = hashlib.sha256(original).hexdigest()
        (self.repo / "dist" / (PACKAGE + ".sha256")).write_text(f"{checksum}  {PACKAGE}\n")
        retry = self.run_publish()
        self.assertEqual(retry.returncode, 0, retry.stderr)
        self.assertEqual(self.state()["published"], 1)
        self.assertEqual((self.fake / "assets" / PACKAGE).read_bytes(), original)
        uploads = [call[3] for call in self.calls() if call[:2] == ["release", "upload"]]
        self.assertEqual(uploads.count("dist/" + PACKAGE), 1)

    def test_new_publication_without_bundle_allows_build(self):
        result = self.run_bundle("restore")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("restored=false", (self.root / "output").read_text())
        self.assertFalse((self.repo / "dist/metaboxd.apk").exists())

    def test_missing_original_bundle_refuses_rebuild_and_links_original_run(self):
        self.draft(body="Verified publication bundle: https://github.com/owner/metabox/actions/runs/122")
        result = self.run_bundle("restore")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("https://github.com/owner/metabox/actions/runs/122", result.stderr)
        self.assertIn("do not rebuild", result.stderr)
        self.assertFalse((self.root / "output").exists())

    def test_expired_original_bundle_refuses_rebuild(self):
        self.archive_bundle()
        state = self.state()
        state["artifacts"][0]["expired"] = True
        (self.fake / "state.json").write_text(json.dumps(state))
        result = self.run_bundle("restore")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("expired", result.stderr)
        self.assertFalse((self.root / "output").exists())

    def test_artifact_for_wrong_commit_is_rejected(self):
        self.archive_bundle()
        state = self.state()
        state["artifacts"][0]["workflow_run"]["head_sha"] = "other-commit"
        (self.fake / "state.json").write_text(json.dumps(state))
        result = self.run_bundle("restore")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("different commit", result.stderr)
        self.assertFalse((self.repo / "dist/metaboxd.apk").exists())

    def test_bundle_manifest_for_wrong_tag_is_rejected(self):
        self.archive_bundle()
        path = self.fake / "bundle/bundle.json"
        manifest = json.loads(path.read_text())
        manifest["tag"] = "v999.0.0"
        path.write_text(json.dumps(manifest))
        result = self.run_bundle("restore")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("does not match", result.stderr)
        self.assertFalse((self.repo / "dist/metaboxd.apk").exists())

    def test_tampered_bundle_is_rejected_before_restoration(self):
        self.archive_bundle()
        (self.fake / "bundle" / PACKAGE).write_bytes(b"changed signed package")
        result = self.run_bundle("restore")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("checksum differs", result.stderr)
        self.assertFalse((self.repo / "dist/metaboxd.apk").exists())

    def test_bundle_excludes_private_key_and_unrelated_files(self):
        (self.repo / "private.pem").write_text("private key fixture")
        self.archive_bundle()
        self.assertEqual(set(p.name for p in (self.fake / "bundle").iterdir()),
                         {PACKAGE, PACKAGE + ".sha256", "metabox-release.pem", "install.sh", "bundle.json"})

    def test_bundle_api_failure_does_not_allow_rebuild(self):
        result = self.run_bundle("restore", FAKE_API_FAILURE="1")
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse((self.root / "output").exists())

    def test_workflow_serializes_same_tag_without_cancellation(self):
        workflow = (ROOT / ".github/workflows/release.yml").read_text()
        self.assertIn("group: release-${{ github.ref }}", workflow)
        self.assertIn("cancel-in-progress: false", workflow)
        self.assertIn("bash .github/scripts/publish-release.sh", workflow)
        self.assertNotIn("gh release create", workflow)
        self.assertLess(workflow.index("Restore verified publication bundle"), workflow.index("Signed package"))
        self.assertLess(workflow.index("Persist verified publication bundle"), workflow.index("- name: Publish"))
        self.assertIn("overwrite: false", workflow)
        self.assertIn("retention-days: 90", workflow)
        self.assertIn("actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9", workflow)
        self.assertEqual(workflow.count("if: steps.bundle.outputs.restored != 'true'"), 7)


if __name__ == "__main__":
    unittest.main()
