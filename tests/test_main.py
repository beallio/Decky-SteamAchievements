from __future__ import annotations

import importlib.util
import asyncio
import json
import logging
import sys
import types
from pathlib import Path

import pytest


@pytest.fixture()
def plugin_module(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    logger = logging.getLogger(f"achievements-restored-test-{id(tmp_path)}")
    logger.setLevel(logging.INFO)
    decky = types.SimpleNamespace(
        logger=logger,
        DECKY_PLUGIN_SETTINGS_DIR=str(tmp_path / "settings"),
        DECKY_VERSION="v3.2.6",
    )
    monkeypatch.setitem(sys.modules, "decky", decky)
    spec = importlib.util.spec_from_file_location(
        f"achievements_restored_main_{id(tmp_path)}",
        Path(__file__).parents[1] / "main.py",
    )
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module, decky


def test_settings_defaults_and_persistence(plugin_module, tmp_path: Path):
    module, _decky = plugin_module
    plugin = module.Plugin()

    assert asyncio.run(plugin.get_settings()) == {
        "feature_enabled": True,
        "debug_logging": False,
    }

    assert asyncio.run(plugin.set_feature_enabled(False)) == {
        "feature_enabled": False,
        "debug_logging": False,
    }
    assert asyncio.run(plugin.set_debug_logging(True)) == {
        "feature_enabled": False,
        "debug_logging": True,
    }

    path = tmp_path / "settings" / "settings.json"
    assert json.loads(path.read_text(encoding="utf-8")) == {
        "feature_enabled": False,
        "debug_logging": True,
    }
    assert list(path.parent.glob("*.tmp")) == []


def test_settings_recover_from_malformed_and_invalid_values(plugin_module, tmp_path: Path):
    module, _decky = plugin_module
    path = tmp_path / "settings" / "settings.json"
    path.parent.mkdir(parents=True)
    path.write_text('{"feature_enabled": "yes", "debug_logging": 1}', encoding="utf-8")

    assert asyncio.run(module.Plugin().get_settings()) == {
        "feature_enabled": True,
        "debug_logging": False,
    }
    path.write_text("not json", encoding="utf-8")
    assert asyncio.run(module.Plugin().get_settings()) == {
        "feature_enabled": True,
        "debug_logging": False,
    }


def test_debug_setting_applies_backend_log_level(plugin_module):
    module, decky = plugin_module
    plugin = module.Plugin()

    asyncio.run(plugin.set_debug_logging(True))
    assert decky.logger.level == logging.DEBUG
    asyncio.run(plugin.set_debug_logging(False))
    assert decky.logger.level == logging.INFO


def test_os_release_parsing(plugin_module, tmp_path: Path):
    module, _decky = plugin_module
    release = tmp_path / "os-release"
    release.write_text('NAME="SteamOS"\nVERSION_ID="3.8.1"\n', encoding="utf-8")
    assert module._read_steamos_version(release) == "3.8.1"
    release.write_text("VERSION_ID=3.9\n", encoding="utf-8")
    assert module._read_steamos_version(release) == "3.9"
    release.write_text("NAME=SteamOS\n", encoding="utf-8")
    assert module._read_steamos_version(release) == ""


def test_decky_version_precedence(plugin_module, monkeypatch: pytest.MonkeyPatch):
    module, decky = plugin_module
    monkeypatch.setenv("DECKY_VERSION", "env-version")
    assert module._resolve_decky_version() == "v3.2.6"
    decky.DECKY_VERSION = ""
    assert module._resolve_decky_version() == "env-version"


def test_manifest_version_precedence_and_fallback(plugin_module, tmp_path: Path):
    module, _decky = plugin_module
    root = tmp_path / "plugin"
    root.mkdir()
    (root / "plugin.json").write_text('{"version":"1.2.3+abc"}', encoding="utf-8")
    (root / "package.json").write_text('{"version":"9.9.9"}', encoding="utf-8")
    assert module._resolve_plugin_version(root) == "1.2.3+abc"
    (root / "plugin.json").write_text("{}", encoding="utf-8")
    assert module._resolve_plugin_version(root) == "9.9.9"


def test_get_versions_is_total(plugin_module, monkeypatch: pytest.MonkeyPatch):
    module, _decky = plugin_module
    monkeypatch.setattr(module, "_resolve_plugin_version", lambda: "0.1.0+abc")
    monkeypatch.setattr(module, "_resolve_decky_version", lambda: "v3.2.6")
    monkeypatch.setattr(module, "_read_steamos_version", lambda: "3.8.1")
    assert asyncio.run(module.Plugin().get_versions()) == {
        "plugin": "0.1.0+abc",
        "decky": "v3.2.6",
        "steamos": "3.8.1",
    }
