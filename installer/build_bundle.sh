#!/usr/bin/env bash
set -euo pipefail

installer_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
cd "$installer_dir"

zip -q -9 -r -FS \
  "Decky-SteamAchievements Installer.zip" \
  "Install Decky-SteamAchievements.desktop" \
  Decky-SteamAchievementsInstaller

printf 'Built %s\n' "$installer_dir/Decky-SteamAchievements Installer.zip"
