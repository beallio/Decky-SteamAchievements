from __future__ import annotations

import datetime
import time
from backend.updater.service import PluginUpdater
from backend.updater.discovery import prevalidate_release_candidate
from backend.updater.models import JsonResponse


def mock_release(
    tag_name: str,
    published_at: str,
    prerelease: bool,
    manifest_ok: bool,
    zip_ok: bool = True,
    draft: bool = False,
    no_assets: bool = False,
) -> dict:
    assets = []
    if not no_assets:
        if manifest_ok or zip_ok:
            if zip_ok:
                assets.append(
                    {
                        "name": "Decky-SteamAchievements.zip",
                        "browser_download_url": f"https://zip/{tag_name}",
                    }
                )
            assets.append(
                {
                    "name": f"Decky-SteamAchievements-{tag_name}.manifest.json",
                    "browser_download_url": f"https://manifest/{tag_name}",
                }
            )

    return {
        "draft": draft,
        "prerelease": prerelease,
        "tag_name": tag_name,
        "html_url": f"https://release/{tag_name}",
        "published_at": published_at,
        "assets": assets,
    }


def mock_manifest(tag: str, valid: bool, channel: str = "stable") -> dict:
    if not valid:
        return {"schemaVersion": 1}  # invalid, missing required fields
    version = tag[1:] if tag.startswith("v") else tag
    return {
        "schemaVersion": 1,
        "pluginName": "Achievements Restored",
        "packageName": "decky-steamachievements",
        "version": version,
        "sourceVersion": version,
        "tag": tag,
        "channel": channel,
        "assetName": "Decky-SteamAchievements.zip",
        "sha256": "a" * 64,
        "generatedAt": "2026-05-30T12:00:00Z",
    }


class MockClient:
    def __init__(self, releases, manifest_validity):
        self.releases = releases
        self.manifest_validity = manifest_validity
        self.get_manifest_calls = []
        self.list_releases_calls = 0

    def list_releases(self):
        self.list_releases_calls += 1
        return JsonResponse(status=200, headers={}, body=self.releases)

    def get_release(self, tag):
        for r in self.releases:
            if r["tag_name"] == tag:
                return JsonResponse(status=200, headers={}, body=r)
        return JsonResponse(status=404, headers={}, body={})

    def get_manifest(self, url):
        self.get_manifest_calls.append(url)
        tag = url.split("/")[-1]
        valid = self.manifest_validity.get(tag, False)
        return JsonResponse(
            status=200,
            headers={},
            body=mock_manifest(tag, valid, channel="dev" if "-dev." in tag else "stable"),
        )


def setup_updater(client):
    return PluginUpdater(
        state_lock=__import__("contextlib").nullcontext(),
        save_callback=lambda: None,
        log_callback=lambda lvl, msg: None,
        release_client=client,
        version_resolver=lambda: "0.1.0",
        now=lambda: datetime.datetime.now(datetime.timezone.utc),
        monotonic=time.monotonic,
    )


def test_check_for_update_fetches_one_manifest_when_newest_is_valid() -> None:
    releases = [
        mock_release(f"v0.1.{i}", f"2026-05-{i:02d}T12:00:00Z", prerelease=False, manifest_ok=True)
        for i in range(1, 11)
    ]
    client = MockClient(releases, {f"v0.1.{i}": True for i in range(1, 11)})
    updater = setup_updater(client)
    res = updater.check_for_update("0.1.0", force=True)

    assert res["status"] == "available"
    assert res["candidate"]["tag"] == "v0.1.10"
    assert client.list_releases_calls == 1
    assert len(client.get_manifest_calls) == 1
    assert client.get_manifest_calls[0] == "https://manifest/v0.1.10"


def test_check_for_update_falls_through_invalid_manifests() -> None:
    releases = [
        mock_release("v0.1.3", "2026-05-03T12:00:00Z", prerelease=False, manifest_ok=True),
        mock_release("v0.1.2", "2026-05-02T12:00:00Z", prerelease=False, manifest_ok=True),
        mock_release("v0.1.1", "2026-05-01T12:00:00Z", prerelease=False, manifest_ok=True),
    ]
    client = MockClient(releases, {"v0.1.3": False, "v0.1.2": True, "v0.1.1": True})
    updater = setup_updater(client)
    res = updater.check_for_update("0.1.0", force=True)

    assert res["status"] == "available"
    assert res["candidate"]["tag"] == "v0.1.2"
    assert len(client.get_manifest_calls) == 2
    assert client.get_manifest_calls == ["https://manifest/v0.1.3", "https://manifest/v0.1.2"]


