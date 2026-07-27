#!/usr/bin/env bash
set -euo pipefail

installer_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
cd "$installer_dir"

zip -q -9 -r -FS \
  "Achievements Restored Installer.zip" \
  "Install Achievements Restored.desktop" \
  DeckyPluginInstaller

printf 'Built %s\n' "$installer_dir/Achievements Restored Installer.zip"
