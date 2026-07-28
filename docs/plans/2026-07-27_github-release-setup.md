# Plan: Set up CI, release tooling, and GitHub deployment (github-release-setup)

## Context

This repository can build a correct plugin package but cannot release one. The goal of this plan
is to close that gap: CI on every push, a validated package, a changelog gate, and a local
release command — leaving the actual push to GitHub as a human step.

**What already works — do not rebuild it.**

- `scripts/package.mjs` is the strongest packaging script across the sibling repos. It derives
  identity from `plugin.json` rather than hardcoding, and already supports `--release`,
  `--release-version`, `--release-tag`, `--channel`, `--no-hash`, and `--emit-release-metadata`,
  emitting a release manifest and a `.sha256` sidecar. Verified 2026-07-27: it produces
  `Decky-SteamAchievements.zip` with a single top-level `Decky-SteamAchievements/` directory.
- `scripts/orchestration-hooks/quality-gates` passes (exit 0) and is cache-isolated to
  `/tmp/Decky-SteamAchievements`.
- Plugin identity is settled and documented in `AGENTS.md` §"Plugin identity — canonical vs
  display": canonical `Decky-SteamAchievements`, QAM display `Achievements Restored`. **Do not
  unify them and do not change either string** — the canonical name is the on-device install
  directory and the string a self-updater passes to `install_plugin`.

**What is missing.**

- `.github/workflows/` does **not exist** — no CI, no release automation.
- `scripts/orchestration-hooks/finalize-release` is a stub that echoes and exits 0.
- No `version_guard.py`, `set_release_version.py`, `bump_next_patch.sh`, `release.sh`, or
  `validate_plugin_zip.py`.
- Zero local and remote git tags. `origin` is already public and currently contains seven branch
  refs (`dev`, `main`, and five feature branches); `git ls-remote --heads origin` is not empty.

**Port from the siblings; do not invent.** The sibling paths below are relative to the parent of
this repository; resolve them from the repository root by prefixing `../`:

| Need | Source to port from |
| --- | --- |
| `ci.yml`, `dev-release.yml`, `release.yml` | `Decky-Metadata/.github/workflows/` (63 / 134 / 114 lines) |
| `release.sh`, `changelog.py`, `version_guard.py`, `set_release_version.py`, `bump_next_patch.sh` | `Decky-Metadata/scripts/` |
| `validate_plugin_zip.py` | `SDH-ludusavi/scripts/` |

Follow Decky-Metadata's release model, whose `release.sh` header states it plainly: *"Prepare a
stable GitHub Release locally; never pushes."* It stamps manifests, builds a hash-free package,
creates an annotated tag, and **prints** the pushes for a human to run.

**Take the donors' *contents*, not their trigger wiring.** Their filenames do not map onto the
behavior wanted here: Decky-Metadata's `dev-release.yml` is `workflow_dispatch` (manual), while
its `release.yml` combines `dev` branch pushes, stable-version tag pushes, and manual dispatch.
Define each trigger explicitly from the behavior specified in Task 5 and port the relevant job
bodies; do not assume a donor file's `on:` block is what this repo wants.

**This repo differs from the donors in three ways that will break a blind copy.**

1. **No Python *backend toolchain*** — but Python itself is still required. There is no
   `pyproject.toml`, no `backend/`, no `py_modules/`, and no `run.sh`; only a thin `main.py`. Drop
   anything in a donor workflow or script that installs `uv`, runs `ruff`, or invokes `pytest`.
   **Keep `python3`**: `changelog.py`, `version_guard.py`, `set_release_version.py`, and
   `validate_plugin_zip.py` are all Python. "No Python steps" means no backend lint/test
   toolchain, not no interpreter.
2. **npm, not pnpm.** This repo has `package-lock.json`; Decky-Metadata's workflows may assume
   `pnpm`. Use `npm ci`.
3. **The lockfile still carries the pre-rename identity.** `package.json` was renamed to
   `decky-steamachievements`, but `package-lock.json` still records the previous noncanonical
   name in both its root `name` and `packages[""].name` (verified 2026-07-27). `npm ci` currently
   succeeds despite that mismatch, but the stale lockfile identity should still be corrected so
   all committed package metadata agrees. Task 0 covers it.

**Two things this plan must NOT do.**

- **Outward actions — precisely what is and is not allowed.** The repository is now published
  (7 branches on `origin`, 0 tags), so a blanket "nothing leaves this machine" no longer fits and
  would block the only real proof that CI works.

  **Permitted during this implementation round:** pushing the implementation branch for
  Verification check 6. **Permitted only after the reviewed branch is merged:** pushing `dev` and
  allowing `dev-release.yml` to produce the rolling `dev-build` prerelease. The latter two are
  deferred below; no implementation-round check depends on them.

  The `dev-build` tag is the one tag this plan may create, and only as a side effect of the
  workflow — a GitHub Release requires a tag, so a rolling prerelease necessarily carries one. It
  is rolling and replaceable, which is why it sits on the permitted side.

  Because `dev-build` is a *rolling* tag, the workflow necessarily moves it — that is what
  "replaceable" means, and it is the one ref this plan may update in place. Read the force-push
  prohibition as applying to branches and to semver tags, not to `dev-build`.

  **Forbidden:** creating or pushing any **semver `v*` tag**, publishing any non-prerelease
  release, invoking `gh release create`/`delete` by hand, force-pushing any branch or semver tag,
  and deleting or rewriting any existing remote ref other than `dev-build`. Those are the irreversible ones: a published stable tag and
  its asset filenames become a contract with anyone who installs. Cutting `v0.1.0` is a human
  step. The distinction that matters is **rolling and replaceable** versus **permanent and
  depended upon**, not tag-versus-no-tag.

  `release.sh` itself must still never push — it prepares locally and prints the commands.
