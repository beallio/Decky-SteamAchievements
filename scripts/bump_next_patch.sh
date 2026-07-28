#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

python_bin="$(command -v python3 || command -v python)"
if ! highest_tag="$("$python_bin" scripts/version_guard.py highest)"; then
  echo "bump-next-patch: failed to read stable release tags" >&2
  exit 1
fi

if [[ -z "$highest_tag" ]]; then
  echo "No stable release tags found; leaving package metadata unchanged."
  exit 0
fi

highest_version="${highest_tag#v}"
if ! next_version="$("$python_bin" scripts/version_guard.py next-patch "$highest_version")"; then
  echo "bump-next-patch: failed to calculate the next patch version" >&2
  exit 1
fi
"$python_bin" scripts/set_release_version.py "$next_version"
