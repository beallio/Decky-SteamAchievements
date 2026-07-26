# HANDOFF — Steam Deck Achievement Bar Investigation

**Last updated:** 2026-07-25
**Task origin:** `steam_achievement_bar_recovery_plan.md` (in this folder)
**Status:** **SOLVED (root cause confirmed live).** See CONCLUSION below. Sections §0–§9 are the investigation trail that led here; some intermediate hypotheses in them (orphaned code, controller-settings red herring) were superseded — CONCLUSION is authoritative.

---

## CONCLUSION (SOLVED)

**What the user calls "the achievement bar"** = the `MiniAchievements` widget ("ACHIEVEMENTS  n/total  ▮▮ bar", blue ribbon at 100%) in the app-details **PlayBar** (`GameStatsSection`), webpack **module 56262** of `chunk~2dcc5aaf7.js`.

**It was not deleted.** The component, its CSS, and its data path all still ship (verified in the user's live Deck build CL 10840511). The bar disappeared because of **one added guard line** in `MiniAchievements.render()`:

```js
if (!this.props.onSeek) return null;
```

- **When:** Steam client update between changelist **10538461** (2026-03-20, guard absent) and **10546225** (2026-03-24, guard present). SteamTracking commit **`29f8d5c9a5c3`**. **NOT April 30** — the plan's date/commits were wrong.
- **Why it hides the bar on the Deck:** the Steam Deck / gamescope game-details header renders its PlayBar with **`onSeek: void 0`** (the non-interactive header variant). `GameStatsSection` forwards that undefined `onSeek` to `MiniAchievements`; the new guard then returns `null`. On surfaces where the PlayBar gets a real `onSeek` (`t.SeekToSection`, the clickable in-page/desktop variant) the bar still renders.
- **Live proof (read-only CDP, user's Deck, Brotato appid 1942280):** the rendered `GameStatsSection` shows "LAST PLAYED / PLAY TIME" only; React fiber prop `onSeek === undefined`; `MiniAchievements` element count = 0. `installed:true`, so it's not the install/data guard.

**Restoration options for a Decky plugin (research only — not implemented):** the component + CSS + `GetAchievements(appid)` store all still exist, so any of:
1. Patch the app-details PlayBar render to pass a real (or no-op) `onSeek` so `MiniAchievements` renders again.
2. Patch/replace `MiniAchievements` to drop the `!onSeek` guard.
3. Render `MiniAchievements` (or a reimplementation) directly into `GameStatsSection`, feeding `GetAchievements(appid)` → `{nTotal,nAchieved}`; 100% → `OiG fullcolor` ribbon.
Decky approach: `routerHook.addPatch` on the library app route + `findModuleChild`/webpack require capture (the `webpackChunksteamui.push` handle) to reach the component/store. See §4/§4b for names.

**RUNTIME PROOF (done, 2026-07-25):** Injected a real `onSeek` into the live `MiniAchievements` instance on the user's Deck (Brotato, Big Picture page) and forced a re-render — the bar reappeared showing **"ACHIEVEMENTS 79/179" + blue bar**, correctly placed after PLAY TIME. Screenshot: `/tmp/Decky-SteamAchievements/ach_inject_success.png`. This confirms the guard line is the entire removal and that restoration only needs `onSeek` supplied.

Runtime facts learned (for a plugin):
- Steam contexts are split: **`SharedJSContext`** holds `webpackChunksteamui`, `SP_REACT`, `SP_REACTDOM`, `App`, and the stores; the visible **`Steam Big Picture Mode`** window holds the app-details DOM/fibers but NONE of those globals. React/webpack work must target the right context.
- Require capture: `self.webpackChunksteamui.push([[Math.random()],{},r=>{R=r}])` gives `R`. **`R.c` (module cache) reads empty here**; use **`R.m` (factory map)** and call **`R(id)`** to instantiate.
- **Achievements store = `R(78057).H`** in SharedJSContext (resolved from module 56262's `m.H.GetAchievements`). `GetAchievements(appid)` → `{nTotal,nAchieved,vecHighlight,vecUnachieved}`. Verified `GetAchievements(1942280)` → `{nTotal:179,nAchieved:79}`.
- The component is a **mobx `observer`** class — `render` is non-configurable (can't reassign). The working injection patched **`props`** instead: `Object.defineProperty(inst,'props',{get,set})` wrapping to always include `onSeek`, then `inst.forceUpdate()`. Injection script: `/tmp/Decky-SteamAchievements/scripts/cdp_inject3.py`.
- Injection is **transient** (in-memory; reload/navigation clears it). No files/config written to the Deck (the temp screenshot was removed).

---

## 0. TL;DR for the next agent

> **HISTORICAL / SUPERSEDED — read the CONCLUSION at the top instead.** §0 and §1
> were written mid-investigation, before the root cause was confirmed. They record
> intermediate hypotheses (some wrong) and are kept only as the reasoning trail.
> The CONCLUSION is authoritative: the bar is hidden by the added
> `if (!this.props.onSeek) return null;` guard (CL 10546225), restored by supplying
> `onSeek`, proven live.

The compact **"ACHIEVEMENTS  44/82  ▮▮▮▯" bar beside the Play button** (with a blue completion ribbon at 100%) is a real component: webpack **module 56262**, class **`MiniAchievements`**, mounted inside **`GameStatsSection`** (the app-details "PlayBar" row). Its code is present and byte-stable in **every** SteamTracking build from 2025-07 → 2026-07-24 **and** in the user's live Deck build (CL 10840511). The plan's "removal commit" `79adf888` is actually a **Controller-Settings** update with zero achievement changes.

User confirmed the reference screenshot is from an **older build**.

**UPDATE (later in session 1): the "orphaned code" hypothesis is DISPROVEN.** I traced the full render chain in the user's *current* Deck build (CL 10840511) and it is entirely intact:

```
app-details page (mod 40478 sticky header / mod 59856 in-page)
  -> in-page PlayBar rendered with  onSeek: t.SeekToSection   (a REAL callback; bInPage:!0)
     -> GameStatsSection  forwards  onSeek: this.props.onSeek
        -> MiniAchievements  (guard `if(!this.props.onSeek) return null` passes) -> RENDERS
```

There are TWO PlayBar instances: the **sticky/collapsed header** passes `onSeek: void 0` (bar intentionally hidden there), the **in-page header** passes `onSeek: t.SeekToSection` (bar shown). Both exist in April AND current. The `MiniAchievements` body is behaviorally identical old vs current (same 4 guards: `!nTotal`, `BIsFeatureBlocked(3)` [now enum `I.WJ`], `!installed&&nAchieved==0`, `!onSeek`; same DOM).

So **statically, the bar SHOULD render on the user's Deck** for any installed game with achievements. Remaining explanations for "it's gone":
1. **Runtime feature-block** — `BIsFeatureBlocked(3)` true (server/feature-flag/A-B/family-view). NOT yet checked at runtime.
2. **Removal in a build NEWER than the Deck's CL 10840511** — e.g. a beta/preview channel the user observed, while their .20 Deck (stable) still has it. Check SteamTracking commits after 2026-07-24 / other channels.
3. It still renders and the report is about another device/build.

**#1 next step = live DOM read (needs a game page open on the Deck) + a runtime `BIsFeatureBlocked(3)` check.** A DOM probe (`/tmp/Decky-SteamAchievements/scripts/cdp_dom.py`) is ready; hashed classes: `MiniAchievements`=`UAhWiMg9Q2VPsQQBj_ikT`, `GameStatsSection`=`_1mDAVT4sTzFRwJtlKCw2Ws`. Ran it with no game page open -> all zero (expected).

---

## 1. THE OPEN QUESTION (do this first) — RESOLVED (historical)

> **RESOLVED — superseded by CONCLUSION.** Both questions below were answered.
> (1) `GameStatsSection` IS rendered, not orphaned. (2) The bar is hidden because
> the Deck header renders its PlayBar with `onSeek: void 0` and Valve added the
> `if (!this.props.onSeek) return null;` guard — NOT a feature-block or a newer
> channel. Confirmed live on the user's Deck (Brotato: onSeek undefined,
> `MiniAchievements` count 0; injecting onSeek → count 1, "ACHIEVEMENTS 79/179").
> The text below is the original open-question framing, kept for the trail.

**Superseded question (answered):** ~~Is `GameStatsSection` rendered or orphaned?~~ → It IS rendered; chain intact in CL 10840511 (see §0 UPDATE, §4b).

**Original open question (now answered — see CONCLUSION):** Given the render chain is intact on the Deck's build, *why* does the user not see the bar? → the PlayBar passes `onSeek: void 0` and the added `!onSeek` guard returns null.

Two ways to run the DOM read:

### 1a. Live DOM read (ground truth, fastest)
The user must open a game **with achievements** (e.g. Starfield, appid **1716740**) on their Deck so an app-details page is on screen. Then read the live DOM via CEF and look for the `MiniAchievements` hashed class or the `GameStatsSection` element.
- First get the `MiniAchievements` hashed class name from the CSS-module map (module **96821** in current build; I captured neighbors like `GameStatsSection:"_1mDAVT4sTzFRwJtlKCw2Ws"` but the `MiniAchievements` value was truncated — re-query it).
- Then `Runtime.evaluate`: `document.querySelectorAll('[class*="<minihash>"]').length` and dump `document.querySelector('[class*="GameStatsSection-hash"]').outerHTML`.

The user was asked to open a game page + confirm whether the reference screenshot is from stable vs beta channel — **that answer may already be in the conversation above this handoff; check first.**

### 1b. Static/runtime consumer trace (no user needed)
Find who *renders* module 56262's exported PlayBar and whether that path is on the live app-details route.
- In the beautified April bundle, module 56262 exports a PlayBar wrapper (classes in it: `Ze`=PlayBarIconAndGame, `Ye`=ActionSection, `Qe/Pe`=GameStatsSection). Find its `module.exports`/`r.d(...)` export table (near end of module, lines ~510600-510639 in `/tmp/Decky-SteamAchievements/pre/chunk~2dcc5aaf7.js`).
- Then grep the bundle for modules that `r(56262)` and render that export. Determine if the top-level app-details page component (the one behind route `.../routes/library/app/:appid` or the game-details React node) is among them in the **current** build.
- Compare the app-details **header** module between an OLD build (bar visible) and the current build to see if the PlayBar invocation was dropped/replaced by the redesigned header.

---

## 2. Environment & access

- **Working repo:** `/mnt/Scripts/Decky-SteamAchievements` (this is a Decky plugin repo; scope is **research only**, no plugin code changes).
- **Exploratory / heavy files:** `/tmp/Decky-SteamAchievements/` (per user instruction — keep scratch here, NOT in the repo).
- **Deliverables:** `<repo>/research/` (gitignored). Final report artifacts go here.
- **Steam Deck (read-only, NO CHANGES ALLOWED):** `ssh deck@<deck-host>`
  - steamui assets: `~/.local/share/Steam/steamui/` (and `~/.steam/steam/steamui/`)
  - **CEF remote debugging already enabled** (flag `~/.steam/steam/.cef-enable-remote-debugging` predates this work; do NOT create/modify it). Listener: `127.0.0.1:8080`, launched with `--remote-allow-origins=*`. Current build: **CL 10840511**, buildid 1784778118.
  - CEF targets: `SharedJSContext` (main UI, was at `https://steamloopback.host/routes/library/home`) is target #4; also a `Steam Big Picture Mode` page.
  - An SSH `-L` tunnel to 8080 did **not** establish cleanly in my session; instead I run CDP clients **on the Deck** by piping over stdin: `ssh deck@<deck-host> 'python3 -' < script.py`. Deck has Python 3.13, **no** `websocket`/`node`. My scripts implement a pure-stdlib WebSocket/CDP client — reuse them.
- **SteamTracking:** blobless partial clone at `/tmp/Decky-SteamAchievements/SteamTracking` (`git clone --filter=blob:none --no-checkout`). Use `git show <commit>:<path>` (lazily fetches the ~22 MB blob). **`git log -S` pickaxe is too slow** over the blobless clone (refetches each blob) — sample specific commits instead. SteamTracking stores bundles **beautified** (multi-line); the Deck ships them **minified** (single line).

---

## 3. Key commits & artifacts

| Role | Commit | Date | Steam CL | Note |
|---|---|---|---|---|
| Plan's "pre" (WRONG) | `701ecca79ccf8b8ab635ca43fbe68eb36d11484a` | 2026-04-29 | — | only touches `steam_client_beta_linuxarm64`, not steamui |
| **True PRE** | `b9766fadd33a819ba76cdb3402412fd5fa39fa17` | 2026-04-28 21:58 | 10620104 | last steamui content before the plan's "post" |
| Plan's "removal" (is a Controller-Settings update) | `79adf888dd8e2de5e83fe7afed1d21810a2b65cf` | 2026-04-30 04:29 | 10623317 | rewrites bundles but **zero** achievement changes |
| SteamTracking HEAD | `2cd20e8c0fd1c95c00634f8d49b8095343bd288d` | 2026-07-24 | — | |
| Live Deck | (working tree) | — | 10840511 | runtime-inspected |

Key file paths in SteamTracking: `ClientExtracted/steamui/chunk~2dcc5aaf7.js`, `.../css/chunk~2dcc5aaf7.css`, `.../library.js`, `.../localization/steamui_english.json`.

**Byte-for-byte extracts + SHA-256 manifest:** `<repo>/research/reports/artifact_manifest.tsv`.
Raw extracts: `/tmp/Decky-SteamAchievements/{pre,post,current}/`.

---

## 4. The component (fully mapped)

**File:** `chunk~2dcc5aaf7.js`, **module 56262**. Beautified April copy: `/tmp/Decky-SteamAchievements/pre/chunk~2dcc5aaf7.js`.
Minified local names differ per build (April → current): `fe`→`Ie` (MiniAchievements class), `Pe`→`Qe` (GameStatsSection class), `Ce`→(bar subcomponent), `be`→(cloud status).

**`MiniAchievements` render (April lines ~509551–509605):**
```js
class MiniAchievements extends Component {          // April local: fe
  render() {
    const e = GetAchievements(this.props.details.unAppID);   // {nTotal,nAchieved,...}
    if (!e.nTotal) return null;
    if (BIsFeatureBlocked(3)) return null;                    // feature 3 = achievements
    if (!this.props.overview.installed && e.nAchieved==0) return null;
    if (!this.props.onSeek) return null;
    let is100 = e.nAchieved/e.nTotal == 1;
    return <div className={cx(GameStat, MiniAchievements)} onClick={()=>onSeek("achievements")}>
      <div className={cx(GameStatIcon, AchievementSVG)}><OiG fullcolor={is100}/></div>   // ribbon icon
      <div className={cx(GameStatRight, AchievementRight)}>
        <div className={cx(PlayBarLabel, AchievementLabel)}>{L("#AppDetails_SectionTitle_Achievements")}</div>  // "ACHIEVEMENTS"
        <div className={AchievementProgressRow}>
          <div className={cx(PlayBarDetailLabel, AchievementCountLabel)}>{[nAchieved,"/",nTotal]}</div>          // "44/82"
          <Ce progressPct={100*nAchieved/nTotal}/>                                                              // the blue bar
        </div>
      </div>
    </div>;
  }
}
```

**Parent `GameStatsSection` (April class `Pe`, ~510498; mounts MiniAchievements ~510547) — UNCONDITIONAL:**
```
<div className={GameStatsSection}>
  {o && <ContentToClaim/>}   {a && <LocalContent/>}   {!IN_GAMEPADUI && <DesktopStat/>}
  {!a && <.../>}   <... bIsApplicationOrTool/>   {!s && <Playtime/>}   {s && <TimedTrial timeLeftMin/>}
  <MiniAchievements ...props onSeek={this.props.onSeek}/>      // <-- no gate
  <... overview/>
</div>
```
Runtime-confirmed identical in the **current live Deck bundle** (module 56262, `onSeek` passed, one `MiniAchievements`).

**Data source:** `GetAchievements(appid)` → `{ nTotal, nAchieved, vecHighlight, vecUnachieved }`. Progress = `floor` not used here (bar uses raw `100*nAchieved/nTotal`); 100% → `OiG fullcolor` ribbon. Related globals: `window.appAchievementProgressCache` (set ~line 423813), `GetAchievementProgress(appid)` (~423751), `SteamClient.Apps.SaveAchievementProgressCache`.

**Valve-origin CSS-module names (survive minification as object keys) — [VALVE]:**
`MiniAchievements, GameStat, GameStatIcon, AchievementSVG, GameStatRight, AchievementRight, PlayBarLabel, AchievementLabel, AchievementProgressRow, PlayBarDetailLabel, AchievementCountLabel`.
Hashed values live in module **96821** (current) / the CSS-map module in April; `.css` file only has hashes.

**Two OTHER achievement UIs in the same bundle (NOT the bar the user means):**
- Right-column **`BasicAppDetailsAchievementsSection`** (April `V`/`q`, ~500200–500360): full section, uses `H` highlight → classes `HighlightDiv, AllAchieved, UnlockedLabel, UnlockedLabelPercent, AchievementProgressContainer, AchievementProgress, Ribbon, GlobalStatLabel`, strings `#AppDetails_PlayerUnlockedPercent[All]`.
- Per-achievement **`SingleAchievementProgressBar`** (April `O`, ~499893): classes `SingleAchievementProgressContainer, SingleAchievementProgressBar, ProgressLabel, AchievementProgress`.

---

## 5. Evidence the code was never deleted

Occurrence counts of `MiniAchievements` / `onSeek("achievements")` in `chunk~2dcc5aaf7.js` = **2 / 1** in ALL sampled builds:
2025-07-31, 2025-09-30, 2025-11-29, 2026-01-31, 2026-03-27, 2026-04-28 (PRE), 2026-04-30 (POST), 2026-05-30, 2026-07-24 (HEAD), **and live Deck CL 10840511**.

The Apr-28→Apr-30 diff (`b9766fa`→`79adf888`): english.json added only `Settings_Controller_*`/`Notification_Controller*`; CSS added controller-settings layout; library.js only build stamps + chunk content-hash ids; chunk.js diff (629+/325−) is entirely Controller-Settings module churn. **No achievement changes.**

Full write-up with the runtime GameStatsSection dump: `<repo>/research/reports/INTERIM_FINDINGS.md`.

---

## 6. Reference screenshot (from the user)

`<local-screenshot-path>`
- A YouTube video ("FreddysGaming", "Drift86 on Steam Deck…"), **a DIFFERENT Deck than the user's**.
- Shows Starfield game page, Gamepad UI: green **Play** button, then columns **LAST PLAYED / PLAY TIME / ACHIEVEMENTS**, achievements value = **"44/82" + blue bar**, then controller + gear icons, "STEAM CLOUD: UP TO DATE", tabs **ACTIVITY / YOUR STUFF / COMMUNITY / GAME INFO**.
- This is exactly the `MiniAchievements` widget rendering. Unknown build/channel — **ask user / determine** whether it's older or a different update channel than their own Deck.

Implication: user believes their own Deck **lost** this bar. If true and the code is present, the cause is almost certainly §1 (page redesign no longer rendering `GameStatsSection`) or a runtime gate — NOT a code deletion.

---

## 7. Reusable commands / scripts

- Extract a historical file: `cd /tmp/Decky-SteamAchievements/SteamTracking && git show <commit>:ClientExtracted/steamui/chunk~2dcc5aaf7.js > out.js`
- Copy current Deck bundle (read-only): `scp deck@<deck-host>:'~/.local/share/Steam/steamui/chunk~2dcc5aaf7.js' /tmp/Decky-SteamAchievements/current/`
- List CEF targets: `ssh deck@<deck-host> 'python3 -' <<'PY' … urllib.request.urlopen("http://127.0.0.1:8080/json") …`
- **CDP probe scripts (pure-stdlib WS client):**
  - `/tmp/Decky-SteamAchievements/scripts/cdp_probe.py` — finds modules whose source has `GameStatsSection`+`MiniAchievements`, dumps the GameStatsSection children snippet. **Works.**
  - `/tmp/Decky-SteamAchievements/scripts/cdp_starfield.py` — tries to read live `GetAchievements(1716740)`; its store-finding heuristic returned `foundStore:false` — **needs fixing** (enumerate `R.c` exports better, or capture the store the component actually imports; or read `window.appAchievementProgressCache`).
  - `/tmp/Decky-SteamAchievements/scripts/cdp_dom.py` — **works**; probes every CEF page for live DOM elements with the `GameStatsSection`/`MiniAchievements` hashed classes and dumps their text. Run it while a game-with-achievements page is open on the Deck. Hashes: `MiniAchievements`=`UAhWiMg9Q2VPsQQBj_ikT`, `GameStatsSection`=`_1mDAVT4sTzFRwJtlKCw2Ws`.
  - `/tmp/Decky-SteamAchievements/scripts/cdp_probe.py` gave the live GameStatsSection children dump proving the in-page PlayBar mounts MiniAchievements with `onSeek` in CL 10840511.
  - Run: `ssh deck@<deck-host> 'python3 -' < <script>`.
- Beautify the minified current bundle for reading: `npx prettier`/`js-beautify` on `/tmp/Decky-SteamAchievements/current/chunk~2dcc5aaf7.js` (SteamTracking copies are already beautified).

---

## 8. Plan-phase status

- Phase 1 (acquire artifacts): **done** (manifest in research/reports).
- Phase 2 (source maps): **done** — none shipped. Bundles reference maps at a buildbot `file://` path (`sourcemaps/chunk~2dcc5aaf7.js.map`); not in SteamTracking, not on Deck. `sourcesContent` recovery ≈ impossible. Long-shot untried: Steam CDN `steamui_websrc_all.zip.<hash>` (build likely purged, ~3 months old).
- Phase 3 (removal diff): **done, and it falsified the premise** — see §5.
- Phase 4 (locate component): **done** — §4.
- Phases 5–8 (names/deps/render/CSS): **mostly done** for `MiniAchievements` — §4. Still open: exact hashed CSS values from the `.css` (map the [VALVE] names → hashes → rules), and pre/post CSS comparison of the achievement rules.
- Phase 9 (removal analysis): **done** — removal = the added `!onSeek` guard (CL 10546225); see CONCLUSION and `research/diffs/removal_onSeek_guard.md`. (The earlier "blocked on §1 / rendered vs orphaned" framing is superseded.)
- Phase 10 (restoration): not started. If §1 shows orphaned, restoration = re-insert `GameStatsSection`/`MiniAchievements` (or reimplement it in the Decky plugin, patching the app-details route). If §1 shows still-rendered, there is nothing to restore — pivot to diagnosing the user's specific device/channel.
- Deliverables (REPORT.md, RECREATED_COMPONENT.tsx, NAME_EVIDENCE.md, modules/, diffs/): **not written yet** — gate on §1.

---

## 9. Constraints (from the user)

- **No changes on the Steam Deck** — read-only only. (CEF was already enabled; don't toggle it. Transient in-memory `webpackChunksteamui.push` require-capture is acceptable and non-persistent; do not mutate app state or navigate their session without asking.)
- Exploratory/scratch files → `/tmp/Decky-SteamAchievements/`. Deliverables → `<repo>/research/` (gitignored).
- Scope: **research only**, no Decky plugin code changes.
- Name classification discipline: `[VALVE]` (survived as export/CSS-module keys), `[INFERRED]`, `[ASSIGNED]`. Minified locals (`fe`, `Pe`, `Ie`, `Qe`…) are build-specific and are `[ASSIGNED]`, never Valve names.