- **Do not edit `orchestration.conf.local`.** It is gitignored machine-local state that currently
  sets `ORCH_LOCAL_ONLY=1`. Flipping it is a human step; document it in the release runbook
  instead.

**Slug used throughout this plan:** `github-release-setup`

---

## Orchestration Contract

**Slug:** `github-release-setup`

**Plan file:**

```text
docs/plans/2026-07-27_github-release-setup.md
```

**Implementation branch:**

```text
feat/github-release-setup
```

**Round-complete marker:**

```text
/tmp/Decky-SteamAchievements/github-release-setup_finished
```

**Finalized marker:**

```text
/tmp/Decky-SteamAchievements/github-release-setup_finalized
```

**Review notes:**

```text
docs/review/github-release-setup-review-*.md
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
git checkout -b feat/github-release-setup
```

Commit this plan first:

```bash
git add docs/plans/2026-07-27_github-release-setup.md
git commit -m "docs(plan): add github-release-setup implementation plan"
```

---

## Implementation Tasks

Work in order. Read each donor file before porting it; adapt rather than copy blindly.

### Task 0 — Realign the lockfile identity and dependency bootstrap

`package-lock.json` still uses the previous noncanonical name in both its root `name` and
`packages[""].name`, left behind by the earlier identity rename. Regenerate or edit it so both
read `decky-steamachievements`, matching `package.json`.

Prefer `npm install --package-lock-only` so the lockfile is regenerated by npm rather than
hand-edited; confirm afterwards that only the two `name` fields changed and no dependency
versions moved. Then confirm `npm ci` succeeds — every later task depends on it, and the CI this
plan adds cannot pass without it.

Also update `scripts/orchestration-hooks/quality-gates`: when `node_modules` is absent, it must
run `npm ci` directly instead of preferring `pnpm install --frozen-lockfile` when pnpm happens to
be installed. This is not hypothetical: running the gate on a machine with pnpm installed **creates
an untracked, non-ignored `pnpm-lock.yaml` at the repo root**, observed 2026-07-27. Delete any such
file as part of this task and add `pnpm-lock.yaml` to `.gitignore` so a stray one cannot be
committed or break the "clean tree" precondition of a release. This repository has no
`pnpm-lock.yaml`, so the current pnpm branch breaks a clean
checkout and therefore also breaks `release.sh` before it can prepare a release. Preserve the
rest of the existing quality-gate behavior. Add a fail-closed source-metadata agreement check to
the gate: `plugin.json.version`, `package.json.version`, `package-lock.json.version`, and
`package-lock.json.packages[""].version` must all match; `plugin.json.name` must remain
`Decky-SteamAchievements`; and the package manifest plus both lockfile name fields must remain
`decky-steamachievements`. A missing file, malformed JSON, missing field, or disagreement must
exit non-zero with a specific diagnostic.

### Task 1 — Version tooling

Port from `../Decky-Metadata/scripts/`, adapting to this repo:

- **`scripts/version_guard.py`** — keep the full four-command CLI (`check-base`, `check-drift`,
  `next-patch`, `highest`). Decky-Metadata's is the complete one; SDH-ludusavi's exposes only two
  and is the lesser fork. Correct Decky-Metadata's fail-open tag reader while porting it:
  `_read_git_tags()` currently catches `FileNotFoundError` and `CalledProcessError` and returns
  `[]`. A missing or failing Git executable must instead report the error and make every command
  that needs repository tags exit non-zero; it must never be interpreted as "there are no tags."
- **`scripts/set_release_version.py`** — take Decky-Metadata's read-before-write ordering and
  extend it to the lockfile: read and validate `plugin.json`, `package.json`, and
  `package-lock.json` before writing **any** of them, validate the requested version with
  `fullmatch`, and catch narrow expected errors. SDH-ludusavi's writes `plugin.json` before
  reading `package.json` and can leave a partial version bump; do not reproduce that.
- **`scripts/bump_next_patch.sh`** — reads the highest stable tag through `version_guard.py` and
  updates all three metadata files through the canonical setter.

Write-failure atomicity across the three files is **deliberately left to implementation review**:
read-before-write already prevents the common partial bump, and specifying transactional
semantics for a script that does not exist yet is better done against the real code than
hypothesised here. Note it in the session log so the reviewer evaluates it.

These must update `plugin.json`, `package.json`, **and `package-lock.json`** together — the
lockfile carries `version` in both its root and `packages[""]`, npm rewrites them on install, and
a lockfile left behind at the old version is a committed-metadata disagreement a release should
not carry. Keep them in the documented canonical/display relationship: `Decky-SteamAchievements` and `decky-steamachievements`. A version
bump must never alter any `name` field.

Tests: this repo uses vitest, not pytest — do not add a Python test suite. Verify these scripts by
exercising them directly in Verification, including placing a `git` shim that exits non-zero first
on `PATH` and proving `version_guard.py highest` also exits non-zero. Note in the session log that
the scripts are covered by direct verification rather than unit tests.

### Task 2 — Changelog gate

Port `scripts/changelog.py` from Decky-Metadata: stdlib-only section parsing, duplicate detection,
date validation, placeholder rejection, release-title rendering.

`CHANGELOG.md` already exists at the repo root. Bring it to the format `changelog.py` expects,
preserving its existing entries — do not rewrite history. Ensure it carries an `[Unreleased]`
section for ongoing work.

The gate this enforces: **a release blocks unless the target version has curated, dated notes.**
That is deliberate in the donor and must survive the port.

### Task 3 — Package validation

Port `scripts/validate_plugin_zip.py` from `../SDH-ludusavi/scripts/` — the only implementation.
It validates one archive root, required files and directories, forbidden paths, manifest
identity/version agreement, and forbidden root flags.

