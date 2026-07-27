# Achievements Restored

A [Decky Loader](https://github.com/SteamDeckHomebrew/decky-loader) plugin that
**brings back the achievement progress bar Valve removed** from the Steam Deck
game-details page — the compact **"ACHIEVEMENTS  n/total  ▮▮▯"** stat next to
Play Time, with the blue completion ribbon at 100%.

![Restored achievement bar](assets/achievement-bar-restored.png)

## What actually happened

The bar was **not deleted**. Valve's own `MiniAchievements` component (in the
app-details PlayBar / `GameStatsSection`) still ships, with working CSS and the
live `GetAchievements(appid)` data. In Steam changelist **10546225 (~2026-03-24)**
Valve added a single guard to its `render()`:

```js
if (!this.props.onSeek) return null;
```

The Steam Deck game-details header renders its PlayBar with `onSeek: undefined`,
so the guard now returns `null` and the bar disappears. Supplying a real `onSeek`
makes Valve's own component render again — confirmed by injecting `onSeek` into
the live instance on-device (see the screenshot above).

This plugin patches `MiniAchievements`' own `render` to supply the withheld
`onSeek` prop, then schedules a re-render so React commits Valve's component.
**It does not reimplement the bar.**

The plugin also preserves Valve's native installed-game behavior. Valve
intentionally hides the compact bar for an uninstalled game with zero earned
achievements, permits it for an uninstalled game with earned progress when that
data is available, and hides it whenever Steam supplies no achievement total.

## Install on Steam Deck

Decky Loader must already be installed. In SteamOS Desktop Mode:

1. Download [`Achievements Restored Installer.zip`](installer/Achievements%20Restored%20Installer.zip).
2. Extract the ZIP directly onto the Desktop. Keep the extracted
   `DeckyPluginInstaller` folder beside `Install Achievements Restored`.
3. Double-click **Install Achievements Restored**. If KDE marks the downloaded
   launcher as untrusted, review it and choose **Trust and Launch**.
4. Confirm the plugin details and approve the administrator-authentication
   prompt. Return to Gaming Mode when installation finishes.

The installer downloads the latest stable `Achievements Restored.zip` release
asset from this repository, validates the archive, backs up an existing plugin
copy, installs the replacement, and restarts Decky Loader. Run the launcher as
the normal `deck` user; do not run the whole installer with `sudo`.

### Install the plugin ZIP through Decky

Decky can also install the `Achievements Restored.zip` plugin package directly:

1. Download `Achievements Restored.zip` from the latest release and place it in
   the Steam Deck's `Downloads` folder.
2. In Gaming Mode, open **QAM → Decky → Settings → General**.
3. Under **Other**, enable **Developer mode**. This adds the **Developer** page
   to Decky's settings sidebar.
4. Open **Developer → Third-Party Plugins**.
5. Beside **Install Plugin from ZIP File**, choose **Browse**, select
   `Achievements Restored.zip` from `Downloads`, and approve Decky's installation
   confirmation.

Use the plugin ZIP for Decky's built-in installation flow. Do not select
`Achievements Restored Installer.zip` there; that bundle is intended to be
extracted and launched from SteamOS Desktop Mode as described above.

## Development

See [`DEVELOPER.md`](DEVELOPER.md) for setup, build, test, packaging, deployment,
installer-bundle maintenance, and repository layout information.

## License

GPL-3.0-or-later.
