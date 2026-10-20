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

**Status (2026-10-11): done, tests 82/82.** `src/route.js` is pure data and state (no DOM). `FARMS` is one road of 7 invented farms (D10, D13), each with `housing` (pasture / straw / freestall / wet, per Shearer), a fixed `cows` count (3–6, D12), a condition `mix`, `growth`/`mud`/`temper` ranges, a `front` share, optional `decoys`, a farmer and a one-line intro. Willow Bank (rep 0, straw, 3 calm hind-foot cows) opens its first visit on `CASE_B` with the guided trim; Marsh End and the wet yards bring digital dermatitis; Top Lane is the first with front feet. Thresholds 0 / 30 / 100 / 180 / 270 / 380 / 500. `cowSeed(farm, visit, k)` fixes each visit's herd; `farmMods` draws the condition and mods from the farm's ranges on its own RNG stream (since 2026-10-11 each visit's conditions come from a shuffled deck, `herdDeck`/`visitDeck`, so the mix holds on every visit; `farmMods` still supplies the mods); `visitCases` skips repeated ear tags. Reputation: `POINTS` Textbook 10 / Clean 7 / Sound 4 / Needs work 1; a lame walk-off or blood earns 0 and is flagged in `history` (for 7.5); a whole-herd-sound day adds `HERD_BONUS` 5. Points bank at `endVisit`, which reports what opened. The route state (`rep`, `visits`, `best`, `history`, `visit`) is plain JSON for 7.7; until then it lasts for one launch. main.js: title → the first farm's visit card → its cows in order (eyebrow and case title say "Farm · Cow k of n") → each ticket shows the reputation line and "Next cow" / "End of the day" → the day summary (a table of tag, case, grade, gait, points; the herd bonus; lame cows; newly opened farms) → the road map (`#route`, a dashed lane of stops: open, suggested in brass, locked with the threshold). Failing a cow now moves on to the next one in a visit; free play keeps "Try again". The frame loop skips drawing until a cow is in the crush (the first visit card comes up before any case exists). Dev params: `?farm=<id>` starts a visit there, `?rep=n` sets the reputation; `?cond=` is still free play off the route. `?debug` also exposes `hoofRoute` and `hoofRound`. Pacing test: an all-Textbook player opens the road in 11 days, all-Sound in 23. `sw.js` v12. Browser: the visit card, three cows, the day summary (+17 with one lame cow) and the road map at 375×812 (no horizontal scroll, 60 px stops), no console errors.
Still to do: a phone playtest of a full visit (pacing, whether the day summary feels rewarding); the title card only goes to the road map once saving exists (7.7).

### 7.5 Return visits
- Revisiting a farm deals some of the same cows back by ear tag, a few months later. Each one shows the outcome of last time: healed, or still sore if the trim was poor.
- A cow flagged lame becomes a recheck case: the same foot, a slightly worse lesion, and a chance to earn the points back. That's the "only up" way to make a bad trim matter.
- Store per cow: farm, tag, seed, condition, last grade, and healed or not.

**Status (2026-10-11): done, tests 86/86.** route.js: `farmCows(history, farm)` is each cow's latest record at a farm. `returningCows(farm, visit, history)` (visit 2 on) brings back every cow still lame, then `healedBack(farm)` = max(1, ⌊cows/3⌋) cows that walked off well, picked on the visit's own seed, never more than the herd. `returnCase` rebuilds her from her seed: same tag, side, foot and temperament, with this visit's growth and mud. A recheck keeps her condition with `lesionSize: 1` (the top of its band; Case B's hand-placed ulcer grows 2 px, from the new `CASE_B_MODS`). A healed cow comes back as a routine trim. Each returning case carries `back: {visit, grade, was, outcome}`, and `backLine(cd)` gives the intro's line about last time. `visitCases(farm, visit, history)` deals the returning cows first, then fresh cows that never wear a tag the farm has seen. A recheck earns the usual points by grade. History and day rows gain `back` ('recheck' | 'healed' | null). `endVisit` reports `mended` (rechecks that walked off sound); a recheck that goes lame again stays flagged and comes back next time. main.js: the visit card says how many cows you've trimmed before and which tags the farmer wants rechecked; the intro eyebrow adds "Recheck" and a bordered line about last time (red for a recheck, green for healed); the ticket says "back on her feet"; the day table marks returning cows with ↺ and lists the mended ones; the road map shows "n to recheck". `sw.js` v13. Browser: Hollins visit 2 after one lame cow shows the recheck card, the recheck intro, +7 "back on her feet" and the day summary with "Back on her feet: #602" at 375×812 with no overflow.
Still to do: a routine cow that went lame comes back as a routine recheck, and the routine intro copy ("hasn't seen her favour it") sits oddly under the "went off sore" line. Saving (7.7) is needed before return visits survive a relaunch.

### 7.6 Difficulty ramp
Turn the help down with reputation, not with menus:
- guides on → guides only after a mistake → off
- a wider tolerance band early, today's band later
- more decoys and calmer cows early, livelier cows later

Show the current tier on the route map ("Guides: off from here").

