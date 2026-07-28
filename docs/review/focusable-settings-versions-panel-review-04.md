# Focusable settings and versions panel review 04

Date: 2026-07-27

Branch: `feat/focusable-settings-versions-panel`

Reviewed commit: `7adc10961884e8df91193d0f0d7b764260f55f30`

Base branch: `dev` at `b7b307b`

## Verdict

The review 03 blocker is resolved and the branch is clear to merge into `dev`. The rolling
development workflow, local package path, stable release path, release preconditions, and
post-commit validation now agree on the split between the canonical archive root and Decky's
display manifest name. No remaining stale validator caller or new regression was found.

## Review 03 resolution

`.github/workflows/dev-release.yml` now invokes the validator with both required identities:

```text
--expected-root Decky-SteamAchievements
--expected-name "Achievements Restored"
```

The reviewer ran the workflow's exact build and validation block with source version `0.1.0`:

```text
node scripts/package.mjs --release --release-version 0.1.0 --release-tag dev-build --channel dev
python3 scripts/validate_plugin_zip.py Decky-SteamAchievements.zip \
  --expected-root Decky-SteamAchievements \
  --expected-name "Achievements Restored" \
  --expected-version 0.1.0
```

The package built with a `Decky-SteamAchievements/` archive root and passed validation.

`scripts/check_identity.py` now checks the real development-workflow caller. The reviewer copied
the required identity fixtures into `/tmp`, restored the stale workflow argument from review 03,
and ran the checked-in identity checker against that fixture. It exited 1 with both expected
diagnostics:

```text
identity error: dev-release package validation must include '--expected-name "Achievements Restored"'
identity error: dev-release package validation still expects the distribution name as plugin.json name
```

The unchanged checked-in tree then passed `scripts/check_identity.py`.

## Validator caller audit

All executable callers were inspected:

- `.github/workflows/dev-release.yml` passes explicit archive-root, display-name, and version
  expectations.
- `scripts/release.sh` passes the same explicit split identity and stable version.
- `scripts/check_release_preconditions.sh` passes the same explicit split identity and tag
  version.
- `scripts/post_commit.sh` intentionally uses the validator defaults, which are the canonical
  archive root and current display name.
- `.github/workflows/release.yml` delegates package validation to
  `check_release_preconditions.sh`; it has no conflicting direct invocation.

No caller still uses the distribution identity as `plugin.json.name`.

## Independent verification

The full plan Quality Gates passed from a clean committed tree:

- `npm test`: 5 files and 68 tests passed.
- `npx tsc --noEmit`: passed.
- `npm run build`: production Rollup build passed.
- `python3 -m py_compile main.py`: passed.
- `uv run --with pytest -- pytest -q`: 13 tests passed.
- `scripts/orchestration/run-quality-gates`: passed source metadata, identity, installer bundle,
  typecheck, production build, frontend tests, Python compilation/tests, and version drift.
- `scripts/orchestration/check-review-notes-not-deleted`: passed.
- `git diff --check`: passed.
- `git status --short`: clean before this review note was created.

Additional checks passed:

- the exact development-workflow package/validator command;
- `scripts/check_installer_bundle.py`;
- the checked-in identity positive control;
- the stale-caller identity negative control described above.

The npm commands emitted only the existing unsupported user-configuration warnings; all commands
exited successfully and the worktree remained clean.

STATUS: APPROVED
