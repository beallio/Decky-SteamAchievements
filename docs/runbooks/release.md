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

## Publish a discoverable development release

The push-triggered `dev-build` release is a replaceable convenience channel. It
contains exactly `Decky-SteamAchievements.zip`, stamps the packaged version as
`X.Y.Z-dev.g<sha>`, and deliberately has no checksum manifest for updater
discovery.

To publish a permanent development candidate for in-plugin discovery, start
from a clean tree whose `package.json` and `plugin.json` contain the next stable
base version, authenticate `gh`, and run:

```bash
scripts/request_dev_release.sh X.Y.Z [commit]
```

The helper validates the version, clean tree, GitHub authentication, commit,
source metadata, and stable-tag ordering before dispatching
`.github/workflows/immutable-dev-release.yml`. The workflow derives
`X.Y.Z-dev.g<sha>` / `vX.Y.Z-dev.g<sha>`, refuses an existing tag, reruns the
full quality gates, and publishes exactly:

- `Decky-SteamAchievements.zip`
- `Decky-SteamAchievements-vX.Y.Z-dev.g<sha>.zip.sha256`
- `Decky-SteamAchievements-vX.Y.Z-dev.g<sha>.manifest.json`

The immutable workflow is manual. Code implementation, orchestration
finalization, and the existence of this helper do not authorize dispatching it,
creating the tag, or publishing the prerelease.

### Recover a failed publication without rewriting the tag

If the tag-triggered workflow fails because of the workflow itself, fix and promote the workflow
through `dev` and `main`; never move, force-push, or delete the permanent semver tag. Once the fix
is on `main`, dispatch the same workflow from `main` with the existing tag:

```bash
gh workflow run Release --ref main -f tag=vX.Y.Z
gh run watch RUN_ID --exit-status
```

The recovery job checks out the existing tag and runs the same provenance, metadata, changelog,
quality, monotonicity, and ZIP gates before publication. This path can recover a workflow defect;
it cannot repair invalid source or release metadata already captured by the tag.

## Understand the three states

1. **Local-only orchestration (current).** `orchestration.conf.local` sets
   `ORCH_LOCAL_ONLY=1`. Finalization merges locally and the finalize hook only prints these
   instructions. Nothing leaves the machine.
2. **Remote base-branch pushing.** Removing `ORCH_LOCAL_ONLY=1` is not enough. Remote pushes also
   require the separate `ORCH_PUSH=1` authorization; committed `orchestration.conf` leaves it at
   its default `0`. Enable that deliberately and separately when remote base-branch updates are
   wanted.
3. **Human-requested release dispatch.** The finalize hook does not invoke `gh`,
   dispatch a workflow, or publish anything. Stable publication follows the tag
   flow above; immutable development publication begins only when a human runs
   `scripts/request_dev_release.sh`.

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
`Decky-SteamAchievements.zip`. It does not create the immutable development
release; that remains a separate manual action.
