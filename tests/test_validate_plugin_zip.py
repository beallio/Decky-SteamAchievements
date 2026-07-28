from __future__ import annotations

import json
import zipfile
from pathlib import Path

import pytest

from scripts.validate_plugin_zip import ValidationError, validate_archive


def build_archive(path: Path, extra: dict[str, bytes]) -> None:
    root = "Decky-SteamAchievements/"
    plugin = {
        "name": "Achievements Restored",
        "version": "0.1.1",
        "publish": {"image": ""},
        "flags": [],
    }
    package = {"name": "decky-steamachievements", "version": "0.1.1"}
    entries = {
        "LICENSE": b"fixture",
        "main.py": b"pass\n",
        "package.json": json.dumps(package).encode(),
        "plugin.json": json.dumps(plugin).encode(),
        "dist/index.js": b"fixture",
        **extra,
    }
    with zipfile.ZipFile(path, "w") as archive:
        for name, value in entries.items():
            archive.writestr(root + name, value)


def test_validator_allows_recursive_backend_python_sources(tmp_path: Path) -> None:
    archive = tmp_path / "plugin.zip"
    build_archive(
        archive,
        {
            "backend/__init__.py": b"",
            "backend/updater/models.py": b"VALUE = 1\n",
        },
    )
    validate_archive(
        archive,
        expected_root="Decky-SteamAchievements",
        expected_name="Achievements Restored",
        expected_version="0.1.1",
    )


@pytest.mark.parametrize(
    "forbidden",
    [
        "backend/updater/__pycache__/models.cpython-313.pyc",
        "backend/updater/secret.json",
    ],
)
def test_validator_rejects_non_source_backend_payloads(
    tmp_path: Path, forbidden: str
) -> None:
    archive = tmp_path / "plugin.zip"
    build_archive(archive, {forbidden: b"fixture"})
    with pytest.raises(ValidationError, match="forbidden"):
        validate_archive(
            archive,
            expected_root="Decky-SteamAchievements",
            expected_name="Achievements Restored",
            expected_version="0.1.1",
        )

