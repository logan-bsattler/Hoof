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
- Long gestures: dispatch pointer events on `#game` with `javascript_tool`. Map a logical point to the screen with
  `r = canvas.getBoundingClientRect(); clientX = r.left + x / 400 * r.width; clientY = r.top + y / 720 * r.height`.
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
- **Optional first impression.** Replace the intro modal over a dimmed hoof with a proper title card (logo, the barn, ambient sound starting on the first tap).

## Done criteria for the whole plan
- `npm test` is green, including the WP0 playthrough at Textbook and the variation sweep.
- In the preview at 1280×900, 375×812 and 375×667: no guides or mm figures before cleaning; guided progress visible on phones; the canvas stays the same size between beats; tool buttons at least 44 px wide; canvas text at least about 11 CSS px.
- Ben's phone playtest: he can stop the grinder at about 7 mm on purpose, and the danger can be heard and felt before any blood.
- README and DESIGN.md match the new behavior.