**Status (2026-10-11): done, tests 91/91.** route.js `TIERS`, each opening with a farm: Apprentice (rep 0: guides on, ±1.0 mm band, new cows temper −0.1 and one extra decoy), Journeyman (100, Brackenford: guides only after a slip, ±0.85), Master trimmer (270, Marsh End: guides off, ±0.75, which is today's band, temper +0.1). `tierFor(rep)`; `tierMods` leans fresh cows only (returning cows keep their temperament); `visitCases(..., tier)` puts `tolerance` on copies of each case (Case B itself stays untouched). `tolOf(caseDef)` in config.js feeds the step checks (levelled, dish), the tutorial goals, the over-trim check, the gauges and cursor pill (`renderer.tol`), and Balance's height ramp, which widens its full-marks zone by the extra slack so stopping at the green band's edge isn't penalised. main.js: on the route each cow's guides follow the tier (the chip still overrides); at the 'mistake' tier any warn toast, a nick or a wrong block turns them on for that cow (`slip()`). The road map header shows the tier, its guides and band; Brackenford and Marsh End carry "… from here". `sw.js` v14. Tests: tier order and thresholds, tierMods clamping, the herd's band, step1 at 7.9 mm under both bands, and the bot at Textbook on every condition at every tier's band. Browser: at rep 120 the header reads Journeyman, both stops are marked, and a Brackenford cow starts with guides off at ±0.85.
Not yet felt in play: whether the 'slip' trigger is too eager (thin-sole warnings count). Tune in Ben's playtest.

### 7.7 Saving progress
- Save to `localStorage` under one versioned key: reputation, unlocked farms, cow history, best grade per farm, and tier.
- Wrap every read and write in try/catch. If storage is blocked or cleared, the game still starts at farm 1.
- Add a "Start the round over" option behind a confirm.
- On Android (Capacitor) localStorage persists; check that the APK keeps the save across restarts.
- Test: save, reload, same state; also a corrupted save, which should fall back to a fresh start without throwing.

**Status (2026-10-11): done, tests 95/95.** `src/save.js`: `SAVE_KEY` `truehoof.round.v1` holds `{v: 1, rep, visits, best, history}`. Opened farms and the tier follow from `rep`, so they aren't stored. `saveRound` runs at the end of each day (in showDay) and never includes a day in progress: a mid-day save drops that visit's history, so a reload goes back to the road map with the day unplayed. `loadRound` checks every field (version, counts ≥ 0, known farm ids, history rows with farm/tag/seed/condition) and falls back to `newRoute()` on a missing, corrupt or blocked store without throwing. main.js: the round loads at launch; once a day is finished, the title leads to the road map; "Start the round over" (a quiet link under the map, shown once there's progress) asks to confirm, then clears the save and opens Willow Bank. `sw.js` v15 precaches save.js. Tests (tests/save.test.js): save → reload gives the same state, the same return-visit herd and the same tier; the day in progress isn't saved; nine malformed saves, blocked storage and no storage all give a fresh round; reset clears the key. Browser: a finished Willow Bank day saved rep 35; after a reload the title went to the road map (Reputation 35, Apprentice), and Start over → confirm cleared the key and opened Willow Bank's first visit.
**Update (2026-10-12): save after each cow, resume the visit.** The save now also holds `visit` (the day in progress: farm, n, k, rows) and that day's cows in `history`. `saveRound` runs when a day starts, after each cow's ticket (showResults/showFail) and at the end of the day. On launch, a saved day resumes at its next cow, or at the day summary if every cow is done; `visitHerd(route)` (route.js, now also behind `startVisit`) re-deals the herd from the history before that day and the tier, so it is the same herd. The cow in the crush at the reload starts again. `parseRound` checks the day (known open farm, n = visits + 1, 0 ≤ k ≤ cows, k well-formed rows, exactly k of today's cows in the history); a broken day is dropped with its cows, back to the last finished day. Cows from an unfinished day with no saved day are dropped too. Free play ignores a saved day without touching it. `sw.js` v17. Tests 102/102; browser: a planted k=1 save resumed at Willow Bank cow 2 of 3 (#249, the right cow), a k=3 save went to the day summary and banked rep 35, and "Start the day" saved k=0.
Still to do: check on the phone that the APK keeps the save across a force-stop and restart (Capacitor's WebView localStorage should persist).

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

### Review fixes (2026-10-12)
A code review of everything since the plan found that the reworked ulcer cap let the moves the game asks for cut into the open core, and that the bot dodged exactly those moves. Fixed: the knife comes off when the cap gives (`popCap` calls `releaseHold`); the cap and the open core answer only to the flat of the blade (`CFG.tools.knife.flat`, stamp falloff ≥ 0.4); `capLift` is 1.75 × the ulcer radius; the guided paring ring sits at r + the flat's reach + 3, so circling it never touches the core; the dish zone stops at the cap plus the flat's reach. Tutorial targets carry an `avoid` keep-out ring (red, round the cap) on the grind step for the ulcer's claw and on the dish step. The bot no longer steers its blade round an opened core: it saws until the cap gives, circles the guided ring, dishes round the cap, and fails on any `lesionCut`. Also: `parseRound` rejects history rows with an unknown condition, side, foot or visit (a return visit would have thrown); the conditions.js note on decoys; `sw.js` registers the background cache refresh while the fetch event is live. `sw.js` v16. Tests 98/98.

## WP8: more scenarios: new conditions (large; scoped 2026-10-13 at `266e6d7`)

Sources: `docs/NOTES-NATE-AMA.md` and the full caption file Ben saved this morning (`reference/nate-hoof-guy-ama-4paUJHxQS70.txt`, git-ignored), checked against the AHDB field guide and Shearer ch. 4.

Ben's calls (2026-10-13):
- **First batch:** new conditions. Judgment cases and farm traits come after (see the end of this section).
- **"This isn't a trim" calls:** a separate action the player has to think of, not an answer on the read card.
- **Scoring a correct call:** full points. Trimming a cow you should have left costs Restraint.
- **D14–D21:** defaults taken (D19–D21 came out of the reference check below).

Each new condition follows the 7.2 recipe: a `CONDITIONS` entry with `place`/`copy`, its `FINDING`, HoofArt, a bot path in `tests/player.js`, a `howto` hint for its first appearance, the sweep (50 seeds) and a playthrough on all four foot × claw layouts. It then joins the farm mixes (8.6). Build order: 8.1 → 8.2 → 8.3 → 8.4 → 8.5 → 8.6, shipping after each step.

### What the references changed
- **Axial fissure is out of WP8.** Shearer treats a wall crack by grooving its edges into a V along the whole length of the crack, on the wall face. The game only shows the sole, so just the crack's bottom end would be visible, and the real job would happen off-screen. It comes back if the game ever gets a wall view. **D20** proposes double sole in its place.
- **Toe necrosis is partly vet work.** The AHDB field guide says proper treatment needs a vet, surgery and anaesthetic. It lists the cues as walking back on her heels, no swelling, very painful, and often linked to DD. Nate trims these cows repeatedly with a wood block, and the bone damage is permanent. So in the game the trimmer's part is to clear the crumbly horn, block on wood and **refer her**. That ties 8.4 to 8.1 (**D19**).
- **Foot rot isn't "touch nothing".** The field guide's steps are: clean the split skin between the claws, pick out stones, spray it, then the vet gives antibiotics. Its cues are sudden lameness, broken skin between the claws, swelling and heat on both sides of the foot, and the smell. Swelling is what separates it from DD (no swelling) and from toe necrosis (no swelling either). Shearer adds that swelling confined to one claw points to a claw problem, not foot rot.
- **Puncture is treated like an ulcer.** Shearer's example record treats a sole puncture with a block and corrective trimming, then a recheck.

### Fact checks (done 2026-10-13, by reading the code)
| Check | Finding | Action |
|---|---|---|
| Wall harder than the sole? | **No.** `cut()` in tools.js never looks at `Z.WALL`, so wall cells cut at the sole's rate toward the same target. | Small fix (D21): a `CFG.tools.<tool>.wall` multiplier (about 0.5 for the knife, 0.7 for the grinder) applied in `cut()` to `Z.WALL` cells. Re-run the bot sweep, since step 1 grinds across the wall. |
| Does the white line move as the sole is pared? | **No.** HoofArt paints it at a fixed distance from the claw's edge (`e < wallW + 1.4`). | Optional art tweak: let it creep a pixel or two inward with `removed` at the toe. Low value, so park it in WP5. |
| Toe length fixed vs foot size? | **Moot.** The game has no foot-size variation. Every foot has the same geometry. | Nothing to do unless foot size becomes a mod. |
| DD copy implying tetracycline? | **No.** No antibiotic, tetracycline or powder anywhere in `src/`. The spray is unnamed. | Nothing. Keep it unnamed. |

### 8.1 Vet / leave-her: a second way to end a cow (required before foot rot)
Today a cow ends in exactly one way, the **Release** button (`requestRelease()` in main.js, `btnRelease` and `btnReleaseBar` in index.html). 8.1 adds a second, always-visible button beside it: **"Vet / leave…"**. It opens a sheet with *Hospital pen, call the vet*, *Leave her till dry-off* and *Back*. Choosing one ends the cow with whatever has been done so far, so a referral can come after treatment (toe necrosis) or instead of it (foot rot).
- **Data:** each condition declares `call: 'vet' | 'leave' | null` (null = release her as usual). The session records `session.call`.
- **Scoring** (`scoreCase` gains an early branch, like the blood branch):
  - Right call on a `call: 'vet'` cow: the parts are scored as usual on what she needed done before referral (see each condition). Releasing her instead costs Correctness −25 ("This one needs the vet").
  - A call on a `call: null` cow is the over-cautious mistake: grade Needs work, gait "sent to the pen", with a note on what the foot actually needed.
  - Trimming strokes a `call` cow didn't need cost Restraint, each condition's own rule.
- **Ticket and gait:** a referred cow doesn't walk off. The ticket shows "In the hospital pen for the vet" in place of the walk-off, mobility n/a. Her points follow her grade (POINTS), and she isn't flagged lame.
- **History:** rows gain `call`. A referred cow comes back on the next visit as a recheck of her condition only when the condition says so (toe necrosis does, foot rot doesn't: the vet has her). A cow left till dry-off comes back on the next visit as an ordinary case.
- **Save:** `parseRound` accepts the new conditions automatically (it checks `CONDITIONS`). `call` is optional on old rows, and the save version stays 1.
- **Tests:** a call on a routine cow scores Needs work; release on a `vet` cow loses the Correctness; the bot path presses the button and picks the call; and history/return-visit rules hold for `call` rows.

**Status (2026-10-13): done, committed a4b2e28, tests 107/107.** `CALLS` in conditions.js (pen, vet, leave: label, sub, gait, ticket); `requestCall()` sheet in main.js behind `#btnCall`/`#btnCallBar`. `session.cuts` counts one per pointer-down for knife, grinder, nippers and rasp. `scoreCase` has an early leave branch (full marks less 10 Restraint per stroke); a missed vet referral costs Correctness 25, a pen in place of the vet 15, a needless call caps at Needs work with no walk-off. History and day rows carry `call`; the save accepts it (`callOk`), and old rows load. The bot path for calls landed with foot rot (8.2).

### 8.2 Foot rot (call: vet)
- **Look:** the whole foot is swollen and warm, the claws are spread, and the skin between the claws is split, grey and moist. The read card says "it smells; she went lame overnight". The swelling shows on both claws evenly, which is the tell against a claw lesion.
- **Probe:** sore anywhere above the coronet. The horn of both soles is firm.
- **Job:** clean, spray the split skin, then *Hospital pen, call the vet*. No trim: any blade stroke on the sole costs Restraint −15 (capped at −30). A blade in the cleft is the existing cleft-cut penalty.
- **Read card:** foot rot is right. DD gets the feedback "DD is a neat raw patch with no swelling; this whole foot is swollen and split".
- **Model:** reuse `Z.CLEFT` with a new `Z.ROT` mark along the cleft's length (Uint16 has room: bit 1024). The spray soaks it like DD. Swelling is art only: in HoofArt, puff the heel bulbs and coronet and widen the gap between the claws by a few px. The grid doesn't change.
- **Steps:** `clean`, `diagnose`, `dress` (spray only: the wrap isn't required) and a new `refer` step whose `done` is `session.call === 'vet'`. Dropping the trim steps is the whole lesson.
- **Cost:** small to medium. Mostly art and the step list.

**Status (2026-10-13): done, tests 109/109.** `CONDITIONS.footrot` (Case E "Hot Foot", weight 0.12, `call: 'vet'`, requires {treat, no open, no block, no wrap, `trim: false`}, steps clean, diagnose, `soak` (spray only, tint ≥ tintMin) and `refer` (done when `session.call === caseDef.call`)). Model: `Z.ROT` (1024) on every cleft cell of both claws; the probe gives the foot-rot read on the split and on either heel (`FOOTROT_HEEL`), soles firm; ROT counts in `ddN`/`ddTint`, so `lesionTint` and the spray work as for DD; `applyWrap` refuses with `nowrap`. Scoring with `trim: false`: no balance, dish, first-cut, rough or heel-horn notes, Balance 100, Finish = mud only, Restraint −15 per stroke (cap −30) with the condition's `trimNote`; released without the call is the 8.1 Correctness −25, and she walks off lame. main.js: a flinch on the probe, the `nowrap` message, a cleft warning, a spray toast and the intro's treat line. Art: the bulbs on both claws flush red-pink toward the cleft (drawn after the stain layer, which otherwise hides it); the cleft skin is grey and macerated with a red inflamed rim and a dark wet crack along the claw edge, teal once sprayed; render label "foot rot ▼". Farms (the foot-rot slice of 8.6): Marsh End {dd .4, footrot .2, whiteline .2, routine .2} (ulcer dropped so a 5-cow deck holds every condition) and Coldharbour {ulcer .25, dd .2, whiteline .2, footrot .15, routine .2}. The swollen coronet and wider claw gap from the plan were not done (art in the sole view only). Tests: idealTrim cleans and soaks without trimming; idealRun makes the call; the 50-seed sweep; the bot sprays the split and calls the vet in every playthrough sweep (gait 'to the vet'). Dev: `dev/artlab.html?cond=<id>&seed=n` stages any dealt condition (dirty, brushed, sprayed). `sw.js` v18 (covers 8.1 too).

**Wall hardness (2026-10-13): done, tests 109/109.** `cut()` in tools.js scales the cut on living `Z.WALL` cells by the tool's `wall` factor: knife 0.5, grinder 0.7 (config.js). Dead toe horn and the rasp and nippers are unchanged. The bot still reaches Textbook on every sweep. `sw.js` v19.

### 8.3 Puncture (foreign body; call: null)
- **Look:** a mark in mid-sole that is *too regular*: a perfect small circle or a short straight line (Nate 1:24:05). It sits among stain and bruise decoys that stay irregular, so shape is the tell. Placement is mid-sole, away from the usual lesion sites.
- **Probe:** a sharp, pinpoint flinch on the mark only. Unlike the white line, it doesn't flinch along a track.
- **Job:** the five-step trim, then pare a narrow funnel straight down until it drains, block the sound claw on rubber, flush and wrap. The mistake is opening a wide crater around it.
- **Model:** reuse the tract machinery with depth in place of distance. ENTRY = the mark (2–3 cells), POCKET = the cells around it a little wider, with `tractOpenable` letting the knife widen only from the open centre. The groove depths follow `GROOVE`. The "hunting" check becomes a per-lesion `huntRadius` (white line: track + 14 px, puncture: pocket + 10 px).
- **Read card:** the existing "Foreign body" option becomes the right answer here. On the other cases it stays wrong, with fresh feedback ("a puncture is a regular hole or line; this is…").
- **Art:** a crisp-edged dark circle or a ruled dark line with a faint metallic glint, then a pale funnel with grey pus at the bottom once opened. The regular shape has to read at phone size, so it is the art check for this case.
- **Cost:** medium.

**Status (2026-10-13): done, tests 111/111.** `CONDITIONS.puncture` (Case F "Something Sharp", weight 0.12, steps TRIM + `funnel` + step5 + treat, requires open, block and treat, diagnosis `foreign`, the existing read option). `placePuncture`: mid-sole (y 345–430, middle of the claw's span), a dot (r 4.5) or a ruled line (half-length 6–8, ends `a`/`b`), pocket r 8.5–10 (+2 for a line). Model: `hoof.buildPuncture` reuses the tract: the mark is `TRACT.ENTRY`, the pus round it `POCKET`, so the knife opens it from the mark outward; `FUNNEL` depths in tools.js (mark −2.5, pocket −1.5); drains at half the pocket open, as the white line does. Spray soaks opened tract cells; `m.tractTint` feeds `lesionTint`; `applyWrap` refuses `closed` until drained. Scoring: hunting = sole dug >1 mm below target within pocket + 10 px (the "crater" note); unopened note; block note uses `caseDef.noun`. FINDING.foreign (a sharp flinch on the mark only, via the existing lesion probe). main.js: the off-track hint says to start on the mark. render: "puncture ▼". Art: a crisp dark dot or thin ruled line with a glint, a faint shadow over the pocket; opened, a pale funnel shading down to grey pus on the mark (looseness read against the tract footprint, so there's no pale rim). Farms: Top Lane {routine, ulcer, whiteline, puncture .25 each}, Greystone {ulcer, whiteline, dd, puncture, routine .2 each}. Tests: idealTrim pares the funnel and flushes it; the bot's `funnel()` (straight down on the mark, then two rings of short pulls from the centre) reaches Textbook in every sweep. Art lab gets a "Ground, funnel pared" stage for puncture. `sw.js` v20. Follow-ups done the same day (sw v21): the closed mark is near-black with a thin pale rim, so it reads on the dark unground sole; the ulcer and white-line read cards say what a puncture looks like when "Foreign body" is picked.

### 8.4 Toe necrosis (call: vet; wood block)
- **Look:** the toe tip of one claw is black and crumbly, in the white line at the toe, past the trim line. There's no swelling. The read card says she is walking back on her heels and that the toe smells.
- **Probe:** very sore at the toe. The crumbly horn gives under the testers.
- **Job:** trim, then nip and knife the necrotic toe horn back until healthy horn shows, glue a **wood** block on the sound claw, then *Hospital pen, call the vet*.
- **Model:**
  - A `Z.NECRO` region at the toe of the lesion claw that overlaps `Z.TRI` and the toe line, carried by `LOOSE.NECRO`. The nippers and knife clear it. The `triCut` penalty skips necrotic cells, so clearing them isn't punished.
  - Healthy horn beyond the necrotic region behaves as usual: thin = pink, and through = blood.
  - Finish counts `LOOSE.NECRO` left behind.
- **Block types:** `placeBlock` gains `kind: 'rubber' | 'wood'`, with a two-state toggle on the block tool (one tap flips it, and the dock icon shows which). `requires.block` can be `'wood'`. The wrong kind costs Correctness −15 ("she rocks back on her heels: she needs a wood block for stability"). Everywhere else rubber is right and wood costs the same −15 the other way. That keeps the toggle a real choice, not decoration.
- **Comes back every time (D18):** history rows gain `recheck: true` for toe necrosis whatever the grade, and `returningCows` brings back `lame || recheck`. A Textbook trim brings her back at `lesionSize: 0.2`, and a poorer one at 1.
- **Cost:** large: a new zone, the triangle exception, block kinds, art and the recheck rule.
- **Status (2026-10-13): done.** Case G "Black Toe" (`toenecrosis`): `LOOSE.NECRO` patch (r 14–18) at the axial toe tip, which the knife or nippers pare to target − 1.5 mm. The grinder grinds it as horn and it stays black. It is left out of contact, roughness and the triangle. There is a `necro` step (pared, plus a wood block on the sound claw). The wrong block kind costs −15 correctness either way. Tapping the block tool while it's selected flips rubber/wood (`hoof.blockKind`), gated on reputation ≥ Ridgeway's 640 (free play always). Eighth farm Ridgeway (rep 640, 6 cows) brings it; pacing is 13 days at Textbook. Recheck rule done (history `recheck: true`; `returningCows` brings back lame || recheck; Textbook → lesionSize 0.2, else 1; its own backLine). Art: the black patch is near-black crumbly horn with cracks and pale flecks, read against its own footprint field; pared, it is a pit of clean pale horn. The wood block is a tan, grained, bevelled block with a knot, and the dock icon switches with the toggle. Label 'toe necrosis ▼', an artlab stage, and the visit card says a toe recheck is due rather than 'lame after last time'. sw v24.

### 8.5 Double sole (proposed in place of the axial fissure, D20)
- **What it is (Shearer):** horn growth was interrupted (usually laminitis), so a loose false sole lies over a new sole underneath. Cows are usually not lame, and it's often found at routine trimming. The treatment is to pare the overlying layer away. A block only goes on if she's lame.
- **Look:** a large patch of one claw's sole with a visible edge, a lifted lip where the old layer has separated. The probe shows it hollow but not sore.
- **Job:** pare the loose layer off with the knife back to the new sole, which is thinner and paler underneath. Don't grind it, because the grinder can't tell the layers apart and takes the new sole too. **No block.** Blocking is the mistake, as on a DD foot.
- **Why it fits:** it plays entirely in the sole view on existing systems (a big `LOOSE` region, as on the heel), and it's a second restraint lesson after routine: a dramatic-looking foot that needs paring, not a block. A decoy-heavy variant suits later farms.
- **Cost:** small to medium.

**Status (2026-10-13): done, tests 118/118.** `CONDITIONS.doublesole` (Case H "Two Soles", weight 0.1, steps clean, diagnose, `pareSole`, steps 1–3, finish, step5; requires open, no block, no treat). `placeDouble`: axial 70–80 px, y 320–420, r 26–32, on the big claw 70% of the time. Model: `LOOSE.DOUBLE = 5`; build strips the dish and sets the target to T over the patch. In metrics a loose DOUBLE cell is skipped, and once cleared it is plain sole. Contact skips loose DOUBLE. The probe on it reads hollow and not sore (main: a tock, no spring or jolt). Cleared, it reads 'new sole underneath'. Tools: the knife's `pareDouble` clears it to ≤ T+0.2. The grinder on loose DOUBLE sets grinderLesion and takes it to ≤ T−1.2, rough. Scoring: `lesionOpened` = looseRemain[5] ≤ 0.1; notes for false sole left on, grinder on it and a needless block; finish counts DOUBLE. Relief for a no-block lesion is now !block && (treated or no treat needed) && (opened or no opening needed). `trimUnderway()`: paring the false sole doesn't set `firstCutClaw`. Render: 'false sole ▼' ringed at 1.25 r. Art: a chalky, flaky layer whose toe-side edge lifts into a pale lip over a shadowed gap; pared, a paler, smoother new sole. Art review (1d95373, sw v26): the layer was a flat pale disc like a sticker, so it now takes the sole's own tone and stains, greyed toward chalk, with terraced flakes lit from the lamp side and a thin lip only where it lifts. Art lab has three stages. Brackenford mix is now {ulcer .35, whiteline .25, doublesole .2, routine .2} (8.6 slice). Tests: the bot's `pareSole()`, a playthrough branch and two unit tests. sw v25.

### 8.6 Farms
- Puncture joins Top Lane and Greystone (tracks and stones). Foot rot joins Marsh End and Coldharbour (wet yards). Double sole joins Brackenford and later. Each mix is re-balanced so routine stays at least 0.2.
- **A new eighth farm** after Coldharbour, at about rep 640, invented per D13: a big herd (6) with a little of everything, and the first place toe necrosis and the wood block appear. Pacing test: re-run the "all-Textbook opens the road in N days" check, and the target is still under about 14 days.
- Free-play `dealCase` weights get the new conditions at low weights, so `?cond=` and "Trim another" can deal them.

**Status (2026-10-13): done.** Each condition brought its own farm slice (8.2–8.5): puncture at Top Lane and Greystone, foot rot at Marsh End and Coldharbour, double sole at Brackenford, and Ridgeway (Sam Okafor, freestall, 6 cows, rep 640) as the eighth farm with toe necrosis and the wood block. 8.6 itself adds double sole to Coldharbour: {ulcer .2, dd .15, whiteline .15, footrot .15, doublesole .15, routine .2}, so its 6-cow deck is one of each. Every farm's deck holds every condition in its mix and routine stays ≥ 0.2. Free-play weights were set with each condition. The pacing test still passes.

### Decisions for Ben

| # | Decision | Default |
|---|---|---|
| D14 | Conditions and order | **Taken (2026-10-13):** Vet/leave + foot rot, puncture, toe necrosis, then the fourth if the view works. |
| D15 | Where new conditions appear | **Taken:** foot rot and puncture in the later farms' mixes, and a new farm after Coldharbour for toe necrosis and the wood block. |
| D16 | Block types | **Taken:** wood arrives with toe necrosis, via a toggle. Rubber is right everywhere else. |
| D17 | Vet/leave button from the start | **Taken:** yes, from the first farm. |
| D18 | Toe necrosis always returns | **Taken:** yes, smaller if trimmed well. |
| D19 | Toe necrosis: trim, wood block **and** refer to the vet (per AHDB), or trim and block only (closer to how Nate describes his visits)? | **Taken (2026-10-13):** Trim, wood block and refer. It's what the guide says and it gives the vet button a second use. |
| D20 | Drop the axial fissure (no wall view) and build double sole in its place? | **Taken (2026-10-13):** Yes |
| D21 | Wall hardness fix (fact check 1): fold it into WP8 before 8.3, or leave it in WP5? | **Taken (2026-10-13):** Fold it in before 8.3. Puncture and toe necrosis both cut near the wall, so tune once. |

### Next batches (not scoped yet)
- **Judgment cases:** scoped as WP9.
- **Farm traits and later conditions:** scoped as WP12 and outlined as WP13 (2026-10-14).
- **Farm traits:** footbath none/poor/good driving the DD share; a sand farm where the knife dulls; a known kicker on the visit card; cows remember (temperament shifts on return).
- **Later conditions:** the axial fissure (needs a wall view); deep digital sepsis (a second vet case, with swelling on one claw only, which plays off foot rot's swelling on both); a thin-soled cow.

## WP9: judgment cases (medium; scoped 2026-10-13, builds on WP8.1)

Cases where the right answer is a call, not a cut. They depend on 8.1's end-of-cow sheet; J2 also uses 8.4's block kinds when they exist (rubber-only until then). Ben took D22–D26 defaults on 2026-10-13. Build order: J1 → J2 → J3, each with its bot path and a seed sweep.

**Change to 8.1 first (D22):** split the sheet into three calls: *Hospital pen* (soft bedding near the parlour, no vet), *Call the vet*, and *Leave her till dry-off*. Foot rot and toe necrosis are `call: 'vet'`; both-claws-bad is `call: 'pen'`. Picking the pen when she needs the vet (or the reverse) is a near miss: Correctness −15, not the full wrong-call penalty.

**D22 status (2026-10-13): already done in 8.1.** `CALLS` has pen, vet and leave. Pen-vs-vet is Correctness −15, and released when a referral was needed is −25 (vet) or −15 (pen).

### J1 Close to calving (call: leave; small)
- **Source:** Nate 1:29:04: don't trim a cow close to calving; trim her at dry-off.
- **Cue:** the farmer's line on the visit card names her ("#418's due in ten days"), and her intro repeats it. No special art (D24). The foot itself is an ordinary routine foot with decoys, so the trap is to trim it because it's there.
- **Right play:** read the intro, maybe clean and look, then *Leave her till dry-off*. Full points (Ben's call). Any trim stroke past cleaning costs Restraint −10 per claw worked (capped −30); a full trim and release is Needs work with the note "She was due any day: she'd have waited for dry-off."
- **Return:** she comes back on the next visit as an ordinary (dry) cow, intro "fresh now; time for that trim".
- **Model:** a `mods.calving: true` flag any condition can carry (only dealt on routine feet at first), `call` read from the case, not only the condition. `farmMods` deals it at a low per-farm share (0 on Willow Bank, about 1 cow in 8 after Brackenford).

**Status (2026-10-13): done.** `farm.calving` (0.5 from Brackenford on, none at Willow Bank or Hollins) is the chance a routine card is a cow close to calving. `farmMods` draws it last, so no earlier draw moves. `makeCase` honours `mods.calving` on routine feet only: `closeToCalving` sets `calving` (days, 4–12 from the seed), `call: 'leave'` and the intro line. Her step list stays the routine one, because the step panel is always visible and a 'refer' step would give the call away. The visit card names her ("… mentions #N’s due to calve in D days"). The leave scoring was already in 8.1 (full marks; Restraint −10 a stroke, cap −30; a trim-and-release is capped below Needs work). History rows get `calving: true`. On the next visit she always comes back as a routine trim, with `back.outcome` 'calved' and the line "Fresh now: she’s calved since visit N". The visit card counts calved cows apart from healed ones, and save.js accepts 'calved'. Tests: two route tests (deal, cue and return); the return-visit test allows for calved cows. Pacing is unchanged (13 days at Textbook). sw v28.

### J2 Recheck still wearing last visit's block (call: null; medium)
- **Source:** Nate 38:42: taking the old block off is often the main reason for a recheck; Shearer: blocks still on after 3–6 weeks come off and are replaced only if she still needs relief.
- **Setup:** a returning cow whose last visit glued a block arrives with it still on (`hoof.block` and its kind preset, worn art). A new first step, **"Take the old block off"**: tap the block with the knife (pry it off; two or three taps, a cracking sound). Blades can't reach the claw under it until then (the existing `blocked()` rule).
- **Then the read:** healed (she walked off sound last time) = a routine trim, no new block; still sore (a recheck) = treat as her condition says, block again. Re-blocking a healed claw is the existing needless-block penalty; leaving the old block on is Correctness −20 ("an old block left on overloads her: it should have come off by now").
- **Model:** history rows already know the condition; add `blocked: kind | null` to the row; `returnCase` sets `hoof.oldBlock`. Steps gain `unblock` at the front when it's set.

**Status (2026-10-13): done.** `scoreCase` returns `block` ({ claw, kind } or null) and `recordCow` writes `blocked` and `blockClaw` to the history row (save.js validates both; a blood fail records its block too). `returnCase` brings a recheck back always wearing it, and a healed or calved cow half the time (seeded per visit); `makeCase` takes `mods.oldBlock`, sets `cd.oldBlock` and puts `unblock` first in her steps. `Hoof` presets `block`/`blockKind` and `hoof.oldBlock` { claw, kind, taps, on }, and the sole under it starts clean. A knife tap on it (a press that moves under 12 px) calls `applyPry`: `CFG.tools.knife.pryTaps` 3 taps, a creak each, a crack when it comes off. The block tool refuses while it's on. Left on: Correctness −20, no needless-block note, relief capped at 40. Art: `drawBlock(…, worn)` scuffs the toe end, packs muck into the tread and shows a glue gap; each tap tilts it a little. The backLine adds "She’s still wearing the block from visit N." Tests: pry and scoring (game), the return deal (route), the save, and the bot prying first on four conditions (playthrough). 125 tests, sw v29. **Not browser-checked:** the worn-block art and the tap feel.

### J3 Both claws bad (call: pen; medium–large)
- **Source:** Nate 10:37, 1:15:39: a lesion on both claws means no block (it loads the other sore claw). Wrap, and send her to a soft hospital pen.
- **Setup:** two lesions, one per claw: ulcer + ulcer, or ulcer + white line (D23). Both test sore.
- **Right play:** trim, open both, flush both, pad and wrap both claws, no block, then *Hospital pen*.
- **Scoring:** any block = Correctness −30 and gait lame ("the block put her whole weight on the other sore claw"); one lesion left unopened = the usual −20; releasing her instead of the pen = Correctness −15.
- **Model (the cost):** `caseDef.lesion` becomes `lesions[]` with `lesion` kept as `lesions[0]` so existing code keeps working; probe, art, `lesionOpened`, `lesionTint` and the walk-off loop over the list; `wrapClaw` becomes a set. Sweep every existing condition to prove one-lesion cases come out byte-identical.

**Status (2026-10-13): built, not browser-checked.** Condition `twoclaw` (case I, "Two Sore Claws", weight 0.1, `call: 'pen'`) places an ulcer on the big claw and an ulcer or a white-line abscess on the other (D23). `caseDef.lesions` (only on a pair, each lesion with its own type; `lesion` is the first) feeds `lesionsOf()`. `Hoof` keeps cap state per claw (`capWorkAt`/`capOpenAt`, `capOpen` getter), wrap state per claw (`wrapAt`, `wrappedOn(c)`, `wrapped`), and reads the probe by the claw tested; `metrics` adds `looseRemainAt`/`lesionTintAt`, with `lesionTint` the worse claw. Steps: trim, `openBoth` (both open, no block), step 5, `treatBoth` (each claw flushed, padded and wrapped), `refer`. Scoring: both lesions must be tested; any block is Correctness −30, a lame gait and the blocked-sore mobility score even with the pen; one left shut is −20 naming its claw; released instead of the pen is −15 (from 8.1). Ridgeway deals it in place of puncture (puncture stays at Top Lane and Greystone). UI: probe weep, cap pop and the release beat per lesion; per-claw markers, pad and wrap; walk-off rings each lesion; hoofart draws each claw's ulcer and the track by claw. **Sweep: every older condition × 40 seeds (plain and dealt) is byte-identical in case, hoof arrays and metrics, and all 462 bot score lines match.** 127 tests, sw v30.

### Decisions for Ben

| # | Decision | Default |
|---|---|---|
| D22 | Split 8.1's sheet into Hospital pen / Call the vet / Leave her? | **Taken (2026-10-13):** Yes, three calls; pen-vs-vet mix-ups are a near miss |
| D23 | Both-claws pairs | **Taken (2026-10-13):** Ulcer + ulcer and ulcer + white line; no DD pairs |
| D24 | How loud is the calving cue? | **Taken (2026-10-13):** Visit card + intro text only, no art |
| D25 | Old block removal | **Taken (2026-10-13):** Tap the block with the knife, 2–3 taps |
| D26 | Add a "lame, but nothing in the foot" cow (Shearer's non-foot lameness: refer to the vet)? | **Taken (2026-10-13):** Not now; later, after J3, since it can feel like a trick |

**D26 status (2026-10-13): built.** Case J "Higher Up" (`nonfoot`, weight 0.1): no lesion, routine decoys, `call: 'vet'`, requires `trim: false` (15 a stroke off Restraint, at most 30, as for foot rot; released, she walks off lame with the call note). Ben's clues: the intro gives a swollen hock (knee on a front foot) or a dragged toe, and a farmer's hint (went down on concrete, or ridden by a bulling heifer), both picked from the ear tag. The testers read the dead toe as "worn square and scuffed", one read-card finding per claw (not in `findings`, so decoy art and scoring ignore it). The art paints a matte, dusty band at each toe tip. Steps are clean, diagnose and `decide` ("Trim her, or send her?"), so the panel doesn't name the call. Read options: nonfoot (right), sound, ulcer and bruise. Greystone's mix swaps white line for nonfoot, and a recheck has its own back line. sw v32, 130 tests. Not yet played in the game; the toe tip is ground off flat with a pale, dusty band above the cut.

## WP10: hoof art realism, follow-ups (small–medium; scoped 2026-10-13 at `cbc2c14`)

Continues the realism pass (`348b521`, `e6baf32`, `cbc2c14`: wet manure, waxy sole, crusted wall, ulcer-ring fix, heel flake, stained horn). Work in `src/hoofart.js`; judge in the art lab (`dev/artlab.html?stage=N&zoom=1.3`, plus `&crop=x,y,w,h` for close-ups) against `reference/hoof-video-capture/frames`.

### 10.1 Measure the hoof build time (do first)
- `HoofArt.build` runs once per hoof. The lab took about 34 s for four stages at S=3, and no "before" figure exists.
- Time `build` + the first `compose` in the game at S=2 and S=3, on desktop and on a phone, and compare against `c3598f3` (before the pass).
- If a case start hitches noticeably: precompute the noise fields once (they don't depend on the hoof), cache them across cases, or build them over a few frames.

**10.1 status (2026-10-13): measured; the cost is in play, not at case start.** `dev/bench.html` times it (`?src=../reference/bench-old/src` runs an export of `c3598f3`, git-ignored). Desktop, Chrome, median ms, now vs `c3598f3`:

| | S=2 | S=3 |
|---|---|---|
| Next cow, same side | 343–592 vs 87–254 | 688–756 vs 183–209 |
| Next cow, other side (outline rebuild) | 708–1217 vs ~100 | 1531–2078 vs ~190 |
| Full compose | 299–346 vs 100–134 | 592–702 vs 195–224 |
| One stroke's patch (64 logical px) | 10–11 vs 3.1–3.4 | 20–23 vs 7–8 (p90 35 vs 11) |

The case start is already sliced behind the loading bar (24 ms a frame; noise fields cached per session), so it's a longer wait, not a freeze. The stroke patch is the problem: compose runs every frame while cutting, and at S=3 on a phone (3–5× slower than this desktop) it could be 60–100 ms a frame. First speedup pass (separable relief spline, per-column spline weights, decoys and cleft culled by box, `hypot`→`sqrt`): about 1.2–1.5× faster, pixels within ±1 of before (scratch harness composed 10 conditions × 2 seeds × dirty/brushed/cut). Second pass (2026-10-13): the bilinear `sm()` hand-inlined with per-pixel locals (it read closure-captured `let`s, about 1.4× alone), the growth-line term precomputed per pixel at build (`this.growth`), the shadow-warming `Math.pow`s replaced by tables (`SH_R`/`SH_B`), and the decoy loop indexed. The scratch harness runs about 1.6× faster than `c865a72`, pixels within ±1. Bench, same throttled browser pane for both runs, S=3: stroke patch 65 → 47 ms dirty, 52 → 37 ms clean; full compose 1589 → 1146 ms. An unthrottled run of the new code gave 14 ms (p90 23) at S=3 and 5 ms at S=2. Left on the table: `smoothstep` isn't inlined in the oversized compose (~3%); splitting compose by class would let V8 inline it. **Next:** Ben runs `dev/bench.html` on his phone over the LAN (`npm start` prints the URL); if S=3 strokes are still over ~30 ms there, split compose.

### 10.2 Ground-sole crosshatch
- At 1.3 zoom, the ground sole still shows a faint woven texture. It's the surface on screen for most of a trim, so it matters most.
- Try less per-pixel grain, and longer, smoother grinder arcs that don't restart at each stamp (the seams between passes show).

**10.2 status (2026-10-13): done, pending Ben's eye in play.** The weave had three sources. (1) Each grinder stamp re-centred its arcs, so they jumped every stamp: `mark()` now keeps one arc centre per pass (`this.pass`, reset on a jump, a turn of more than ~40°, or the arcs swinging too far round the centre). (2) The arc fade read `nStreak`, which is stretched lengthwise, so it cut sideways passes into columns: it now reads the broad `nStain`. (3) The relief itself had a cell-scale egg-crate and pass rows: `reliefGrid()` now applies a 1-2-1 smoothing (rows, then columns) per claw, skipping the ulcer core so the cavity rim stays crisp. Visual only; the thickness the game scores is unchanged. `reference/perf/shot.mjs` (git-ignored) renders a lab stage to a full-res PNG for close comparison (`node reference/perf/shot.mjs src ground 70,330,150,150 out.png`).

### 10.3 Stain islands
- Low spots the grinder skips stay as dark, ragged, stained islands (ref 0:35, 1:25 left claw). They also tell the player where the sole is low.
- `nIsle` already raises the stain depth; make the islands bigger and darker, with the crisp broken edge the stain already has.

**10.3 status (2026-10-13): done, pending Ben's eye in play.** The old islands came from the static `nIsle` noise (the same spots on every cow) and soaked only ~1.5 mm deep, while one grinder pass takes off 2–4 mm, so none survived. Now `stainIslands()` places 2–4 lobed patches per claw, per cow (from the case seed), biased toward the axial half where the sole dishes, kept off the wall, dead toe and any lesion's horn. The stain there soaks 3.4–5.2 mm deep at the core, with `nIsle` breaking the edge up, so a level trim leaves a few dark, ragged islands and grinding on one clears it. Once horn round it is cut, an island darkens to packed wet manure (gated, so a brushed claw doesn't give the islands away). The small noise pockets stay at 0.6 mm. Visual only: the sim doesn't know the spots are low. No measurable cost on a stroke patch.

**10.3 follow-up (2026-10-15): the islands are real low spots.** Ben, on the phone: the islands never trimmed off, and chasing them with the grinder went on until blood. He chose to make them low in the sim, not to make the stain shallower. The placement moved to `Hoof.buildIslands()` (same seed and shapes, pushed just past the dish band and faded at the wall and the dish feather, kept off the toe triangle, lesions and marks). The sole there starts 1.6–2.6 mm under target at the core (`CFG.isle`), never lower than 4.4 mm, and `hoof.low` / `hoof.isle` carry how low and how deep the stain soaked (at most 1 mm, never under 3.8 mm of sole). The grinder's disc rides on the highest plain sole under its middle, so a cell well under it is cut at 8% speed (and adds little to the danger cue): a level pass leaves ~87% of the island stain. Held on an island, the stain clears at 3.8–4.4 mm, with the danger cue at 0.6–0.9 and nothing under the disc thin (120 cows). Islands sit out of `wbMean` (still judged for over-trim from where they start); the testers call them "a low spot, stained deep … leave it"; the art reads the sim's field and draws them as hollows in the relief. Tests in game.test.js; Ben to judge in play.

### 10.4 Dirty hoof: less even (agreed 2026-10-13)
- Manure is uniformly pebbled. Add large-scale coverage variation: thick clumps toward the heel and the gap, thinner smears, and a few patches where tan horn shows through (ref 0:15).

**10.4 status (2026-10-13): done, pending Ben's eye in play.** `mudBody()` builds a per-cow, cell-level cake thickness (0..1) from a large-scale noise offset by the case seed, pushed up toward the heel and the interdigital gap. Thick areas get more relief and go nearer black; thin areas are a translucent smear with opaque grit specks, and the thinnest let the stained tan horn show through (they also brush clean a little sooner, since the coverage threshold rises there). Art only: the sim's `mud` and the brushing rules are unchanged.

### 10.5 Pocket size varies per cow (agreed 2026-10-13)
- The opened ulcer is smaller than the reference. Rather than one bigger size, vary `lesion.r` per cow (for example 10–16) through the light variations (WP2.3 / 7.3), so some pockets are big jobs and some small.
- Check the probe text, `lesionOpened`, the tint threshold and scoring still hold at both ends of the range; add the range to the variation sweep.

**10.5 status (2026-10-13): done, pending Ben's eye in play.** `lesion.r` already varied per cow (`band(rand, 10, 14, v.size)`), and the sweep already ran both ends. The ulcer band (single and the J3 pair) is now 10–16. `lesionOpened` and the tint check are fractions over the pocket's cells, so they scale; the playthrough at `lesionSize: 1` (r=16) still grades Textbook, spray included. At r=16 the opened pocket reaches the axial wall and is cut off square there; it reads acceptably, but watch it in play. A recheck can add 2 more (r=18).

Dropped: the straight knife-dish shadows. They come from the art lab's ruler-straight scripted strokes, not from play.

## WP11: playtester feedback (2026-10-13)

### 11.1 Guided run: don't swap tools under the finger (done 2026-10-13)
- A playtester: finishing a beat switched straight to the next tool, which started cutting in the wrong place at once. Now only the first beat hands over its tool; after that the next beat's tool button pulses (still on the green "suggested" dot, steady under reduced motion) and the player picks it. Checked in the preview 2026-10-14 through beats 1–3: the brush stays in hand after cleaning, the testers stay in hand after the read, and only the next beat's button runs the `nudge` pulse until it's picked. Not yet felt on a phone.

### 11.2 A guide book (to scope)
- A playtester asked for a manual: what each tool does, and the conditions you'll meet. To decide: open from the title and from a button in play (pause); one page per tool (from `TOOLS` name/hint plus a drawn icon from toolart) and per condition (title, look and feel from `FINDING`, the right call, with art-lab style crops). Unlock conditions as they're met on the route, or show them all? Kept short, no spoilers on reads the player hasn't made?

**11.2 scope (2026-10-14), agreed: Ben took the defaults for D27–D30. Ready to build.**

*What it is:* a "Field guide" overlay, a DOM panel over the canvas (like the visit card), not a new canvas scene. Two tabs: **Tools** and **Conditions**, plus a short **The trim** page (the five steps in plain words). One page per entry, with prev/next and a list. It closes back to exactly where the player was.

*Where it opens:* a "Guide" button on the title screen (`showTitle`, main.js) and a book button in play. Opening it in play pauses the cow: no fidget, flinch timer or score clock while it's up. Check what pauses today; if nothing does, it becomes a small `paused` flag the frame loop respects.

*Tool pages (9, all shown from the start):* the drawn icon from toolart.js at a large size, `TOOLS[id].name`, `hint`, and two or three lines on when to reach for it and what goes wrong (most of this is already in steps.js tips, e.g. not the grinder on the old sole). The key in brackets for desktop.

*Condition pages (10):* title (`CONDITIONS[id].title`, e.g. "Pressure Point"), the plain name (sole ulcer), **look** and **feel** from `FINDING`, what to do (from `diagnosedText`), the right call (`CALLS[...].label`) and one art crop. Crops are pre-rendered PNGs from the art lab (shot.mjs-style, about 240×240, one per condition, under `assets/guide/`), not drawn live, so opening the guide costs nothing and needs no hoof build. About 10 small images; add them to the service worker's cache list.

*Unlocks (default):* tools always open. A condition is locked ("Not met yet", silhouette, no text) until the player has finished a cow with it. Read straight from the saved route `history` (`h.condition`), so no save-format change. Case B / the guided run unlocks the ulcer. Nonfoot (D26) stays locked until met, since its page gives the trick away.

*Spoiler rule:* a condition's page shows only what the game itself says after the cow (look, feel, what to do, the call). Never the decoy kinds or how to tell it apart from a near miss that hasn't been met.

*Size:* medium. About 1 day: guide.js (data → pages), a CSS panel, two buttons, the pause flag, a crop script and 10 PNGs, tests (every tool and condition has a page; lock state follows history; a locked page leaks no text from `FINDING`). Then a preview check at 1280×900 and 375×667 (44 px buttons, 11 px text, scrolls inside the panel).

| # | Decision | Default |
|---|---|---|
| D27 | Conditions unlock as met, or all open? | **Taken (2026-10-14):** Unlock as met (tools always open); an "all" toggle after the route's first full round |
| D28 | Art per condition: pre-rendered PNG crops, or a live mini hoof? | **Taken (2026-10-14):** PNG crops (no build cost, no hitch in play) |
| D29 | Open it mid-cow? | **Taken (2026-10-14):** Yes, and it pauses her; but not during the walk-off or score card |
| D30 | Include "The trim" page (five steps)? | **Taken (2026-10-14):** Yes, short; it's what the guided run teaches, for players who skipped it |

**11.2 status (2026-10-14): built, pending Ben's eye in play.** `src/guide.js` holds the pages (`guideBook()`, pure) and the panel (`Guide`). It opens from "Field guide" on the title card and the "Book" chip in the top bar (or B). Opened mid-cow, `game.state` goes to `'guide'` and the frame loop returns early, so no fidget, flinch, weep or clock; closing restores `'play'`. It won't open over a card or the walk-off. Conditions unlock from `route.history`; "Show all" appears on the Conditions tab once every farm has been visited. The 10 crops in `assets/guide/` are the brushed-clean foot at the read, drawn by `dev/guide-crop.html` and screenshotted by headless Edge (`npm start`, then `node scripts/guide-crops.mjs`). A node-only render missed the canvas overlay. They're precached (sw v40) and shipped in www/. Tests: `tests/guide.test.js`. Checked in the preview at desktop and 375×667: the panel scrolls inside itself, text is 11 px or larger, and the top bar fits after tightening the chips under 400 px. Some crops are subtle (the ulcer is just a dark spot, as it is at the read). Re-pick a seed in `dev/guide-crop.js` if one reads poorly.

## WP12: farm traits (medium; scoped 2026-10-14 at `6f9985f`)

The "next batches" left after WP8/WP9 come in two groups: farm traits and later conditions. **Recommendation: farm traits first.** The road has ten conditions already, but its eight farms differ only in their mix and their ranges. These four traits make a farm feel like a place, they reuse systems that exist (temperament, the visit card, the mix deck, `cut()`), and three of the four need no new art. The later conditions are outlined as WP13 below.

All four come from Nate's AMA (`docs/NOTES-NATE-AMA.md`, lines 28–37). None changes the save format: each trait is either farm data or read from `route.history`. Build order: 12.1 → 12.2 → 12.3 → 12.4, shipping after each step with the bot sweep.

### 12.1 Cows remember (small)
- **Source:** Nate 1:26:54. Cows that have been through the crush before walk straight in, and a cow with a bad experience resists.
- **Today:** `returnCase` keeps her temperament unchanged.
- **Change:** her return temper shifts according to her last row. Lame or a blood fail: +0.15. Textbook or Clean and sound: −0.1. Anything else: unchanged. Clamp to 0–1, and apply the shift before the tier lean, as now. The intro adds a half-line when it moved ("She remembers last time: she won't walk in." / "She walks straight into the crush.").
- **Tests:** route test that a lame row returns livelier and a Textbook row calmer. The bot sweep is unchanged (it plays fresh cows).

**Status (2026-10-14): done.** `remembers(h)` in route.js reads her last row: 'hurt' if she went off lame (a blood fail counts as lame), 'easy' after Textbook or Clean. `returnCase` shifts her base temper by `CFG.temper.remember` (+0.15 or −0.1, clamped), and `back.mood` adds the half-line to her intro. The return-visit route test checks both directions. 135 tests, sw v41. A correctly left or referred cow scores Textbook, so she also comes back calmer. That fits: nothing hurt her.

### 12.2 A known kicker (small)
- **Source:** Nate 1:21:18. Some cows are known for it.
- **Change:** a `farm.kicker` chance (none at Willow Bank or Hollins; about 1 visit in 3 from Brackenford on, at most one cow a visit). That cow's temper is floored at `CFG.temper.kickFrom` (0.8), so she kicks, and the visit card names her ("Mind #233: she kicks."). Her intro repeats it. A returning kicker stays one (her seed decides).
- **No new mechanic:** the warning is the feature. It tells the player to work in short strokes on that cow. A "go gently" mechanic is not planned (see D33).
- **Tests:** deal (route), and the visit-card line.

**Status (2026-10-14): done.** `farm.kicker` is 0.33 from Brackenford on. `visitCases` draws from the visit's own seed (stream 888) whether there is a kicker, and which new cow it is, and skips it when a known kicker is already coming back. `makeCase` takes `mods.kicker`: it floors her temper at `kickFrom`, sets `cd.kicker`, and her traits line says so in place of the "flighty" one. History rows carry `kicker: true`, and `returnCase` keeps it. The visit card says “Mind #N: she kicks.” (checked in the preview at Marsh End, visit 1). A route test covers none before Brackenford, at most one a visit, about 1 visit in 3 over 60 Greystone visits, and her return.

### 12.3 Footbath quality drives DD (small)
- **Source:** Nate 1:33:41. No DD in 20 years on one farm, 30 of 50 cows on a farm with no footbath.
- **Change:** `farm.footbath: 'none' | 'poor' | 'good'`, shown on the visit card and the road map. It scales the `dd` weight in the mix (none ×1.5, poor ×1, good ×0.25; the deck renormalises). Proposed: Marsh End none, Coldharbour none, Greystone poor, Ridgeway good; the others good. These farms' DD shares come out close to today's, so pacing barely moves. Check the herd decks in the route tests.
- **Copy:** the farm intro or the visit card says it in Nate's terms ("the footbath's been dry since spring").

**Status (2026-10-14): done, with one change to D34.** `FOOTBATH` and `farmMix()` in route.js scale `dd` (none ×1.5, poor ×1, good ×0.25) for both the deck and `farmMods`. The visit card and the road map name the footbath. **Ridgeway is poor, not good:** with good, its deck lost its only DD cow (rounding to whole cows), which broke the deck test and the "close to today" aim. A herd bought in last month fits a footbath that isn't running yet. Because decks round, the shares move no deck except that one: today the footbath is mostly a visible cause. It would bite if the footbath changed between visits (an idea, not planned). 137 tests, sw v42.

### 12.4 Sand dulls the knife (medium)
- **Source:** Nate 50:07, 51:00. He sharpens every day and carries 7 knives; sand and gravel dull them fast.
- **Change:** a `farm.sand: true` farm (proposed: Greystone becomes sand-bedded freestalls, so no new farm is needed). On a sand farm the knife's cut rate falls with the area it has pared (`knifeWear` 0 → 1, the rate down to about 55%, and resistance up), and the knife's edge is drawn duller in the hand. **Fresh knife:** tap the knife button while the knife is in hand (or press 5 again). This swaps in a sharp one with a short sound and resets the wear. Swapping is free, so the skill is noticing.
- **Not on other farms:** all wear stays at 0 there, so every other condition plays byte-identically (prove it with the sweep).
- **Bot:** swaps whenever wear passes 0.6. Tests: wear rises and the swap resets it (game), and a sweep on the sand farm.
- **Art:** a duller, scuffed blade in `toolart.js`, plus a small wear pip on the knife button.

**Status (2026-10-14): done.** Greystone's housing is `'sand'` ("Sand-bedded freestalls"), and `onSand(farm)` in route.js reads it, so there is no separate flag. `applyStroke` takes the blade in hand, `{ sand, wear }`. On sand, wear rises by `CFG.tools.knife.wearPer` (0.0004, halved at Ben's call) per mm of horn the knife cuts, and the cut rate falls linearly to `dull` (0.55) at full wear. A careful trim pares about 1700, so a sharp knife reaches 0.6 about every second cow. Without sand the rate is `cfg.rate` exactly. The knife lasts the visit (it's sharpened each morning). Tapping the knife button with the knife in hand, or pressing 5 again, swaps in a sharp one: "Fresh knife." and a short ring of steel. Off sand that tap does nothing. The visit card says so in a line. The button pip goes green, amber (0.3), then red (0.6). The blade in hand takes a grey-brown film, scratches and a faded edge. Tests: wear, dulling and its cap (game); the bot carries one knife through the sweep, swaps past 0.6 and reaches Textbook on every condition on sand; a non-sand knife leaves the trim byte-identical to no knife (playthrough). 140 tests, sw v44. **Wear rate halved (2026-10-14):** at 0.0008, six deep knife pulls on an untrimmed foot turned the pip red. Ben halved it.

**Ben took the defaults for D31–D36 (2026-10-14). Ready to build.**

### Decisions for Ben

| # | Decision | Default |
|---|---|---|
| D31 | Next batch: farm traits (WP12) before the later conditions (WP13)? | **Taken (2026-10-14):** Yes, farm traits first |
| D32 | Cows remember: lame or blood +0.15 temper, Textbook or Clean −0.1? | **Taken (2026-10-14):** Yes, with a half-line in her intro |
| D33 | Known kicker: a warning only, or also a "go gently" mechanic (short strokes calm her)? | **Taken (2026-10-14):** Warning only |
| D34 | Footbath: which farms get none/poor/good? | **Taken (2026-10-14):** Marsh End and Coldharbour none, Greystone poor, the rest good |
| D35 | Sand: make Greystone the sand farm, or add a new farm? | **Taken (2026-10-14):** Greystone (no new farm) |
| D36 | Fresh knife: tap the knife button again, free and unlimited? | **Taken (2026-10-14):** Yes |

## WP13: later conditions (medium; scoped 2026-10-14)

Two new conditions, each a restraint lesson the road doesn't teach yet. The thin-soled cow tests "stop at 7 mm" when she arrives already there. Deep digital sepsis is a second vet case, and swelling is the only way to tell it from foot rot. The axial fissure stays parked: it needs a wall view (see WP8).

Both follow the 7.2 recipe: a `CONDITIONS` entry with `place`/`copy`, its `FINDING`, HoofArt, a bot path in `tests/player.js`, a `howto` hint, a 50-seed sweep, a playthrough on all four foot × claw layouts, a field-guide page with its crop (`dev/guide-crop.html`, `scripts/guide-crops.mjs`), and a farm slot. Neither changes the save format (`parseRound` checks `CONDITIONS`). **Build order (D37): 13.1 → 13.2 → 13.3**, shipping after each step.

### Fact checks (done 2026-10-14, by reading the code)
| Check | Finding | Consequence |
|---|---|---|
| Does the sole art already show a thin sole? | **Yes.** `SOLE_RAMP` in hoofart.js warms from ivory at 7 mm to pink by 3.5 mm. | The thin cow needs no new sole art: start her thin and the ramp draws it. |
| Does the scorer punish a sole that *arrives* under target? | **Yes, wrongly.** Restraint docks a claw whose `wbMean` ends below the target band, whatever she came in with. | 13.1 must score against her starting thickness, not the fixed target. |
| What does `levelled()` accept? | `deadRemain < 0.12` and `wbMean ≤ T + tol`. | A thin cow passes steps 1–2 once the dead toe is off, with no grinding. That's the lesson, for free. |
| What does the probe say on a 5–6 mm sole? | "Firm, healthy horn. N mm." Only under `sole.thin` (3 mm) does it flex. | 13.1 adds the tell: a case flag makes the probe say the sole gives under the testers. |
| Is foot rot's swelling drawn? | **Only as colour.** The bulbs flush red-pink beside the cleft. The outline doesn't change, and the plan's puffed coronet and wider claw gap were never done (8.2). | 13.2 is the first shape change in hoofart.js. |
| Does any farm already set up a thin cow? | **Yes.** Ridgeway's intro: "Some were trimmed too hard before they came: look at the toes." | 13.1 goes to Ridgeway (D40). |

### 13.1 Thin-soled cow (call: null; small)
- **What it is:** she was over-trimmed before (or worn on concrete), so her sole is already **under** target: 5.5–6.5 mm across both claws (D38). Her toes are still long, because the last trimmer took sole, not toe. The trap is the habit: grind every sole to the gauge.
- **Look:** soles warmer and pinker than usual (the existing ramp), long toes, decoys as usual. The read card says "she's tender on hard ground and walks short".
- **Probe:** on live sole under target: "It gives under the testers: thin. N mm. Not much to take here." This is a case flag (`thinSole`), not a new `FINDING` mark, so the whole sole reads thin, not one spot.
- **Job:** nip the dead toe back to the line, then leave the sole alone: no grinder on it, no dish (D39). Rasp only the nipped edge.
- **Steps:** clean, diagnose, a new `toeOnly` step ("Nip the toes back, leave the sole", `deadRemain < 0.12` on both claws), then release. Dropping steps 2–3 is the lesson, as dropping the trim was for foot rot.
- **Model:** `place` as routine. `makeCase` sets `excess` to −1.5 to −0.5 mm per claw (seeded), so the sole starts under T while the dead toe keeps its usual height above it (`T + excess + 2.5` puts it near the line, so the toe-length cue holds; check this in the art lab). `thinSole: true` on the case. Nothing else changes in the grid.
- **Scoring:** for a `thinSole` case, Restraint is measured against the cell's **starting** thickness: horn taken from live sole costs (the over-trim note becomes "Her sole was already thin: every mm you took was one she needed"). The usual under-target note is skipped, since she arrived there. Balance is judged on level only, which she already is. Blood stays the usual fail, and comes sooner because there's less horn.
- **Read card:** "Thin soles: leave them" (right), "Sound: routine trim" ("She'd be routine if there were horn to take. Under the testers it gives: it's thin, so nip the toes and stop"), "Sole bruise", "Sole ulcer".
- **Farm:** Ridgeway, in place of one routine cow: {toenecrosis .2, ulcer .2, dd .15, whiteline .15, twoclaw .1, thinsole .1, routine .1}. Routine drops under 0.2 here, so **D40** asks whether that's fine (the thin cow is a routine foot in all but the trap).
- **Cost:** small. No new art and no new grid zone. The only new rule is restraint measured from her starting thickness.

**Status (2026-10-14): done, 144 tests, sw v45. Changed from D40:** Ridgeway's 6-cow deck can't hold a seventh condition, and 7 cows would break D12 (3–6). So the thin cow takes **white line's** slot instead: {toenecrosis .2, ulcer .2, dd .15, twoclaw .1, thinsole .15, routine .2}. Routine stays at 0.2, and white line still turns up in Ridgeway's both-claws pairs. Build: `CONDITIONS.thinsole` (Case K "Thin Soles", `thinSole: true`, steps clean, diagnose, `toeOnly`, step5). `makeCase` sets excess between −1.7 and −0.3 mm, with the big claw ≤ 0.2 mm taller, ignoring growth. hoof.js drops the toe ramp for her. The probe on live sole under T − 0.3 reads 'thinsole' (one finding per claw, like the scuff). In `metrics`, `overWB`, `triCut` and the new `wbTakenMean` are measured from min(T, init), so other cows come out byte-identical. Scoring for a thin cow: height comes from horn taken (0.3–1.5 mm). The dish, first-claw and rough checks are skipped. Over 0.4 mm taken costs 15 per claw ("already thin"). `decoysDug` measures from her start. A block gets its own note. Back lines cover both her recheck and her healed return. There's a guide page, a crop and a bot path. **Weak spot:** the crop looks almost like routine's, because `SOLE_RAMP` only turns pink under about 4.5 mm. At 5.5–6.5 mm the probe carries the tell, not the colour. Ben to judge in play whether the sole needs a pinker tint.

### 13.2 Swelling art (shared; medium)
- **Why first of the two vet pieces:** deep sepsis can only be told from foot rot by where the swelling sits, so the swelling has to be drawn before either reads right.
- **Art, sole view only:** on a swollen claw, the heel bulb outline bulges outward 4–6 px and the coronet band shows as a tight, shiny, red-pink rim above the bulb. Foot rot swells both claws and pushes them apart 3–4 px at the cleft. The grid doesn't move: it's art only, drawn over the existing outline, as 8.2 planned. `caseDef.swollen: [claws]` drives it.
- **Foot rot gets it too:** both claws swollen, and the existing cleft flush stays.
- **Check:** at phone size (375 × 667), swelling on one claw must read as one-sided before the probe. This is the art check for WP13. If it doesn't read, the intro says which claw is "up" (D41).
- **Cost:** medium. All hoofart.js, plus an artlab stage per condition. Foot rot's 50-seed sweep must stay byte-identical in its grid and scores, since only pixels change.

**Status (2026-10-14): done, 144 tests, sw v46.** `caseDef.swollen` comes from the condition (foot rot: both claws) or from its `place()`, for 13.3's dealt claw. hoofart.js draws it as vector layers either side of the horn canvas, so the grid, metrics and scores are untouched. Behind the horn, the heel outline is offset outward by 5.5 px above y 225, blending back by y 295, and filled red-pink with a dark outer edge. Over the horn there's a soft flush a few px in from the rim, a crease, and a lamp shine along the crest. Where both claws swell, a soft shadow rolls each axial heel edge away into the cleft, which reads as the claws pushed apart. **Phone check (375 × 667):** one claw swollen reads plainly as one-sided, even before the foot is brushed, so the D41 intro fallback isn't needed. The foot rot guide crop is redone. The swelling shows through the muck from the start, since the bulb's skin sits above it. Ben to judge in play whether that gives foot rot away too early.

### 13.3 Deep digital sepsis (call: vet; medium)
- **What it is:** an ulcer or white-line abscess left too long, so the infection has gone deep into the joint or tendon sheath of one claw. It's beyond the trimmer: the vet resects the joint or takes the claw off. Nate refers anything needing surgery or antibiotics (1:26:12), and Shearer's note (8.2 above) is the tell: swelling confined to one claw points to the claw, not foot rot.
- **Look:** one claw swollen (13.2) above an old, open ulcer at the usual site, with a dark, weeping hole and proud red tissue in it. The other claw is normal. The cleft skin is whole, which separates it from foot rot. She is very lame, and the read card says "she's been lame a fortnight and she's off her feed".
- **Probe:** extremely sore on the swollen claw's bulb and coronet. The open hole weeps. The sound claw is firm.
- **Job (D42):** trim the **sound** claw, block it (rubber), then *Call the vet*. No knife in the hole: opening it further is the vet's work. Wrap optional, not required.
- **Steps:** clean, diagnose, a new `trimSound` step (the sound claw's dead toe off and level), `blockSound` (rubber block on the sound claw), `refer`.
- **Model:** a `dds` lesion type on the ulcer site, built from `buildUlcer` with no cap (already open, `LOOSE` empty), so there is nothing for the knife to do there. Its `FINDING.dds` covers the bulb, coronet and hole of that claw (as `FOOTROT_HEEL` does for both). A blade in the hole costs Restraint −15 each (cap −30) with the note "That's the vet's job now: the infection's deep in the joint". Trimming the swollen claw is the same cost.
- **Scoring:** released without the call is the 8.1 Correctness −25 ("This one needs the vet"). Pen in place of the vet is −15. A block on the swollen claw is Correctness −30 and lame, as in J3. No block at all is Correctness −15 ("she needed the weight off that claw on the way to the vet").
- **Read card:** dds (right), footrot ("Foot rot swells both claws and splits the skin between them. Here one claw is up and the cleft is whole: it's gone deep in that claw"), ulcer ("There was an ulcer, but the swelling above it says it's gone deep. That's past opening: it's the vet's"), whiteline. Foot rot's card gains a dds option the other way.
- **Return:** none. The vet has her, as with foot rot.
- **Farm:** Marsh End, so the two vet cases sit side by side: {dd .2, footrot .2, dds .2, whiteline .2, routine .2}. Its footbath stays none, so DD still leans up (×1.5).
- **Cost:** medium. Most of it is the step list, the scoring branch and the hole art. The swelling comes from 13.2.

**Ben took the defaults for D37–D42 (2026-10-14). Ready to build.**

**Status (2026-10-14): done, 147 tests, sw v47.** `CONDITIONS.dds` is Case L "Gone Deep": the hole sits at the ulcer site (mostly the big claw), `place()` returns `swollen: [claw]`, and the loose heel horn has r 0, so there's no step 5. hoof.js marks the hole `Z.SEPSIS`: no blade takes horn there, and metrics and the contact map skip it. The testers read the whole bulb and the sole round the hole as the dds finding. tools.js flags `holeCut` for a blade in the hole, and `sepsisCut` for horn taken with the tool centred on the swollen claw, so a disc grazing it from the sound claw's axial edge doesn't count. main.js counts each once per stroke. Steps: clean, diagnose, `trimSound`, `blockSound` (rubber), `refer`. Scoring: Balance is the sound claw's height, toe and heel (no level). No dish, first-claw or rasp checks. Finish is mud only. Restraint is −15 a stroke into the hole or on the swollen claw, capped at 30. No block costs −15 ("weight off that claw"). A block on the swollen claw costs the usual −30, and she goes to the vet lame. The wrap is refused with its own message. Foot rot's read card gains deep sepsis. Marsh End: {dd .2, footrot .2, dds .2, whiteline .2, routine .2}. A cow sent to the vet can come back healed, with her own back line. Art: a ragged dark hole with proud red granulation, pooled pus, a sheen and a soft dribble toward the toe, drawn over the horn and faded by the muck over it. Guide page and crop done. **Not checked in play:** the hole art at phone size, and whether 15 per stroke feels right when a player brushes the swollen claw's toe with the nippers.

### Decisions for Ben

| # | Decision | Default |
|---|---|---|
| D37 | Build order: thin sole, then swelling art, then deep sepsis? | **Taken (2026-10-14):** Yes. Thin sole is small and needs no art, so it ships first |
| D38 | Thin sole: under target (5.5–6.5 mm), or near target (~7 mm) as the outline said? | **Taken (2026-10-14):** Under target. At 7 mm she's just a routine cow that's already done, which teaches nothing. Under target makes "leave the sole" the right call and needs the start-relative scoring |
| D39 | Thin sole: no dish at all, or a light dish? | **Taken (2026-10-14):** No dish. Dishing to 4.5 mm on a 5.5 mm sole is the over-trim the case is about |
| D40 | Ridgeway takes the thin cow from its routine share, leaving routine at 0.1 | **Taken (2026-10-14):** Yes. The thin cow is a routine foot apart from the trap, and the farm's intro already sets it up |
| D41 | If one-claw swelling doesn't read at phone size, say which claw in the intro? | **Taken (2026-10-14):** Yes, as a fallback only |
| D42 | Deep sepsis: trim and block the sound claw and refer, or refer only (no trim, like foot rot)? | **Taken (2026-10-14):** Trim and block the sound claw, then refer. It's what a trimmer can do for her before the vet comes, and it makes the two vet cases play differently. Refer-only would make them the same play with a different read |

## WP14: restraint round the lesion, and when to stop (medium; scoped 2026-10-14 at `d41ffba`)

The Tier 1 ideas from Nate's lives (`docs/NOTES-NATE-LIVES.md`, "Top ideas"), plus the one Tier 2 fix. **Recommendation: build 14.1 first.** It is Nate's biggest change in 23 years, and the code has a real gap there: the horn round an opened ulcer is not scored at all today. 14.2 and 14.3 sharpen the read; 14.4 is a one-line deck fix that can ship any time.

None of these adds a condition, so the 7.2 recipe doesn't apply. Two add optional fields to a history row (`stripped`, `pits`); `cowOk` in save.js ignores unknown fields, so old saves load and new ones stay valid. Shipping after each step with the bot sweep, as before.

### Fact checks (done 2026-10-14, by reading the code)
| Check | Finding | Consequence |
|---|---|---|
| Is the horn round an opened ulcer scored? | **No.** `buildLesion` sets `keepOut` on every cell within `1.75r + 14·√0.6` px of the ulcer (the cap plus a knife's reach), and `metrics()` leaves `keepOut` cells out of `wbMean`, `overWB` and `triCut`. Only `thinCells` (under 3 mm, capped at −30 across the foot) and blood catch a stripped ring. | 14.1 needs a new ring metric. Nothing scores the ring today, so this adds a cost without double-counting one. |
| Is the same lesson scored for the white line and the puncture? | **Yes.** `soleDugBesideTrack` costs Restraint −25 for sole dug more than 1 mm under target beside the track or round the pocket ("hunted"). | 14.1 covers the ulcer only (single and J3 pair). Toe necrosis and double sole are pared back on purpose, and 13.3’s hole takes no blade at all, so they stay out. |
| What does a returning cow carry? | `recordCow` writes grade, lame, call, `blocked`/`blockClaw`. `returnCase` brings a lame cow back as a recheck (lesion r + 2, block still on, J2), and a cow that went off sound comes back healed and routine. | A stripped surround has to be recorded (`stripped: true`) and has to override "healed": the cow who walked off fine comes back lame. |
| What are the decoys today? | `DECOY_KINDS = ['stain', 'bruise']`. `placeDecoys` puts them mid-sole (`at(claw, 30–120)`, y 285–470, r 10–13). `DECOY_DEPTH` is stain 1 mm, bruise 2.5 mm, and hoofart fades each mark out by that much horn removed. The probe says "firm" for both. | **A stain already fades as you pare,** after 1 mm. What "fades as you pare" adds is the *place*: by the wall, where a white-line track would start. Pigment is a decoy with no depth limit. |
| What does digging a decoy cost? | `decoysDug`: Restraint −25 for each decoy whose cells sit more than 0.75 mm (mean) under target. It measures from target, or from her start on a thin cow. | All three new decoys score through `decoysDug` with no new branch. 14.2 adds notes per kind, not new costs. |
| When does a cut bleed? | `cut()` in tools.js: when a cell reaches 0.05 mm. The sole warms to pink below 7 mm (`SOLE_RAMP`). | A tempting bruise only needs thinner horn under it: start its cells near target, so the pink and the blood come early. |
| Does the bot touch decoys? | **No.** `tests/player.js` never aims at a decoy; it levels over them. | The new kinds can't break the sweep, as long as levelling over them stays inside the target band. A pigment mark left at sole height costs nothing. |
| Is there a walk-in? | **No.** walkoff.js draws the exit only, and from the side (she walks right). The intro is a text card (main.js `game.state = 'intro'`). | A toe-out shows from behind, not the side, so 14.3 is new art, not a reuse of the walk-off. |
| Which claw does the lesion land on? | Ulcer, white line and toe necrosis land on `v.big` (outer on a hind foot). The puncture picks a claw 50/50. | On a hind foot the toe-out shows on most ulcer, white-line and toe-necrosis cows, and on half the punctures. |
| What does Hollins deal? | `{routine .5, whiteline .3, ulcer .2}`, 4 cows, so the deck is 2 routine, 1 white line, 1 ulcer. route.test.js:62 asserts exactly that. Puncture first appears at Top Lane (rep 180). | 14.4 moves the puncture’s first appearance to farm 2 (rep 30). D51 asks whether that’s too early. |

### 14.1 Leave a ring round the ulcer (medium)
- **What it is:** free the ulcer (cut away its loose cap), but leave a ring of sound sole round it. If the block comes off, that ring is all she stands on. Nate stopped getting "she can't walk" calls once he did this (April 1:38:28), and he takes the rest at the recheck once the horn has firmed (March 37:39).
- **The ring:** cells on the lesion's claw that are live sole, not ulcer core and not cap (`looseInit !== LOOSE.ULCER`), from the cap's edge (1.75r) out to 1.75r + 8 px (two cells). `metrics()` gains `ringMean` (mean thickness) and `ringThin` (share under 4 mm), per lesion for the J3 pair.
- **Measure first:** run the bot over 50 ulcer seeds (and J3) and log `ringMean` and `ringThin` for its Textbook trims. The knife is 14 px across, so opening the cap does nick the ring. The threshold has to sit clear of what a careful trim leaves. Proposed default: stripped when `ringMean < 5 mm` or `ringThin > 0.3`. Set it from the measurement, as 10.1 did for the build time.
- **Scoring:** a stripped ring costs Restraint −20 (once per lesion, cap −30 on a pair). The note: "You stripped the horn round the ulcer. Free the loose horn, but leave a ring of sound sole: if her block comes off, that ring is all she stands on." It sits alongside the existing open check: an unopened cap still costs Correctness −20, so the lesson is "enough, not more".
- **Return (D44, D45):** `recordCow` writes `stripped: true` when the ring was stripped. A stripped cow who went off in a block always comes back a recheck, even if she walked off sound. The block is gone, not still on (an exception to J2), the lesion is r + 2 as for any recheck, and her mood is 'hurt'. Back line: "She threw her block ten days on and stood on the bare sole round the ulcer. Dev rang you back." (the name is `farm.farmer`).
- **The tidy at the recheck (D46):** not modelled. A cow done right comes back healed and routine, and the routine trim is the tidy.
- **Cost:** medium. A ring pass in `metrics()`, one scoring branch, one history field, one `returnCase` branch and its back line. No art.
- **Check:** game test: a cap opened with a wide circle of knife strokes round it is stripped, and the bot's trim isn't. Route test: a stripped, blocked, sound cow comes back a recheck with no block on. The sweep stays at Textbook on ulcer and J3.
- **Built 2026-10-14.** Measured: over 50 dealt ulcers and 50 J3 pairs (125 rings), the bot's Textbook trims leave the ring at a mean of 7.1 mm at the least (median 8.9), with no cell under 4 mm. A heavy hand circling just outside the cap takes it under 5 mm in about six full passes, without blood. So the default threshold stands (`CFG.ring`: mean < 5 mm or > 30% under 4 mm). The guided step and the ulcer's read text now say to leave the ring. Copy for the intro's how-to was left out, since it shows before the read and would give the ulcer away. Side finding: J3 dealt seeds 12 and 16 (with `dealMods`) fail the bot with a cut into the open ulcer. They fall outside the sweep's seeds 1–6 and are unrelated to the ring.

### 14.2 Decoys that teach when to stop (medium)
Three new kinds in `DECOY_KINDS`, each with a `FINDING`, a `DECOY_DEPTH` and its art in hoofart's decoy loop. The testers stay honest (they never call a decoy sore); the art does the tempting. Each kind gets its own dug note, so the player learns which mark fooled them.
- **Fade (`fade`):** a short dark line at the abaxial white line, drawn like a track's entry (like `buildTract`'s first 8 px), 1.5 mm deep. One or two passes and it's gone. Placed by a new branch in `placeDecoys` that hugs the wall, clear of any real track. Probe: "Firm. A dark nick at the wall, but she doesn't mind it." Dug note: "That mark by the wall was a passing flaw: it went with one pass. Chasing it only takes wall and leaves a hole." (NYE 1:14:13)
- **Pigment (`pigment`):** a dark grey-black stripe running in from the wall, with no hole and no halo. Its depth is unlimited: it never fades, however much is pared. Probe: "Firm, and dark all the way through." Dug note: "The colour didn't change as you pared: that's pigment, not a lesion. If it doesn't change, leave it." (March 47:30)
- **Tempting bruise (`haem`):** a pinkish, streaked patch shaded like a track that runs somewhere, 4 mm deep, so it outlasts the levelling. The horn under it starts at T + 0.3 mm instead of her usual excess, so levelling barely touches it, and any paring on it turns pink at once and bleeds soon after. Probe: "Tender, but no give. Bruised, not soft." Dug note: "That was a bruise with the corium right under it. Pink means stop." (Oct 1:00:30)
- **Who gets them (D47):** proposed, from Top Lane on (rep 180) the decoy pool is all five kinds. Willow Bank, Hollins and Brackenford keep stain and bruise, so new players learn the plain "firm means leave it" first. The pool rides on the farm (`farm.decoyKinds`), and `placeDecoys` keeps drawing from it in turns, as now.
- **Off-target pits (D48):** a dug decoy is recorded on the history row as `pits: [{ claw, x, y }]` (at most two). When she comes back, healed or recheck, each pit is a `pit` decoy at the same spot: a small, dark, round hole like an ulcer's cap with no spring. Probe: "Firm. An old pared hole, packed with black." Its intro says nothing, so the player meets their own mistake as a new decoy. Nothing changes on the day itself apart from the note. (NYE 1:13:11)
- **Cost:** medium. Most of it is art: four marks in hoofart's decoy loop, checked in the art lab at phone size. The scoring needs only notes. The tempting bruise also needs `makeCase` to lower the horn under it (a `stampExact` after the excess is laid).
- **Check:** game tests: a fade decoy is gone after 1.5 mm; a pigment one is still drawn at 5 mm; one knife stroke on a tempting bruise after levelling turns pink, and three bleed. Sweep: the bot stays Textbook with each kind forced (`decoyKinds: [kind]`), since it never digs them. Route test: a dug decoy comes back as a pit.
- **Built 2026-10-14.** As planned, with three deviations. (1) The tempting bruise: horn at T + 0.3 mm alone left the corium too far down for the third pull to bleed, so the bruise also carries a `lift` (`CFG.decoy.haemLift` 5.1 mm) that the knife, the grinder's danger and the probe read as lost thickness (`thick − lift`). Measured: the third knife pull bleeds. `metrics.thinCells` still reads plain thickness, since the sole under a bruise is thin by nature and shouldn't cost the player for being so. (2) Pigment is dark brown, not grey-black: grey read as a blue-grey dash against the stained horn. Its stripe runs 36 px in from the wall. (3) The fade sits 11 px in from the outline, on the white line; at 8 px it landed on the dark wall rim and didn't show. The haem, pit, fade and pigment are drawn over the stain and the manure film (under the clumps), so all four show on a brushed foot. Checked in the art lab at desktop and 375 px. Not changed: once ground, the bruise's lift zone shows as a round pink spot; making it elliptical to match the streaks would touch the grid, so it's left for Ben to judge in play.

### 14.3 Toe-out on the walk-in (medium)
- **What it is:** on a hind foot with a sore outer claw, she stands and walks a little duck-footed, toe turned out, to put her weight on the inner claw (NYE 1:38:35, autumn 22:11). It's a read before the testers.
- **Art (D49):** a small rear-view sketch of her hind legs on the intro card, a canvas about 160 × 120: hocks, cannons and both hind feet from behind. Every hind cow gets it, so its presence isn't a tell. A cow with a sore outer claw on that foot has it turned out about 15°, with the hock in a touch. A sound or inner-claw cow stands square. The left hind is on the viewer's left. New code in walkoff.js (it already draws legs and hooves) or a small `stance.js`.
- **Who toes out:** hind foot, lesion on the outer claw, and the claw sore: ulcer, white line, puncture, toe necrosis, and 13.3's deep sepsis when it's built. DD, foot rot, thin sole, both claws (J3) and the non-foot cow stand square. Front feet stand square too: the front-foot tell (crossed legs) is a later idea.
- **False positives (D50):** proposed none for now. A sound cow never toes out, so the cue can be learned before it's tested. Nate's metabolic toe-out that settles on its own is a later variation.
- **Feedback:** the result card adds one line when she toed out: "She was toeing out on the walk-in: that's the outer claw talking." The field guide pages for those conditions get the same line.
- **Cost:** medium. All new art and one rule (`stance(caseDef)`), with no scoring and no grid change.
- **Check:** phone check (375 × 667): the turned foot reads at a glance against a square one, in the art lab with both sides. Unit test for `stance()` over the conditions above. The sweep is untouched.
- **Built 2026-10-14.** `src/stance.js`: `stance(caseDef)` gives 'out', 'square' or null (front foot, no sketch), and `drawStance` paints the 160 × 120 rear view on the intro card under a neutral caption ("Walking in, from behind"). The turned foot is rotated 15° on the floor plane with the hock 4 px in; the eye is set high enough (floor foreshortened to 0.7) that the claws show past the heels, which is what makes the turn read at 1×. The result card shows the toe-out line; the guide pages for ulcer, white line, puncture, toe necrosis and deep sepsis gain a Walk-in row. Checked in `dev/stance.html` (both sides, 1× and 2×) and on the intro card at 375 × 667. Not checked by Ben in play.

### 14.4 Hollins deals the wrong mix (tiny)
- **What it is:** a pasture herd gets stones, punctures, sticks and foot rot, and *fewer* ulcers than housed cows (Nate's pasture videos, ×4). Hollins deals an ulcer.
- **Change:** Hollins's mix becomes `{routine .5, whiteline .3, puncture .2}`, so the deck is 2 routine, 1 white line, 1 puncture. Its intro already says the lane is all stones; add "and the odd nail in the gateway". Update route.test.js:62.
- **Effects:** the puncture's first appearance moves from Top Lane (rep 180) to Hollins (rep 30), on the Apprentice tier with guides on. Farm 2 then brings two lesions the player hasn't met (white line, puncture) instead of one. Old saves are fine: a Hollins ulcer cow still comes back as an ulcer, since `returnCase` reads her own record. A Hollins visit in progress when the update lands re-deals a different herd on reload (`visitHerd` deals from the mix); that's acceptable.
- **Not taken:** foot rot at Hollins. It's the right condition for pasture, but it needs the vet call, which the road introduces at Marsh End.
- **Built 2026-10-14.** Mix and intro as above; the deck test now expects the puncture. The WP14.1 route test (stripped ulcer in a block) moved to Brackenford, since Hollins no longer deals an ulcer. 158 tests green, sweep included. sw v51.
- **Cost:** tiny. One data line, one copy line, one test.
- **Check:** the deck test, and the full route tests.

### Build order (D43)
14.1 → 14.2 → 14.3, shipping after each with the sweep. 14.4 is independent and can ship first or ride along with any step. 14.1 goes first because it's the strongest lesson and needs no art. 14.2 next because it reuses the decoy pipe. 14.3 last, being all new art.

**Ben took the defaults for D43–D51 (2026-10-14). Ready to build, starting with 14.1's bot measurement.**

### Decisions for Ben

| # | Decision | Default |
|---|---|---|
| D43 | Build order: ring (14.1), decoys (14.2), toe-out (14.3), with the Hollins fix (14.4) any time? | Yes |
| D44 | A stripped ring costs Restraint −20 (cap −30 on a pair), with the threshold set from the bot measurement (starting at ring mean under 5 mm, or more than 30% under 4 mm)? | Yes |
| D45 | A stripped cow who went off in a block: always back as a recheck with the block thrown, or only half the time (a block doesn't always come off)? | Always. A teaching game needs the lesson to land every time, and "half the time" reads as luck |
| D46 | Model Nate's second stage (tidy the ring at the recheck), or let the healed cow's routine trim stand for it? | Let the routine trim stand for it. A real tidy needs a "firmed-up ring" state for little extra play |
| D47 | New decoy kinds from Top Lane on, with stain and bruise only at the first three farms? | Yes |
| D48 | Off-target pits: come back as a black-pit decoy on her next visit? | Yes. It shows the cost Nate names (a dug hole refills black) without a new on-the-day mechanic |
| D49 | Toe-out: a rear-view stance sketch on the intro card, or a line of intro copy? | The sketch. Copy would tell the player the answer; the point is to notice |
| D50 | Toe-out: never on a sound cow for now (no false positives)? | Yes. Add the metabolic toe-out as a later variation once the cue is learned |
| D51 | Hollins: swap its ulcer for a puncture, which brings the puncture in at rep 30 instead of 180? | Yes. The farm's intro already sets it up, and the guides are on at that tier. If two new lesions on farm 2 feel like too much, swap the white line for the puncture instead and keep the ulcer |

## WP15: the calendar, and cows that come back (medium; scoped 2026-10-14 at `4aa8a13`)

Tier 2 of Nate's "Top ideas" (`docs/NOTES-NATE-LIVES.md`), items 4, 6 and 7, plus the 14.1 side finding. **Recommendation: build 15.1 first.** A season knob is the idea Nate repeats most (×6), and the road has no sense of time today: every visit to a farm is the same week of the year. 15.2 and 15.3 are smaller and give returning cows and abscesses a second face. 15.4 is a bug hunt that can go any time.

### Fact checks (done 2026-10-14, by reading the code)

| Question | Answer | So |
|---|---|---|
| Does the road keep a date? | No. `route` holds `rep`, `visits` per farm, `best`, `history` and the day in progress. Nothing counts days across farms. | 15.1 needs a clock. The total of `route.visits` (days finished) is one already, and it's in the save. |
| Is a visit's herd fixed? | Yes. `visitCases(farm, visit, history, tier)` is seeded per farm and visit, and `visitHerd` rebuilds the day from the history before it, so a reload deals the same herd. | The season must be passed in the same way as the tier: worked out from the days finished *before* this one, so it can't change mid-day. |
| How does a mix become cows? | `farmMix` (footbath on DD) → `herdDeck` shares the mix out over the herd by largest remainder → `visitDeck` shuffles it. | A season is one more multiplier in `farmMix`. With 3–4 cows a herd, a ×1.5 only changes the deck when it crosses a remainder, so the effect is lumpy. That's fine, but the tests should measure it over many visits. |
| Which farms deal what the season would push? | White line: Hollins, Brackenford, Top Lane, Marsh End, Coldharbour. DD: Marsh End, Greystone, Coldharbour, Ridgeway. Foot rot: Marsh End and Coldharbour. | Summer has something to push at every farm past Hollins; DD and foot rot only bite from Marsh End on. |
| Who comes back healed today? | `returningCows`: every recheck, every calved cow, then `healedBack(farm)` = ⌊cows/3⌋ of the cows who went off well, picked at random. A healed cow always comes back as a routine trim (`returnCase`). | 15.2 is a weighting in the healed pick plus one new outcome. |
| What happens when an abscess drains? | `pareTract` fires `ev.drain` once at 50% of the pocket opened. `main.js:711` plays the release beat (sigh, pus) for every white line. | 15.3 adds a second stage with no pus and no beat. |
| Save format | `save.js:27` allows `back` to be null, 'recheck', 'healed' or 'calved'. | A new outcome means a save change (as J1 did for 'calved'). |

### 15.1 A season knob (medium)
- **What it is:** Nate, ×6: summer (above about 65–68 °F) means cows stand more to shed heat, so it's "abscess season" (white line) and DD's worst time, and lesions heal slower. Winter is tame: cows lie down and foot problems "pretty much disappear" except DD. Wet spring and autumn bring mud and foot rot. Summer runs about 10–15% problem cows to 1–2% in winter.
- **Change:** a season clock on the road. Each finished day moves it on: `seasonFor(daysDone)`, with **3 days a season** (D53), starting in spring. The season rides on the visit like the tier (`visitCases(farm, visit, history, tier, season)`), worked out from the days finished before this one. It multiplies the mix in `farmMix`:

  | Season | White line | DD | Foot rot | Routine | Mud |
  |---|---|---|---|---|---|
  | Spring | ×1 | ×1 | ×1.5 | ×1 | +0.1 |
  | Summer | ×1.75 | ×1.5 | ×1 | ×0.75 | ×1 |
  | Autumn | ×1 | ×1 | ×1.5 | ×1 | +0.1 |
  | Winter | ×0.5 | ×1 | ×0.5 | ×1.5 | ×1 |

  The visit card gets a season line under the farm intro ("High summer: the herd has been standing in the shade all week"), and the road map shows the season. Willow Bank and Hollins keep their decks in every season (D54), so the opening is the same for everyone.
- **Effects:** on the pacing test (13 days at Textbook today), the road runs through spring → summer → autumn → winter → spring once. A summer Top Lane deals more white line and DD; a winter one is mostly routine and easier. Points per cow don't change, so a winter day isn't worth less. Rechecks and returning cows are untouched: a season changes who's *new*, not who comes back.
- **Not taken:** season art (snow on the yard, summer light). Worth a look later, but the scenery is one painted set today. Slower healing in summer (more summer rechecks): it's real, but it would make summer a penalty rather than a different mix. Temperature as a number on the card.
- **Check:** route tests: the season is fixed for a day across a reload; over 40 visits to Top Lane, summer deals at least half again as many white lines as winter; Willow Bank and Hollins decks never change; the pacing test still opens the road within a fortnight. The sweep is untouched (the bot plays whatever is dealt).
- **Cost:** medium. A small `season.js` (or a block in route.js), the farmMix multiplier, the card line, the map line, save field none (days finished are already saved), tests.
- **Built 2026-10-14.** Logic in route.js (`SEASONS`, `SEASON_DAYS`, `daysDone`, `seasonFor`; `farm.seasons: false` on Willow Bank and Hollins; `endVisit` reports `season` and `turned`). **Season art added at Ben's request (mid-build):** `src/seasonart.js` paints a countryside behind the road map for each season (spring blossom, summer gold fields and bales, autumn ploughland and leaves, winter snow and bare trees; the horizon rises on tall phones), and tints the barn daylight (crush backdrop, title, walk-off windows). The visit card names the season and, where it leans the deal, adds its line; the day summary says when the weather turns. `?season=` overrides the pictures (not the deal) for checking. Browser-checked on the road at 375 × 812 in all four seasons; the crush, title and walk-off tints not yet looked at. 162 tests green; pacing still 13 days. sw v52.

### 15.2 Ulcer cows come back; white-line cows don't (small)
- **What it is:** Nate, ×2: ulcers recur because the pedal bone grows little spurs under the site and enlarges. White lines and abscesses are one-offs. Toe necrosis recurs too (already a recheck since WP8.4).
- **Change:** in `returningCows`, the healed pick prefers cows whose condition was an ulcer (they're drawn first, then the rest at random). A healed ulcer cow then comes back with **the same ulcer again half the time** (D55), from the visit's own seed: same claw, same site, at the bottom of the size band. New `back.outcome: 'again'`, with the intro line "Back for her trim, and the ulcer is back where it was: the bone under it has a spur now." She earns points as a fresh ulcer. A healed white-line cow is never picked first and always comes back routine (as today).
- **Effects:** more repeat ulcers at every farm that deals them; Willow Bank's Case B cow, if she healed, may come back with her ulcer on visit 2. That's a nice beat on the first farm. Save: `back` accepts 'again'.
- **Not taken:** a bigger pedal bone in the art or the probe text. Only the recurrence is modelled.
- **Check:** route tests: over many visits, a healed ulcer cow comes back as an ulcer about half the time and on the same claw; a healed white-line cow never does; a save with 'again' loads and an unknown outcome is still refused.
- **Cost:** small.
- **Built 2026-10-14.** `returningCows` picks healed ulcer cows first, then the rest. `returnCase` brings a healed ulcer back as `outcome: 'again'` when `ulcerAgain(farm, visit, k)` draws under 0.5 (the visit's own seed, stream 600 + k): same seed, so the same foot, claw and site, at `lesionSize: 0`; Case B comes back with her hand-placed ulcer as it was. A calving cow still comes back fresh. The visit card names her ("thinks #642's old ulcer is back"), her intro gives the spur line, and the save accepts 'again'. Browser-checked: Top Lane visit 3 card and intro. 166 tests green. sw v53.

### 15.3 Abscess stage: sealed or burst (medium)
- **What it is:** Nate, ×2: a sealed abscess squirts pus when opened and she walks out better straight away. One that has already burst has a dry track and little pus; she's been finding her own relief.
- **Change:** a white-line mod `stage: 'sealed' | 'burst'`, drawn per cow from Brackenford on (1 in 3 burst, D56); Hollins and every guided run stay sealed. A burst abscess:
  - *Read:* the entry at the wall is already open, a small dark hole with a dried crust round it, not a closed black line. The probe text says so ("an old hole at the white line, dry, crusted: it has broken out on its own").
  - *Trim:* the track still has to be opened to the pocket, since the dead horn over it still traps muck, but the pocket is shallower (pared at target −1.5, not −2.5) and `ev.drain` gives a dry beat: no squirt, no sigh, a toast "Dry: it broke out on its own a while back. Open it so it stays clean."
  - *Score:* the same as a sealed one. The lesson is the read (and not over-digging for pus that isn't there): `soleDugBesideTrack` already costs digging round the track.
- **Effects:** the white line's guide page gains a "Burst" row. The art needs the open entry and crust (in `hoofart.js` next to the existing track art) and an art-lab stage for it.
- **Not taken:** the gait difference (a sealed cow walking out better than she walked in). The walk-off already shows sound vs lame; a "better than before" beat needs the walk-in gait, which 14.3 only sketches.
- **Check:** game tests: a burst abscess drains dry (no release sound, the dry toast), its pocket depth is −1.5; the sweep plays Textbook with `stage: 'burst'` forced; art lab shows both stages at 1× and 2×.
- **Cost:** medium, most of it art.
- **Built 2026-10-14.** `stage: 'burst'` is a makeCase mod that only a white line takes (on its lesion). `farmMods` draws it last, 1 in 3, on farms with `burst` (Brackenford on); rechecks keep it. Burst: `FINDING_BURST` read and probe text, an intro of a cow short for a week or two and a bit better, the misread feedback names the crusted hole. The knife opens its pocket to target −`BURST_POCKET` (1.5) and the drain fires `ev.dry`: an info toast, no release beat. Art: a dark hole at the entry with a ring of yellow-brown crust; opened, the pocket is pale and dry (little grit, no pus). Guide: a "Burst" row on the white line page. Art lab: `?cond=whiteline&burst=1`, with a "track pared" stage for either. Browser-checked in the art lab at 2× (brushed and pared, sealed and burst); not yet seen in play. 169 tests green; burst sweep seeds 1–8 Textbook. sw v54.

### 15.4 J3 seeds 12 and 16 fail the bot (small; diagnose first)
- **What it is:** the 14.1 side finding: J3 `twoclaw` dealt with `dealMods` on seeds 12 and 16 fails the bot with a cut into the open ulcer. The sweep only runs seeds 1–6, so it's never been seen in the test run.
- **Change:** find out whether the bot or the game is at fault. If the bot (most likely: it already had to learn to keep the knife off an opened ulcer core in 7.3), fix the bot. If the placement puts the second lesion where a Textbook trim can't avoid it, fix `place` for twoclaw. Then widen the J3 sweep to seeds 1–20.
- **Cost:** small, unless it turns out to be placement.
- **Built 2026-10-14.** The bot, not the game. On seeds 12 and 16 both claws carry an ulcer near the cleft (cores about 45 px apart, 15 px of horn between them), and the bot's orbit round the second ulcer swept its blade over the first one's opened core. `openUlcer` now breaks the orbit into arcs that keep the blade clear of any other opened ulcer. Seeds 1–30 all play Textbook; a new test sweeps J3 over seeds 1–20. 159 tests green.

### Build order (D52)
15.4 → 15.1 → 15.2 → 15.3. 15.4 first because it's small and clears a known red seed before more variety goes in. 15.1 next as the headline. 15.2 is small and independent. 15.3 last, being mostly art.

### Decisions for Ben

**Taken 2026-10-14: Ben took all the defaults.**

| # | Decision | Default |
|---|---|---|
| D52 | Build order: J3 seeds (15.4), season (15.1), ulcer recurrence (15.2), abscess stage (15.3)? | Yes |
| D53 | Season length: 3 finished days a season, starting in spring? | Yes. A road of about 13 days then sees every season once. 2 days a season flickers; 4 means most players never see winter |
| D54 | Leave Willow Bank and Hollins out of the season, so the opening is the same for everyone? | Yes. The first two farms are the teaching ramp, and a summer Hollins would deal two white lines on farm 2 |
| D55 | A healed ulcer cow comes back with her ulcer half the time? | Yes. Always would make "healed" meaningless for ulcers; a quarter would barely be seen |
| D56 | Burst abscesses: 1 in 3 white lines from Brackenford on, never on Hollins or a guided run? | Yes |
| D57 | Knife stroke modes (your carve-vs-flick idea from 2026-10-11) stay out of WP15? | Yes. It's a feel change to the core tool and deserves its own WP with a phone design first. It's the obvious WP16 candidate |

## WP16: knife stroke modes, carve and flick (medium; scoped 2026-10-14 at `e60555a`)

Ben's idea from 2026-10-11 (D57): opening an ulcer feels the same as carving the dish, because the knife has one stroke. **Recommendation: no mode switch. The stroke you make picks the mode.** A long pull carves, as today. A short, quick stroke flicks: the hook at the knife's tip lifts loose horn and takes only a shaving of live sole. Real trimmers don't flip a switch; they change how they move the knife. Nate: "the knife's hook lifts the loose horn away along the line of separation", and corium is nicked, never gouged (`docs/NOTES-NATE-LIVES.md`, 1:01:09 and 34:00). The flick becomes how a cap is opened and how loose horn by a lesion is freed without stripping the ring round it.

No condition is added and no score changes, so the 7.2 recipe doesn't apply and the save is untouched. Each step ships with the bot sweep, as before.

### Fact checks (done 2026-10-14, by reading the code)

| Question | Answer | So |
|---|---|---|
| How does a knife stroke reach the hoof? | `main.js` pointermove: once the pointer has moved `engage` (6 px), each move is cut at once as interpolated stamps through `applyStroke`. On release, a stroke under 12 px is a tap, and a knife tap pries an old block (J2). | A flick must be at least 12 px, or it collides with the pry. A flick can't be known until the finger lifts, so the start of every knife stroke has to be held back briefly (see 16.1). |
| What opens a closed cap today? | `workCap`: 90 px (`capGive`) of flat-of-blade travel over the cap, from any stroke. Sawing back and forth opens it. | That's why it feels like carving. 16.2 makes the flick the quick way in. |
| Who calls `applyStroke` besides the game? | The bot (`tests/player.js`) calls it directly with drags, and opens caps by sawing (player.js:100–104). `game.test.js:122–146` saws caps open too. | `applyStroke` takes the stroke as an argument (`'carve'` by default), so the bot and old tests keep working, and the bot is taught to flick where a player should. |
| Does anything punish heavy knife work round a lesion? | Yes. WP14.1's ring metric costs Restraint when the sound sole round an opened ulcer is stripped. `soleDugBesideTrack` does the same round a white-line track. | No new score is needed. A flick takes a shaving, so flicking the loose rim keeps the ring, and the existing costs already reward it. |
| Does the game already use the word? | Yes. The guided run's `heelHorn` step says "One or two short pulls with the knife flick it off." | The heel step needs no new idea, only for the flick to really be different. |

### 16.1 Tell a flick from a carve (medium; the core)
- **Change:** in `main.js`, a knife stroke starts *undecided*. Its points are buffered, not cut, until either it has travelled more than `flickMax` (about 40 CSS px) or `flickTime` (about 160 ms) has passed. Then it's a **carve**: the buffer is replayed as stamps at once, and the stroke goes on cutting live as today. If the finger lifts first, having moved at least 12 px, it's a **flick**: applied once along the buffered path with `applyStroke(..., 'flick')`. Under 12 px stays a tap (the pry). Thresholds are in CSS px, like `CFG.touch.grip`, so zoom doesn't change them.
- **What a flick does** (`applyStroke` with stroke `'flick'`): the hook is smaller than the blade's flat (radius about 9 against 14). Loose horn under it lifts as now (heel curl, ulcer rim, the white-line track where it's openable, necrosis, double sole). Live sole loses at most `flickCut` (about 0.25 mm) a flick, with the usual near-target resistance, so it nicks and never gouges. The open ulcer core is still raw: a flick into it is a cut into the lesion, as a carve is.
- **Feel:** a flick gets its own short sound (a dry "tk", synthesized in `audio.js`), a short buzz, and a flake that flies off in the stroke's direction. A carve keeps the strip that curls off at the end of the pull.
- **Effects:** the carve start is held back by at most about 160 ms. The cut is replayed as soon as the stroke is known, so a steady pull should feel the same; this needs Ben's phone to confirm.
- **Check:** game tests (a flick takes loose horn and at most `flickCut` of live sole; the cap and core rules hold); a unit test of the recogniser with fake pointer timings (tap, flick, slow short pull, fast long pull).
- **Built 2026-10-14.** `src/stroke.js` sorts a knife stroke (`startStroke`, `strokeMove`, `strokeTick` each frame, `strokeEnd`); `main.js` holds a pending stroke's points and cuts them at once (`carveHeld`, still from `engage` px on) the moment it's a carve, or works them as one `applyFlick` when the finger lifts. A cancelled touch is neither a flick nor a pry. `applyFlick` works each cell under the hook once, however the path crosses it, and counts `capFlick` on a closed cap. Feel: `Sound.flick`, a 6 ms buzz, two chips thrown the way the hook went; the strip curl and pull sound stay on carves. Settings in `CFG.tools.knife`: `flickMax` 40, `flickTime` 160, `tapMax` 12, `hook` 9, `flickCut` 0.25, `capFlick` 35. Browser-checked with synthetic pointer events: three quick strokes on the cap open it (35 work each); a 30 ms-a-move pull stays pending for 6 moves, then carves. Not felt on a phone yet. 180 tests green (11 new in `tests/stroke.test.js`). sw v55.

### 16.2 The cap answers to the flick (small)
- **Change:** in `workCap`, a flick whose hook lands on the cap counts `capFlick` (about 35 px) of work, so about three flicks open it. A carve still works it, at half its travel (a carve over the cap counts 0.5 per px, so 180 px of sawing). The first carve on a cap toasts once: "Carving rides over the cap. Flick at its edge: short, quick strokes with the hook."
- **Effects:** an ulcer is opened by a few deliberate flicks with creaks in between, then the crack. Sawing still gets there, slowly, so nobody gets stuck.
- **Check:** game tests: three flicks pop a cap; 90 px of carve doesn't, 180 px does.
- **Built 2026-10-14.** `capCarve` 0.5 in `workCap`'s carve call. The first creak of a carved cap says "Carving rides over the cap. Flick at its edge: short, quick strokes with the hook." (again after 30 s of carving it); a flicked cap says "A few more flicks at its edge and it'll give." Browser-checked: sawing the cap fires the carve line and opens it at 180 px. The bot still opens caps by sawing, at half speed. 182 tests green.

### 16.3 Teach it (small)
- **Change:** the knife hint ("Pull for a long strip; flick, a short quick stroke, to lift loose horn"); the guided run's `openUlcer` step ("Flick at the edge of the dark circle: short, quick strokes. The cap holds, then gives") and `heelHorn` step; the knife page in the guide gains a carve and flick row; a flick on the guide-run heel horn is enough to pass it.
- **Check:** guide tests; the guided run plays through with the new texts at 375 × 812.
- **Built 2026-10-14.** New knife hint, guided-run `openUlcer` (flick at the edge, then flick the loose edge free) and `heelHorn` ("one or two quick flicks") texts, and the guide's knife notes name both strokes. The heel step still passes on any stroke that clears the horn. Not yet played through in the browser. sw v56.

### 16.4 The bot flicks (small)
- **Change:** the bot opens caps with flicks, frees an ulcer rim and the heel curl with flicks, and keeps carving for the dish and the white-line track. Sweep seeds 1–8 at Textbook for every condition, J3 seeds 1–20.
- **Check:** the full sweep green; the pacing test unchanged.
- **Built 2026-10-14.** `player.flick(a, b)` works one short stroke through `applyFlick`, as `main.js` does when the finger lifts, and refuses any stroke shorter than `tapMax` or longer than `flickMax`. The bot opens a cap with flicks kept wholly on it (3 flicks), frees any rim left with 16 px flicks on a ring just clear of the open core (the J3 pair's other core too), and flicks the heel curl off row by row (about 10 flicks). The dish and the white-line track stay carved. On ulcer seeds 1–3 the cap's crack takes all but 0–2% of the rim, so the rim flicks rarely run. Scores match the sawing bot or edge up (two finish 99 → 100). Full sweep green (seeds 1–10 every condition, J3 1–20), pacing test untouched; 182 tests green. Tests only, so no sw bump.

### Not taken
- **A mode button** (tap the knife again to switch). It's explicit, but it adds a mode the player forgets they're in, and on sand farms a second tap already swaps in a fresh knife (WP12.4).
- **Soft heel-bulb horn that a hard carve zips through** (Nate, 3:01). A good later feel item now that carves are distinct, but it adds a new way to bleed.
- **Thin worn knives that cut finer but can snap** (Nate, 5:41). Belongs with WP12.4's wear, not here.
- **Scoring the stroke.** The ring and track costs already reward the flick; a separate "you carved near the lesion" cost would double-count.

### Build order (D58)
16.1 → 16.2 → 16.3 → 16.4, shipping after each with the sweep. 16.1 first because the rest needs the flick to exist. The bot (16.4) stays green through 16.1–16.3 because carving still opens a cap.

### Decisions for Ben

| # | Decision | Default |
|---|---|---|
| D58 | Build order 16.1 → 16.4? | Yes |
| D59 | The stroke picks the mode (short and quick is a flick), with no mode button? | Yes. It's how the real knife works, and a button collides with the sand farm's fresh knife |
| D60 | Where's the line? A flick is 12–40 CSS px and lifted within 160 ms | Yes, as a start. Tune on your phone; both are config numbers |
| D61 | Carving can still open a cap, at half speed? | Yes. Flicks are the way in, but nobody gets stuck. "Only a flick opens it" is stricter and more deliberate, but a player who never finds the flick can't finish an ulcer |
| D62 | A flick takes at most 0.25 mm of live sole? | Yes. Enough to feel, too little to bleed unless the sole is already at the line |

## WP17: the long road feels the same (medium; scoped 2026-10-15)

From the 2026-10-15 review (#3). **Recommendation: break up the run of identical full trims with short cows that test judgement, and give reputation a second use besides opening farms.** Today every cow is the same five-step trim, and opening the whole road takes 59 cows at Textbook, 82 at Clean and 129 at Sound (13, 18 and 28 days; `tests/route.test.js` pacing). Reputation buys farms and nothing else, so the middle of the road (Brackenford to Greystone) is many near-identical cows with nothing new to aim for.

### Fact checks (done 2026-10-15, by reading the code)

| Question | Answer | So |
|---|---|---|
| Can a cow start part-trimmed? | Yes in principle: `makeCase` takes `excess` per claw outright (Case A and B use it), and `Hoof` builds thickness from it. A thin-soled cow (WP13.1) already starts below target. | A pre-trimmed cow is an `excess` near 0 on both claws plus a deliberate fault. No new simulation. |
| Do the steps cope with work already done? | `evaluateSteps` checks state, not history: a claw already at target reads done. `steps` per case can be any list. | A partial-work cow gets a short step list and finishes as soon as the foot is right. |
| Is there a "check and sign off" ending? | Release or the call (WP8.1). Releasing a sound foot untouched already scores. | No new ending; scoring reads the foot as it leaves. |
| Can rep gate tools? | Yes: `woodOK()` in `main.js` gates the wood block on Ridgeway's rep. | Unlocks are more of the same gate, shown on the road map. |
| Does rep ever go down? | No (WP7.4). | Unlocks are milestones, never a shop: nothing is spent. |

### 17.1 The apprentice's cows (medium)
- **Change:** from Journeyman (rep 100), one cow a visit comes in already trimmed by the farm's apprentice. The ticket on the intro says so. Each has one or two faults drawn from: claws not level, dish missed on one claw, toe left long, a thin spot near the line, a decoy dug out, or a lesion missed under a clean trim. The player reads the foot (gauge, beam, testers), fixes what's wrong, and releases. A good one needs nothing: releasing it untouched is right.
- **Effects:** a 1–2 minute cow that teaches judging a finished foot, and restraint when nothing needs doing.
- **Check:** route tests (one a visit from Journeyman, never at Willow Bank or Hollins); game tests (each fault reads undone on the right step; an untouched good one scores Textbook); the bot fixes each fault.
- **Built 2026-10-15.** `case.js`: `APPRENTICE_OK` (routine, ulcer, white line) and `APPRENTICE_FAULTS` (`unlevel`, `nodish`, `longtoe`, `rough`, `heel`); `makeCase(..., { apprentice: [...] })` builds the trimmed foot with those faults left in, and `apprenticeLeft(cd)` names them on the ticket. A lesion cow keeps her lesion under the clean trim. `route.js`: farms from Brackenford on carry `apprentice: true`; `visitCases` picks one fresh cow a visit (stream 333) once past the Apprentice tier, a routine cow clean a fifth of the time, else one or two faults (a lesion cow: the lesion, plus a fault half the time). Dev: `?cond=routine&apprentice=unlevel,heel`, or `&apprentice=` for a good job. Tests: route (one a visit, from Journeyman, never Willow Bank or Hollins), game (an untouched good one is Textbook, a fault left is not), playthrough (every fault and none, routine, ulcer and white line, to Textbook).

### 17.2 Partial-work cows (small)
- **Change:** two short kinds, dealt now and then from Hollins on. A **heifer**: a small foot, little growth, mostly a check and a tidy. **Trimmed lately**: one claw done last time, so only the other claw, the heel horn and the read. Both use the normal steps, which read done where the foot is already right.
- **Effects:** variety in length without new mechanics.
- **Check:** route tests (share per farm); the bot sweep on both.
- **Built 2026-10-15.** `farmMods` draws `partial` ('heifer' or 'lately', even odds) on a quarter of routine cows from Hollins on, never close to calving. A heifer: little horn on both claws and livelier (her first crush). Trimmed lately: the big claw at 0.15 mm excess and `trimmed: [claw]`. Own intro lines; neither gets a guided run or an apprentice. Dev: `?cond=routine&partial=heifer` or `&partial=lately`. Tests: route (share and never-calving), game (start state), playthrough (both to Textbook).

### 17.3 Reputation unlocks (small)
- **Change:** rep milestones (never spent) open kit, shown on the road map under the next farm: a finer grinder disc (a cleaner, slower cut near the line), a better knife (a stronger flick, so a cap opens in two), a helper with a hose (the foot comes in half clean). The wood block moves onto the same list.
- **Effects:** rep is worth having between farms. The kit makes later cows a little quicker, not easier to bleed.
- **Check:** tests per unlock; the guide names each.
- **Built 2026-10-15.** `route.js` `KIT`, `kitFor(rep)`, `nextKit(rep)`: hose helper 50 (the foot comes in at `CFG.hose` of its muck), finer grinder disc 165 (`cfg.fine`: slower near the line, finer swirls), better knife 330 (a cap gives in two flicks), wood block 480 (was gated on Ridgeway's rep). Each rides on the hoof as `hoof.kit`. The road map shows a kit line (what you have, the next piece and its rep); the day summary names kit opened that day (`endVisit` reports `kit`); the guide notes each on its tool page. Tests: route (milestones between farms, reported on the day), stroke (knife two flicks, disc slower and finer).

### 17.4 Shorter road (tiny)
- **Change:** cut farm thresholds by about a quarter, or raise Textbook to 12 points, so a Clean player opens Ridgeway in about 60 cows, not 82.
- **Effects:** fewer cows overall; the bot pacing test's bounds move.
- **Built 2026-10-15.** Farm thresholds cut by a quarter: Hollins 25, Brackenford 75, Top Lane 135, Marsh End 200, Greystone 285, Coldharbour 375, Ridgeway 480; the Journeyman and Master tiers move with their farms (75, 200). The bot pacing test now opens the whole road in 10 days at Textbook and 21 at Sound (was 13 and 28). sw bumped with the review fixes and the playtest log to v58.

### Not taken
- **Skipping steps by menu** (auto-trim the sound claw). It removes the game rather than varying it.
- **Spending reputation.** Rep only goes up (WP7.4); a shop would make a bad day cost kit.

### Decisions for Ben

| # | Decision | Default |
|---|---|---|
| D63 | Which of 17.1–17.4 to build? | 17.1 + 17.3 (the judging cows and a reason to earn rep) |
| D64 | Apprentice cows from which tier? | Journeyman (Brackenford, rep 100) |
| D65 | Unlocks as milestones, never spent? | Yes |
| D66 | Which unlocks? | Finer disc, better knife, hose helper; wood block joins the list |

**Ben's answers (2026-10-15):** D63 all four, 17.1–17.4. D64 Journeyman. D65 milestones (the default stood). D66 all four unlocks. **Build order (D67):** 17.4 → 17.3 → 17.2 → 17.1: the numbers first, so the unlock milestones and the new cows are placed on the final road.

## Done criteria for the whole plan
- `npm test` is green, including the WP0 playthrough at Textbook and the variation sweep.
- In the preview at 1280×900, 375×812 and 375×667: no guides or mm figures before cleaning; guided progress visible on phones; the canvas stays the same size between beats; tool buttons at least 44 px wide; canvas text at least about 11 CSS px.
- Ben's phone playtest: he can stop the grinder at about 7 mm on purpose, and the danger can be heard and felt before any blood.
- README and DESIGN.md match the new behavior.

## Phone notes 2026-10-15 (after the stain islands APK)

### Level gauge says LEVEL before step 2 is done (built 2026-10-19)
- Ben's phone, step 2: the gauge read **LEVEL** (inner 8.2 mm, outer 7.6 mm) but the step didn't advance.
- The step is right: `levelled()` (src/steps.js:16, used at :67) also needs the claw at target (`wbMean <= T + tolOf(cd)`, 7.75 mm), and 8.2 isn't.
- The gauge is wrong: `level` in src/render.js:405 and :455 checks only `|diff| <= 0.6`, so the big green word says "done" while the claw is still high.
- Fix: show LEVEL only when the claws match *and* the claw being worked is at target. Otherwise say which is off, e.g. "level · inner 0.5 mm high". Both gauge layouts (render.js ~405 and ~455). Add a test that the label and `steps` agree.
- Not caused by WP10.3. Leaving the islands out of `wbMean` makes the reading honest; with them counted, the islands would have pulled the mean down and ticked the step over early.
- **Built 2026-10-19.** `levelRead(m, caseDef)` in steps.js is the gauge's word for both layouts: LEVEL only when step 2 would tick (matched within 0.6 mm, each trimmed claw at target, toe off); otherwise `N mm off`, `level · inner 1.1 mm high` or `level · outer toe long`. A deep sepsis foot checks only the sound claw. `renderer.caseDef` set per cow in main.js. tests/level.test.js sweeps the second claw's height and toe and checks the label agrees with step 2.

### Stain islands look like holes (built 2026-10-19, art only)
- On the phone the islands read as punched through the sole: flat, evenly dark brown, a crisp torn-paper edge and a heavy rim shadow.
- Fix in hoofart.js (stain block at "3. Stained outer horn"): mottle the inside, lighten where `isle` is shallow, soften the edge and the dark lip. Leave the sim alone.
- **Built 2026-10-19.** The dark fill was the stain, not the relief (the dip alone reads soft). Once the plain sole round an island is ground (`isleAround()`: the plain sole's cut carried in over the island, per compose), its stain lies patchy and part-cover, thins to the rim, mottles, lightens where nearly through, and the lip and packed-manure darkening ease off. An island in unground sole stays as stained as the rest. Sim untouched. Checked in the art lab, stages 1 and 2. sw v61.

### To check
- A faint pink patch mid outer claw (about level with its third island). Pink means the sole is near the thin line: fine if Ben had been grinding an island there, a bug if not.
- A dark brown dash just outside the outer claw's right edge, about halfway down. It doesn't look like part of the foot.

### "Always over-trimmed, but the overall is still too high" (to investigate)
- Ben, phone, Top Lane: Restraint 0, "Over-trimmed patches", yet the gauge still read high while grinding. It's a feeling across many cows, not just this one (the calving miss was separate).
- Likely cause: the gauge shows the claw's *mean*, but over-trim is judged *per cell* (scoring.js:262: more than 5% of sole cells more than 1.25 mm under target gives the note). A disc that takes some patches deep while others stay high gives a mean that still says "too high" with patches already over. The gauge then pushes for more grinding everywhere.
- The islands may add to it: an island's stain clears about 1 mm under where it started, but over-trim there counts at 1.25 mm, and the art's jitter can push the clear point past that. Chasing one stain = an over-trimmed patch.
- Restraint 0 also took the dug wall mark ("a passing flaw … chasing it"), so it's not all over-trim.
- Next: pull Ben's playlog export (road map → log) and replay a few cows. Measure the spread of sole thickness at the moment the gauge first says on target, and what share of the over-trimmed cells are islands. Fix options: show the high spots rather than only the mean (e.g. tint cells still above the band); widen the island over-trim margin to soak + 0.5 mm; make the step and gauge use a robust level (median) so a few high cells don't push the mean.

### Toasts land where the tool is working (built 2026-10-19)
- Ben, phone: message pop-ups cover the spot he's working on.
- `#toast` (styles.css:145) is fixed at the bottom centre of the play area (`bottom: 16px`), which is where the toe and the lower sole sit on a phone, right under the thumb.
- Fix: place the toast away from the active touch. When the pointer or the last tool stamp is in the lower half of the foot, show it at the top (under the level gauge); otherwise at the bottom. Simpler alternative: always dock it in the instruction strip at the top of the screen ("2 · Match the inner claw" panel), which is off the foot entirely. Check both on a phone and on desktop, and keep the warn/good styles.
- **Built 2026-10-19.** ui.js tracks the last pointer over `#canvasWrap`; a toast placed while that's in the lower half of the canvas gets `.top`, docked at `--toast-top` (set in main.js resize: just under the gauge, phone strip or desktop meter). Placed when it comes up, not moved after; keeps its place while it fades. Checked at 375×812 (testers tap low → top) and desktop.

## Every foot is the same shape (gap, to scope)
From Ben, 2026-10-16: "hooves are different shapes and sizes." The references agree; the game draws one foot.
- **The game:** one claw outline (`INNER_PTS`, src/hoof.js:87), mirrored for the other claw and flipped for side. `GEOM` (hoof.js:70) zones are fixed pixels. Cows differ only in horn heights, growth, mud and lesions. The plan's line "Toe length fixed vs foot size? Moot" (Nate AMA table) records the gap but treats it as nothing to do.
- **Size sets the toe length.** Cramer: 7.5 cm dorsal wall under 650–700 kg; 8.2 cm for bulls and Brown Swiss. Shearer step 1: "Observe the size of the cow … small, average or large", 7.5 cm for an average Holstein, add 3–6 mm for larger cows and bulls. AHDB field guide: 8 cm for young healthy Holsteins, "adjust for age, breed, environmental conditions and disease". Nate: his complaint about Dutch is a big foot getting the same toe as a small one.
- **Shape comes from growth vs wear.** Shearer: overgrowth lengthens and raises the toe, lowers the heel, and drops the front wall from 45° to 35° or less, mostly on the hind outer and front inner claws. AHDB: "care taken if presented with curled toes".
- **Shape conditions already noted but not built:** corkscrew claw (hind outer, a farm trait; Shearer also describes acquired corkscrew of the front inner claws at feed bunks), the odd claw enlarged by an old pedal-bone injury (Nate lives #12), bulls (Nate lives #13; thin soles).
- **Build options, smallest first:** (1) per-cow scale: small / average / large frame, outline and `GEOM` scaled together, toe target in mm scaled to match, intro or read card says her size; breed per farm deck (Jersey small, Brown Swiss and bulls large). (2) Per-claw shape mods: claw width, toe length and curl, heel height, outer claw bigger than inner, drawn from the outline with seeded jitter. (3) Corkscrew as a condition and farm trait on top of (2).
- **Cost:** everything keyed to fixed pixels has to move with the outline: `GEOM` zones and feathers, `toeRamp`/`overgrowY`, decoy and lesion placement bands in conditions.js, tutorial targets, guide sets, the art lab, crops in the field guide, the bot's paths. Bigger than it looks; scope D-decisions with Ben first.
- **Release art per breed (Ben, 2026-10-16).** The walk-off cow is one Holstein: one `bodyPath` (src/walkoff.js:287) with seeded black-and-white patches (`patchTexture`, :385). Once breed exists, the release should show it: Holstein black-and-white (or red-and-white), Jersey a small fawn cow with a dark face and dished profile, Brown Swiss a big solid grey-brown cow with a pale muzzle ring, a beef cow short and stocky (Nate: the reason they're hard in the chute), and a bull with a thick neck and no udder. Needs a body shape per breed (size, depth, leg length, head and neck), a coat painter per breed in place of the one patch texture, and the same coat on the intro and day summary if a cow appears there. The walk-off gait and lameness code should stay shared and read the scale from the breed.

### Decisions for Ben (foot shape, 2026-10-19)

**The finding that drives these.** Toe length can't be got wrong today. The nippers only bite `Z.DEAD` cells (tools.js `applyBite`), and the dead/live line is the same fixed outline on every cow. So the dashed toe line is a tidy-up, not a judgment. If size only changes the picture, it's cosmetic. It becomes a skill (Shearer's step 1, "observe the size of the cow", and Nate's complaint about one toe length for every foot) only if the right toe length moves with the cow *and* you can miss it.

**The cheap path vs the expensive one.** Drawing a big foot bigger on screen means scaling the outline and every pixel-keyed thing with it (`GEOM`, ~50 uses across hoof, conditions, render, art, tutorial and the tests, plus the guide crops and the bot). Moving only where the toe line sits on the same outline is local to the toe: the dead zone's top edge, `toeLine()`, the dashed guide and the nipper check. The recommendation is to start cheap and only pay for the redraw if the cheap version plays well.

| # | Decision | Default (recommended) |
|---|---|---|
| D68 | What does a cow's size change in play? (a) the picture only, (b) where the right toe line sits, (c) (b) and the nippers can cut too short | **(c).** Without it size is cosmetic. Too short is the real risk the references warn about. |
| D69 | Does a big foot look bigger on screen? | **No, not in the first pass.** The camera keeps framing the foot. Her size comes from the intro, the walk-in picture and the walk-off (D74). Redraw at real scale later only if it's missed. |
| D70 | Size classes and toe targets | **Three:** small (Jersey, heifers) ≈ 7.0 cm, average (Holstein) 7.5 cm, large (Brown Swiss, big old cows) 8.0 cm. Cramer's 8.2 cm and Shearer's +3–6 mm are for bulls and the largest cows. The small figure is an estimate; check it against a reference before building. |
| D71 | How does the player know the target once guides are off? | **At Apprentice, the dashed line sits at her size. From Journeyman on there's no line:** the intro names her frame ("a big Brown Swiss"), and the field guide has the rule (7.5 cm average, longer for big cows). Optional: a mm ruler along the toe when the nippers are picked up. |
| D72 | Cost of a toe cut too short | **Scaled by how far.** About 2 mm short is a Balance note ("toe short: she'll rock back on her heels"). Further is a Soundness hit. Into the toe's live tip: pink, then blood, as on the sole. A toe left long (a big cow's line used on a small cow) is a smaller Balance note. |
| D73 | Which breeds, on which farms | **Willow Bank:** Holsteins only (learn the average first). **Hollins:** some Jersey crosses (grazing herd). **Greystone:** big Holsteins. **Ridgeway:** a Brown Swiss or two. Beef cows and bulls later: bulls bring thin soles and their own handling (Nate lives #13). |
| D74 | Breed art on the walk-off (and walk-in) | **With size:** Holstein (black or red and white), Jersey (small, fawn, dark face) and Brown Swiss (big, grey-brown, pale muzzle). One body shape scaled per breed plus a coat painter each. Beef and bull bodies when those cows arrive. |
| D75 | Per-claw shape (width, curl, heel height) and corkscrew | **Later, as their own WP.** They need the outline to vary, which is the expensive path. Revisit after D68–D74 are played. |
| D76 | Build order | **Size data + intro + toe line → too-short nipping + scoring → field guide → breed art → farm decks.** Each step is playable before the next. |


**D74 built (2026-10-19):** src/coat.js holds a coat per breed and a draw scale per frame (small 0.86, large 1.1). The walk-off cow (walkoff.js `coatTexture`, `head`) and the walk-in sketch (stance.js) both read it. A Holstein is red and white one time in eight, from her seed. Beef and bull bodies wait for those cows.

**Ben's answers (2026-10-19):** defaults on all of D68–D76. Ready to build in the D76 order, starting with size data, the intro line and the toe line. Check the small-cow 7.0 cm figure against a reference first.

## WP18: claws that aren't the same shape (D75; scoped 2026-10-19 at `d1efc70`)
Ben asked for D75 on 2026-10-19, before D68–D74 had been played (they aren't pushed yet). D75's own default said to wait for that play. This is the scope. Build after Ben answers D77–D83.

**What the references add (Shearer pp. 11, 27–28, step 1):**
- **The two claws aren't twins.** The inner hind claw is "the more normal claw", used as the model for the overgrown outer one. The game mirrors one outline, and the claws differ only in horn height (`excess`, case.js:191).
- **Corkscrew claw** is hereditary and mostly hits the hind outer claw. The outside wall curls under the sole and carries weight. The toe rises and rotates, the inside wall folds at the toe, and the heel is overgrown, "nearly always higher" than the other claw's. The trim: straighten the front wall and stop at blood. Take out the curl and fold. Set the toe to 10 cm, then come down 6 mm at a time to 8.25 cm unless it bleeds. Balance with the other claw, and *don't* lower that claw's heel. The commonest mistake is over-trimming the outside sole near the toe, which often ends with a block on the other claw.
- **Acquired toe-out** of the front inner claws comes from reaching forward at a feed bunk and is "unknown in pastured cattle."

**The engineering choice: warp one outline per claw instead of drawing new outlines.** Each claw gets a shape `{ width, toe, curl, heel }`, with a forward map (template → screen) and its inverse. The sim grid tests each cell's *template* position against `GEOM`, so the 78 `GEOM` uses and the ten placement bands in conditions.js stay as written. `clawPolygon`/`clawSpan`/`clawBox`/`toeLine`/`dishRect` (about 60 call sites) take the shape and warp what they return. Lesions are placed in template coordinates and warped when stamped. The default shape is the identity, so every existing test stays green until a cow gets a shape.
- **The hard parts:** (1) hoofart.js (1.9k lines) draws from `clawPolygon` but also from fixed y values (the heel shading at 330/200), and those need the inverse map. (2) A corkscrew isn't just a warped outline: the outer wall moves *onto* the sole as a band of weight-bearing wall, which is a new zone shape, not a stretch. (3) The camera framing (D69) has to fit the widest claw.

**Packages:**
- **18.1 Warp plumbing, identity default.** No visible change. Test: an identity shape gives a byte-identical grid and art.
- **18.2 Ordinary variation.** The overgrown claw (hind outer, front inner) is a bit wider and longer than its partner. Seeded jitter per cow on width, toe and heel. Art lab `&shape=`. Nothing new to score: the toe line, dish and heel all follow the warp, so the player reads each foot instead of memorising screen positions.
- **18.3 Corkscrew claw** as a condition and a farm trait. Read card, probe text, field-guide entry, Shearer's trim as the rule, and the two traps (outside sole near the toe, the other claw's heel) as scoring.
- **18.4 Acquired toe-out on front feet**, on bunk-fed farms only (D82).

| # | Decision | Default (recommended) |
|---|---|---|
| D77 | Build now, or wait for D68–D74 in play? | **Push D68–D74 now so the playtester has them, and build 18.1–18.2 in parallel.** 18.1 is invisible and 18.2 is cosmetic-plus, so neither depends on how size plays. Hold 18.3 until there's a play report on size. |
| D78 | How much ordinary variation? | **Modest.** The overgrown claw is about 5% wider with a toe about 4 mm longer. Per-cow jitter is ±5% width and ±3 mm toe. Visible side by side, never a different rule. |
| D79 | Does the camera reframe for wide claws? | **No.** Keep D69's fixed framing. Cap the warp so the widest claw still fits the current margins (about +8% width at most). |
| D80 | Corkscrew: where and how often? | **A farm trait on Greystone** (big Holsteins: a sire line), about 1 cow in 6 there and 1 in 40 elsewhere. Always the hind outer claw, often on both hind feet. |
| D81 | Corkscrew: what counts as a good trim? | **Shearer's procedure.** Nip the curl and the inside-wall fold. Her toe target is 8.25 cm, not her frame's. The outside sole near the toe is a thin-sole trap (pink, then blood). Lowering the *other* claw's heel is a Balance fault. Blood there means a block on the other claw. Not "fixed": she comes back on the calendar (WP15) like an ulcer. |
| D82 | Acquired toe-out of front inner claws | **Shape only, no new condition:** a stronger 18.2 curl on front inner claws at bunk-fed farms, never at the grazing farm (Hollins). Only if front feet come up often enough to be seen; otherwise drop it. |
| D83 | An odd claw enlarged by an old pedal-bone injury (Nate lives #12) | **Not taken**, as in WP15 ("a bigger pedal bone ... not taken"). 18.2 makes it a one-line case later if wanted. |

**Ben's answers (2026-10-19):** defaults on all of D77–D83. D68–D74 pushed; building 18.1–18.2 now, corkscrew (18.3) held for a play report on size.
