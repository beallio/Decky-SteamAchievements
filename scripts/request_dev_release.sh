#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 || $# -gt 2 ]]; then
  echo "Usage: $0 <base_version> [commit]" >&2
  exit 1
fi

base_version="$1"
commit_ref="${2:-HEAD}"

if [[ ! "$base_version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "request-dev-release: base version must be stable X.Y.Z" >&2
  exit 1
fi

repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "request-dev-release: working tree must be clean" >&2
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "request-dev-release: authenticate GitHub CLI first" >&2
  exit 1
fi

if ! full_sha="$(git rev-parse --verify "$commit_ref^{commit}" 2>/dev/null)"; then
  echo "request-dev-release: cannot resolve commit '$commit_ref'" >&2
  exit 1
fi

package_version="$(git show "$full_sha:package.json" | python3 -c 'import json, sys; print(json.load(sys.stdin)["version"])')"
plugin_version="$(git show "$full_sha:plugin.json" | python3 -c 'import json, sys; print(json.load(sys.stdin)["version"])')"
if [[ "$package_version" != "$base_version" || "$plugin_version" != "$base_version" ]]; then
  echo "request-dev-release: base version must match package.json and plugin.json" >&2
  exit 1
fi

if git tag --list "v$base_version" | grep -q .; then
  echo "request-dev-release: stable tag v$base_version already exists" >&2
  exit 1
fi

python3 scripts/version_guard.py check-base "$base_version"

echo "Requesting immutable development release for $base_version at $full_sha"
gh workflow run immutable-dev-release.yml   -f base_version="$base_version"   -f commit="$full_sha"
