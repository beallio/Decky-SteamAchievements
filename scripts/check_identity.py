#!/usr/bin/env python3
"""Enforce canonical product identity outside the deliberately different QAM title."""

from __future__ import annotations

import argparse
import json
import subprocess
from pathlib import Path

CANONICAL = "Decky-SteamAchievements"
PACKAGE_NAME = "decky-steamachievements"
QAM_TITLE = "Achievements Restored"


def tracked_files(root: Path) -> list[Path]:
    result = subprocess.run(
        ["git", "-C", str(root), "ls-files", "-z"],
        check=False,
        capture_output=True,
    )
    if result.returncode == 0:
        return [root / item.decode() for item in result.stdout.split(b"\0") if item]
    return [
        path
        for path in root.rglob("*")
        if path.is_file() and not {".git", "node_modules"}.intersection(path.parts)
    ]


def check(root: Path) -> list[str]:
    errors: list[str] = []
    plugin = json.loads((root / "plugin.json").read_text(encoding="utf-8"))
    package = json.loads((root / "package.json").read_text(encoding="utf-8"))
    lock = json.loads((root / "package-lock.json").read_text(encoding="utf-8"))
    if plugin.get("name") != CANONICAL:
        errors.append(f"plugin.json name must be {CANONICAL!r}")
    if package.get("name") != PACKAGE_NAME:
        errors.append(f"package.json name must be {PACKAGE_NAME!r}")
    if lock.get("name") != PACKAGE_NAME or lock.get("packages", {}).get("", {}).get("name") != PACKAGE_NAME:
        errors.append("package-lock.json root package names must match package.json")

    index = (root / "src" / "index.tsx").read_text(encoding="utf-8")
    if f'const PLUGIN_NAME = "{CANONICAL}";' not in index:
        errors.append("definePlugin registration constant must use the canonical name")
    if index.count(f'const QAM_TITLE = "{QAM_TITLE}";') != 1:
        errors.append("src/index.tsx must declare exactly one QAM title constant")
    if "name: PLUGIN_NAME" not in index or "{QAM_TITLE}</div>" not in index:
        errors.append("definePlugin name and titleView must use their distinct constants")

    for path in tracked_files(root):
        try:
            text = path.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError):
            continue
        relative = path.relative_to(root)
        for number, line in enumerate(text.splitlines(), 1):
            if QAM_TITLE not in line:
                continue
            if relative == Path("src/index.tsx") and line.strip() == f'const QAM_TITLE = "{QAM_TITLE}";':
                continue
            if relative.suffix.lower() == ".md" and "qam" in line.lower():
                continue
            errors.append(f"{relative}:{number}: old product title is allowed only as the QAM title")

    expected = [
        root / "installer" / "Decky-SteamAchievements Installer.zip",
        root / "installer" / "Install Decky-SteamAchievements.desktop",
        root / "installer" / "Decky-SteamAchievementsInstaller" / "install_decky_plugin.py",
    ]
    for path in expected:
        if not path.is_file():
            errors.append(f"missing canonical installer artifact: {path.relative_to(root)}")
    for path in (root / "installer").iterdir():
        if QAM_TITLE in path.name or "DeckyPluginInstaller" in path.name:
            errors.append(f"obsolete installer path remains: {path.relative_to(root)}")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    args = parser.parse_args()
    errors = check(args.root.resolve())
    if errors:
        for error in errors:
            print(f"identity error: {error}")
        return 1
    print("identity: OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
