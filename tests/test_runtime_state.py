from __future__ import annotations

import json
import threading
from pathlib import Path

import pytest

from backend.runtime_state import RuntimeStateStore, StateLockTimeoutError


def test_malformed_or_missing_state_fails_closed(tmp_path: Path) -> None:
    store = RuntimeStateStore(tmp_path / "updater-state.json")
    assert store.load() == {"update_check_cache": {}}
    store.path.write_text("not json", encoding="utf-8")
    assert store.load() == {"update_check_cache": {}}


def test_save_is_atomic_and_cleans_temp(tmp_path: Path) -> None:
    store = RuntimeStateStore(tmp_path / "updater-state.json")
    payload = {"update_check_cache": {"last_notified_tag": "v1.0.0"}}
    store.save(payload)
    assert json.loads(store.path.read_text()) == payload
    assert list(tmp_path.glob("*.tmp")) == []


def test_cross_holder_exclusion_is_bounded(tmp_path: Path, monkeypatch) -> None:
    import backend.runtime_state as runtime_state

    monkeypatch.setattr(runtime_state, "LOCK_ACQUIRE_TIMEOUT_SECONDS", 0.05)
    monkeypatch.setattr(runtime_state, "LOCK_RETRY_INTERVAL_SECONDS", 0.005)
    first = RuntimeStateStore(tmp_path / "updater-state.json")
    second = RuntimeStateStore(tmp_path / "updater-state.json")
    observed = []

    with first.locked():
        thread = threading.Thread(
            target=lambda: observed.append(pytest.raises(StateLockTimeoutError, second.load)),
        )
        thread.start()
        thread.join(timeout=1)

    assert not thread.is_alive()
    assert len(observed) == 1
