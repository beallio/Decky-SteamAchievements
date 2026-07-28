# Plan: Fix Decky Python Module Packaging (fix-decky-python-module-packaging)

## Context

The exact `0.1.1+667e6d5` package was installed on the available Steam Deck through
Decky's supported install flow. Decky installed the expected manifest and frontend bundle,
but the backend failed during every load with:

```text
ModuleNotFoundError: No module named 'backend'
```

The package is complete but laid out incorrectly. `scripts/package.mjs` currently copies
the repository's recursive `backend/**/*.py` sources to a root-level `backend/` directory
inside the ZIP. Decky Loader does not put the plugin root on Python's import path: it adds
only `<installed-plugin>/py_modules`, then executes root `main.py` with
`spec_from_file_location`. SDH-ludusavi follows that contract by packaging its importable
Python packages beneath `py_modules/`.

Keep the repository source convention (`main.py` plus `backend/`) and the existing
`from backend...` imports. Correct only the distribution mapping so source
`backend/<path>.py` is installed as `py_modules/backend/<path>.py`. Do not add a runtime
`sys.path` workaround, rename the `backend` package, move the source tree, or change any
RPC, setting, updater, frontend, identity, version, or release-channel behavior.

The current validator is part of the defect: it accepts root `backend/` and reports the
known-bad ZIP as compliant. The fix is complete only when tests, routine quality gates,
and release validation fail closed on the obsolete layout and a fresh package loads on the
Steam Deck.

**Slug used throughout this plan:** `fix-decky-python-module-packaging`

---

## Orchestration Contract

**Slug:** `fix-decky-python-module-packaging`

**Plan file:**

```text
docs/plans/2026-07-28_fix-decky-python-module-packaging.md
```

**Implementation branch:**

```text
feat/fix-decky-python-module-packaging
```

**Round-complete marker:**

```text
/tmp/Decky-SteamAchievements/fix-decky-python-module-packaging_finished
```

**Finalized marker:**

```text
/tmp/Decky-SteamAchievements/fix-decky-python-module-packaging_finalized
```

**Review notes:**

```text
docs/review/fix-decky-python-module-packaging-review-*.md
```

Each review note ends with exactly one status trailer:

```text
STATUS: CHANGES_REQUESTED
```

or:

```text
STATUS: APPROVED
```

---

## Required Agent Protocol

1. Use the **implementer** skill.
2. Work from the repository root.
3. Branch from `dev`.
4. Commit this plan as the first commit on the implementation branch.
5. Follow TDD where behavior changes are testable.
6. Run quality gates before marking any round complete.
7. Do not write your own review.
8. Do not create files under `docs/review/`.
9. Do not delete files under `docs/review/`.
10. Review notes are durable audit records and must be committed.
11. Resolving a review note means:
    - implement the requested changes;
    - run quality gates;
    - commit the code/docs changes;
    - commit the review note itself if it is not already committed;
    - recreate the round-complete marker.
12. After finalization, stop polling and exit cleanly.

---

## Scope discipline

- Implement only the units the plan lists. Do not modify files outside the plan's scope.
- Do not change runtime behavior beyond what the plan specifies. A `refactor` or
  `cleanup` commit must preserve observable behavior.
- Never edit a test's expected value to make a behavior change pass. If a test
  legitimately must change, that change must be required by the plan or a review
  note, and you must record the rationale in the session log.
- If you spot an unrelated improvement, do not make it here — note it in the
  session log for a separate plan.

---

## Setup

Start from `dev`:

```bash
git checkout dev
# ORCH_LOCAL_ONLY: local trial branch, skipping origin pull
git checkout -b feat/fix-decky-python-module-packaging
```

Commit this plan first:

```bash
git add docs/plans/2026-07-28_fix-decky-python-module-packaging.md
git commit -m "docs(plan): add fix-decky-python-module-packaging implementation plan"
```

---

## Implementation Tasks

### 1. Establish the packaging regression in tests

Follow TDD and record red-to-green evidence in the session log.

1. Update `tests/test_validate_plugin_zip.py` so a compliant fixture contains
   `py_modules/backend/__init__.py` and a recursive module such as
   `py_modules/backend/updater/models.py`.
2. Add failing assertions that the validator:
   - rejects an archive with first-party modules only under root `backend/`;
   - rejects an archive missing `py_modules/backend/__init__.py`;
   - accepts recursive `.py` modules beneath `py_modules/backend/`;
   - rejects `.pyc`, `.pyo`, a nested `__pycache__`, and non-Python payloads anywhere
     inside the first-party `py_modules/backend/` tree.
