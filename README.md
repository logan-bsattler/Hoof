# TRUE HOOF

A calm, craftsmanlike cattle hoof-trimming game (working title). You're a
travelling bovine podiatrist: clean the caked foot to reveal what's hiding,
read it, then pick the right tool in the right order to restore a flat,
balanced, weight-bearing surface, so the cow walks off sound.

Scoring rewards **balance, correctness and restraint, not speed**. Cutting into
the corium and drawing blood is a hard fail.

- Full design concept: [`docs/design-concept.html`](docs/design-concept.html)
- Distilled spec + what the MVP covers: [`docs/DESIGN.md`](docs/DESIGN.md)

## Run it

Requires Node 18+ (no `npm install`; there are zero dependencies).

```bash
npm start
```

Open http://localhost:5173. Use another port with `npm start -- --port 8080`.

It's plain ES modules, so any static file server works (for example
`python -m http.server`). Opening `index.html` straight from disk won't work,
because browsers block ES modules over `file://`.

Run the tests (Node's built-in test runner):

```bash
npm test
```

## How to play (MVP: Case B, "Pressure Point")

One full hoof case: a Holstein's left hind foot with a hidden sole ulcer. The foot is shown the
way a trimmer sees it in the chute: sole facing you, heel bulbs at the top, toes pointing down.

New players should pick **Guided first trim** on the opening card. It coaches the same case in
13 small beats: each one picks the tool, outlines where to work, gives one instruction and shows
a progress bar. **Lift the foot** plays it unguided.

| Step | What you do | Tool |
|---|---|---|
| Clean | Scrub the mud off. The dark patch only shows on a clean foot | 🖌️ Wire brush |
| Read | Tap the dark patch, then commit to a diagnosis | 🧪 Hoof testers |
| 1 | Inner claw first: nip the overgrown toe from the tip back to the dashed line, level the sole to ~7 mm | ✂️ Nippers, ⚙️ Grinder |
| 2 | Match the outer claw until the balance beam reads LEVEL | ⚙️ Grinder |
| 3 | Carve the dish along each claw's inner edge (dashed channel), staying out of the toe triangle | 🔪 Knife |
| 4 | Pare the loose horn off the ulcer (pressure release), then glue the block on the **sound** claw | 🔪 Knife, 🧱 Block |
| 5 | Flick off the curl of loose heel horn | 🔪 Knife |
| Finish | Rasp out the grinder swirls | 🪵 Rasp |
| Treat | Flush the opened ulcer, then pad and wrap it. **Release the cow** and watch her walk | 🧴 Spray bottle, 🩹 Pad + wrap |

**Controls:** mouse or touch. Tap a tool (or press keys `1`–`9`).
- **Brush and rasp:** scrub back and forth.
- **Hoof knife:** press, hold and pull. It bites once pulled and takes off a strip of horn.
- **Grinder and spray bottle:** press, hold and glide.
- **Nippers:** tap or drag to bite, working from the tip of the toe back toward the hoof. Each bite
  takes all the dead horn beyond the jaws, or nothing if that's more than one bite can hold.
- **Testers, block, pad + wrap:** taps.
- `G` toggles the guided lines and `M` toggles sound.

**Reading the hoof:** horn colour tracks sole thickness: weathered yellow-brown when overgrown,
cream at target, pink when thin. With guides on, a mm gauge follows the cursor. Cuts slow down as you
reach target (that's the resistance), but lingering, especially with the grinder, draws blood and ends the case.

You're graded on Balance 35%, Correctness 30%, Restraint 20% and Finish 15%, which
gives Textbook / Clean / Sound / Needs work. Notes explain what to fix. The walk-off gait
(sound / tender / lame) reflects your work.

## Project layout

```
index.html, styles.css   page shell, HUD, responsive layout (portrait/phone friendly)
src/main.js              state machine (intro → play → walk-off/fail → results), input, frame loop
src/config.js            all tunables: thickness targets, tool rates, score weights, grades
src/hoof.js              hoof model: cell grid over two claws (thickness, mud, roughness, zones)
src/case.js              hand-built case data (Case B: sole ulcer)
src/tools.js             tool definitions and their effect on the model (pure, testable)
src/steps.js             clean → diagnose → five steps → finish → treat checklist predicates
src/tutorial.js          guided first trim: coached beats with targets and progress (pure, testable)
src/scoring.js           Balance / Correctness / Restraint / Finish grading + gait
src/render.js            canvas rendering: scene, guides, coach highlight, block, dressings, HUD, cursor
src/hoofart.js           layered hoof material: horn, stain, manure + straw, tool marks, blood
src/toolart.js           drawn tool sprites
src/particles.js         shavings, mud, dust, flakes, release puff, blood
src/audio.js             procedural WebAudio SFX (no asset files) + haptics
src/walkoff.js           the walk-off reward scene
src/ui.js                DOM tool dock, steps panel, guided-run coach card, toasts, modals
scripts/serve.mjs        zero-dependency static dev server
tests/                   node:test unit tests for model, tools, steps, scoring
```

The simulation (`hoof`, `tools`, `steps`, `scoring`, `tutorial`) has no DOM dependency and is unit-tested.
Rendering, audio and UI sit on top.

## Tech choice

A vanilla JS + HTML5 Canvas web prototype, with no build step:

- It's playable instantly on any device with a browser, and links are shareable for playtests.
- Touch and pointer events cover mouse and phone with the same code.
- It's a 2D, gesture-driven game, so a full engine (Unity/Godot) adds weight without adding feel at this stage.
- It can later be wrapped for the App Store or Play Store with Capacitor. If the art needs grow
  (layered 3D hoof, shaders), port the tested simulation core to Godot/Unity.

## Roadmap (from the design doc)

More cases (overgrowth tutorial, embedded screw, white line, DD, crack), the case select and
apprentice→pro progression, a real cow sprite, a
recorded ASMR audio pass, a narrator, and a Capacitor mobile wrap.
