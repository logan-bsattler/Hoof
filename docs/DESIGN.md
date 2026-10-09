# TRUE HOOF: design spec (distilled)

Source: [`design-concept.html`](design-concept.html) (full concept v1, 8 Oct 2026).
This file is the working spec. It covers what we're building toward and what the MVP implements.

## Fantasy & tone

You're a travelling bovine podiatrist. A patient cow, one caked hoof presented. You read what's
wrong under the mud and overgrown horn, choose the right tool, and restore a flat, balanced,
weight-bearing surface so she walks off sound. The feel to aim for is the Nate-the-Hoof-Guy register: calm,
methodical, informative, quietly triumphant. (He's inspiration only; there's no licensing deal.)

**Anti-cheese principle:** this is not a pimple-popper. It rewards judgment, not gross-out or
tapping. Respect for the animal is a design constraint, and drawing blood is always a failure.

## Pillars

1. **Read before you cut.** Each hoof is a diagnostic puzzle.
2. **Tactile, not twitchy.** Swipe to pare, scrub to clean, hold to grind.
3. **Balance is the win state.** You can finish a hoof and still have done it wrong.
4. **Do no harm.** The corium is a hard boundary. Caution beats aggression.

## Core loop

Intake → **Clean** (reveal) → **Diagnose** (testers) → **Trim** (five steps) → **Treat** → **Resolve** (walk-off).
A case runs 60–120 s, and a farm visit chains 3–5 cases.

## Five-step backbone (AHDB Dutch method)

| Step | Real protocol | In-game |
|---|---|---|
| 1 | Measure/trim first (inner hind) claw: toe ~8 cm, sole ~7 mm, don't touch heel | Nip to trim line; level sole to target band |
| 2 | Match the outer claw to the inner | Balance beam → LEVEL |
| 3 | Dish out behind the axial wall; avoid toe triangle | Guided channel; triangle = no-cut |
| 4 | Relieve affected claw; block the sound claw | Open lesion; block placement (wrong claw = headline mistake) |
| 5 | Remove loose/undermined horn | Knife flicks only flagged loose horn |

Golden rule: *avoid over-trimming; always err on the side of caution.*

## Tools (full set)

Wire brush, hoof knife, nippers, grinder (+discs), rasp, hoof testers, block + glue, spray/topical.
Each does one job well and the wrong job badly. Picking the tool is the decision.

## Scoring

Balance 35%, Correctness 30%, Restraint 20%, Finish 15%. **Speed is never scored.**
Fails and penalties: drawing blood (hard fail), over-thinning the sole, cutting the toe triangle/axial wall,
blocking the wrong claw, removing healthy horn. The grade tiers are Sound, Clean and Textbook.

## Juice

The reveal, the clean pass ("forbidden parmesan" shavings), the pressure release, the walk-off.
The audio leans ASMR: understated, never arcade-loud.

## Progression (later)

Apprentice (brush, knife, nippers; overgrowth) → Trimmer (grinder, rasp, testers; first lesions)
→ Specialist (blocks, spray; therapeutic 4–5) → Pro (compound pathologies, minimal assists).

## Monetization (later)

Premium unlock first; opt-in rewarded ads only; cosmetics; case packs. No energy timers, no interstitials.

---

## MVP v0.1: what's implemented

**One full case end to end: Case B "Pressure Point"** (sole ulcer, outer claw, left hind).
It was chosen because it exercises every system: reveal, diagnosis, all five steps, the block, and pressure release.

| Area | Implementation |
|---|---|
| Hoof model | 84×120 cell grid over two claws; per-cell sole thickness, mud, roughness, loose horn, blood; zones for wall, white line, heel, dish, toe triangle, ulcer, dead toe |
| Tools | 9: brush, testers, nippers, grinder, knife, rasp, block, spray bottle, pad + wrap |
| Gestures | Scrub (brush/rasp), press-hold-pull strip (knife), press-hold-glide (grinder/spray), tip-first tap/drag bite (nippers; all-or-nothing per bite), tap (testers/block/pad + wrap) |
| View | Sole facing the camera, heel bulbs at the top, toes pointing down (the trimmer's view in the chute) |
| Guided run | Optional coached first trim: 13 beats, each with a tool, an on-hoof target outline, one instruction and a progress bar |
| Treatment | Flush the opened ulcer with the spray, then pad and wrap it; fresh paring washes out the flush |
| Reveal | Mud hides the bruise-coloured ulcer patch until scrubbed |
| Diagnosis | Testers spring on the lesion, then you pick from 4 diagnoses; wrong picks are explained |
| Steps | Live checklist (clean, read, five steps, finish, treat) with per-step tips and a suggested tool |
| Feedback | Thickness colour ramp, mm gauge, balance beam, toe-length gauges, near-target resistance, thin-sole warnings |
| Hard fail | Any living cell cut to 0 mm: flinch, moo, blood, case failed |
| Scoring | Weighted 4-part score + teaching notes; gait (sound/tender/lame) drives the walk-off |
| Juice | Curled shavings, mud clods, grinder dust, flakes, release puff, screen shake, procedural WebAudio SFX, vibration on supported devices |

### Deliberate simplifications

- "Lower the affected claw" (step 4) is folded into the block: the height difference comes from the block.
- Toe length is modelled as removing the dead overgrown toe beyond the trim line, rather than a drag-to-measure overlay.
- No two-finger rotate; the sole view shows everything needed for this case.
- Numbers (7 mm sole, 4.5 mm dish) are AHDB-derived design targets, tuned for feel in `src/config.js`.

### Next up

1. Case A (overgrowth only, apprentice tools) and Case C (embedded screw); per-tool practice drills.
2. Case select + farm visit (3–5 cases) + herd mobility score.
3. Art: real cow sprite (the layered horn renderer is done; see docs/ART-DIRECTION.md).
4. Recorded ASMR audio + optional narrator.
5. Capacitor wrap for iOS/Android; haptics via native plugin.
