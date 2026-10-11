# TRUE HOOF: quality plan (handoff for execution)

Written 2026-10-10 from a full review at commit `ecf9eb9`. Line numbers are as of that commit, so re-check each one before editing.
Review basis: every file in `src/`, `tests/`, `docs/` and `scripts/serve.mjs` was read; `npm test` passed 20/20; the intro and the first brushing were played on desktop. Nothing was tested on a real phone, so the mobile items come from reading the CSS and layout code.

## Bottom line

The simulation core and the hoof renderer are strong. Three things hold the game back, in this order:

1. The core cut punishes precision instead of rewarding it.
2. There is one fixed case, so "read before you cut" is a formality.
3. Everything around the hoof (the tool dock, the walk-off, the phone layout) is a step down from the hoof art.

Work through the packages in the order below. **WP0 comes first** because it is the regression guard for every tuning change after it.

## Decisions to ask Ben before starting the affected package

| # | Decision | Affects | Default if Ben has no preference |
|---|---|---|---|
| D1 | Should a small first cut into the corium be a graded "nick" instead of an instant fail? (`docs/DESIGN.md:14` says blood is "always a failure"; the concept doc says it "drops a grade or fails") | WP1.4 | Keep the hard fail and skip WP1.4 |
| D2 | After a wrong diagnosis, should the game still reveal the correct treatment plan? | WP2.2 | Keep revealing it (it's a teaching game) |
| D3 | Audio source: record his own foley, use CC0 library sounds, or stay procedural | WP3.5 | CC0, with a CREDITS file |
| D4 | Tool dock on phones: two rows, or one horizontally scrolling row | WP4.3 | Two rows |
| D5 | Support the right hind foot (mirrored layout) now or later | WP2.3 | Later |

## Ground rules for the executing session

- The game stays zero-dependency vanilla ES modules. The simulation files (`hoof`, `tools`, `steps`, `scoring`, `tutorial`) stay DOM-free and unit-tested.
- Any new file under `src/` (or any new shipped asset) must be added to `ASSETS` in `sw.js`, and `VERSION` must be bumped; `tests/pwa.test.js` enforces this for `src/*.js`. If you add a new top-level folder such as `audio/`, also check that `scripts/build-web.mjs` copies it into `www/` for the Android build.
- Never ship or trace the reference footage in `reference/` (it's copyrighted and git-ignored; see `docs/ART-DIRECTION.md`).
- Match the existing code style: short "why" comments and all tunables in `src/config.js`.
- Ask Ben before committing. Make one commit per work package, using the existing subject style (`Area: what changed`, e.g. `Feel: resistance ramps in above target`).
- When behavior changes, update `README.md` (the "How to play" and "Controls" sections) and the MVP table in `docs/DESIGN.md`.

### How to verify

- `npm test` after every package.
- Browser: `preview_start {name: "true-hoof"}` (port 5173, from `.claude/launch.json`). The pane is small, so `resize_window` to 1280×900 for desktop, use the mobile preset (375×812), and also try 375×667 for small phones.
- Long gestures: dispatch pointer events on `#game` with `javascript_tool`. Map a logical point to the screen through the camera (WP6; on phones the canvas no longer shows the whole 400×720 scene). With `?debug`, use
  `r = canvas.getBoundingClientRect(); cam = hoofRenderer.cam; clientX = r.left + (x - cam.x) * cam.scale; clientY = r.top + (y - cam.y) * cam.scale`
  (the same as `toScreen` in `src/view.js`). On desktop the camera is `{x: 0, y: 0, scale: r.width / 400}`, so the old `x / 400 * r.width` mapping still holds there.
  Use `pointerId: 1, pointerType: 'mouse', bubbles: true`, then `pointerdown` → several `pointermove` → `pointerup`.
- For close-up art checks, open `dev/artlab.html` (`?stage=0..3`, `?focus=lesion|toe`, `?zoom=2`).
- Ask Ben to playtest on his phone for feel (`npm start` and open the LAN URL, or `npm run android:apk`).

---

## WP0: end-to-end "bot" test (small, do first)

**Problem.** `tests/game.test.js:14` (`idealTrim`) writes the ideal end state straight into the hoof arrays. No test proves that the *tools themselves* can reach Textbook without drawing blood, so a tuning change can make the game unwinnable and every test still passes.

**Do.**
1. Move the DOM-free "careful hand" player out of `dev/artlab.js:23-85` (`drag`, `brushAll`, `nip`, `grind`) into `tests/player.js`. It should import only `hoof`, `tools` and `config`, and take an optional `onStamp(tool, x, y, dx, dy)` callback so `dev/artlab.js` can still call `art.mark(...)`. Point the artlab at the new module.
2. Add the test `tests/playthrough.test.js`. It plays Case B with the tools in order:
   - brush everything until the clean step is done
   - `hoof.probe` the lesion, then set `session.diagnosis = 'ulcer'` and `diagnosisCorrect = true` (as `main.js` does)
   - nip both toes, tip first
   - grind the inner claw until step1 is done, then the outer claw until step2 is done
   - knife the dish channels until step3 is done
   - knife across the ulcer until `looseRemain[ULCER] < 0.1`
   - set `hoof.block = CLAW.INNER` and record the attempt in `session.blockAttempts`
   - knife the heel flake, then rasp
   - spray the ulcer, then call `applyWrap` twice
   - after each phase, call `evaluateSteps(...)` and assert the expected step is done; set `session.firstCutClaw` from the events, as `main.js:363` does

   **Assert:** no event has `blood`, every step is done, `scoreCase(...).grade` is Textbook (accept Clean at first if needed, but log `total` and the notes so tuning shifts show up), and the gait is `sound`.
3. Add a "careless" bot that holds the grinder still on one sole spot and assert that it *does* draw blood within about 6 s of simulated time.

**Done when:** both tests pass, and the artlab page still renders all four stages.

---

## WP1: the core cut should reward precision (small)

### 1.1 Ramp the resistance in *above* the target
- **Now.** In `src/tools.js:68-72` (`cut`), the slowdown only applies once a cell is at or below `tgt - 0.25`. The grinder removes 8.5 mm/s (`src/config.js:36`). At the disc centre, that's about 0.03 s from 7.0 to 6.75 mm, then about 0.4 s more to the "over-trimmed patch" line at 5.75 mm (`hoof.js:334`). The README promises "cuts slow down as you reach target", but players will overshoot.
- **Change.** Replace the step with a smooth multiplier:
  - `k = 1` above `tgt + ramp`
  - `smoothstep` from 1 down to `resist` between `tgt + ramp` and `tgt`
  - `resist` below the target
  - `resistThin` below `CFG.sole.thin`; the `ULCER` case is unchanged

  Add `ramp` (start at 1.5 mm) to `CFG.sole` or per tool in `CFG.tools`. Nippers pass `resist = 1`, so they're unaffected. The knife (0.35) and rasp (0.3) get the ramp as well, which is intended.
- **Tests.** Add a unit test: a cell at `tgt + 2` cuts at the full rate, at `tgt + 0.5` it cuts under 70% of full, and at `tgt - 0.5` it cuts at `resist`. Re-run WP0. The step1/step2 goals (`wbMean <= T + TOL`) must still be reachable, and `lingering with the grinder draws blood` must still pass.
- **Tune** `rate`, `resist` and `ramp` until the WP0 bot scores Textbook. Then ask Ben to feel-test it.

### 1.2 Make the grinder sound and vibration tighten near danger
- **Now.** `main.js:471` calls `Sound.grinder(true, Math.min(1, ev.removed / 4))`. Resistance lowers `removed`, so the motor pitch rises (`150 - load * 40`) and the grind noise drops (`audio.js:120-121`). The tool sounds *freer* exactly when the cut is most dangerous. `buzz(4)` also fires every frame no matter the danger (`main.js:472`).
- **Change.**
  - In `applyGrind` (`tools.js:146`), track the thinnest live, non-dead horn under the core of the disc (`f > 0.5`). Return `ev.danger = 1 - smoothstep(CFG.sole.thin, tgt, minThick)`, which is pure and testable.
  - Extend `Sound.grinder(on, load, danger)`. Keep `load` for the bite, and use `danger` to bog the motor down (lower pitch) and raise a tighter band-passed whine (lift `grindNoise` frequency and Q). Keep it subtle, in the ASMR register.
  - Throttle the vibration to about every 100 ms, with intensity scaled by danger (for example `buzz(4 + Math.round(danger * 14))`).
  - Optional: give the knife the same treatment with `Sound.knife()`, using a softer, duller burst near the target.
- **Test.** `danger` is about 0 on a fresh hoof and above 0.8 on a cell set to 3.2 mm.

### 1.3 Safety net for a held tool; resume audio
- **Now.** A hold only ends on `pointerup` or `pointercancel` (`main.js:196-211`), and the grinder cuts every frame while `ptr.down` is true (`main.js:464-473`). Nothing handles `lostpointercapture`, window `blur` or `visibilitychange`. Separately, the AudioContext is only resumed at the intro (`main.js:98`, `audio.js:76`), so backgrounding the app mid-case can leave it silent.
- **Change.**
  - Add `releaseHold()`: set `ptr.down = false`, call `stopHoldSounds()`, reset `pullRemoved` and `holdLast`, and do **not** run `tap()`.
  - Wire it to `lostpointercapture` on the canvas, `blur` on `window`, and `visibilitychange` when `document.hidden`. `endPointer` already returns early if `!ptr.down`, so the normal `pointerup` path stays first.
  - Add `Sound.resume()` (resume the context when it isn't `running`) and call it on every `pointerdown`.
- **Verify in the preview.** Dispatch `pointerdown` with the grinder, then `window.dispatchEvent(new Event('blur'))`, and check that `game` stops cutting. Thickness under the pointer should stop changing (inspect it through a module-scope debug hook, or by watching the mm gauge).

### 1.4 (D1) A graded "nick" before the hard fail
Only if Ben agrees. Today one cell reaching ≤ 0.05 mm sets `blood` (`tools.js:85-89`), and `main.js:378` fails the case.

Proposal:
- The first event that bloods at most about 3 cells is a **nick**: the cow flinches (`Sound.moo(true)` and a shake), one drop of blood appears, `session.nicks++`, and a toast says "She felt that. One more and you're done."
- A second nick, or a deep cut (more than 3 cells, or any grinder blood if Ben prefers), fails the case as it does today.
- Scoring: a nick caps the grade at `Sound` and costs Restraint 40, with a teaching note.
- Tests: one nick still yields a score; two nicks fail.

---

## WP2: make diagnosis real and the case varied (medium)

### 2.1 Remove the Case B hard-coding (required before adding any second case)

| Where | Problem | Fix |
|---|---|---|
| `src/steps.js:43` | Step 4 requires `hoof.block === CLAW.INNER` | Compare to the sound claw. Add `soundClaw(caseDef)` (already computed inline at `scoring.js:23`) to `case.js` or `hoof.js` and use it in both places |
| `src/steps.js:21,26,42,47` | Tips name "outer" and "inner" | Make tips functions of `caseDef` (or templates using `CLAW_NAME`). `ui.js`, `main.js` and `tutorial.js` read `STEPS`; keep the predicates reading `hoof.caseDef` |
| `src/main.js:294-295` | The diagnosis prompt is Case B text | Move it to `caseDef.diagnosisPrompt` |
| `src/scoring.js:48` | The misread note is Case B text | Move it to `caseDef.misreadNote` |
| `index.html:22` | `Case B · Pressure Point` is baked into the page | Set it from `caseDef` in `showIntro` |
| `src/main.js:17` | `const caseDef = CASE_B` | Choose the case per run (`let`) |
| `src/render.js:177,183,189` | The dish rect (212..254), the toe-triangle path and the heel line are literals | Derive them from `GEOM` (`midX`, `dishW`, `triY`, `triW`, `heelY`) and the claw polygon. For the triangle, clip to `clawPolygon(c)` and fill the rectangle where `axialDist < triW && y > triY` |
| `src/render.js:228-229, 259-270` | Claw labels and gauges assume outer is on the left | Use a side helper (needed for 2.3) |
| `src/toolart.js:316-319` | `blockFrame` uses literal cx/cy/rx/ry | Derive from the claw polygon's bounding box, inset |
| `src/toolart.js:406` | The pad is placed at `lesion.y + 58`, 66×118 | Derive from the lesion and the claw bounding box, clamped inside the claw |
| `src/tutorial.js:28-113` | Target rects and rings are literals; texts say "outer (left)" / "inner (right)" | Add `clawBox(claw)` in `hoof.js` and build the targets from it and from `caseDef`; derive the side words too |

**Test.** Add `CASE_B_INNER`: Case B with the ulcer on the INNER claw (mirror `lesion.x` across `midX`) and the loose horn on the OUTER heel. Adapt `idealTrim` so it blocks the OUTER claw. Assert that every step completes and the grade is Textbook. Also run `new Tutorial(caseDef)` over the ideal state and assert `finished`. Then check the guides, block, pad and coach targets visually in the preview.

### 2.2 Make the read a real decision
- **Now.** The unguided tip gives the answer away ("See that dark patch on the outer claw? Tap it…", `steps.js:21`). The modal prompt contains the deciding clue ("It springs… sole/heel junction", `main.js:294-295`). The first lesion tap opens the diagnosis modal straight away (`main.js:240-249`).
- **Change.**
  - Use a neutral unguided tip ("Clean it, then test anything that looks wrong."). Keep the explicit pointing only in the guided beat (`tutorial.js:34`).
  - Add `caseDef.findings: [{x, y, r, kind: 'stain'|'bruise'|'ulcer', probeText}]` and consult it in `Hoof.probe`. Decoys: a firm, dark stain ("Dark is just staining. Firm underneath.", from ART-DIRECTION recheck beat 6) and a bruise that stays firm. The ulcer springs.
  - Record each probe result in `session.probes`. Replace the auto-opening modal with a **Commit read** button that becomes available after the first finding. The modal lists what the testers found, in neutral words, and asks for the diagnosis.
  - (D2) Decide whether a misread still shows `caseDef.plan`.
- **Tests.** `probe()` returns a firm or stain reading on a decoy and springs on the ulcer. Committing without probing the ulcer is allowed but scores as an unread lesion (the existing −25 path).

### 2.3 Cheap variation and persistence
- Add `makeCaseB(seed)` that varies:
  - the hoof seed (`new Hoof(caseDef, caseDef.seed)`; the default seed is hard-wired at `hoof.js:116`)
  - per-claw excess (outer 3.5–5.5 mm, inner 1.8–3.0 mm, with outer always above inner)
  - the ulcer position near the sole/heel junction on the axial half (y about 275–305) and its radius (10–14)
  - the loose-horn position on the sound claw's heel
  - which claw is ulcerated (mostly the outer)
  - (D5) LH or RH foot. A right hind foot shows its outer claw on the *viewer's right*, so it needs a side flag honoured by `clawPolygon`, `toeLine`, render `mirror`, tutorial `out()`, `blockFrame`, the labels and gauges, and the walk-off limp leg (`walkoff.js:100,107`).
- "Trim another" uses a new seed. Show "Holstein #<n>" derived from the seed.
- Persist the best result per case in `localStorage` (`truehoof.best.<caseId>` → `{grade, total}`), wrapped in try/catch like the Lefty setting (`main.js:56-61`). Show it on the intro and say "New best" on results.
- **Test.** Generate 50 seeds. Each one builds, the lesion sits inside its claw, `idealTrim` (sound-claw aware) gives Textbook, and the tutorial finishes.

---

## WP3: bring the presentation up to the hoof's level (medium–large)

### 3.1 Tool dock icons from the real tool art
- **Now.** The dock uses platform emoji (`tools.js:10-43`, rendered at `ui.js:18`): 🧪 for the hoof testers, 🪵 for the rasp, 🧱 for the rubber block. They clash with the drawn tools in `toolart.js`.
- **Change.** Add `drawToolIcon(ctx, id, size)` to `toolart.js` that reuses `drawKnife`, `drawGrinder` and the rest with a per-tool framing (offset, scale, angle), so each tool fits a square laid diagonally.
  - The block needs a mini version: a black superellipse with lugs, not `drawBlock`, which needs the claw outline.
  - The pad and wrap use `drawWrapRoll`.
  - In `ui.js`, render a `<canvas class="icon">` sized at CSS size × `devicePixelRatio`, and redraw it on DPR change.
  - Remove `.icon` emoji styling; keep the name labels.

### 3.2 Contextual guides; don't spoil the reveal
- **Now.** Every guide draws from the first frame over the caked foot (`main.js:556`; `guides: true` at `main.js:29`). The balance beam shows exact mm before any cleaning: "2.2 mm off" was visible on the dirty foot (`render.js:259-264`).
- **Change.**
  - Use `renderer.guides(hoof, set)` with the set chosen by the current step or tutorial beat:
    - clean and read: none
    - steps 1–2: trim line, heel line and toe triangle
    - step 3: dish and toe triangle
    - step 5: heel line
    - finish and treat: none
  - Fade between sets over about 0.4 s.
  - Until the clean step is done, show the beam neutral with "—" for every mm value.
  - The `G` key still turns guides off entirely.

### 3.3 Legible text on the play field; the strap
- **Now.** Fonts are 9–11 logical px (`render.js:105,160,226,256,265,284,333`). On a 375×667 phone the canvas scales to about 0.67, so 9 px renders around 6 CSS px. Labels rely on a 0.8 px shadow over a busy texture. The green strap is drawn from `y = -10` (`scenery.js:186`), so it runs up through the HUD.
- **Change.**
  - Store `cssScale = cssW / W` in `Renderer.resize` and use `font = max(base, 11 / cssScale)`.
  - Draw guide and gauge labels on small dark pills (radius 6, alpha about 0.75).
  - Start the strap below the HUD panel (y ≥ 112, with a short fade) or make the HUD panel opaque.
  - Optional on narrow screens: move the balance beam and gauges into a DOM bar, which frees the top 112 logical px for the hoof.

### 3.4 The walk-off is the payoff; give it real art and tie it to the trim
- **Now.** The cow is a rounded rectangle with ellipse spots, 13 px stroke legs and a triangle neck (`walkoff.js:106-187`). The first leg phases (`walkoff.js:99-104`) aren't a proper walk.
- **Change.**
  1. Add a short **weight-test beat** before the walk (about 1.2 s, reusing the hoof renderer). Overlay a contact-pressure map on the trimmed sole: cells within about 0.5 mm of their claw's highest weight-bearing level (or the whole block) glow green, and the ulcer region reads as unloaded. This shows the player *why* she walks the way she does.
  2. Redraw the cow:
     - a bezier silhouette (barrel, hips and pin bones, tail head, dewlap)
     - Holstein patches from thresholded noise clipped to the body
     - jointed legs with knees and hocks
     - soft shading and a ground shadow
     - original art only (`docs/ART-DIRECTION.md`)
  3. Use a proper 4-beat walk: left hind, left fore, right hind, right fore at quarter-cycle offsets.
  4. Map the gait to the AHDB Mobility Score: sound = 0, tender = 1, lame = 2 (use 3 if the block is on the sore claw). Lameness shows as an arched back, a shortened stride on the affected hind leg, and an uneven rhythm. Print the score on the stamp ("Mobility score 0 · good mobility"). This sets up the herd mobility score from the design doc.

### 3.5 (D3) Recorded audio for the core sounds
- **Now.** Everything is synthesized noise or tones (`audio.js`). The moo is a filtered sawtooth with a vibrato wobble (`audio.js:170-181`), and it plays at the two most emotional beats.
- **Change.** Add an `audio/` folder with short MP3s (MP3 plays everywhere, including iOS Safari). Aim for 30 KB or less each: knife peel (2–3 variations), nip snip, grinder loop, brush loop, rasp loop, spray, block clunk, a calm moo, and a flinch exhale.
  - Load them with `fetch` + `decodeAudioData` and fall back to the procedural sounds on failure.
  - Randomize pitch and gain slightly per trigger.
  - Add the files to `sw.js` `ASSETS` and bump `VERSION`; check `scripts/build-web.mjs` copies `audio/`.
  - List every source and license in `audio/CREDITS.md`.

---

## WP4: phones (small; the primary platform)

### 4.1 Show guided progress on phones
- **Now.** The coach card and its progress bar sit inside `#stepsPanel` (`index.html:43-48`), which is hidden below 860 px (`styles.css:266-280`). The canvas only draws progress for ring targets (`render.js:141-153`), so 7 of the 10 beats that have a progress measure show none on a phone (clean, both nips, both grinds, dish, rasp).
- **Change.** Add a 3 px progress bar along the bottom edge of `#stepBar`, updated in `ui.setCoach` and hidden when the beat has no measure. Optionally also draw a small progress arc beside the canvas outline for rect targets.

### 4.2 Stop the play field from resizing between beats
- **Now.** `#stepBarTip` grows with each beat's text (`styles.css:65-76`). `#canvasWrap` shrinks, the `ResizeObserver` (`main.js:452`) refits the canvas, and `Renderer.resize` repaints the scenery and shadows every time (`render.js:31-46`).
- **Change.**
  - Clamp the tip to 2 lines (`-webkit-line-clamp: 2`) and give `#stepBar` a fixed height. The full text stays in the steps panel.
  - Coalesce `resize()` into one rAF per frame, and return early from `Renderer.resize` when the CSS size and DPR are unchanged.

### 4.3 (D4) Tool buttons are too narrow
- **Now.** 9 tools sit in one row: (375 − 16 − 32) / 9 ≈ 36 px wide (`styles.css:172-189,281-289`), under the 44 px touch minimum.
- **Change.** Choose with Ben:
  - two rows of 5 and 4 (about 67×52 px each), and win back height by hiding `#toolInfo` on narrow screens; or
  - one scrolling row with 48 px buttons and scroll-snap.

  Screenshot both at 375×667 and 412×915 before deciding.

---

## WP5: smaller items (any time)

- **Rasp before block.** The finish tip says to rasp "before anything gets covered up" (`steps.js:52`), but the block goes on in step 4 and covers the inner claw. In practice the surface is finished before a block is glued. Move `finish` ahead of `step4` in `STEPS` and in the tutorial beats (`rasp` before `block`), then re-run the tests.
- **Service worker offline start.** `sw.js:27-41` goes to the network first with no timeout, so an offline launch on a hung network waits for each request to fail. Race the fetch against about a 2.5 s timeout and fall back to cache (or use stale-while-revalidate for static files). Bump `VERSION`.
- **Leftovers on a new case.** `newCase()` (`main.js:65-79`) leaves the old coach card up behind the intro (call `ui.setCoach(null)`) and doesn't reset `ptr`, `shake`, `scrubLevel`, `holdLast`, `knifeAccum`, `pullRemoved` or `metricsTimer`.
- **Toasts overwrite each other.** There's a single toast element, so warnings replace step tips mid-read (`ui.js:96-102`). Add a small queue with priority (warn > good > info) and a minimum display time of about 1.2 s.
- **Duplicate helpers.** `hoof.js:93-113` re-implements `mulberry32` and `smoothstep` from `noise.js`, and `render.js:362` `roundRect` duplicates `toolart.js:17` `rrect`. Import one copy of each.
- **Optional first impression.** Replace the intro modal over a dimmed hoof with a proper title card (logo, the barn, ambient sound starting on the first tap). *Done 2026-10-10:* `#title` in index.html, `showTitle()` in main.js (barn painted with `paintScenery`, once per launch); the first tap or Enter starts the room tone and a muffled distant moo (`Sound.distantMoo`), then fades into the case card.

---

## WP6: a bigger hoof on phones (medium; scoped 2026-10-10 at `4494435`)

**Problem.** The canvas is a fixed 400×720 logical scene, letterboxed into `#canvasWrap` (`main.js:523-533`). Phone wraps are much wider than 0.556, so the fit is height-limited:

| Viewport | Wrap (CSS px) | Canvas now | Hoof scale now | Empty side margin |
|---|---|---|---|---|
| 375×667 | 375×413 | 229×413 | 0.573 | 146 px |
| 375×812 | 375×558 | 310×558 | 0.775 | 65 px |

About a third of the scene's height is not hoof. The HUD takes y 8–112, the strap and chute take y 112–180, and the bottom 60 px are empty. The claws (with the overgrown toes, both feet) span x 48–352 and y 182–625. The claw labels sit at y 652, and the clean-step target covers y 180–630.

**Change: a camera, plus a phone HUD drawn in screen space.** On narrow screens the canvas fills the wrap. The HUD becomes a fixed strip across the top, and the camera fits a content box of about x 38–362 and y 172–664 (324×492 logical) into the space that's left.

| Viewport | Hoof scale with WP6 (48 px HUD strip) | Gain |
|---|---|---|
| 375×667 | min(375/324, 365/492) = 0.742 | +29% linear, +67% area |
| 375×812 | min(375/324, 510/492) = 1.037 | +34% linear, +79% area |

### 6.1 Camera (the seam everything else goes through)
- Add a pure `fitCamera(wrapW, wrapH, mode)` in a new `src/view.js`. It returns `{ x, y, w, h, scale, hudH }` in logical px and is unit-tested. Mode `full` is today's whole scene, letterboxed. Mode `hoof` is the content box below a HUD strip. Put the content box, the strip height and the breakpoint in `CFG.view`.
- `Renderer.begin()`: `setTransform(k)` then `translate(-cam.x, -cam.y + hudH/scale)`. `cssScale` becomes `cam.scale`, so the text floor in `font()` keeps working.
- `toLogical()` (`main.js:166-175`) inverts the camera instead of `/ r.width * 400`. Add a round-trip test (logical → screen → logical).
- The walk-off keeps mode `full`, because it's a cutscene composed for the whole 400×720. Switch modes on `state` and refit once, not per frame.

### 6.2 Phone HUD strip
- Draw `meter()` in screen space under its own transform, about 48 CSS px tall and full canvas width. Keep the beam and status text ("clean to read", "LEVEL", "1.2 mm off") and the two corner readouts (name and mm). Swap the 46 px vertical gauges for short horizontal bars, and show "toe long" and "too thin" as text in the corners. The desktop HUD stays as it is.
- Keep the `wasCleaned()` gating from WP3.2: "— mm" until the foot is clean.

### 6.3 Scenery bleed
- With a full-width canvas, the camera shows logical x of about −53 to 453 at 375×667, but the scenery is painted only for 0–400 (`scenery.js:19-31`). Paint it with a horizontal bleed (around −80 to 480) and widen `background()`'s fill to match. The other option is a soft vignette into the dark wrap colour (D7).

### 6.4 Knock-on fixes
- **Touch grip.** `CFG.touch.grip` (68 logical px) would grow from 39 to 50 CSS px at 375×667 and to about 70 px at 375×812. Make the grip a CSS-px value (about 44) converted with `cam.scale`, so the tip-to-finger distance doesn't change with zoom.
- **Hoof buffer sharpness.** `HoofArt` picks a 3× buffer only when `k >= 2.6` (`render.js:115`). At scale 1.04 on a 3× DPR phone, k ≈ 3.1, so even the 3× buffer is slightly upscaled. Lower the threshold, or allow 4× when k > 3, after checking the memory cost (the buffer is 336×480 × S² × 4 bytes, plus the overlay).
- **Thickness readout.** The cursor pill clamps to 0–W (`render.js:415`). Clamp it to the camera's visible x range instead.
- **Fill cost.** The phone canvas gains about 1.6× pixels at 375×667. Check the frame time on a mid-range Android in Ben's playtest.
- **Docs.** Update the "How to verify" mapping in this plan, the README, and the DESIGN.md "View" row.

### 6.5 Verify
- `npm test`, including the new `view.js` tests. The playthrough bot works in logical coordinates and shouldn't change.
- In the preview at 375×667, 375×812, 412×915 and 1280×900 (desktop must be unchanged), check that:
  - the whole hoof, both labels and every tutorial target are visible
  - tool taps land where the tip is drawn (mouse and emulated touch)
  - the HUD strip shows "— mm" before cleaning
  - the canvas doesn't change size between beats
  - the walk-off is still letterboxed correctly

### Decisions for Ben
| # | Decision | Default |
|---|---|---|
| D6 | Where does the camera apply: phones only (≤ 860 px, like the rest of WP4) or everywhere it helps? | Phones only |
| D7 | Side margins: extend the barn scenery, or a soft vignette into the dark background? | Extend the scenery |
| D8 | Phone HUD: compact strip with horizontal gauges (+29%), or keep today's HUD scaled into a ~66 px strip (+23%, no redesign)? | Compact strip |

## WP7: the trimmer's route, with more conditions and progression (large; scoped 2026-10-10 at `30479cf`)

Today every case is the same sole ulcer on a dealt cow, played one at a time with nothing carried over. WP7 frames the game as a working hoof trimmer's round: you drive from farm to farm, trim each herd's cows, and build a reputation that opens up bigger and harder farms. (In-game copy says "trimmer", never "farrier": farriers shoe horses.)

Ben's calls (2026-10-10):
- **Structure:** the route. A farm visit is the level unit.
- **Fail state:** none. Reputation only goes up. A poor trim earns little; it never takes anything away.
- **Conditions:** both. Two or three new conditions done in depth, plus light variations on every case.

Build order: 7.1 → 7.2 (one condition at a time, each with its bot playthrough) → 7.3 → 7.4 → 7.5 → 7.6 → 7.7. The game should be shippable after each step: until 7.4 lands, "New cow" just deals from the wider case pool.

### 7.1 Condition framework (required before any new condition)
Case B is still the template: `buildCase()`/`makeCaseB()` in `src/case.js`, the ulcer-specific step 4 (block) and treat (spray + wrap) in `src/steps.js`, and the beats in `src/tutorial.js`.
- Add a condition registry (`src/conditions.js`). Each entry has the lesion kind and how to build it on the grid, its findings and probe text, which steps apply (trim always; block, treat, pare-out and wrap per condition), the correct diagnosis, the treatment plan text, and any scoring changes.
- `steps.js` builds the step list from the condition, and the five-step trim stays shared.
- Scoring reads "what was required" from the condition, not from literals.
- `makeCase(conditionId, seed, mods)` replaces `makeCaseB`; Case B becomes `makeCase('ulcer', 214)`, with an identical hoof (pin it with a test).
- The tests sweep every condition × 50 seeds, all of which must build, and run one bot playthrough per condition, which must reach Textbook with no blood.

**Status (2026-10-10): done, apart from the grid.** `src/conditions.js` holds `CONDITIONS` (only `ulcer` for now) with these fields: `caseId`, `title`, `steps` (step ids), `requires` ({open, block, treat}, which scoring gates on), `diagnosis`, `place(rand, side)` and `copy()`. `makeCase` always draws the side, so a `side` mod doesn't reshuffle the cow. `CASE_B` is `makeCase('ulcer', 214, {hand-placed mods})`, and a snapshot showed it and 7 seeded cows came out identical to before. `stepsFor(caseDef)` in steps.js feeds evaluateSteps, ui.js (the checklist is rebuilt when the step list changes) and main.js. Probe, decoy art and scoring read `caseDef.lesion.type` in place of `'ulcer'`. Still ulcer-specific, to generalize per condition in 7.2: `LOOSE.ULCER` carving in hoof.js, the step4/treat predicates, tutorial beats, and the `tests/player.js` bot path.

### 7.2 New conditions, in depth (two or three)
In priority order. Each one needs its own probe text, art in HoofArt, a bot path in `tests/player.js`, and a tutorial-lite hint for its first appearance.
1. **Routine trim (nothing wrong).** The restraint test. Decoys only: the right read is "sound", and the job is the five-step trim with nothing opened. Opening a decoy costs Restraint. Cheapest to build, and it makes every other diagnosis meaningful.
2. **White-line abscess.** A dark track in the white line near the toe or abaxial wall. The testers flinch along the line. Pare along the track until it drains (a new "drain" event in tools.js), relieve the claw and block the sound one. The mistake to punish is digging into the sole instead of following the line.
3. **Digital dermatitis (strawberry heel).** A raw lesion between the heel bulbs, outside the sole grid's trim zones. No knife: clean, spray, then wrap. Cutting there is the mistake. Needs a small heel-cleft area added to the grid and art.

**Status (2026-10-10): routine trim done, tests 46/46.** It is `CONDITIONS.routine` (Case A "Due for a Trim", `lesion: null`, read = `sound`, steps = trim + step5, 1–2 decoys). The deal weights are routine 0.4 and ulcer 0.6, through `dealCase(seed)`, which main.js uses for "Trim another". Code that assumed a lesion now checks for one: soundClaw returns CLAW.NONE, and HoofArt, render, walk-off, applyWrap (new reason `nothing`), placeBlock and the release beat skip the lesion. Scoring: a needless block costs Correctness −20, and a decoy dug more than 0.75 mm below target costs Restraint −25 (this applies to every condition). The guided tutorial is offered only on the ulcer case. The intro's treat line is swapped for "leave what's firm alone". New dev param: `?cond=routine&seed=3`. Browser-verified: that URL deals Case A (no lesion, stain and bruise decoys, routine step list). The earlier Case B was the service worker serving a cached main.js, so index.html now skips (and unregisters) the SW on localhost unless the URL has `?sw`. Still to do for routine: a first-appearance hint beyond the intro copy.

**Status (2026-10-10): white-line abscess done, tests 53/53.** It is `CONDITIONS.whiteline` (Case C "Under the Wall", `noun: 'abscess'`, steps TRIM + drain + step5, requires open + block, no treat). Deal weights: routine .3 / ulcer .4 / whiteline .3. Model: `hoof.tract[]` (ENTRY/TRACK/POCKET) under `LOOSE.TRACT`; only the knife opens it, and only from the entry or next to an opened cell (`tractOpenable`), cutting a groove at target −1.5 mm (pocket −2.5). `ev.drain` fires once at 50% of the pocket open and sets `hoof.drained`; `ev.offTrack` fires on knifing the pocket without following the track. Metrics skip the groove for thin/rough/wb. Scoring: `lesionOpened()` = drained; more than 6 sole cells dug 1 mm below target beside the track = Restraint −25. main.js: one `releasePressure()` beat for both lesions (ulcer opened / abscess drained), weep at `lesionSpot`, an off-track hint, tract flakes, probe = flinch (no weep) on the white line, block/grinder copy uses `caseDef.noun`. `applyWrap` refuses with `untreated` when `requires.treat` is false. Art: ulcer art gated on `type === 'ulcer'` (which also fixes a null-lesion `L.r` crash on the routine case), plus a dark seam along the track, a pale opened groove with grey pus at its bottom, and a pink-grey drained pocket. render: a dashed trace beside the track + pocket ring, "▲ white line" label; walk-off rings the pocket. First-appearance hint: a `howto` line in the intro ("Follow the dark line in from the wall"). Tests: idealTrim pares the groove and drains; sweep checks the track stays in its claw with all three tract parts; bot `followTrack()` path; playthrough on all four foot × claw layouts; drain-once, off-track/grinder can't open, hunting the sole, undrained, and no-wrap tests. `sw.js` v9. Browser: `?cond=whiteline&seed=1` deals Case C with the right step list and intro hint, no console errors.
Still to do: an eyeball pass on the seam / groove / pocket art at full size (not yet looked at closely).

**Status (2026-10-10): digital dermatitis done, tests 59/59.** It is `CONDITIONS.dd` (Case D "Strawberry Heel", `noun: 'lesion'`, steps TRIM + step5 + `dress`, requires treat only: no open, no block). Deal weights: routine .25 / ulcer .3 / whiteline .25 / dd .2. Model: `zone` is now a Uint16Array; `Z.CLEFT` is a strip `GEOM.cleftW` (12 px) wide along each claw's axial heel between `cleftY0`/`cleftY1` (204–238), built on every foot, and `Z.DD` marks the patch on it (`placeCleft`, r 10–12). metrics skip the cleft as horn; `m.ddN`/`ddTint` feed `lesionTint`. Tools: knife, grinder and nippers take nothing off the cleft but set `ev.cleftCut` (tool core only) and bleed the DD cells visually (`blood[i]`, no fail); the rasp rides over it; the spray soaks DD at the full rate; `applyWrap` gates `closed` on ulcers only. Scoring: `lesionOpened` true for DD; any cleft cut is Correctness −15 and Restraint −20; a block on a DD foot is Correctness −20; DD gait relief is 100 only when treated and unblocked. main.js: a sharp flinch on the probe and on cleft cuts (throttled), noun-aware wrap/spray/block copy. Art: greyish-pink cleft skin on every foot, a raw red ellipse with pale dots and a white rim on DD, teal when sprayed; render marker label "DD ▼". Tests: idealTrim tints DD and only blocks when `requires.block`; the sweep counts DD cells; DD cleft/no-blade, spray/wrap/block, and cleft-cut penalty tests; the bot plays DD on all four layouts. `sw.js` v10. Browser: `?cond=dd&seed=1` deals Case D with the right intro, howto and step list; no errors after starting (it caught a use-before-declare in hoofart compose that Node tests can't see).
Still to do: an eyeball pass on the cleft skin and DD patch at full size (only seen at a small pane size: a red patch with a pale rim on the axial heel, in place, no errors). "Digital dermatitis" is now a wrong option on Cases A–C's read cards.

**Digital dermatitis (Case D), the original handoff plan:**
1. `hoof.js`: a heel-cleft area between the bulbs (a new zone bit, say `Z.CLEFT`, built next to `Z.HEEL` near `GEOM.heelY` on the axial side), which is outside every trim zone. `LESION_LOOSE` has no entry: DD is not loose horn. contactMap and metrics skip the cleft.
2. `conditions.js`: `FINDING.dd` (raw, strawberry-red, very sore to the touch), `placeCleft`, `CONDITIONS.dd` (caseId 'D', noun 'lesion', requires {open: false, block: false, treat: true}, with a `howto` hint "No knife in the cleft: clean, spray, wrap"). Re-weight the deal.
3. `tools.js`: the knife, grinder or nippers in the cleft set `ev.cleftCut` (and bleed easily). The spray tints the cleft; `applyWrap` must accept a DD lesion with no `looseRemain` gate, keyed on the condition (today it checks `LOOSE.ULCER` and `lesionTint`, which is ulcer-only).
4. `steps.js`: a DD treat step (clean the cleft → spray → wrap). `scoring.js`: `lesionOpened` returns true for DD; any cleft cut costs Correctness and Restraint; `lesionTint` has to measure the cleft, not `LOOSE.ULCER`.
5. main.js / render / walkoff / hoofart: the probe on DD = a sharp flinch; the marker and walk-off use `lesionSpot` (give DD x, y, r); the art is a raw red ellipse with a white rim in the cleft (gate it like the ulcer art, `type === 'dd'`).
6. Tests: idealTrim tints the cleft and wraps; the sweep; a bot path (spray the cleft, wrap); a cut-in-the-cleft penalty; sw v10; a browser check at `?cond=dd&seed=1`.

Later candidates, not in WP7: a thin-soled cow (over-trim trap), a corkscrew claw, and a toe ulcer.

### 7.3 Light variations (every case)
Data only, through `mods` in `makeCase`, chosen per farm (7.4):
- excess growth per claw, and front versus hind foot (RH is already supported)
- mud level, which changes how long cleaning takes
- the number and kind of decoys
- lesion size and position within its allowed band
- cow temperament: flinch threshold and movement while you work (the existing flinch, tuned per cow)

Each modifier keeps the bot at Textbook across the seed sweep.

**Status (2026-10-10): done, tests 74/74.** Ben chose to include front feet. `makeCase(condition, seed, mods)` takes `foot` ('hind'|'front'), `growth` (scales both claws' excess), `mud` (1 usual; below 1 patchier cover, above 1 caked: `hoof.mudHard` slows the brush), `decoyCount`/`decoyKinds`, `lesionSize`/`lesionAt` (0..1 in the condition's size and position bands; for white line, size = a longer track and bigger pocket) and `temper` (0 calm .. 1 lively). Placement takes `v` and still makes every random draw, so a mod changes only what it names; with no mods, 100 seeded cows plus Case B came out byte-identical to before. `dealCase` now varies cows through `dealMods(seed)` (own RNG stream: 15% front, growth .75–1.35, mud .65–1.5, temper .1–.95, sometimes a different decoy count or kind) until 7.4 gives farms their own ranges. Front foot: `firstClaw`/`secondClaw(cd)` in hoof.js (front = outer first, inner overgrows, ulcers and white-line abscesses favour the inner claw). Steps 1/2 labels, tips and checks, the rasp check, the wrong-first-claw note in scoring, the subtitle/intro copy ("left front") and the walk-off limp leg (LF/RF) all follow the foot. The guided run is offered on hind feet only. Temperament: `temperament(t)` in case.js from `CFG.temper`. A blade at living sole thinner than `flinchAt` (2.4–3.6 mm, under the dish band) makes her flinch (from `ev.minLive`, a new tools event). Every flinch jolt scales by `shake`. Above 0.45 she fidgets every 16–6 s; at 0.8 or more a fidget knocks a held tool off. The intro shows a traits line for front feet, flighty or calm cows, wet-yard or clean-straw mud, and long-overdue growth. Dev params: `&foot=front&growth=&mud=&temper=&decoys=&size=&at=`. The bot's knife used to cut into an opened ulcer core on some seeds (4, 5 and 12 failed with no mods), so it now keeps its edge off an opened core while dishing and stops paring once the ulcer is open. New tests: a plain sweep of 4 conditions × 10 seeds; each variation at both ends × every condition × 3 seeds; dealt cows × 6 seeds; front feet on both sides; plus unit tests for mods, mud brushing time, temperament and the deal. `sw.js` v11. Browser: `?cond=ulcer&seed=5&foot=front&temper=0.9&mud=1.4` shows "right front", outer-first step labels, the three trait lines and no guided button.
Not yet verified live: the flinch and fidget feel (the preview's rAF was paused). Tune `CFG.temper` in Ben's playtest.

### 7.4 The route and farms
- **Farm profile:** name, herd size (3–6 cows per visit), housing (pasture, freestall, straw yard, wet yard) which sets the condition weights and mud, a temperament range, and a one-line farmer intro. Start with 6–8 hand-written farms.
- **A visit** is that farm's cows in sequence, ending with a day summary: each cow's grade, mobility, and the reputation earned.
- **The route map** is a simple screen between visits: farms as stops along a road, locked ones greyed out with their reputation threshold shown. The title card's "tap to start" leads here once a save exists.
- **Reputation only goes up.** Each cow earns points by grade (Textbook > Sound > ...). A lame walk-off earns nothing and flags that cow for the return visit. Thresholds unlock farms and, through them, new conditions and modifiers.
- The first farm is the current tutorial: a small, calm herd, with guides on.

**Status (2026-10-11): done, tests 82/82.** `src/route.js` is pure data and state (no DOM). `FARMS` is one road of 7 invented farms (D10, D13), each with `housing` (pasture / straw / freestall / wet, per Shearer), a fixed `cows` count (3–6, D12), a condition `mix`, `growth`/`mud`/`temper` ranges, a `front` share, optional `decoys`, a farmer and a one-line intro. Willow Bank (rep 0, straw, 3 calm hind-foot cows) opens its first visit on `CASE_B` with the guided trim; Marsh End and the wet yards bring digital dermatitis; Top Lane is the first with front feet. Thresholds 0 / 30 / 100 / 180 / 270 / 380 / 500. `cowSeed(farm, visit, k)` fixes each visit's herd; `farmMods` draws the condition and mods from the farm's ranges on its own RNG stream; `visitCases` skips repeated ear tags. Reputation: `POINTS` Textbook 10 / Clean 7 / Sound 4 / Needs work 1; a lame walk-off or blood earns 0 and is flagged in `history` (for 7.5); a whole-herd-sound day adds `HERD_BONUS` 5. Points bank at `endVisit`, which reports what opened. The route state (`rep`, `visits`, `best`, `history`, `visit`) is plain JSON for 7.7; until then it lasts for one launch. main.js: title → the first farm's visit card → its cows in order (eyebrow and case title say "Farm · Cow k of n") → each ticket shows the reputation line and "Next cow" / "End of the day" → the day summary (a table of tag, case, grade, gait, points; the herd bonus; lame cows; newly opened farms) → the road map (`#route`, a dashed lane of stops: open, suggested in brass, locked with the threshold). Failing a cow now moves on to the next one in a visit; free play keeps "Try again". The frame loop skips drawing until a cow is in the crush (the first visit card comes up before any case exists). Dev params: `?farm=<id>` starts a visit there, `?rep=n` sets the reputation; `?cond=` is still free play off the route. `?debug` also exposes `hoofRoute` and `hoofRound`. Pacing test: an all-Textbook player opens the road in 11 days, all-Sound in 23. `sw.js` v12. Browser: the visit card, three cows, the day summary (+17 with one lame cow) and the road map at 375×812 (no horizontal scroll, 60 px stops), no console errors.
Still to do: a phone playtest of a full visit (pacing, whether the day summary feels rewarding); the title card only goes to the road map once saving exists (7.7).

### 7.5 Return visits
- Revisiting a farm deals some of the same cows back by ear tag, a few months later. Each one shows the outcome of last time: healed, or still sore if the trim was poor.
- A cow flagged lame becomes a recheck case: the same foot, a slightly worse lesion, and a chance to earn the points back. That's the "only up" way to make a bad trim matter.
- Store per cow: farm, tag, seed, condition, last grade, and healed or not.

### 7.6 Difficulty ramp
Turn the help down with reputation, not with menus:
- guides on → guides only after a mistake → off
- a wider tolerance band early, today's band later
- more decoys and calmer cows early, livelier cows later

Show the current tier on the route map ("Guides: off from here").

### 7.7 Saving progress
- Save to `localStorage` under one versioned key: reputation, unlocked farms, cow history, best grade per farm, and tier.
- Wrap every read and write in try/catch. If storage is blocked or cleared, the game still starts at farm 1.
- Add a "Start the round over" option behind a confirm.
- On Android (Capacitor) localStorage persists; check that the APK keeps the save across restarts.
- Test: save, reload, same state; also a corrupted save, which should fall back to a fresh start without throwing.

### Decisions for Ben
Ben took all five defaults on 2026-10-10.

| # | Decision | Default |
|---|---|---|
| D9 | Which deep conditions, in what order: routine trim, white-line abscess, digital dermatitis? | All three, in that order |
| D10 | Route shape: one fixed road of farms, or a small branching map where you choose the next stop? | Fixed road first; branching later if it feels thin |
| D11 | Earnings and kit upgrades (better grinder, a tilt chute, the van): in WP7, later, or never (keep it calm)? | Later; reputation only for now |
| D12 | Cows per visit: fixed per farm, or random within the farm's range? | Fixed per farm, so the visit length is predictable |
| D13 | Farm names and farmers: invented, or named after real places or people you know (with their OK)? | Invented |

### How to verify
- `npm test`: the condition × seed sweep, one bot playthrough per condition at Textbook, and the save/load tests.
- In the preview: play farm 1 through to the route map; reload and confirm progress is kept; and a return visit shows the healed or recheck state.
- Ben's phone playtest of a full visit: the pacing of 3–6 cows, and whether the day summary feels rewarding.

## Done criteria for the whole plan
- `npm test` is green, including the WP0 playthrough at Textbook and the variation sweep.
- In the preview at 1280×900, 375×812 and 375×667: no guides or mm figures before cleaning; guided progress visible on phones; the canvas stays the same size between beats; tool buttons at least 44 px wide; canvas text at least about 11 CSS px.
- Ben's phone playtest: he can stop the grinder at about 7 mm on purpose, and the danger can be heard and felt before any blood.
- README and DESIGN.md match the new behavior.