def test_check_for_update_caps_manifest_attempts_at_five() -> None:
    releases = [
        mock_release(f"v0.1.{i}", f"2026-05-{i:02d}T12:00:00Z", prerelease=False, manifest_ok=True)
        for i in range(1, 8)
    ]
    # Reverse so v0.1.7 is highest version
    releases.reverse()

    # All newer 6 releases are broken
    validity = {f"v0.1.{i}": False for i in range(2, 8)}
    validity["v0.1.1"] = True

    client = MockClient(releases, validity)
    updater = setup_updater(client)
    res = updater.check_for_update("0.1.0", force=True)

    assert res["status"] == "current"
    assert len(client.get_manifest_calls) == 5


def test_check_for_update_orders_by_version_not_published_at() -> None:
    releases = [
        mock_release("v1.9.1", "2026-05-02T12:00:00Z", prerelease=False, manifest_ok=True),
        mock_release("v2.0.0", "2026-05-01T12:00:00Z", prerelease=False, manifest_ok=True),
    ]
    client = MockClient(releases, {"v1.9.1": True, "v2.0.0": True})
    updater = setup_updater(client)
    res = updater.check_for_update("1.0.0", force=True)

    assert res["status"] == "available"
    assert res["candidate"]["tag"] == "v2.0.0"
    assert len(client.get_manifest_calls) == 1
    assert client.get_manifest_calls[0] == "https://manifest/v2.0.0"


def test_check_for_update_stable_channel_skips_prereleases_without_fetch() -> None:
    releases = [
        mock_release("v1.0.1-dev.g123", "2026-05-02T12:00:00Z", prerelease=True, manifest_ok=True),
        mock_release("v1.0.0", "2026-05-01T12:00:00Z", prerelease=False, manifest_ok=True),
    ]
    client = MockClient(releases, {"v1.0.1-dev.g123": True, "v1.0.0": True})
    updater = setup_updater(client)
    # channel defaults to "stable"
    res = updater.check_for_update("0.1.0", force=True)

    assert res["status"] == "available"
    assert res["candidate"]["tag"] == "v1.0.0"
    assert len(client.get_manifest_calls) == 1
    assert client.get_manifest_calls[0] == "https://manifest/v1.0.0"


def test_prevalidate_rejects_free_failures_without_fetch() -> None:
    releases = [
        mock_release(
            "v1.0.6", "2026-05-01T12:00:00Z", prerelease=False, manifest_ok=True, draft=True
        ),
        mock_release("1.0.5", "2026-05-01T12:00:00Z", prerelease=False, manifest_ok=True),  # no 'v'
        mock_release(
            "v1.0.4", "2026-05-01T12:00:00Z", prerelease=False, manifest_ok=False, no_assets=True
        ),
        mock_release(
            "v1.0.3", "2026-05-01T12:00:00Z", prerelease=False, manifest_ok=False, zip_ok=False
        ),  # no zip
        mock_release("v1.0.2", "2026-05-01T12:00:00Z", prerelease=False, manifest_ok=True),
    ]
    client = MockClient(releases, {"v1.0.2": True})
    updater = setup_updater(client)
    res = updater.check_for_update("0.1.0", force=True)

    assert res["status"] == "available"
    assert res["candidate"]["tag"] == "v1.0.2"
    # ONLY v1.0.2 should be fetched
    assert len(client.get_manifest_calls) == 1
    assert client.get_manifest_calls[0] == "https://manifest/v1.0.2"

    assert prevalidate_release_candidate(releases[0]) is None
    assert prevalidate_release_candidate(releases[1]) is None
    assert prevalidate_release_candidate(releases[2]) is None
    assert prevalidate_release_candidate(releases[3]) is None
    assert prevalidate_release_candidate(releases[4]) is not None
