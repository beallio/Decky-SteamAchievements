from __future__ import annotations

import importlib.util
import os
import subprocess
from pathlib import Path

ROOT = Path(__file__).parents[1]


def read(relative: str) -> str:
    return (ROOT / relative).read_text(encoding="utf-8")


def test_stable_release_publishes_exact_updater_assets() -> None:
    content = read(".github/workflows/release.yml")
    publish = content.split("- name: Publish stable GitHub Release", 1)[1]
    assert "Decky-SteamAchievements.zip" in publish
    assert '"Decky-SteamAchievements-$TAG.zip.sha256"' in publish
    assert '"Decky-SteamAchievements-$TAG.manifest.json"' in publish
    assert "--emit-release-metadata" in content
    assert "--channel stable" in content


def test_rolling_dev_stays_zip_only_and_stamps_commit_version() -> None:
    content = read(".github/workflows/dev-release.yml")
    assert "push:" in content and "- dev" in content
    assert "dev-build" in content
    assert 'dev_version="${base_version}-dev.g${short_hash}"' in content
    assert '--release-version "$dev_version"' in content
    assert "--emit-release-metadata" not in content
    publish = content.split("- name: Reconcile rolling tag, release, and ZIP asset", 1)[1]
    assert "Decky-SteamAchievements.zip" in publish
    assert ".manifest.json" not in publish
    assert ".zip.sha256" not in publish


def test_immutable_dev_workflow_enforces_semver_identity_and_three_assets() -> None:
    content = read(".github/workflows/immutable-dev-release.yml")
    assert "workflow_dispatch:" in content
    assert "base_version:" in content
    assert 'DEV_VERSION="$BASE_VERSION-dev.g$SHORT_SHA"' in content
    assert 'DEV_TAG="v$DEV_VERSION"' in content
    assert "scripts/version_guard.py check-base" in content
    assert "package.json" in content and "plugin.json" in content
    assert "--emit-release-metadata" in content
    assert "--channel dev" in content
    assert "scripts/orchestration-hooks/quality-gates" in content
    assert "Decky-SteamAchievements.zip" in content
    assert 'Decky-SteamAchievements-$DEV_TAG.zip.sha256' in content
    assert 'Decky-SteamAchievements-$DEV_TAG.manifest.json' in content
    assert "--prerelease" in content
    assert 'git rev-parse "refs/tags/$DEV_TAG"' in content


def test_request_helper_validates_before_dispatch() -> None:
    content = read("scripts/request_dev_release.sh")
    dispatch = content.index("gh workflow run immutable-dev-release.yml")
    for required in [
        "git diff --quiet",
        "git diff --cached --quiet",
        "gh auth status",
        "git rev-parse --verify",
        "scripts/version_guard.py check-base",
        "package.json",
        "plugin.json",
    ]:
        assert required in content
        assert content.index(required) < dispatch


def test_request_helper_rejects_nonstable_version_without_dispatch(tmp_path: Path) -> None:
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    calls = tmp_path / "gh-calls"
    gh = bin_dir / "gh"
    gh.write_text(f"#!/bin/sh\necho \"$@\" >> {calls}\nexit 0\n", encoding="utf-8")
    gh.chmod(0o755)
    env = os.environ.copy()
    env["PATH"] = f"{bin_dir}:{env['PATH']}"
    result = subprocess.run(
        ["bash", "scripts/request_dev_release.sh", "v1.2.3"],
        cwd=ROOT,
        env=env,
        text=True,
        capture_output=True,
    )
    assert result.returncode != 0
    assert not calls.exists()


def test_version_guard_ignores_development_tags() -> None:
    spec = importlib.util.spec_from_file_location(
        "version_guard", ROOT / "scripts/version_guard.py"
    )
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    assert module.highest_stable_version(
        ["v0.1.0", "v99.0.0-dev.gabc", "dev-build", "v0.2.0"]
    ) == (0, 2, 0)
