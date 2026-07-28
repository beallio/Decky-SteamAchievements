from __future__ import annotations

from backend.updater.models import (
    ReleaseManifest,
    parse_release_manifest,
)


def test_parse_release_manifest() -> None:
    manifest_dict = {
        "schemaVersion": 1,
        "pluginName": "Achievements Restored",
        "packageName": "decky-steamachievements",
        "version": "0.2.1",
        "sourceVersion": "0.2.1",
        "tag": "v0.2.1",
        "channel": "stable",
        "assetName": "Decky-SteamAchievements.zip",
        "sha256": "a" * 64,
        "generatedAt": "2026-05-30T12:00:00Z",
    }

    # Valid
    manifest = parse_release_manifest(manifest_dict)
    assert isinstance(manifest, ReleaseManifest)
    assert manifest.version == "0.2.1"

    # Invalid sha256 length
    bad_sha = dict(manifest_dict, sha256="bad")
    assert parse_release_manifest(bad_sha) is None

    # Missing field
    missing_version = dict(manifest_dict)
    del missing_version["version"]
    assert parse_release_manifest(missing_version) is None

    # Not a dict
    assert parse_release_manifest(["not", "dict"]) is None

