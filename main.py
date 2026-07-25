"""Achievements Restored — Decky backend.

The restoration is entirely frontend (re-render Valve's own MiniAchievements
component by supplying the onSeek prop its guard requires). This backend is a
minimal Decky entrypoint kept for lifecycle hooks and future settings storage.
"""

from __future__ import annotations

import decky  # injected by decky-loader at runtime


class Plugin:
    async def _main(self) -> None:
        decky.logger.info("Achievements Restored: backend started")

    async def _unload(self) -> None:
        decky.logger.info("Achievements Restored: backend unloaded")

    async def _uninstall(self) -> None:
        decky.logger.info("Achievements Restored: uninstalled")
