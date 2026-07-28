# Fix Decky Python module packaging

Date: 2026-07-28

Branch: `feat/fix-decky-python-module-packaging`

Artifact commit: `3bd0475`

## Failure and root cause

Decky installed package `0.1.1+667e6d5`, but every backend load failed with:

```text
ModuleNotFoundError: No module named 'backend'
```

The ZIP contained all repository `backend/**/*.py` files, but placed them under
the installed plugin root as `backend/`. Decky executes root `main.py` with
`spec_from_file_location` and adds only `<plugin>/py_modules` to Python's import
path. The source imports were correct; the distribution mapping was not.

The package script now maps repository `backend/<path>.py` to ZIP
`py_modules/backend/<path>.py`. The validator requires that runtime package,
rejects every root `backend/` entry, and permits only Python source and directory
entries inside the first-party runtime tree. The routine orchestration gate now
builds a hash-free package after the existing build/tests and validates it
against the base `package.json` version.

## Red-to-green evidence

- RED:
  `UV_CACHE_DIR=/tmp/Decky-SteamAchievements/.uv uv run --with pytest -- pytest -q tests/test_validate_plugin_zip.py`
  produced `4 failed, 4 passed`. The old validator accepted root backend Python
  sources, a missing `py_modules/backend/__init__.py`, a nested
  `__pycache__` source, and a non-Python payload under the runtime package.
  Output is retained at
  `/tmp/Decky-SteamAchievements/fix-decky-python-module-packaging-red.log`.
- GREEN: the same targeted file passed `8 passed` after the validator and
  packaging changes.
- REVIEW ROUND 01 RED:
  `UV_CACHE_DIR=/tmp/Decky-SteamAchievements/.uv uv run --with pytest -- pytest -q tests/test_check_backend_archive_parity.py tests/test_release_workflows.py`
  failed during collection because the repository-aware parity checker did not
  exist. Output is retained at
  `/tmp/Decky-SteamAchievements/fix-decky-python-module-packaging-review-01-red.log`.
- REVIEW ROUND 01 GREEN: the same targeted command passed `12 passed`. The four
  new parity cases cover complete, missing, extra, and duplicate backend-module
  mappings. Release-workflow assertions prove rolling and immutable development
  publication validate their ZIPs with the computed development version before
  publishing, while stable publication calls the preconditions script before
  publishing and that script validates the ZIP with the stable tag version.
- The first baseline gate also found that the new plan's original device-smoke
  sentence did not qualify the display identity with a Decky UI surface. The
  wording was corrected to name the Decky QAM panel without changing the plan's
  behavior or scope.

## Local verification and exact artifact

- `scripts/orchestration/run-quality-gates`: passed.
  - source metadata, identity, and installer bundle checks passed;
  - TypeScript and Rollup build passed;
  - Vitest: 8 files and 100 tests passed;
  - Pytest: 89 tests passed, including release-workflow, ZIP-validator, and
    repository-to-archive backend parity contracts;
  - hash-free package `0.1.1` passed the stricter validator;
  - the automated parity gate confirmed that the package contains every
    repository `backend/**/*.py` source exactly once, with no missing, extra,
    or duplicate first-party module;
  - review-note deletion check passed.
- `git diff --check`: passed.
- Exact device artifact version: `0.1.1+3bd0475`.
- Exact device artifact SHA-256:
  `396f69c2815dd26ad0527eaf648ebb25a45617e66c54bd65a78f255fa7724bc0`.
- Packaged and installed `dist/index.js` SHA-256:
  `b536d08168e442116af9436aae249e424f34c267911b6e107c6e9c22de87d61a`.
- Local and remote ZIP hashes matched exactly.
- The validator accepted the exact ZIP at version `0.1.1+3bd0475`.
- Source-to-archive comparison found all 10 repository backend Python modules
  exactly once, no duplicate ZIP member, and no root `backend/` member.
- Review round 01 changed only tests, the repository-aware parity checker, the
  routine quality gate, and this validation record. Package inputs and archive
  mapping did not change, so the previously installed exact device artifact and
  SHA-256 remain the acceptance artifact and no repeat Deck installation was
  performed.

