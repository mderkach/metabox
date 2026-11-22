import json
import re
from pathlib import Path


root = Path(__file__).resolve().parents[2]
manifest = json.loads((root / "package.json").read_text())
engines = manifest["engines"]
go_version = (root / ".go-version").read_text().strip()
go_minor = go_version.rsplit(".", 1)[0]
expected_go_directive = f"go {go_version}"
expected_go_image = f"FROM golang:{go_minor}-trixie"

pins = [
    (".nvmrc", (root / ".nvmrc").read_text().strip(), engines["node"]),
    ("packageManager", manifest["packageManager"], f"pnpm@{engines['pnpm']}"),
]

for module in ("apps/metaboxd", "tools/schemagen"):
    path = f"{module}/go.mod"
    directive = re.search(r"^go .+$", (root / path).read_text(), re.MULTILINE)
    pins.append((path, directive[0] if directive else None, expected_go_directive))

dockerfile = ".devcontainer/Dockerfile.dev"
image = re.search(r"^FROM golang:.+$", (root / dockerfile).read_text(), re.MULTILINE)
pins.append((dockerfile, image[0] if image else None, expected_go_image))

errors = [f"{name}: expected {expected!r}, found {actual!r}" for name, actual, expected in pins if actual != expected]
if errors:
    raise SystemExit("\n".join(errors))

print("Node.js, pnpm and Go toolchain pins agree.")
