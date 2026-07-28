from __future__ import annotations

import fcntl
import json
import logging
import os
import threading
import time
from pathlib import Path
from typing import Any

LOGGER = logging.getLogger("decky_steamachievements.runtime_state")

LOCK_ACQUIRE_TIMEOUT_SECONDS = 5.0
LOCK_RETRY_INTERVAL_SECONDS = 0.05


class StateLockTimeoutError(RuntimeError):
    pass


class _InterProcessLock:
    def __init__(self, path: Path) -> None:
        self.path = path
        self._thread_lock = threading.RLock()
        self._depth = 0
        self._fd: int | None = None

    def __enter__(self) -> "_InterProcessLock":
        self._thread_lock.acquire()
        self._depth += 1
        if self._depth == 1:
            try:
                self._fd = self._acquire_file_lock()
            except BaseException:
                self._depth -= 1
                self._thread_lock.release()
                raise
        return self

    def __exit__(self, *_exc_info: object) -> None:
        if self._depth == 1 and self._fd is not None:
            try:
                fcntl.flock(self._fd, fcntl.LOCK_UN)
                os.close(self._fd)
            except OSError as exc:
                LOGGER.warning("Failed to release updater state lock at %s: %s", self.path, exc)
            self._fd = None
        self._depth -= 1
        self._thread_lock.release()

    def _acquire_file_lock(self) -> int:
        try:
            self.path.parent.mkdir(parents=True, mode=0o700, exist_ok=True)
            fd = os.open(self.path, os.O_CREAT | os.O_RDWR, 0o600)
        except OSError as exc:
            raise StateLockTimeoutError(f"Updater state lock unavailable at {self.path}: {exc}")

        deadline = time.monotonic() + LOCK_ACQUIRE_TIMEOUT_SECONDS
        while True:
            try:
                fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
                return fd
            except OSError:
                if time.monotonic() >= deadline:
                    os.close(fd)
                    raise StateLockTimeoutError(
                        f"Timed out acquiring updater state lock at {self.path}"
                    )
                time.sleep(LOCK_RETRY_INTERVAL_SECONDS)


class RuntimeStateStore:
    def __init__(self, path: Path) -> None:
        self.path = path
        self._lock = _InterProcessLock(path.with_name(".updater-state.lock"))

    def locked(self) -> _InterProcessLock:
        return self._lock

    def load(self) -> dict[str, Any]:
        with self._lock:
            return self._load_locked()

    def _load_locked(self) -> dict[str, Any]:
        try:
            payload = json.loads(self.path.read_text(encoding="utf-8"))
        except (OSError, ValueError, TypeError):
            return {"update_check_cache": {}}
        if not isinstance(payload, dict):
            return {"update_check_cache": {}}
        cache = payload.get("update_check_cache")
        return {"update_check_cache": dict(cache) if isinstance(cache, dict) else {}}

    def save(self, payload: dict[str, object]) -> None:
        with self._lock:
            self._save_locked(payload)

    def _save_locked(self, payload: dict[str, object]) -> None:
        self.path.parent.mkdir(parents=True, mode=0o700, exist_ok=True)
        temporary = self.path.with_name(f".{self.path.name}.{os.getpid()}.tmp")
        try:
            temporary.write_text(
                f"{json.dumps(payload, indent=2, sort_keys=True)}\n",
                encoding="utf-8",
            )
            os.replace(temporary, self.path)
        finally:
            try:
                temporary.unlink(missing_ok=True)
            except OSError:
                pass
