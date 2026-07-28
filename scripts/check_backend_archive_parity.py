#!/usr/bin/env python3
from __future__ import annotations

import argparse
import sys
import zipfile
from collections import Counter
from pathlib import Path


DEFAULT_ARCHIVE_ROOT = "Decky-SteamAchievements"


class BackendArchiveParityError(ValueError):
    pass


def _display_paths(paths: list[str]) -> str:
    return ", ".join(paths)


def check_backend_archive_parity(
    zip_path: Path,
    *,
    project_root: Path,
    expected_root: str = DEFAULT_ARCHIVE_ROOT,
) -> None:
    backend_root = project_root / "backend"
    if not backend_root.is_dir():
        raise BackendArchiveParityError(
            f"repository backend source directory does not exist: {backend_root}"
        )
    if not zip_path.is_file():
        raise BackendArchiveParityError(f"ZIP file does not exist: {zip_path}")

    source_modules = sorted(
        path.relative_to(backend_root).as_posix()
        for path in backend_root.rglob("*.py")
        if path.is_file()
    )
    archive_prefix = f"{expected_root}/py_modules/backend/"

    try:
        with zipfile.ZipFile(zip_path, "r") as archive:
            archive_modules = [
                info.filename[len(archive_prefix) :]
                for info in archive.infolist()
                if not info.is_dir()
                and info.filename.startswith(archive_prefix)
                and info.filename.endswith(".py")
            ]
    except zipfile.BadZipFile as exc:
        raise BackendArchiveParityError(f"bad ZIP file: {zip_path}") from exc
    except OSError as exc:
        raise BackendArchiveParityError(f"cannot read ZIP file {zip_path}: {exc}") from exc

    source_set = set(source_modules)
    archive_counts = Counter(archive_modules)
    archive_set = set(archive_counts)
    missing = sorted(source_set - archive_set)
    extra = sorted(archive_set - source_set)
    duplicates = sorted(path for path, count in archive_counts.items() if count != 1)

    problems = []
    if missing:
        problems.append(f"missing modules: {_display_paths(missing)}")
    if extra:
        problems.append(f"extra modules: {_display_paths(extra)}")
    if duplicates:
        problems.append(f"duplicate modules: {_display_paths(duplicates)}")
    if problems:
        raise BackendArchiveParityError(
            "backend source/archive parity mismatch; " + "; ".join(problems)
        )


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Compare repository backend Python sources with packaged modules."
    )
    parser.add_argument("zip_path", type=Path, help="Plugin ZIP to inspect.")
    parser.add_argument(
        "--project-root",
        type=Path,
        default=Path.cwd(),
        help="Repository root containing backend/ (defaults to the current directory).",
    )
    parser.add_argument(
        "--expected-root",
        default=DEFAULT_ARCHIVE_ROOT,
        help="Expected canonical archive root / installed directory.",
    )
    args = parser.parse_args()

    try:
        check_backend_archive_parity(
            args.zip_path,
            project_root=args.project_root.resolve(),
            expected_root=args.expected_root,
        )
    except BackendArchiveParityError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1

    print("Success: packaged backend modules match repository sources exactly!")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
