from __future__ import annotations

import datetime
import threading
import time

from backend.updater.service import PluginUpdater
from backend.updater.models import JsonResponse


class MockClient:
    def __init__(self, fetch_fn=None):
        self._fetch = fetch_fn

    def list_releases(self):
        if self._fetch:
            return self._fetch("releases")
        return JsonResponse(status=200, headers={}, body=[])

    def get_release(self, tag):
        if self._fetch:
            return self._fetch(tag)
        return JsonResponse(status=200, headers={}, body={})

    def get_manifest(self, url):
        if self._fetch:
            return self._fetch(url)
        return JsonResponse(status=200, headers={}, body={})


def create_updater(
    client=None, version="0.2.0", now=None, log_cb=None, save_cb=None
) -> PluginUpdater:
    if now is None:

        def _now():
            return datetime.datetime.now(datetime.timezone.utc)

        now = _now
    if client is None:
        client = MockClient()
    if log_cb is None:

        def _log(lvl, msg):
            pass

        log_cb = _log
    if save_cb is None:

        def _save():
            pass

        save_cb = _save

    return PluginUpdater(
        state_lock=threading.RLock(),
        save_callback=save_cb,
        log_callback=log_cb,
        release_client=client,
        version_resolver=lambda: version,
        now=now,
        monotonic=time.monotonic,
    )


def test_updater_service_settings_defaults() -> None:
    updater = create_updater()
    updater.load_state({}, {})
    payload = updater.settings_payload()
    assert payload["update_channel"] == "stable"
    assert payload["automatic_update_checks"] is True
    assert updater.cache_payload().get("update_check_cache", {}) == {}


def test_updater_service_channel_normalization() -> None:
    updater = create_updater()
    updater.load_state({"update_channel": "invalid"}, {})
    assert updater.settings_payload()["update_channel"] == "stable"


def test_updater_service_set_methods() -> None:
    updater = create_updater()
    updater.load_state({}, {})
    updater.set_channel("development")
    assert updater.settings_payload()["update_channel"] == "development"
    updater.set_automatic_checks(False)
    assert updater.settings_payload()["automatic_update_checks"] is False


def test_pending_update_install_reconciliation() -> None:
    updater = create_updater()
    updater.load_state({}, {})

    pending = {
        "version": "0.2.2-dev.g456",
        "tag": "v0.2.2-dev.g456",
        "channel": "development",
        "published_at": "2026-05-30T12:00:00Z",
        "requested_at": "2026-05-30T12:01:00Z",
    }
    updater._cache["pending_update_install"] = pending

    updater.reconcile_pending_install("0.2.2-dev.g456")
    assert updater._cache.get("installed_release_tag") == "v0.2.2-dev.g456"
    assert updater._cache.get("installed_release_published_at") == "2026-05-30T12:00:00Z"
    assert updater._cache.get("pending_update_install") is None

    updater._cache["pending_update_install"] = pending
    updater.reconcile_pending_install("0.2.1")
    assert updater._cache.get("pending_update_install") is None
    assert updater._cache.get("installed_release_tag") == "v0.2.2-dev.g456"


def test_transient_rate_limit_properties() -> None:
    future_time = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=1)

    updater1 = create_updater()
    updater1.load_state({}, {})
    updater1._rate_limited_until = future_time

    payload = updater1.cache_payload()

    updater2 = create_updater()
    updater2.load_state({}, payload)
    assert updater2._rate_limited_until is None


