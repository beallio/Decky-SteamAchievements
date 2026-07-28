# Review — fix-decky-python-module-packaging (round 01)

Branch: `feat/fix-decky-python-module-packaging`
Reviewed against: `docs/plans/2026-07-28_fix-decky-python-module-packaging.md`

## Verdict

The package mapping and validator fix are semantically correct, the current archive is
complete, and live Deck validation proves the original `ModuleNotFoundError` is resolved.
Two plan-required regression fences are still missing, so this round is not ready to merge.

## Gate status

- Implementer gate: passed metadata/identity/installer checks, TypeScript build, 100 Vitest
  tests, 85 Pytest tests, Python compilation, package validation, version drift, and review
  note preservation.
- Independent orchestrator gate: passed the same complete gate.
- Exact device ZIP `396f69c2815dd26ad0527eaf648ebb25a45617e66c54bd65a78f255fa7724bc0`
  has 10 expected backend sources, no missing/extra/duplicate module, and no root
  `backend/` entry.
- Independent Deck-style import simulation loaded extracted root `main.py` after removing
  the repository root from `sys.path` and adding only packaged `py_modules`; imported
  `backend` resolved from the extracted archive.
- Steam Deck `0.1.1+3bd0475` smoke passed backend startup, Check Now, QAM/focus traversal,
  settings preservation, Brotato `79/179`, and active-service checks.

## Required changes

1. **Add an automated one-to-one backend source/archive parity gate.** The current stricter
   ZIP validator requires only `py_modules/backend/__init__.py` plus extension/path policy.
   If packaging later omits `rpc_pool.py`, `runtime_state.py`, or an updater module, the
   validator and full quality gate can still pass while `main.py` fails at runtime again.
   Add a repository-aware check, invoked immediately after ZIP validation by
   `scripts/orchestration-hooks/quality-gates`, that compares the sorted set of repository
   `backend/**/*.py` paths with archive `py_modules/backend/**/*.py` paths and fails on any
   missing, extra, or duplicate module. Keep `validate_plugin_zip.py` independently usable
   without a source checkout. Add focused tests proving complete, missing, extra, and
   duplicate cases.

2. **Fence validator use in every publication path.** The plan's archive acceptance requires
   release-workflow tests to prove every publisher reaches the stricter validator. Extend
   `tests/test_release_workflows.py` to assert that rolling development and immutable
   development workflows invoke `scripts/validate_plugin_zip.py` with their computed
   expected version, and that stable publication goes through
   `scripts/check_release_preconditions.sh`, whose prepublication path invokes the same
   validator with the stable expected version. Production workflow changes are unnecessary
   unless the new tests reveal a real gap.

3. Run the targeted new tests and the complete orchestration gate, then update the validation
   record with the new automated parity/release-path evidence and final test counts. These
   changes should not alter packaged plugin payloads, so do not reinstall on the Deck unless
   a package input or archive mapping changes. Preserve the existing exact device ZIP and
   its recorded hash.

STATUS: CHANGES_REQUESTED
