from __future__ import annotations

import zipfile
from pathlib import Path

import pytest

from scripts.check_backend_archive_parity import (
    BackendArchiveParityError,
    check_backend_archive_parity,
)


ARCHIVE_ROOT = "Decky-SteamAchievements"


def write_source_tree(project_root: Path) -> None:
    backend = project_root / "backend"
    (backend / "updater").mkdir(parents=True)
    (backend / "__init__.py").write_text("", encoding="utf-8")
    (backend / "updater/models.py").write_text("VALUE = 1\n", encoding="utf-8")


def write_archive(path: Path, modules: list[str]) -> None:
    prefix = f"{ARCHIVE_ROOT}/py_modules/backend/"
    with zipfile.ZipFile(path, "w") as archive:
        for module in modules:
            archive.writestr(prefix + module, b"fixture\n")


def test_backend_archive_parity_accepts_complete_mapping(tmp_path: Path) -> None:
    write_source_tree(tmp_path)
    archive = tmp_path / "plugin.zip"
    write_archive(archive, ["__init__.py", "updater/models.py"])

    check_backend_archive_parity(archive, project_root=tmp_path)


def test_backend_archive_parity_rejects_missing_module(tmp_path: Path) -> None:
    write_source_tree(tmp_path)
    archive = tmp_path / "plugin.zip"
    write_archive(archive, ["__init__.py"])

    with pytest.raises(BackendArchiveParityError, match="missing.*updater/models[.]py"):
        check_backend_archive_parity(archive, project_root=tmp_path)


def test_backend_archive_parity_rejects_extra_module(tmp_path: Path) -> None:
    write_source_tree(tmp_path)
    archive = tmp_path / "plugin.zip"
    write_archive(
        archive,
        ["__init__.py", "updater/models.py", "updater/obsolete.py"],
    )

    with pytest.raises(BackendArchiveParityError, match="extra.*updater/obsolete[.]py"):
        check_backend_archive_parity(archive, project_root=tmp_path)


def test_backend_archive_parity_rejects_duplicate_module(tmp_path: Path) -> None:
    write_source_tree(tmp_path)
    archive = tmp_path / "plugin.zip"
    with pytest.warns(UserWarning, match="Duplicate name"):
        write_archive(archive, ["__init__.py", "updater/models.py", "updater/models.py"])

    with pytest.raises(BackendArchiveParityError, match="duplicate.*updater/models[.]py"):
        check_backend_archive_parity(archive, project_root=tmp_path)