Be accurate about what the donor actually does, because the plan previously overstated it. Read
`../SDH-ludusavi/scripts/validate_plugin_zip.py` first: it takes `--expected-name` (defaulting to
the donor's own plugin) and `--expected-version`, requires exactly one top-level `<name>/` prefix,
and checks a required-file and required-directory set. It does **not** validate `package.json`
identity. Either keep its real scope and say so, or extend it deliberately — but do not describe
capabilities it lacks, and make the verification match whatever you actually build.

Also make the **package name** an explicit contract rather than an implementer choice: the
validator must check `package.json`'s `name` equals `decky-steamachievements`, not only
`plugin.json`'s canonical name. Extend the donor if it does not already, and propagate that
expectation to the malformed-archive verification cases so a ZIP carrying the wrong package name
is proven to be rejected.

Adapt its expectations to this repo: pass `--expected-root Decky-SteamAchievements` and
`--expected-name "Achievements Restored"` so the archive
root is checked against the canonical identity. Replace the donor's required-file set with
`LICENSE`, `main.py`, `package.json`, `plugin.json`, and `dist/index.js`; keep `NOTICE` and
`dist/index.js.map` optional because `scripts/package.mjs` emits them only when present. Replace
the donor's three `py_modules/` required directories with this plugin's sole required directory,
`dist/`. Build a package first and read its contents to confirm those expectations rather than
assuming.

### Task 4 — Local release command

Port `scripts/release.sh` from Decky-Metadata, preserving its defining property, stated in its own
header: **it never pushes.** It must enforce a clean tree on the promoted branch, reject an
existing tag, check the changelog gate and quality gates, stamp manifests, create a local
hash-free package and an annotated tag, and then **print** the `git push` commands for a human to
run rather than running them.

If a version commit is needed, create it with
`git -c core.hooksPath=/dev/null commit -m "release: $tag"` so repository, global, or system
`post-commit` hooks cannot turn this local-only command into an outward-facing action. Quality
gates have already run explicitly, so disabling hooks for this one generated commit does not
remove the release checks. Stage `plugin.json`, `package.json`, and `package-lock.json` for that
commit so the tag can never carry a partial version bump.

**Fix the donor's fail-open guards while porting — they are defects, not style.**

- `../Decky-Metadata/scripts/release.sh:45` guards with `if [[ -n "$(git status --porcelain)" ]]`.
  If `git status` errors, the substitution is empty, the test is false, and the script proceeds as
  though the tree were clean. Capture the status output and the exit code separately, and abort on
  either a non-empty tree **or** a failed command.
- Apply the same rule anywhere a ported script decides something from `$(cmd)` — an empty result
  must never be indistinguishable from a failed command. `version_guard.py` inspects git tags this
  way; make a git failure an error rather than "no tags found", since "no tags" is currently the
  true state and a silent failure would be invisible. Capture `git branch --show-current`
  separately as well: a failed branch lookup must report that failure and exit non-zero, while a
  successful lookup must report and reject any branch other than `main`.

**Refresh remote tags before deciding a version, and fail closed if that refresh fails.**
`release.sh` picks the next version from local tag state, which can be stale — a fresh clone or a
missed fetch would let it prepare a version *lower* than an already-published stable release, and
publishing that would corrupt the update ordering for anyone installed. Do **not** use
`git fetch --tags --prune-tags` for this — it is shorthand for a tag refspec that makes local
tags subject to pruning, so it can delete local-only tags and clobber conflicting ones. That was
an error in an earlier draft of this plan. Use a **read-only** comparison instead:
`git ls-remote --tags origin`, captured with its exit code checked, and compared against local
tags without mutating any ref. Only exact stable `refs/tags/vX.Y.Z` names participate in the
monotonicity decision; ignore the rolling `dev-build` tag and annotated-tag `^{}` rows. If a
non-pruning fetch is preferred, use `git fetch --tags origin` and fail closed on conflicts. Abort
on a non-zero exit rather than proceeding on local knowledge. After that comparison or
non-pruning fetch, pass the requested release version through
`version_guard.py check-base` and abort unless it is strictly greater than the highest stable tag;
checking the pre-stamp metadata version is insufficient because a caller can request a downgrade
from a newer development base. Re-assert stable-version monotonicity inside `release.yml` as well,
since the workflow is the last point before publication.

**Wire `validate_plugin_zip.py` into `release.sh`**, running it on the built package **before**
the annotated tag is created, and aborting the release if it fails. Without that, the documented
human flow can tag and publish an archive that the validator would have rejected — a validator
that only runs in CI catches the problem after the tag exists, which is the expensive moment.

Drop anything Decky-Metadata-specific: references to `run.sh`, `uv`, `ruff`, `pytest`, or a
`backend/` directory do not apply here.

### Task 5 — CI and release workflows

Create `.github/workflows/` contents by porting from `../Decky-Metadata/.github/workflows/`:

- **`ci.yml`** — on push and pull request: `npm ci`, the same fail-closed source-metadata
  agreement check required of the local quality gate in Task 0, typecheck, build, vitest. **No
  Python *backend toolchain*** — no `uv`, `ruff`, or `pytest`. `python3` itself is fine and
  expected; compiling `main.py` is a reasonable check and the release scripts are Python. This
  matches the distinction drawn in Context; do not read "no Python" as "no interpreter".
- **`dev-release.yml`** — on push to `dev`: build and refresh **one rolling prerelease at the
  fixed tag `dev-build`**. Define the overlap behavior explicitly rather than inheriting the
  donor's: use a fixed concurrency group with `cancel-in-progress: true` so only the newest run
  survives; verify the run is building the current `dev` head before moving the tag, so the tag
  cannot move backward; treat a GitHub API failure as an error rather than as "the release does
  not exist"; and reconcile release and tag state independently, so a recreated release is never
  attached to a stale orphaned tag, replacing its assets each time, carrying **the ZIP only**.

  **Do not emit release metadata on this channel.** `scripts/package.mjs:112` enforces
  `--release-tag` == `v<version>` whenever metadata is emitted, and rejects anything else with
  *"must equal v0.1.0 (discovery checks tag === 'v' + manifest.version)"* — verified. A fixed
  `dev-build` tag and `--emit-release-metadata` are therefore mutually exclusive, and the manifest
  exists for stable-release discovery by the self-updater, which the rolling channel does not need.
  Use `package.mjs --release --channel dev --release-tag dev-build` **without**
  `--emit-release-metadata`. Do not "fix" this by loosening the check in `package.mjs`; that file
  is out of scope and the constraint is deliberate.
- **`release.yml`** — on a pushed `v*` tag: build, run `validate_plugin_zip.py`, and publish a
  GitHub Release with the ZIP, its `.sha256` sidecar, its `.manifest.json`, and
  changelog-derived notes. Pass `--verify-tag` to `gh release create` so a missing or concurrently
  deleted trigger tag aborts the workflow rather than causing `gh` to recreate a semver tag.

  **Serialize stable publication.** Give the stable release job a fixed concurrency group with
  `cancel-in-progress: false`, so two stable runs cannot publish out of order. A last-moment
  remote-tag comparison narrows the race but does not close it — without a shared group an older
  run can still publish after a newer one has finished.

  **Put the prepublication gate in a script, so it can be tested without publishing.** Extract the
  stable-release preconditions — tag-ancestry from `origin/main`, full quality gates, changelog
  agreement, remote-tag monotonicity, and `validate_plugin_zip.py` — into a single locally
  executable script (e.g. `scripts/check_release_preconditions.sh`) that `release.yml` invokes.
  Otherwise none of this wiring can fail any check during an implementation round: publishing a
  semver tag is forbidden, so the workflow path is unreachable and the gate would ship unproven.
  With it extracted, Verification can run the script directly and prove each rejection path — a
  tag not on `main`, a changelog mismatch, a remote tag higher than the requested version — which
  is the same "make it behavior-testable" move that replaced static workflow inspection with a
  real CI run. Give the script a documented local invocation through arguments and/or environment
  variables for every piece of workflow context it consumes, so Verification can supply
  disposable commits, refs, remotes, versions, and archives without publishing or editing the
  implementation worktree.

  **Gate the publish on provenance, not just on the ref existing.** Before `gh release create`,
  the job must confirm the tagged commit is an ancestor of `origin/main`
  (`git merge-base --is-ancestor "$GITHUB_SHA" origin/main`) and that the full quality gates pass
  on that commit — not merely that a concurrent CI run happens to exist. A semver tag pushed by
  hand from any branch must not be able to publish a stable release.

  Immediately before `gh release create`, query remote tags again with the same non-destructive
  rule as `release.sh`: use `git ls-remote --tags origin` with its exit status checked, or a
  non-pruning `git fetch --tags origin`; never use `--prune-tags`. Consider only exact stable
  `vX.Y.Z` refs, fail if the requested version is behind the returned remote stable set, and then
  run `version_guard.py check-drift "$VERSION"` against local tags when the chosen method has
  updated them. This final check is in addition to the earlier full quality-gate run: it closes the
  window in which a higher stable tag could arrive while this job is building and let an older
  concurrent workflow publish afterward.

  **Do not trust the tag itself.** The donor publishes for any matching `v*` ref, so a tag pushed
  by hand — or by mistake — would publish a stable release that `release.sh` never validated.
  Before publishing, the job must confirm the tag's version agrees with `plugin.json`,
  `package.json`, both `package-lock.json` version fields, and the changelog; confirm all four
  canonical/package name fields agree with the identities in Task 0; and confirm that
  `validate_plugin_zip.py` passes on the built archive. Any disagreement fails the job instead of
  publishing.

Use `npm ci` throughout — this repo has `package-lock.json`, not a pnpm lockfile. Pin action
versions the way the donor does. These workflows only ever *run on GitHub*; creating them here
pushes nothing.

### Task 6 — Arm the finalize hook and write the runbook

Replace the `scripts/orchestration-hooks/finalize-release` stub with a hook that **prints the
release runbook steps and exits 0**. It must not push, must not invoke `gh`, and must not dispatch
a workflow.

Deliberately do **not** model it on `../SDH-ludusavi/scripts/orchestration-hooks/finalize-release`.
That hook hard-requires an executable `./scripts/request_dev_release.sh` and fails without it, and
this plan does not port that helper. Engine-driven remote dispatch remains out of scope even
though the repository is now public. Read the donor for shape if useful, but do not adopt its
dispatch.

Do **not** gate the hook's behavior on `ORCH_LOCAL_ONLY`. The engine sources `orchestration.conf`
and `orchestration.conf.local` but does not export those assignments, so a hook running as a child
process cannot rely on seeing them. Because this hook never performs a remote action at all, the
question does not arise — which is the point. Keep it that way.

Create `docs/runbooks/release.md` documenting the end-to-end flow for a human:

1. curate `CHANGELOG.md` for the version;
2. merge `dev` → `main` (human gate);
3. run `scripts/release.sh X.Y.Z` and review the tag and package;
4. run the printed pushes — the first updates `main` in the already-public repository, and the
   second publishes the first release tag and triggers the stable-release workflow;
5. understand the three distinct states, and do not conflate them — removing `ORCH_LOCAL_ONLY=1`
   alone enables none of the later ones:
   - **local-only orchestration** (current): finalize merges locally, nothing leaves the machine;
   - **remote base-branch pushing**: requires `ORCH_LOCAL_ONLY` removed **and** `ORCH_PUSH=1`,
     which `orchestration.conf` leaves at its default `0`. Authorize that deliberately and
     separately;
   - **engine-driven release dispatch**: out of scope for this plan entirely. The finalize hook
     built here only prints instructions; wiring real dispatch needs a helper and a further plan;
6. return to `dev`, run `scripts/bump_next_patch.sh`, commit `plugin.json`, `package.json`, and
   `package-lock.json` together, and push `dev` so its base is ahead of the stable tag and the
   rolling dev prerelease refreshes.

State plainly in the runbook that step 4 is this release flow's first outward-facing action, not
the repository's first publication. Updating the public branch and publishing a tag and asset
name are durable actions that become a contract with anyone who installs.

### Out of scope — do not do these

- **Do not create or push a semver `v*` tag, publish a non-prerelease release, force-push any
  branch or semver tag, or delete/rewrite any remote ref other than `dev-build`.** Pushing the
  implementation branch is permitted and required by Verification check 6. A `dev` push and
  creation or movement of the `dev-build` tag are permitted only after merge and are deferred
  below. See the outward-actions rule in Context.
- Do not edit `orchestration.conf.local`, or any gitignored machine-local file.
- Do not change `plugin.json` or `package.json` `name` fields, or the QAM display string.
- Do not modify `scripts/package.mjs` — it is the canonical copy and already does what is needed.
- Do not touch `installer/`; it lives on an unmerged branch and is not part of this unit.
- Do not modify any sibling repository. Read them; copy from them; write only here.
- Do not add a Python test suite or reintroduce a `tests/` directory.

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

Eight checks. Each tests **behavior**, not structure, and each names how to prove it can fail.
Run them in order; record in the session log, per check, what you broke to confirm it reports
failure.

**Guiding rule, learned the hard way on this plan:** a check that cannot fail is worse than no
check. In shell, the recurring causes are a command substitution that yields empty on *error* as
well as on success, a subshell `exit` where `set -e` is not active, `grep -c` where zero matches
is correct, and `assert && echo ok`. Prefer capturing exit codes explicitly over testing output
emptiness.

**Before any edit**, record the baseline the last two checks compare against:

```bash
set -euo pipefail
mkdir -p /tmp/Decky-SteamAchievements

sibling_fingerprint() {
  local repo="$1"
  local untracked_paths fingerprint
  if ! untracked_paths="$(mktemp /tmp/Decky-SteamAchievements/sibling-untracked.XXXXXX)"; then
    return 1
  fi
  if ! git -C "$repo" ls-files --others --exclude-standard -z | sort -z > "$untracked_paths"; then
    rm -f -- "$untracked_paths"
    return 1
  fi
  if ! fingerprint="$(
    {
      git -C "$repo" rev-parse HEAD || exit 1
      git -C "$repo" diff --binary HEAD -- || exit 1
      while IFS= read -r -d '' path; do
        printf 'untracked:%s\0' "$path"
        sha256sum -- "$repo/$path" || exit 1
      done < "$untracked_paths"
    } | sha256sum | cut -c1-16
  )"; then
    rm -f -- "$untracked_paths"
    return 1
  fi
  rm -f -- "$untracked_paths"
  [[ -n "$fingerprint" ]] || return 1
  printf '%s\n' "$fingerprint"
}

for d in Decky-Metadata SDH-ludusavi decky-tooling DeckConnect; do
  git -C "../$d" rev-parse --git-dir >/dev/null
  fingerprint=""
  if ! fingerprint="$(sibling_fingerprint "../$d")"; then
    echo "baseline: failed to fingerprint ../$d" >&2
    exit 1
  fi
  [[ -n "$fingerprint" ]] || {
    echo "baseline: empty fingerprint for ../$d" >&2
    exit 1
  }
  printf '%s %s\n' "$d" "$fingerprint"
done > /tmp/Decky-SteamAchievements/siblings.before

git ls-remote --heads origin > /tmp/Decky-SteamAchievements/remote-heads.before   # must succeed
git ls-remote --tags  origin > /tmp/Decky-SteamAchievements/remote-tags.before    # must succeed
git tag -l                   > /tmp/Decky-SteamAchievements/local-tags.before
sha256sum orchestration.conf.local > /tmp/Decky-SteamAchievements/conf-local.sha
```

If either `ls-remote` fails, stop — an unverifiable baseline makes checks 7 and 8 meaningless.

---

1. **Gates pass on a clean tree.** Run `scripts/orchestration/run-quality-gates` and capture the
   output and exit status of `git status --porcelain` separately; require the gate to exit 0, Git
   status to succeed, and its captured output to be empty. Define that same clean-tree assertion
   once, install a cleanup trap, create the exact untracked file `.verification-stray`, and require
   the assertion to return non-zero. Remove the stray file, clear the trap, and require the
   clean-tree assertion to succeed again before continuing.

   Then create two independent disposable local clones under `/tmp/Decky-SteamAchievements`. In
   the first, change only `package-lock.json.packages[""].version`; in the second, change only
   `package.json.name`. Run `scripts/orchestration-hooks/quality-gates` inside each clone and
   require a non-zero exit plus the case-specific metadata-disagreement diagnostic from each.
   Remove both clones and require the implementation worktree to remain clean.

2. **Version tooling round-trips all committed package metadata without touching identity and
   fails closed when Git fails.** Create a disposable directory with `mktemp -d` under
   `/tmp/Decky-SteamAchievements`, install a cleanup trap, and copy `plugin.json`, `package.json`,
   and `package-lock.json` into it. Run
   `scripts/set_release_version.py 9.8.7 --project-root <disposable-directory>` and require
   `plugin.json.version`, `package.json.version`, `package-lock.json.version`, and
   `package-lock.json.packages[""].version` all to report `9.8.7`; require `plugin.json.name` to
   remain `Decky-SteamAchievements`; and require `package.json.name`, `package-lock.json.name`,
   and `package-lock.json.packages[""].name` all to remain `decky-steamachievements`.

   Prove the three-file read-before-write guard: in a second disposable directory, copy all three
   files, record the hashes of the valid `plugin.json` and `package.json`, corrupt
   `package-lock.json`, and require the setter to exit non-zero without changing either recorded
   hash. Remove that directory.

   Exercise all four `version_guard.py` commands against the real zero-tag repository:
   `check-base 0.1.0` and `check-drift 0.1.0` must exit 0, `next-patch 0.1.0` must print exactly
   `0.1.1`, and `highest` must exit 0 with empty stdout. Capture command exit status separately
   from stdout.

   Then place an executable `git` shim first on `PATH` that exits 73 for every invocation and
   confirm `version_guard.py highest` exits non-zero. Finally, change one copied metadata file's
   `name`, rerun the same identity assertion, and require that assertion to fail. Remove
   the disposable directory and confirm the three source metadata files were never modified.

3. **The changelog gate blocks.** `python3 scripts/changelog.py check 0.1.0` must succeed, and
   `python3 scripts/changelog.py check 9.9.9` must exit non-zero. For the failure proof, create a
   temporary changelog under `/tmp/Decky-SteamAchievements` containing a substantive
   `[Unreleased]` section but no `[0.1.0]` section, then require
   `python3 scripts/changelog.py --file <temporary-changelog> check 0.1.0` to exit non-zero.
   Remove the temporary file and confirm `CHANGELOG.md` is unchanged.

4. **The package validator rejects bad archives.** Build with
   `node scripts/package.mjs --release --release-version 0.1.0 --emit-release-metadata`; confirm
   the three emitted assets exist and
   `python3 scripts/validate_plugin_zip.py Decky-SteamAchievements.zip --expected-root Decky-SteamAchievements --expected-name "Achievements Restored" --expected-version 0.1.0`
   passes. Then build deliberately broken copies — wrong archive root, wrong `plugin.json` name,
   wrong `package.json` name, mismatched version — and invoke the validator with the same
   `--expected-name` and `--expected-version` flags, confirming a non-zero exit for **each**. A
   validator that never rejects is the failure mode here.

5. **Local release preparation and stable prepublication refuse unsafe conditions without
   publishing.** The tracked `scripts/orchestration` symlink is relative and would otherwise be
   broken in these clones. Before creating them, make
   `/tmp/Decky-SteamAchievements/agent-orchestration` a temporary symlink to the real
   `../agent-orchestration`; fail rather than replacing that path if it already exists with a
   different target, and remove it afterward only if this check created it. Put every fixture
   clone directly one directory below `/tmp/Decky-SteamAchievements`, and confirm
   `scripts/orchestration/run-quality-gates` resolves inside each clone without changing the
   tracked symlink or dirtying the fixture. Install a cleanup trap for this temporary helper.

   First, prove `release.sh` remains local. Run each early-failure case in its own disposable
   local clone under `/tmp/Decky-SteamAchievements`, rename that clone's checked-out
   implementation branch to `main`, and keep its `origin` pointed at the local source repository
   rather than GitHub. Use `9.9.9` as the target version and require both a non-zero exit and the
   case-specific diagnostic:

   - create one untracked file and require `release: working tree must be clean`;
   - create the local tag `v9.9.9` and require `release: tag v9.9.9 already exists`;
   - leave the clone clean with no `9.9.9` changelog section and require the missing-section
     diagnostic from `changelog.py`;
   - place a `git` shim first on `PATH` that exits non-zero only for `git status --porcelain`,
     delegates every other invocation to the real Git executable, and require a non-zero exit with
     a git-status failure diagnostic;
   - place a `git` shim first on `PATH` that exits 74 only for
     `git rev-parse --verify --quiet refs/tags/v9.9.9`, delegates every other invocation to the
     real Git executable, and require a non-zero exit with
     `release: failed to check whether tag v9.9.9 exists`.
   - place a `git` shim first on `PATH` that exits 75 only for
     `git branch --show-current`, delegates every other invocation to the real Git executable,
     and require a non-zero exit with a branch-lookup failure diagnostic.
   - for this case only, invoke `release.sh 0.1.0` so the committed changelog section is valid,
     point `origin` at a nonexistent disposable path, and require a non-zero exit with a
     remote-tag-refresh failure diagnostic.

   In another disposable clone, prove that current remote state controls the requested version
   rather than merely checking the newer pre-stamp metadata. Rename the branch to `main`, roll
   over and commit changelog notes for `0.0.8`, create a disposable bare origin with a `v0.0.9`
   tag that is absent locally, and point the clone's `origin` at it. Require
   `release.sh 0.0.8` to exit non-zero with the stable-version monotonicity diagnostic after
   observing that remote tag; require all four source version fields to remain at `0.1.0`,
   require both `v0.0.8` and `v0.0.9` to remain absent locally, and require every ref in the bare
   origin to remain unchanged.

   Then run two late-stage cases in additional disposable clones. In each clone, rename the branch
   to `main`, run `python3 scripts/changelog.py rollover 9.9.9`, commit the resulting changelog,
   create an empty disposable bare repository, point `origin` at that bare repository, and record
   its refs before invoking `release.sh`:

   - replace `validate_plugin_zip.py` with a committed failure shim carrying a unique diagnostic;
     require `release.sh 9.9.9` to exit non-zero with that diagnostic, require `v9.9.9` not to
     exist, and require the bare origin's refs to remain unchanged;
   - with the real validator restored, install a `post-commit` hook that writes a marker, place a
     `gh` shim first on `PATH` that writes a separate marker and exits non-zero, and require
     `release.sh 9.9.9` to succeed. Require an annotated local `v9.9.9` tag, a validator-approved
     `Decky-SteamAchievements.zip`, all four version fields at the tagged commit to equal `9.9.9`,
     all four name fields at the tagged commit to retain the identities from Task 0, both printed
     push commands, no hook marker, no `gh` marker, and no change to any ref in the disposable
     bare origin.

   Next, exercise `scripts/check_release_preconditions.sh` directly through its documented local
   invocation in disposable clones and bare repositories only. Start with a passing fixture: a
   valid stable tag/version and changelog, a validator-approved archive, a tagged commit that is
   an ancestor of the fixture's `origin/main`, and no higher stable remote tag. Require the script
   to exit 0 without invoking `gh` or changing any local or remote ref.

   Then prove every delegated precondition propagates failure before publication, one fixture at
   a time, requiring a non-zero exit and a unique case-specific diagnostic:

   - point the candidate tag at a side-branch commit that is not an ancestor of `origin/main`;
   - make the full quality-gate command fail through a committed failure shim;
   - remove or mismatch the target changelog section;
   - make `validate_plugin_zip.py` fail through a committed failure shim;
   - add a higher stable tag only to the disposable bare origin, leaving it absent locally.

   For every case, put a `gh` failure shim first on `PATH` that would write a marker if called,
   snapshot local tags and all bare-origin refs before the invocation, and require no marker and
   byte-identical before/after snapshots. In the higher-remote-tag case, also require the higher
   tag to remain absent locally, proving that the read-only comparison did not mutate or prune
   local tags.

   Remove every disposable clone and bare repository afterward, plus the temporary
   `agent-orchestration` helper if this check created it. Do not create the dirty file, test tag,
   changelog rollover, hook, shim, malformed archive, or missing changelog condition in the
   implementation worktree.

6. **CI is proven by running it, not by reading it.** Push the implementation branch to origin and
   confirm the `ci.yml` run completes successfully:

   ```bash
   set -euo pipefail
   branch="$(git branch --show-current)"
   head_sha="$(git rev-parse HEAD)"
   git push -u origin HEAD

   run_id=""
   for _ in {1..30}; do
     run_id="$(gh run list \
       --workflow ci.yml \
       --branch "$branch" \
       --commit "$head_sha" \
       --event push \
       --limit 1 \
       --json databaseId \
       --jq '.[0].databaseId // empty')"
     [[ -n "$run_id" ]] && break
     sleep 2
   done

   [[ -n "$run_id" ]] || {
     echo "ci verification: no ci.yml push run found for $head_sha" >&2
     exit 1
   }
   gh run watch --exit-status "$run_id"
   ```

   `--exit-status` makes a failed run fail this check. This replaces every static inspection of
   workflow contents: the repository is published and Actions are enabled, so the workflows can be
   executed for real, and a green run proves more than any amount of fragment matching. Reading a
   workflow cannot tell you whether the runner image, the pinned actions, the cache keys, or the
   token permissions are right; running it can.

   Pushing a feature branch is expected and permitted. Publishing a **release** is not — see 7.

7. **Only the implementation branch changed remotely, and no tag was created.** Require the
   remote implementation branch to equal the implementation worktree's current `HEAD`; require
   every other remote branch, every remote tag, and every local tag to match the recorded baseline:

   ```bash
   set -euo pipefail
   root=/tmp/Decky-SteamAchievements
   feature_ref=refs/heads/feat/github-release-setup
   expected_feature="$(git rev-parse HEAD)"

   git ls-remote --heads origin > "$root/remote-heads.after"
   git ls-remote --tags  origin > "$root/remote-tags.after"
   git tag -l                   > "$root/local-tags.after"

   ref_oid() {
     awk -v wanted="$2" '$2 == wanted { print $1 }' "$1"
   }

   before_feature="$(ref_oid "$root/remote-heads.before" "$feature_ref")"
   after_feature="$(ref_oid "$root/remote-heads.after" "$feature_ref")"
   [[ "$after_feature" == "$expected_feature" ]]
   if [[ -n "$before_feature" ]]; then
     git merge-base --is-ancestor "$before_feature" "$after_feature"
   fi

   awk -v feature="$feature_ref" \
     '$2 != feature' "$root/remote-heads.before" > "$root/remote-heads-unpermitted.before"
   awk -v feature="$feature_ref" \
     '$2 != feature' "$root/remote-heads.after" > "$root/remote-heads-unpermitted.after"
   diff "$root/remote-heads-unpermitted.before" "$root/remote-heads-unpermitted.after"

   diff "$root/remote-tags.before" "$root/remote-tags.after"
   diff "$root/local-tags.before" "$root/local-tags.after"
   echo "only-implementation-branch-changed"
   ```

   Every command runs under `set -e`. An unreadable remote, a feature ref not pointing to the
   verified implementation commit, a non-fast-forward feature update, any change to another
   remote branch or tag, or any local-tag change fails the check. To prove the comparison itself
   can fail without changing a remote ref, copy `remote-tags.after` to a temporary snapshot,
   append a synthetic tag row to that copy, require the baseline diff to exit non-zero, and remove
   the copy.

8. **Nothing outside this repo changed.** Two parts:

   - `orchestration.conf.local` matches the hash recorded in the pre-edit block (`sha256sum -c`).
   - No sibling repository was modified. Compare against the sibling fingerprint recorded in the
     pre-edit block; a bare after-the-fact snapshot cannot distinguish pre-existing sibling dirt
     (which exists: several siblings carry uncommitted notes) from a change you made. In the shell
     used for the after-check, redefine the function before calling it:

     ```bash
     set -euo pipefail
     sibling_fingerprint() {
       local repo="$1"
       local untracked_paths fingerprint
       if ! untracked_paths="$(mktemp /tmp/Decky-SteamAchievements/sibling-untracked.XXXXXX)"; then
         return 1
       fi
       if ! git -C "$repo" ls-files --others --exclude-standard -z | sort -z > "$untracked_paths"; then
         rm -f -- "$untracked_paths"
         return 1
       fi
       if ! fingerprint="$(
         {
           git -C "$repo" rev-parse HEAD || exit 1
           git -C "$repo" diff --binary HEAD -- || exit 1
           while IFS= read -r -d '' path; do
             printf 'untracked:%s\0' "$path"
             sha256sum -- "$repo/$path" || exit 1
           done < "$untracked_paths"
         } | sha256sum | cut -c1-16
       )"; then
         rm -f -- "$untracked_paths"
         return 1
       fi
       rm -f -- "$untracked_paths"
       [[ -n "$fingerprint" ]] || return 1
       printf '%s\n' "$fingerprint"
     }

     for d in Decky-Metadata SDH-ludusavi decky-tooling DeckConnect; do
       git -C "../$d" rev-parse --git-dir >/dev/null
       fingerprint=""
       if ! fingerprint="$(sibling_fingerprint "../$d")"; then
         echo "verification: failed to fingerprint ../$d" >&2
         exit 1
       fi
       [[ -n "$fingerprint" ]] || {
         echo "verification: empty fingerprint for ../$d" >&2
         exit 1
       }
       printf '%s %s\n' "$d" "$fingerprint"
     done > /tmp/Decky-SteamAchievements/siblings.after

     diff /tmp/Decky-SteamAchievements/siblings.before \
       /tmp/Decky-SteamAchievements/siblings.after
     ```

     Since this plan only ever reads siblings, any difference means something went wrong: stop
     and report rather than cleaning up. To prove the comparison can fail without touching a
     sibling, copy `siblings.after` to a temporary snapshot, append a synthetic fingerprint row,
     require the baseline diff to exit non-zero, and remove the copy. Then place a `git` shim first
     on `PATH` that fails only the `ls-files --others --exclude-standard` invocation and delegates
     every other invocation to the real Git executable; require `sibling_fingerprint` itself to
     return non-zero. Repeat with shims that fail only `rev-parse HEAD` and only `diff --binary
     HEAD --`, and with a `sha256sum` shim that fails only for one untracked fixture in a
     disposable repository. Each acquisition error must make `sibling_fingerprint` return
     non-zero rather than collapse into a valid-looking fingerprint.

**Deferred — the dev-release workflow, because an implementation round cannot reach it.**
`dev-release.yml` fires on a push to `dev`, which happens when the reviewed branch is *merged* —
after the round ends. The implementer therefore cannot execute or prove it, and a check it cannot
reach is not a check. After the merge and first `dev` push, require `gh release list --limit 1000
--json tagName` to contain exactly one `dev-build`; require the REST release at
`repos/{owner}/{repo}/releases/tags/dev-build` to report `prerelease: true`, exactly one asset
named `Decky-SteamAchievements.zip`, and a tag ref equal to the remote `dev` head; and record that
release's numeric ID, asset ID, and tag OID. After the next legitimate `dev` push and successful
`dev-release.yml` run, require the release count to remain one, the release ID to remain the same,
the asset ID and tag OID to have changed, and the moved tag to equal the new remote `dev` head.
Capture every query's exit status separately from its output; an API or `ls-remote` failure must
fail the check rather than look like a missing release.

**Deferred to a human, and genuinely outstanding:** merging `dev` to `main`, running
`release.sh 0.1.0`, pushing the tag, and confirming `release.yml` publishes the stable release
with the correct asset names. That chain is the only thing that proves the stable path end to
end, and it is deliberately not automated here.

---

## Mark Round Complete

When the implementation round is complete and the working tree is clean, run:

```bash
scripts/orchestration/mark-finished github-release-setup
```

This writes:

```text
/tmp/Decky-SteamAchievements/github-release-setup_finished
```

Then exit cleanly. If this process exits, the orchestrator will resume you through
`scripts/orchestration/continue-implementer github-release-setup`.

---

## Review Polling Loop

After marking the round complete, check existing review notes first, then poll for new review notes if you remain active:

```text
docs/review/github-release-setup-review-*.md
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
   scripts/orchestration/clear-finished github-release-setup
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
   git add docs/review/github-release-setup-review-*.md
   git commit -m "docs(review): record github-release-setup review notes"
   ```

8. Recreate the round-complete marker:

   ```bash
   scripts/orchestration/mark-finished github-release-setup
   ```

9. Either continue polling or exit cleanly. If you exit, the orchestrator will resume you with `scripts/orchestration/continue-implementer github-release-setup` after the next review note is created.

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
   scripts/orchestration/check-review-notes-committed github-release-setup
   ```

3. Confirm the working tree is clean:

   ```bash
   git status --short
   ```

4. Finalize:

   ```bash
   scripts/orchestration/finalize github-release-setup
   ```

5. Confirm the finalized marker exists:

   ```text
   /tmp/Decky-SteamAchievements/github-release-setup_finalized
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
scripts/orchestration/finalize github-release-setup
```

Do not manually merge into `dev` unless the finalize script fails and the user/orchestrator explicitly instructs you to recover manually.

Leave both markers in place after finalization:

```text
/tmp/Decky-SteamAchievements/github-release-setup_finished
/tmp/Decky-SteamAchievements/github-release-setup_finalized
```

Any project-specific release step runs from the project's
`scripts/orchestration-hooks/finalize-release` hook, invoked by finalize.