def test_record_update_install_requested_preserves_metadata() -> None:
    updater = create_updater(version="0.2.1")
    updater.load_state({}, {})

    candidate = {
        "version": "0.2.2-dev.g456",
        "tag": "v0.2.2-dev.g456",
        "channel": "development",
        "published_at": "2026-05-30T12:00:00Z",
        "action": "update",
    }

    ctx = updater.record_install_requested(candidate)
    assert ctx["pending_update_install"] is not None
    assert ctx["pending_update_install"]["version"] == "0.2.2-dev.g456"

    ctx2 = updater.get_context()
    assert ctx2["pending_update_install"] is not None
    assert ctx2["pending_update_install"]["version"] == "0.2.2-dev.g456"
    assert ctx2["effective_installed_version"] == "0.2.2-dev.g456"

    ctx_confirmed = updater.confirm_install_handoff("0.2.2-dev.g456")
    assert ctx_confirmed["pending_update_install"]["handoff_confirmed_at"] is not None
    assert ctx_confirmed["effective_installed_version"] == "0.2.2-dev.g456"

    updater.reconcile_pending_install("0.2.1")
    ctx3 = updater.get_context()
    assert ctx3["pending_update_install"] is not None
    assert ctx3["pending_update_install"]["version"] == "0.2.2-dev.g456"
    assert ctx3["effective_installed_version"] == "0.2.2-dev.g456"


def test_update_context_uses_pending_install_as_effective_version() -> None:
    updater = create_updater(version="0.2.3")
    updater.load_state({}, {})

    updater._cache["pending_update_install"] = {
        "version": "0.2.4",
        "tag": "v0.2.4",
        "channel": "stable",
        "published_at": "2026-06-02T12:00:00Z",
        "requested_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "handoff_confirmed_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    }

    ctx = updater.get_context()
    assert ctx["installed_version"] == "0.2.3"
    assert ctx["effective_installed_version"] == "0.2.4"


def test_confirmed_pending_install_freshness_uses_confirmation_time() -> None:
    updater = create_updater(version="0.2.3")
    updater.load_state({}, {})

    old_requested_at = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(hours=1)
    fresh_confirmed_at = datetime.datetime.now(datetime.timezone.utc)

    updater._cache["pending_update_install"] = {
        "version": "0.2.4",
        "tag": "v0.2.4",
        "channel": "stable",
        "published_at": "2026-06-02T12:00:00Z",
        "requested_at": old_requested_at.isoformat(),
        "handoff_confirmed_at": fresh_confirmed_at.isoformat(),
    }

    ctx = updater.get_context()
    updater.reconcile_pending_install("0.2.3")
    assert ctx["effective_installed_version"] == "0.2.4"
    assert updater._cache["pending_update_install"]["version"] == "0.2.4"


