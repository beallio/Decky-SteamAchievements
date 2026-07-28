#!/usr/bin/env bash
set -euo pipefail

installer_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
cd "$installer_dir"
bundle="$installer_dir/Decky-SteamAchievements Installer.zip"
rm -f -- "$bundle"

zip -q -9 -r -FS \
  "$bundle" \
  "Install Decky-SteamAchievements.desktop" \
  Decky-SteamAchievementsInstaller \
  -x '*/__pycache__/*' '*.pyc'

printf 'Built %s\n' "$bundle"
