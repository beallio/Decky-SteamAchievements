from __future__ import annotations

import json
import zipfile
from pathlib import Path

import pytest

from scripts.validate_plugin_zip import ValidationError, validate_archive


def build_archive(
    path: Path,
    extra: dict[str, bytes],
    *,
    include_backend: bool = True,
) -> None:
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
        **(
            {
                "py_modules/backend/__init__.py": b"",
                "py_modules/backend/updater/models.py": b"VALUE = 1\n",
            }
            if include_backend
            else {}
        ),
        **extra,
    }
    with zipfile.ZipFile(path, "w") as archive:
        for name, value in entries.items():
            archive.writestr(root + name, value)


def test_validator_allows_recursive_backend_python_sources(tmp_path: Path) -> None:
    archive = tmp_path / "plugin.zip"
    build_archive(archive, {})
    validate_archive(
        archive,
        expected_root="Decky-SteamAchievements",
        expected_name="Achievements Restored",
        expected_version="0.1.1",
    )


def test_validator_rejects_root_backend_python_sources(tmp_path: Path) -> None:
    archive = tmp_path / "plugin.zip"
    build_archive(
        archive,
        {
            "backend/__init__.py": b"",
            "backend/updater/models.py": b"VALUE = 1\n",
        },
        include_backend=False,
    )
    with pytest.raises(ValidationError, match="root backend"):
        validate_archive(
            archive,
            expected_root="Decky-SteamAchievements",
            expected_name="Achievements Restored",
            expected_version="0.1.1",
        )


def test_validator_requires_backend_package_initializer(tmp_path: Path) -> None:
    archive = tmp_path / "plugin.zip"
    build_archive(
        archive,
        {"py_modules/backend/updater/models.py": b"VALUE = 1\n"},
        include_backend=False,
    )
    with pytest.raises(ValidationError, match="py_modules/backend/__init__[.]py"):
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
        "py_modules/backend/updater/models.pyc",
        "py_modules/backend/updater/models.pyo",
        "py_modules/backend/updater/__pycache__/marker.py",
        "py_modules/backend/updater/secret.json",
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
