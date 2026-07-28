# github-release-setup implementation session

Date: 2026-07-27

Branch: `feat/github-release-setup`

Plan: `docs/plans/2026-07-27_github-release-setup.md`

## Implementation record

- Committed the existing plan first on the feature branch.
- Realigned both `package-lock.json` name fields with `package.json` without moving dependency
  versions. `npm ci` succeeded. npm reported eight existing high-severity audit findings; changing
  dependency versions was outside this plan.
- Added one fail-closed source-metadata checker shared by local and hosted CI.
- Ported the full four-command version guard and made Git lookup errors fatal. The version setter
  reads and validates all three metadata files before writing any file, and updates four version
  fields without changing identity.
- Ported the changelog parser and ZIP validator, extending the latter to enforce the package name
  `decky-steamachievements`.
- Added local-only release preparation, a directly executable stable prepublication gate, CI,
  rolling dev-prerelease, and stable-release workflows.
- Replaced the finalize stub with a print-only handoff and added the human release runbook.

The setter is covered by the requested read-before-write behavior but writes the three validated
JSON files sequentially. Cross-file rollback after an operating-system write failure was
deliberately left for implementation review, as requested by the plan.

The Python release scripts are covered by the direct behavioral verification below rather than a
new Python unit-test suite. The repository's existing automated suite remains Vitest.

## Verification record

1. **Clean gates and metadata agreement:** `scripts/orchestration/run-quality-gates` passed on a
   clean tree. An exact untracked `.verification-stray` made the clean-tree assertion fail. Two
   disposable clones independently changed only `package-lock.json.packages[""].version` and
   `package.json.name`; both gates failed with case-specific metadata diagnostics.
2. **Version tooling:** the setter round-tripped all four version fields to `9.8.7` in a temporary
   tree while preserving every name. Corrupting `package-lock.json` made the setter fail without
   changing the valid plugin or package files. All four version-guard commands passed their
   zero-tag expectations. A `git` shim exiting 73 made `highest` fail closed, and an intentional
   copied package-name change made the shared identity assertion fail.
3. **Changelog:** curated `0.1.0` notes passed. Missing `9.9.9` notes and a temporary changelog with
   substantive Unreleased notes but no `0.1.0` section both failed. The source changelog hash was
   unchanged by the probes.
4. **ZIP validation:** the real package, checksum, and manifest were produced and the ZIP passed.
   Independently malformed archives with a wrong root, wrong plugin name, wrong package name, and
   mismatched version all failed validation.
5. **Release safety and prepublication:** disposable clones proved dirty-tree, existing-tag,
   missing-changelog, failed status lookup, failed tag lookup, failed branch lookup, failed remote
   lookup, remote monotonicity, and late validator refusal paths. A successful local preparation
   produced an annotated tag and valid ZIP, retained all identities, printed both push commands,
   bypassed a post-commit hook, never invoked a failing `gh` shim, and changed no bare-remote ref.
   The stable precondition script then passed a valid candidate and independently rejected a
   side-branch tag, a failing full quality gate, a missing changelog section, a failing validator,
   and a higher remote-only stable tag. No precondition case invoked `gh` or mutated local or
   remote refs. All disposable repositories and the temporary orchestration helper were removed.
6. **Hosted CI:** pushed only `feat/github-release-setup` at
   `5f29eba29f45ad2b887fb891b0ccb025f64b749d`. GitHub Actions CI run `30320439612` completed
   successfully; every checkout, setup, install, metadata, typecheck, build, Vitest, Python
   compile, and version-drift step passed.
7. **Remote invariants:** the remote feature ref matched the verified implementation SHA. All
   other remote branch refs matched the pre-edit baseline, and both remote and local tag lists
   remained empty. Appending a synthetic stable-tag row to a copied snapshot made the comparison
   fail as required.
8. **External invariants:** `orchestration.conf.local` matched its pre-edit checksum, and the
   fingerprints for `Decky-Metadata`, `SDH-ludusavi`, `decky-tooling`, and `DeckConnect` matched
   their pre-edit values. A synthetic sibling row failed comparison. Selective shims proved that
   failures from untracked-file enumeration, `rev-parse`, tracked diff acquisition, and hashing
   one untracked fixture all make fingerprinting fail rather than return a valid-looking value.

Raw verification logs and snapshots are under `/tmp/Decky-SteamAchievements/` for this session.
