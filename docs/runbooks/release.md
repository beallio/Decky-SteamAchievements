# Release runbook

Decky-SteamAchievements has three deliberately separate delivery paths: local orchestration,
remote base-branch updates, and release publication. Do not treat enabling one as authorization
for the others.

## Prepare curated notes

Choose the stable `X.Y.Z` version and make its `CHANGELOG.md` section substantive and dated. A
stable section needs a non-bullet summary before any headings or bullets. If the notes are still
under `[Unreleased]`, add that summary and roll them over:

```bash
python3 scripts/changelog.py rollover X.Y.Z
python3 scripts/changelog.py check X.Y.Z
```

Review and commit the changelog. The release command fails unless the exact target version has
curated, dated notes.

## Promote through the human gate

Review `dev`, then deliberately merge it into `main`. This is the human release gate; stable
publication is allowed only for a tag whose commit is an ancestor of `origin/main`.

On a clean `main`, prepare the release locally:

```bash
scripts/release.sh X.Y.Z
```

The command checks local and remote stable-version monotonicity, runs the full quality gates,
stamps `plugin.json`, `package.json`, and both `package-lock.json` version fields together,
builds and validates `Decky-SteamAchievements.zip`, creates an annotated local `vX.Y.Z` tag,
and prints the publication commands. It never pushes and never invokes GitHub itself.

Review the version commit, annotated tag, and ZIP. When satisfied, run the two commands printed
by the script:

```bash
git push origin main
git push origin vX.Y.Z
```

This is the release flow's first outward-facing action, not the repository's first publication.
The repository is already public. Updating its public `main` branch and publishing a stable tag
and asset filename are durable actions that become a contract with anyone who installs the
plugin. The tag push triggers `.github/workflows/release.yml`, which rechecks provenance,
metadata, changelog, monotonicity, quality gates, and the ZIP before publishing these assets:

- `Decky-SteamAchievements.zip`
- `Decky-SteamAchievements-vX.Y.Z.zip.sha256`
- `Decky-SteamAchievements-vX.Y.Z.manifest.json`

## Understand the three states

1. **Local-only orchestration (current).** `orchestration.conf.local` sets
   `ORCH_LOCAL_ONLY=1`. Finalization merges locally and the finalize hook only prints these
   instructions. Nothing leaves the machine.
2. **Remote base-branch pushing.** Removing `ORCH_LOCAL_ONLY=1` is not enough. Remote pushes also
   require the separate `ORCH_PUSH=1` authorization; committed `orchestration.conf` leaves it at
   its default `0`. Enable that deliberately and separately when remote base-branch updates are
   wanted.
3. **Engine-driven release dispatch.** This remains out of scope. The finalize hook does not
   invoke `gh`, dispatch a workflow, or publish anything. Automating dispatch requires a helper
   and a separate reviewed plan.

Do not edit `orchestration.conf.local` as part of a release implementation round. It is
machine-local state, and changing it is a separate human decision.

## Advance development after a stable release

Return to `dev`, derive the next patch base from the highest stable tag, and commit all three
metadata files together:

```bash
git checkout dev
scripts/bump_next_patch.sh
git add plugin.json package.json package-lock.json
git commit -m "chore(release): start next patch development"
git push origin dev
```

The `dev` push keeps its base version ahead of the stable tag and triggers
`.github/workflows/dev-release.yml`. That workflow moves the replaceable `dev-build` tag to the
current `dev` head and refreshes the single rolling prerelease with exactly one asset,
`Decky-SteamAchievements.zip`.