3. Run the targeted tests before production changes and capture the expected failure.

Do not weaken existing archive-root, metadata, display/distribution identity, version, or
forbidden-payload checks.

### 2. Map repository backend sources into Decky's runtime path

1. Change `scripts/package.mjs` so every recursively discovered source
   `backend/<relative>.py` is staged and archived at
   `py_modules/backend/<relative>.py`.
2. Preserve the current sorted source discovery, root `main.py`, fixed
   `Decky-SteamAchievements` archive root/asset name, optional source map handling, version
   stamping, checksum generation, and deterministic source-to-target entry construction.
3. Do not include any root-level `backend/` entry and do not copy caches, bytecode, or
   non-Python backend files.

The expected archive relationship is:

```text
repository backend/__init__.py            -> ZIP py_modules/backend/__init__.py
repository backend/rpc_pool.py            -> ZIP py_modules/backend/rpc_pool.py
repository backend/updater/service.py     -> ZIP py_modules/backend/updater/service.py
repository main.py                        -> ZIP main.py
```

### 3. Make ZIP validation enforce the runtime contract

1. Update `scripts/validate_plugin_zip.py` to require
   `py_modules/backend/__init__.py` and the `py_modules/backend/` directory.
2. Reject every root `backend/` entry, including otherwise valid `.py` files.
3. Permit only Python source files and directory entries within
   `py_modules/backend/`; reject compiled modules, nested cache directories, and other
   payloads with actionable error messages.
4. Keep the validator usable for local, rolling-development, immutable-development, and
   stable packages without adding a source-checkout dependency.

### 4. Put package validation in the routine orchestration gate

After the existing frontend build and automated suites, extend
`scripts/orchestration-hooks/quality-gates` to:

1. create a hash-free local package with `node scripts/package.mjs --no-hash` (do not
   rebuild the frontend a second time);
2. validate it with `scripts/validate_plugin_zip.py`, passing the base version from
   `package.json` as the expected version;
3. fail the round if packaging or archive validation fails.

The generated ZIP is already gitignored. Do not change release workflows: their existing
validator calls must inherit the stricter contract.

### 5. Document the source-versus-runtime layout

1. Update `DEVELOPER.md` packaging/deployment guidance to say repository Python sources
   remain under `backend/`, while packages and manual device deployments must place them
   under `<plugin>/py_modules/backend/`.
2. Add the same invariant to `AGENTS.md` without changing the documented repository source
   convention.
3. Add a dated record under `docs/agent_conversations/` containing the original device
   error, root cause, red-to-green test evidence, final package version/SHA-256, local gate
   results, device results, and rollback state. Do not edit the historical updater plan to
   disguise the original packaging assumption.

### 6. Validate the exact artifact on the Steam Deck

Only begin device mutation after all local checks pass.

1. Build a fresh default local package so its manifest version includes the implementation
   commit hash. Record its SHA-256 and ZIP member list.
2. Confirm the ZIP contains every repository `backend/**/*.py` source exactly once beneath
   `Decky-SteamAchievements/py_modules/backend/`, with no root `backend/` member.
3. Before installation, create a new timestamped backup on `ssh steamdeck` containing the
   working installed plugin, settings, runtime data, logs, and Downloads ZIP. Preserve the
   existing `/home/deck/backups/Decky-SteamAchievements/device-validation-20260728T010300`
   backup as a secondary recovery point.
4. Copy the exact validated ZIP to the Deck, verify its remote SHA-256, and install it using
   Decky's supported `utilities/install_plugin` confirmation flow. Do not manually overlay
   files into a running installation.
5. Verify the installed `plugin.json` version and `dist/index.js` hash match the local ZIP;
   verify installed Python modules are under `py_modules/backend/` and no root `backend/`
   directory exists.
6. Confirm `plugin_loader.service` is active and current plugin logs contain neither
   `ModuleNotFoundError` nor a backend startup failure.
7. In Gaming Mode, open the Achievements Restored Decky QAM panel and confirm:
   - the Updates section renders and loads its RPC-backed state;
   - Check Now completes without a backend error;
   - existing settings remain intact;
   - every Updates control and version row remains gamepad-focusable;
   - Brotato still displays the restored `79/179` achievement progress.
8. If any device acceptance check fails, restore the fresh backup, restart Decky, and prove
   the prior working plugin is active before ending the round. The known working fallback is
   `0.1.0+a3b49d5`.

Do not push a branch, publish an asset, create a tag, merge `dev` into `main`, or release as
part of this plan.

---

## Quality Gates

Run before marking any round complete:

```bash
scripts/orchestration/run-quality-gates
scripts/orchestration/check-review-notes-not-deleted
git status --short
```

