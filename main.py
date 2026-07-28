"""Decky-SteamAchievements backend.

The restoration is entirely frontend (re-render Valve's own MiniAchievements
component by supplying the onSeek prop its guard requires). This backend is a
minimal Decky entrypoint kept for lifecycle hooks and future settings storage.
"""

from __future__ import annotations

import json
import logging
import os
import threading
from pathlib import Path
from typing import Any

import decky  # injected by decky-loader at runtime

DEFAULT_SETTINGS = {"feature_enabled": True, "debug_logging": False}


def _normalize_settings(value: Any) -> dict[str, bool]:
    data = value if isinstance(value, dict) else {}
    return {
        key: data[key] if isinstance(data.get(key), bool) else default
        for key, default in DEFAULT_SETTINGS.items()
    }


def _read_settings(path: Path) -> dict[str, bool]:
    try:
        return _normalize_settings(json.loads(path.read_text(encoding="utf-8")))
    except (OSError, ValueError, TypeError):
        return dict(DEFAULT_SETTINGS)


def _write_settings(path: Path, settings: dict[str, bool]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    try:
        temporary.write_text(
            f"{json.dumps(_normalize_settings(settings), indent=2)}\n",
            encoding="utf-8",
        )
        os.replace(temporary, path)
    finally:
        try:
            temporary.unlink(missing_ok=True)
        except OSError:
            pass


def _read_version_file(path: Path) -> str:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        value = data.get("version") if isinstance(data, dict) else None
        return value.strip() if isinstance(value, str) else ""
    except (OSError, ValueError, TypeError):
        return ""


def _resolve_plugin_version(root: Path | None = None) -> str:
    plugin_root = root or Path(__file__).resolve().parent
    for filename in ("plugin.json", "package.json"):
        version = _read_version_file(plugin_root / filename)
        if version:
            return version
    return ""


def _resolve_decky_version() -> str:
    value = getattr(decky, "DECKY_VERSION", None)
    if isinstance(value, str) and value.strip():
        return value.strip()
    return os.environ.get("DECKY_VERSION", "").strip()


def _parse_os_release_field(text: str, key: str) -> str:
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        name, _, value = line.partition("=")
        if name.strip() != key:
            continue
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        return value.strip()
    return ""


def _read_steamos_version(path: Path = Path("/etc/os-release")) -> str:
    try:
        return _parse_os_release_field(
            path.read_text(encoding="utf-8", errors="replace"), "VERSION_ID"
        )
    except OSError:
        return ""


class Plugin:
    def __init__(self) -> None:
        settings_dir = Path(str(getattr(decky, "DECKY_PLUGIN_SETTINGS_DIR", ".")))
        self._settings_path = settings_dir / "settings.json"
        self._settings_lock = threading.RLock()

    def _load_settings(self) -> dict[str, bool]:
        with self._settings_lock:
            return _read_settings(self._settings_path)

    def _save_setting(self, key: str, enabled: bool) -> dict[str, bool]:
        if not isinstance(enabled, bool):
            raise TypeError(f"{key} must be a boolean")
        with self._settings_lock:
            settings = _read_settings(self._settings_path)
            settings[key] = enabled
            _write_settings(self._settings_path, settings)
            return settings

    @staticmethod
    def _apply_debug_logging(enabled: bool) -> None:
        decky.logger.setLevel(logging.DEBUG if enabled else logging.INFO)

    async def _main(self) -> None:
        self._apply_debug_logging(self._load_settings()["debug_logging"])
        decky.logger.info("Decky-SteamAchievements: backend started")

    async def _unload(self) -> None:
        decky.logger.info("Decky-SteamAchievements: backend unloaded")

    async def _uninstall(self) -> None:
        decky.logger.info("Decky-SteamAchievements: uninstalled")

    async def get_settings(self) -> dict[str, bool]:
        settings = self._load_settings()
        self._apply_debug_logging(settings["debug_logging"])
        return settings

    async def set_feature_enabled(self, enabled: bool) -> dict[str, bool]:
        return self._save_setting("feature_enabled", enabled)

    async def set_debug_logging(self, enabled: bool) -> dict[str, bool]:
        settings = self._save_setting("debug_logging", enabled)
        self._apply_debug_logging(settings["debug_logging"])
        return settings

    async def get_versions(self) -> dict[str, str]:
        return {
            "plugin": _resolve_plugin_version(),
            "decky": _resolve_decky_version(),
            "steamos": _read_steamos_version(),
        }
