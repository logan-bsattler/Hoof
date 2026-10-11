# TRUE HOOF

A calm, craftsmanlike cattle hoof-trimming game (working title). You're a
travelling bovine podiatrist: clean the caked foot to reveal what's hiding,
read it, then pick the right tool in the right order to restore a flat,
balanced, weight-bearing surface, so the cow walks off sound.

Scoring rewards **balance, correctness and restraint, not speed**. Cutting into
the corium draws blood: one small nick caps the grade at Sound, and a second nick or a
deep cut fails the case.

- Full design concept: [`docs/design-concept.html`](docs/design-concept.html)
- Distilled spec + what the MVP covers: [`docs/DESIGN.md`](docs/DESIGN.md)

## Run it

Requires Node 18+. Playing needs no `npm install`: the game itself has zero dependencies
(Capacitor is only used to build the Android app, below).

```bash
npm start
```

Open http://localhost:5173. Use another port with `npm start -- --port 8080`. The server listens on
your whole network so a phone can reach it (see below); `npm run start:local` keeps it on this PC only.

It's plain ES modules, so any static file server works (for example
`python -m http.server`). Opening `index.html` straight from disk won't work,
because browsers block ES modules over `file://`.

Run the tests (Node's built-in test runner):

```bash
npm test
```

## Play on a phone

### Option A: Android app (APK), the best experience on Android

Full-screen, portrait-locked, works offline, has its own launcher icon. Needs the Android SDK
(Android Studio's default `%LOCALAPPDATA%\Android\Sdk` is found automatically, or set `ANDROID_HOME`),
JDK 21 and Node 22+. Gradle comes from the bundled wrapper.

```bash
npm install
```

```bash
npm run android:apk
```

That copies the game into `www/`, syncs it into the Capacitor project in `android/`, runs Gradle and
writes **`dist/true-hoof-debug.apk`**. Rebuild after changing the game. To get it onto the phone:

- **USB:** turn on Developer options → USB debugging on the phone, plug it in, accept the prompt,
  then `npm run android:install` (builds and runs `adb install -r`).
- **No cable:** `dist/` is inside OneDrive, so open the OneDrive app on the phone, go to
  `Documents/Personal/Hoof/dist`, tap `true-hoof-debug.apk`, and allow "Install unknown apps" for
  OneDrive when Android asks. Emailing or Drive-sharing the file and tapping it works the same way.

It's a debug build (signed with the local debug key), fine for sideloading but not for the Play Store.
Android launcher icons and the splash screen are drawn by `scripts/make-icons.ps1`.

### Option B: PWA over Wi-Fi (Android or iPhone, nothing to install)

1. `npm start` on the PC. It prints the LAN address, e.g. `http://192.168.0.78:5173`
   (use the `Wi-Fi` line, not the virtual adapters).
2. On the phone, on the same Wi-Fi, open that address. If it doesn't load, allow Node.js through
   Windows Firewall for **Private** networks (Windows usually asks the first time).
3. Add it to the home screen: Chrome menu → **Add to Home screen**, or Safari Share → **Add to Home Screen**.

Caveat: browsers only enable the service worker (offline play) and Chrome's true "Install app"
over **HTTPS or localhost**. Over a plain `http://192.168…` address you get a home-screen shortcut
that needs the PC running; iPhone still opens it full-screen. To get the full installable PWA:

- **Quick HTTPS tunnel, no install** (uses the built-in Windows `ssh`, makes the game public while it runs):
  `ssh -R 80:localhost:5173 nokey@localhost.run` and open the `https://…` URL it prints on the phone.
- **Android Chrome on the LAN:** in `chrome://flags`, enable *Insecure origins treated as secure*
  and add `http://192.168.0.78:5173`, then relaunch Chrome.
- **Permanent:** host the folder on any HTTPS static host (e.g. GitHub Pages). No build step needed.

Once installed over HTTPS, it plays offline: `sw.js` precaches the app shell (network-first, so
updates arrive whenever the server is reachable). If you add a file under `src/`, add it to
`ASSETS` in `sw.js` and bump `VERSION`; `tests/pwa.test.js` fails if you forget.

## How to play (MVP: Case B, "Pressure Point")

One hoof case: a Holstein's hind foot with a hidden sole ulcer. The foot is shown the
way a trimmer sees it in the chute: sole facing you, heel bulbs at the top, toes pointing down.
The first cow is the hand-built #214 (left hind, ulcer on the outer claw). **Trim another** deals a
fresh cow: left or right hind (a right hind shows its outer claw on your right), different overgrowth,
ulcer size and position, sometimes on the inner claw, plus one or two harmless marks (a stain, a
bruise) that look like trouble. Your best grade on the case is remembered on the device.

The game is played as a trimmer's round: a road of seven farms, each visit a fixed number of that
farm's cows (3–6), ending with a day summary and the road map. Each cow earns reputation by grade
(a lame walk-off earns nothing; reputation never goes down), and reputation opens the next farm.
Farms differ by housing: wet yards bring digital dermatitis, concrete brings ulcers and white-line
abscesses, and later farms have front feet, longer growth and livelier cows. Dev params:
`?farm=<id>` starts a visit at that farm, `?rep=n` sets the reputation, and `?cond=<id>&seed=n`
is free play on one condition off the route.

New players should pick **Guided first trim** on the opening card. It coaches the same case in
13 small beats: each one picks the tool, outlines where to work, gives one instruction and shows
a progress bar. **Lift the foot** plays it unguided.

| Step | What you do | Tool |
|---|---|---|
| Clean | Scrub the mud off. The dark patch only shows on a clean foot | 🖌️ Wire brush |
| Read | Test anything suspicious; only the ulcer springs. Then press **Commit read** and name it | 🧪 Hoof testers |
| 1 | Inner claw first: nip the overgrown toe from the tip back to the dashed line, level the sole to ~7 mm | ✂️ Nippers, ⚙️ Grinder |
| 2 | Match the outer claw until the balance beam reads LEVEL | ⚙️ Grinder |
| 3 | Carve the dish along each claw's inner edge (dashed channel), staying out of the toe triangle | 🔪 Knife |
| Rasp | Rasp out the grinder swirls on both soles, before the block covers one | 🪵 Rasp |
| 4 | Pare the loose horn off the ulcer (pressure release), then glue the block on the **sound** claw | 🔪 Knife, 🧱 Block |
| 5 | Flick off the curl of loose heel horn | 🔪 Knife |
| Treat | Flush the opened ulcer, then pad and wrap it. **Release the cow** and watch her walk | 🧴 Spray bottle, 🩹 Pad + wrap |

**Controls:** mouse or touch. Tap a tool (or press keys `1`–`9`).
- **On a touchscreen your finger holds the handle:** the tool's working tip sits about a
  centimetre up-left of your fingertip, so the horn you're cutting stays visible. Tune it with
  `CFG.touch` in `src/config.js` (`grip` distance, `angle`). Left-handed? Tap the **Lefty** chip
  in the top bar to mirror it (tip up-right of your finger); it's remembered on that device.
  The spray bottle and hoof testers are the exception: they work right under your finger.
  Mouse and pen work right at the pointer.
- **Brush and rasp:** scrub back and forth.
- **Hoof knife:** press, hold and pull. It bites once pulled and takes off a strip of horn.
- **Grinder and spray bottle:** press, hold and glide.
- **Nippers:** tap or drag to bite, working from the tip of the toe back toward the hoof. Each bite
  takes all the dead horn beyond the jaws, or nothing if that's more than one bite can hold.
- **Testers, block, pad + wrap:** taps.
- **On a phone** the tools sit in two rows, and tapping one shows its hint as a toast. The bar
  under the top bar carries the current step (and, in the guided run, a progress strip along its
  bottom edge); tap its text, or **Steps**, for the full checklist and coach card. The view zooms
  onto the hoof (about 30% larger than the full scene), with the balance beam and claw readouts in
  a compact strip across the top.
- `G` toggles the guided lines and `M` toggles sound. The lines follow the step: none while you clean and read, then the trim line, heel line, toe triangle or dish as each step needs them. The balance beam shows no figures until the foot is clean.

**Reading the hoof:** horn colour tracks sole thickness: weathered yellow-brown when overgrown,
cream at target, pink when thin. With guides on, a mm gauge follows the cursor. Cuts ease off over the
last 1.5 mm above target (that's the resistance), and the grinder bogs down into a tighter whine, with a
harder buzz, as the sole under it thins. Lingering, especially with the grinder, draws blood. She flinches
at a first small nick (the grade is capped at Sound); a second nick or a deep cut ends the case.

You're graded on Balance 35%, Correctness 30%, Restraint 20% and Finish 15%, which
gives Textbook / Clean / Sound / Needs work. Notes explain what to fix. Before she walks, a weight test lights up where the trimmed foot meets the floor (the ulcer should be off it), and the stamp gives her AHDB mobility score (0 good to 3 severely impaired). The walk-off gait
(sound / tender / lame) reflects your work.

## Project layout

```
index.html, styles.css   page shell, HUD, responsive layout (portrait/phone friendly)
src/main.js              state machine (intro → play → walk-off/fail → results), input, frame loop
src/config.js            all tunables: thickness targets, tool rates, score weights, grades
src/hoof.js              hoof model: cell grid over two claws (thickness, mud, roughness, zones)
src/case.js              Case B (sole ulcer): the hand-built cow and makeCaseB(seed) for dealt cows
src/tools.js             tool definitions and their effect on the model (pure, testable)
src/steps.js             clean → diagnose → five steps → finish → treat checklist predicates
src/tutorial.js          guided first trim: coached beats with targets and progress (pure, testable)
src/scoring.js           Balance / Correctness / Restraint / Finish grading + gait
src/render.js            canvas rendering: scene, guides, coach highlight, block, dressings, HUD, cursor
src/view.js              camera: full scene on desktop, zoomed onto the hoof on phones (pure, testable)
src/hoofart.js           layered hoof material: horn, stain, manure + straw, tool marks, blood
src/toolart.js           drawn tool sprites
src/particles.js         shavings, mud, dust, flakes, release puff, blood
src/audio.js             WebAudio SFX: CC0 recordings + procedural layers/fallbacks, haptics
audio/                   short CC0 MP3s (sources and licenses in audio/CREDITS.md)
src/walkoff.js           the walk-off reward scene
src/ui.js                DOM tool dock, steps panel, guided-run coach card, toasts, modals
manifest.webmanifest     PWA manifest (standalone, portrait); icons/ holds its icons
sw.js                    service worker: offline precache of the app shell
scripts/serve.mjs        zero-dependency static dev server (LAN-visible, prints the phone URL)
scripts/build-web.mjs    copies just the game into www/ for Capacitor
scripts/build-apk.mjs    www/ → cap sync → Gradle → dist/true-hoof-debug.apk (--install to adb it)
scripts/make-icons.ps1   draws PWA, Android launcher and splash icons
android/                 Capacitor Android project (generated; build output is git-ignored)
tests/                   node:test unit tests for model, tools, steps, scoring, PWA wiring
```

The simulation (`hoof`, `tools`, `steps`, `scoring`, `tutorial`) has no DOM dependency and is unit-tested.
Rendering, audio and UI sit on top.

## Tech choice

A vanilla JS + HTML5 Canvas web prototype, with no build step:

- It's playable instantly on any device with a browser, and links are shareable for playtests.
- Touch and pointer events cover mouse and phone with the same code.
- It's a 2D, gesture-driven game, so a full engine (Unity/Godot) adds weight without adding feel at this stage.
- It's wrapped for Android with Capacitor (see above); iOS would need a Mac with Xcode. If the art needs grow
  (layered 3D hoof, shaders), port the tested simulation core to Godot/Unity.

## Roadmap (from the design doc)

More cases (overgrowth tutorial, embedded screw, white line, DD, crack), the case select and
apprentice→pro progression, a real cow sprite,
a fuller ASMR audio mix, a narrator, and a signed Play Store / iOS build.