The round is not complete unless:

1. all requested implementation work is done;
2. all relevant tests pass;
3. build/typecheck gates pass;
4. review notes have not been deleted;
5. the working tree is clean;
6. all code/docs changes are committed.

---

## Verification

Run and record:

```bash
uv run --with pytest -- pytest -q tests/test_validate_plugin_zip.py
scripts/orchestration/run-quality-gates
npm run package
python3 scripts/validate_plugin_zip.py Decky-SteamAchievements.zip
unzip -Z1 Decky-SteamAchievements.zip
sha256sum Decky-SteamAchievements.zip
git diff --check
```

Archive acceptance:

1. every tracked `backend/**/*.py` source has exactly one
   `py_modules/backend/**/*.py` archive counterpart;
2. no root `backend/`, bytecode, cache directory, or unintended backend payload exists;
3. root `main.py`, manifest/package metadata, display name, distribution root, and asset
   filename remain unchanged;
4. release workflow tests still prove every publication path invokes the stricter
   validator.

Device verification is mandatory and must use the exact ZIP that passed local validation.
Record the backup path, local and remote ZIP hashes, installed version/bundle hash, service
state, relevant clean log excerpt, QAM Updates smoke result, focus smoke result, achievement
bar result, and final rollback/readiness state in the dated session log.

---

## Mark Round Complete

When the implementation round is complete and the working tree is clean, run:

```bash
scripts/orchestration/mark-finished fix-decky-python-module-packaging
```

This writes:

```text
/tmp/Decky-SteamAchievements/fix-decky-python-module-packaging_finished
```

Then exit cleanly. If this process exits, the orchestrator will resume you through
`scripts/orchestration/continue-implementer fix-decky-python-module-packaging`.

---

## Review Polling Loop

After marking the round complete, check existing review notes first, then poll for new review notes if you remain active:

```text
docs/review/fix-decky-python-module-packaging-review-*.md
```

When a review note exists or a new review note appears:

1. Read the full review note.
2. If the note ends with:

   ```text
   STATUS: CHANGES_REQUESTED
   ```

   then resume work.

3. Clear the round-complete marker:

   ```bash
   scripts/orchestration/clear-finished fix-decky-python-module-packaging
   ```

4. Address every requested change.
5. Run quality gates:

   ```bash
   scripts/orchestration/run-quality-gates
   scripts/orchestration/check-review-notes-not-deleted
   ```

6. Commit code/docs fixes.
7. Commit the review-note file itself if it is not already committed:

   ```bash
   git add docs/review/fix-decky-python-module-packaging-review-*.md
   git commit -m "docs(review): record fix-decky-python-module-packaging review notes"
   ```

8. Recreate the round-complete marker:

   ```bash
   scripts/orchestration/mark-finished fix-decky-python-module-packaging
   ```

9. Either continue polling or exit cleanly. If you exit, the orchestrator will resume you with `scripts/orchestration/continue-implementer fix-decky-python-module-packaging` after the next review note is created.

---

## Approval Handling

If the latest review note ends with:

```text
STATUS: APPROVED
```

then:

1. Confirm every previous review item has been addressed.
2. Confirm all review notes are committed:

   ```bash
   scripts/orchestration/check-review-notes-committed fix-decky-python-module-packaging
   ```

3. Confirm the working tree is clean:

   ```bash
   git status --short
   ```

4. Finalize:

   ```bash
   scripts/orchestration/finalize fix-decky-python-module-packaging
   ```

5. Confirm the finalized marker exists:

   ```text
   /tmp/Decky-SteamAchievements/fix-decky-python-module-packaging_finalized
   ```

6. Stop polling and exit cleanly.

---

## Review Rules

Do not write your own review.

Do not create files under:

```text
docs/review/
```

Do not delete files under:

```text
docs/review/
```

Only the orchestrator writes review notes. Your job is to read them, resolve them, commit them as audit records, and continue the loop.

---

## Finalization Rules

Only finalize after a review note with:

```text
STATUS: APPROVED
```

Finalization is performed with:

```bash
scripts/orchestration/finalize fix-decky-python-module-packaging
```

Do not manually merge into `dev` unless the finalize script fails and the user/orchestrator explicitly instructs you to recover manually.

Leave both markers in place after finalization:

```text
/tmp/Decky-SteamAchievements/fix-decky-python-module-packaging_finished
/tmp/Decky-SteamAchievements/fix-decky-python-module-packaging_finalized
```

Any project-specific release step runs from the project's
`scripts/orchestration-hooks/finalize-release` hook, invoked by finalize.
