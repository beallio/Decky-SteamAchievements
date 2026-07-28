# Review — sdh-ludusavi-updates-panel (round 01)

Branch: `feat/sdh-ludusavi-updates-panel`
Reviewed against: `docs/plans/2026-07-27_sdh-ludusavi-updates-panel.md`

## Verdict

The updater port is broad, close to the SDH-ludusavi donor, and green under the
repository quality gates, but three correctness/documentation gaps remain. The
runtime-state reconciliation and install handoff are not sufficient to protect
the existing settings file across Decky's overlapping old/new backend process
window, the manual immutable-dev helper does not yet enforce its full preflight
contract, and the prerequisite docs move left tracked documentation pointing at
a file that no longer exists in a clean checkout.

## Gate status

- `scripts/orchestration/run-quality-gates`: passed (8 frontend files / 100
  tests; 77 Python tests).
- `npm run package`: passed and included every new `backend/**/*.py` module.
- `python3 scripts/validate_plugin_zip.py`: the generated local-build ZIP was
  structurally valid; its expected version is `0.1.1+8a033ac` rather than the
  source base `0.1.1`.
- `git diff --check`: passed.
- Review verdict: changes requested for the items below.

## Required changes

1. **Protect every settings read-modify-write across backend processes.**
   `Plugin._save_updater_state()` takes the runtime `fcntl` lock, but
   `Plugin._save_setting()` takes only the instance-local `_settings_lock`.
   During Decky's reload window, an old updater worker and the new backend can
   therefore both read `settings.json`, atomically replace it in either order,
   and silently erase the other's update (for example, losing a newly changed
   `feature_enabled` value or reverting `update_channel`). Use one bounded
   inter-process lock/consistent lock order for all four settings mutations,
   while retaining atomic replacement and the separate runtime-state payload.
   Add a deterministic test with independent holders that forces overlapping
   read-modify-write operations and proves both changes survive.

2. **Make `scripts/request_dev_release.sh` enforce the plan's complete
   pre-dispatch contract.** Its two `git diff` checks do not see untracked files,
   so a dirty tree currently dispatches. It also accepts a locally resolvable
   commit that is not available to Actions and checks only locally known tags,
   so an unsuitable ref or stale tag view can pass locally and fail after
   dispatch. Fail closed on `git status --porcelain` (including inspection
   errors), refresh/verify the relevant remote refs and tags, and prove the
   selected commit is remotely reachable before invoking `gh workflow run`.
   Add executable helper tests for the untracked-tree and non-remote-ref cases;
   static substring assertions alone do not demonstrate these gates.

3. **Repair tracked references to the deleted root `HANDOFF.md`.** The
   prerequisite commit intentionally removed that tracked file, but current
   `AGENTS.md` and `DEVELOPER.md` still direct contributors to it, as do several
   implementation-plan references. A clean clone has neither root `HANDOFF.md`
   nor the ignored local `research/HANDOFF.md`. Point active guidance at a
   tracked authoritative replacement (or move the authoritative handoff into
   its intended tracked docs location), and update the remaining tracked links
   so `rg 'HANDOFF\\.md'` no longer reports dead paths.

STATUS: CHANGES_REQUESTED