def test_unconfirmed_pending_install_becomes_effective_version() -> None:
    updater = create_updater(version="0.2.3")
    updater.load_state({}, {})
    updater._cache["pending_update_install"] = {
        "version": "0.2.4",
        "tag": "v0.2.4",
        "channel": "stable",
        "published_at": "2026-06-02T12:00:00Z",
        "requested_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    }
    ctx = updater.get_context()
    assert ctx["installed_version"] == "0.2.3"
    assert ctx["effective_installed_version"] == "0.2.4"


def test_clear_pending_update_install_removes_failed_handoff_metadata() -> None:
    updater = create_updater()
    updater.load_state({}, {})
    updater._cache["pending_update_install"] = {
        "version": "0.2.4",
        "requested_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    }
    ctx = updater.clear_pending_install("0.2.4")
    assert ctx["pending_update_install"] is None


def test_fresh_confirmed_pending_update_install_survives_startup_mismatch() -> None:
    updater = create_updater()
    updater.load_state({}, {})
    updater._cache["pending_update_install"] = {
        "version": "0.2.4",
        "tag": "v0.2.4",
        "channel": "stable",
        "published_at": "2026-06-02T12:00:00Z",
        "requested_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "handoff_confirmed_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    }
    updater.reconcile_pending_install("0.2.3")
    assert updater._cache["pending_update_install"]["version"] == "0.2.4"
    assert updater._cache.get("installed_release_tag") is None


def test_revalidate_plugin_update_respects_rate_limit() -> None:
    fetch_called = False

    def mock_fetch(url):
        nonlocal fetch_called
        fetch_called = True
        raise RuntimeError("Should not be called")

    updater = create_updater(client=MockClient(mock_fetch))
    updater.load_state({}, {})

    future_time = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=1)
    updater._rate_limited_until = future_time

    candidate = {
        "version": "0.2.1",
        "tag": "v0.2.1",
        "channel": "stable",
        "artifact_url": "https://zip-url",
        "sha256": "a" * 64,
    }

    res = updater.revalidate(candidate)
    assert not fetch_called
    assert res["status"] == "failed"
    assert "Rate limit cooldown active" in res["message"]
    assert res["retry_after"] == future_time.isoformat()


def test_revalidate_plugin_update_records_rate_limit() -> None:
    def mock_fetch(url):
        return JsonResponse(
            status=403,
            headers={"retry-after": "120", "x-ratelimit-remaining": "0"},
            body={"message": "API rate limit exceeded"},
        )

    updater = create_updater(client=MockClient(mock_fetch))
    updater.load_state({}, {})

    candidate = {
        "version": "0.2.1",
        "tag": "v0.2.1",
        "channel": "stable",
        "artifact_url": "https://zip-url",
        "sha256": "a" * 64,
    }

    res = updater.revalidate(candidate)
    assert res["status"] == "failed"
    assert "rate limit exceeded" in res["message"].lower()
    assert res["retry_after"] is not None
    assert updater._rate_limited_until is not None


def test_revalidate_plugin_update_does_not_hold_lock_during_fetch() -> None:
    lock_held_during_fetch = None
    state_lock = threading.RLock()

    def mock_fetch(url):
        nonlocal lock_held_during_fetch

        def try_acquire():
            nonlocal lock_held_during_fetch
            lock_held_during_fetch = not state_lock.acquire(blocking=False)
            if not lock_held_during_fetch:
                state_lock.release()

        t = threading.Thread(target=try_acquire)
        t.start()
        t.join()

        if "manifest" in url:
            return JsonResponse(
                status=200,
                headers={},
                body={
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
                },
            )

        return JsonResponse(
            status=200,
            headers={},
            body={
                "tag_name": "v0.2.1",
                "assets": [
                    {"name": "Decky-SteamAchievements.zip", "browser_download_url": "https://zip-url"},
                    {
                        "name": "Decky-SteamAchievements-v0.2.1.manifest.json",
                        "browser_download_url": "https://manifest-url",
                    },
                ],
            },
        )

    updater = create_updater(client=MockClient(mock_fetch))
    updater._state_lock = state_lock
    updater.load_state({}, {})

    candidate = {
        "version": "0.2.1",
        "tag": "v0.2.1",
        "channel": "stable",
        "artifact_url": "https://zip-url",
        "sha256": "a" * 64,
    }

    updater.revalidate(candidate)
    assert lock_held_during_fetch is False


def test_updater_backend_logging_and_privacy() -> None:
    logged = []

    def mock_log(level, msg):
        logged.append((level, msg))

    manifest = {
        "schemaVersion": 1,
        "pluginName": "Achievements Restored",
        "packageName": "decky-steamachievements",
        "version": "0.2.1",
        "sourceVersion": "0.2.1",
        "tag": "v0.2.1",
        "channel": "stable",
        "assetName": "Decky-SteamAchievements.zip",
        "sha256": "f" * 64,
        "generatedAt": "2026-05-30T12:00:00Z",
    }
    releases = [
        {
            "draft": False,
            "prerelease": False,
            "tag_name": "v0.2.1",
            "html_url": "https://release-url",
            "published_at": "2026-05-30T12:00:00Z",
            "assets": [
                {
                    "name": "Decky-SteamAchievements-v0.2.1.manifest.json",
                    "browser_download_url": "https://manifest-url",
                },
                {"name": "Decky-SteamAchievements.zip", "browser_download_url": "https://zip-url"},
            ],
        }
    ]

    def mock_fetch(url):
        if "manifest" in url:
            return JsonResponse(status=200, headers={}, body=manifest)
        if url == "releases":
            return JsonResponse(status=200, headers={}, body=releases)
        return JsonResponse(status=200, headers={}, body=releases[0])

    updater = create_updater(client=MockClient(mock_fetch), log_cb=mock_log)
    updater.load_state({}, {})

    res = updater.check_for_update("0.2.0", force=True)
    assert res["status"] == "available"

    # Verify privacy and logging
    for level, msg in logged:
        assert "f" * 64 not in msg
        assert "a" * 64 not in msg

    logged.clear()

    # Validation failure
    def mock_fetch_draft(url):
        return JsonResponse(status=200, headers={}, body={"draft": True})

    updater_fail = create_updater(client=MockClient(mock_fetch_draft), log_cb=mock_log)
    updater_fail.load_state({}, {})
    candidate = {
        "version": "0.2.1",
        "tag": "v0.2.1",
        "channel": "stable",
        "artifact_url": "https://zip-url",
        "sha256": "f" * 64,
    }

    res = updater_fail.revalidate(candidate)
    assert res["status"] == "failed"
    assert any(
        "validation failed during revalidation" in m.lower() and "elapsed_ms" in m
        for _, m in logged
    )


def test_record_update_install_requested_returns_immediate_effective_version() -> None:
    updater = create_updater(version="0.2.2-dev.g123")
    updater.load_state({}, {})

    candidate = {
        "version": "0.2.3",
        "tag": "v0.2.3",
        "channel": "stable",
        "published_at": "2026-06-04T12:00:00Z",
        "action": "move_to_stable",
    }

    ctx = updater.record_install_requested(candidate)
    assert ctx["effective_installed_version"] == "0.2.3"
    assert ctx["installed_version"] == "0.2.2-dev.g123"


def test_unconfirmed_pending_install_ttl() -> None:
    updater = create_updater(version="0.2.2-dev.g123")
    updater.load_state({}, {})

    candidate = {
        "version": "0.2.3",
        "tag": "v0.2.3",
        "channel": "stable",
        "published_at": "2026-06-04T12:00:00Z",
        "action": "move_to_stable",
    }

    updater.record_install_requested(candidate)
    ctx = updater.get_context()
    assert ctx["effective_installed_version"] == "0.2.3"

    stale_time = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(minutes=20)
    updater._cache["pending_update_install"]["requested_at"] = stale_time.isoformat()

    ctx_stale = updater.get_context()
    assert ctx_stale["effective_installed_version"] == "0.2.2-dev.g123"


def test_reconcile_promotion_stable_equivalents() -> None:
    updater = create_updater()
    updater.load_state({}, {})

    def set_pending():
        updater._cache["pending_update_install"] = {
            "version": "0.2.3",
            "tag": "v0.2.3",
            "channel": "stable",
            "published_at": "2026-06-04T12:00:00Z",
            "requested_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        }

    set_pending()
    updater.reconcile_pending_install("0.2.3")
    assert updater._cache.get("installed_release_tag") == "v0.2.3"
    assert updater._cache.get("pending_update_install") is None

    set_pending()
    updater.reconcile_pending_install("0.2.3+metadata")
    assert updater._cache.get("installed_release_tag") == "v0.2.3"

    set_pending()
    updater._cache["pending_update_install"]["tag"] = "v0.2.3-new"
    updater._cache.pop("installed_release_tag", None)
    updater.reconcile_pending_install("0.2.3-dev.gabcdef")
    assert updater._cache.get("installed_release_tag") is None
    assert updater._cache.get("pending_update_install") is not None


def test_check_for_plugin_update_pending_fast_path() -> None:
    updater = create_updater(version="0.2.0")
    updater.load_state({}, {})

    candidate = {
        "version": "0.2.1-dev.g123",
        "tag": "v0.2.1-dev.g123",
        "channel": "development",
        "published_at": "2026-06-04T12:00:00Z",
        "action": "install",
    }

    updater.record_install_requested(candidate)

    # check_for_update called with fast path
    res = updater.check_for_update("0.2.1-dev.g123", force=True)
    assert res["status"] == "current"
