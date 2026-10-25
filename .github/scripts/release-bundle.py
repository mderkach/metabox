#!/usr/bin/env python3
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile


def fail(message):
    raise SystemExit(f"::error::{message}")


def gh(*args):
    return subprocess.check_output(["gh", *args], text=True)


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def validate(directory, identity, public_key):
    manifest_path = directory / "bundle.json"
    if manifest_path.is_symlink() or not manifest_path.is_file():
        fail("publication bundle manifest is missing or not a regular file")
    manifest = json.loads(manifest_path.read_text())
    if any(manifest.get(key) != value for key, value in identity.items()):
        fail("publication bundle does not match the repository, tag, commit and original run")
    package = manifest.get("package", "")
    if not re.fullmatch(r"metaboxd-[A-Za-z0-9._+-]+\.apk", package):
        fail("publication bundle has an invalid package name")
    names = {package, package + ".sha256", public_key.name, "install.sh"}
    if set(manifest.get("files", {})) != names or set(p.name for p in directory.iterdir()) != names | {"bundle.json"}:
        fail("publication bundle has an unexpected file set")
    for name, expected in manifest["files"].items():
        path = directory / name
        if path.is_symlink() or not path.is_file() or digest(path) != expected:
            fail(f"publication bundle checksum differs for {name}")
    checksum = (directory / (package + ".sha256")).read_text()
    if checksum != f"{digest(directory / package)}  {package}\n":
        fail("publication bundle package checksum does not match its package")
    for source in (public_key, Path("install.sh")):
        if source.read_bytes() != (directory / source.name).read_bytes():
            fail(f"publication bundle {source.name} differs from the tagged source")
    return package


def main():
    tag = os.environ["TAG"]
    repository = os.environ["GITHUB_REPOSITORY"]
    run_id = os.environ["GITHUB_RUN_ID"]
    public_key = Path(os.environ["PUBLIC_KEY"])
    commit = subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip()
    identity = {"tag": tag, "commit": commit, "repository": repository, "run_id": run_id}
    name = f"release-{tag}-{commit}"
    run_url = f"https://github.com/{repository}/actions/runs/{run_id}"
    directory = Path("release-bundle")
    mode = sys.argv[1]
    if mode == "create":
        package = os.environ["PACKAGE"]
        sources = [Path("dist") / package, Path("dist") / (package + ".sha256"), public_key, Path("install.sh")]
        directory.mkdir()
        for source in sources:
            shutil.copyfile(source, directory / source.name)
        manifest = {**identity, "package": package, "files": {p.name: digest(p) for p in sources}}
        (directory / "bundle.json").write_text(json.dumps(manifest, indent=2) + "\n")
        validate(directory, identity, public_key)
        return
    if mode != "restore":
        fail("expected create or restore")
    pages = json.loads(gh("api", "--paginate", "--slurp",
                          f"repos/{repository}/actions/runs/{run_id}/artifacts?per_page=100"))
    artifacts = [a for page in pages for a in page["artifacts"] if a["name"] == name]
    if len(artifacts) > 1:
        fail(f"multiple publication bundles found in {run_url}")
    restored = False
    if artifacts:
        artifact = artifacts[0]
        if artifact["expired"]:
            fail(f"original verified publication bundle expired in {run_url}; do not rebuild or replace draft assets")
        if artifact["workflow_run"]["head_sha"] != commit or str(artifact["workflow_run"]["id"]) != run_id:
            fail("publication artifact belongs to a different commit or run")
        with tempfile.TemporaryDirectory() as temp:
            gh("run", "download", run_id, "--repo", repository, "--name", name, "--dir", temp)
            package = validate(Path(temp), identity, public_key)
            Path("dist").mkdir(exist_ok=True)
            shutil.copyfile(Path(temp) / package, "dist/metaboxd.apk")
        restored = True
    else:
        pages = json.loads(gh("api", "--paginate", "--slurp", f"repos/{repository}/releases?per_page=100"))
        releases = [r for page in pages for r in page if r["tag_name"] == tag]
        if releases:
            body = releases[0].get("body") or ""
            original = re.search(r"Verified publication bundle: (https://github\.com/[^\s]+/actions/runs/[0-9]+)", body)
            location = original.group(1) if original else "the original release workflow run"
            fail(f"original verified publication bundle is unavailable in {run_url}; rerun {location}; do not rebuild or replace release assets")
    with open(os.environ["GITHUB_OUTPUT"], "a") as output:
        output.write(f"artifact_name={name}\nrestored={str(restored).lower()}\n")


if __name__ == "__main__":
    main()