The exact ZIP member list was:

```text
Decky-SteamAchievements/main.py
Decky-SteamAchievements/package.json
Decky-SteamAchievements/plugin.json
Decky-SteamAchievements/LICENSE
Decky-SteamAchievements/dist/index.js
Decky-SteamAchievements/py_modules/backend/__init__.py
Decky-SteamAchievements/py_modules/backend/rpc_pool.py
Decky-SteamAchievements/py_modules/backend/runtime_state.py
Decky-SteamAchievements/py_modules/backend/updater/__init__.py
Decky-SteamAchievements/py_modules/backend/updater/client.py
Decky-SteamAchievements/py_modules/backend/updater/discovery.py
Decky-SteamAchievements/py_modules/backend/updater/models.py
Decky-SteamAchievements/py_modules/backend/updater/pending.py
Decky-SteamAchievements/py_modules/backend/updater/rate_limit.py
Decky-SteamAchievements/py_modules/backend/updater/service.py
Decky-SteamAchievements/dist/index.js.map
```

## Steam Deck validation

- Fresh backup:
  `/home/deck/backups/Decky-SteamAchievements/device-validation-20260728T153648Z`.
  It contains the prior plugin, settings, runtime data, logs, and Downloads ZIP.
- Secondary recovery point preserved:
  `/home/deck/backups/Decky-SteamAchievements/device-validation-20260728T010300`.
- The exact validated ZIP was copied to
  `/home/deck/Downloads/Decky-SteamAchievements.zip`; its remote SHA-256 matched
  the local hash before and after installation.
- Installation used Decky's `utilities/install_plugin` RPC with the validated
  URL, display identity, version, whole-ZIP hash, and update type 2. The native
  prompt named version `0.1.1+3bd0475` and was accepted through Gaming Mode.
- Decky's installed manifest registered the Decky QAM display name `Achievements Restored`
  at `0.1.1+3bd0475`.
- The installed frontend bundle matched the packaged bundle hash exactly.
- All 10 Python modules were installed beneath
  `/home/deck/homebrew/plugins/Decky-SteamAchievements/py_modules/backend/`.
  No root `/home/deck/homebrew/plugins/Decky-SteamAchievements/backend/`
  directory exists.
- `plugin_loader.service` remained `active`, and the active backend process was
  loaded from the expected root `main.py`.
- The current log reported `Startup reconciliation: No pending update found`
  followed by `backend started`. It contained no `ModuleNotFoundError` or
  backend-startup failure. The immediately preceding reload instance also
  started successfully and then recorded only the expected clean unload.
- The Decky QAM Updates section rendered its RPC-backed state with installed
  version `0.1.1+3bd0475 (Local Build)`, status `Up to date`, and a last-checked
  timestamp.
- Activating `Check now` through Steam's gamepad focus changed status to
  `Checking...`, then completed as `Up to date`. The backend log recorded a
  forced GitHub check, HTTP 200, one valid prevalidated release, and no upgrade
  candidate or error.
- A bounded D-pad traversal proved focus in this order: description,
  Achievement bar, Debug logging, Installed Version, Receive development
  releases, Automatically check for updates, Status, Check now, Plugin, Decky
  Loader, and SteamOS. Every Updates control and every version row received
  Steam's `gpfocus` marker.
- Settings were preserved byte-for-byte across installation:
  SHA-256 `1ebf105306bb4ac2d1dc13cf26a2733cd1e91e3cd2688b7dde51139c45d90135`,
  with `feature_enabled: true` and `debug_logging: false`.
- The Brotato Gaming Mode DOM contained `ACHIEVEMENTS` and `79/179` after the
  update, with no visible plugin-startup error.

## Rollback and final device state

No rollback was required. The fresh backup contains the known-working
`0.1.0+a3b49d5` plugin and bundle, and the older required recovery point remains
available. The Downloads path holds the exact validated `0.1.1+3bd0475` ZIP.
Decky Loader is active, the backend is healthy, settings are intact, the updater
RPC/UI smoke passed, and Brotato still shows the restored progress bar. The
temporary `/tmp/decky-cdp.py` helper used for validation was removed.
