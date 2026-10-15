# TRUE HOOF: design spec (distilled)

Source: [`design-concept.html`](design-concept.html) (full concept v1, 8 Oct 2026).
This file is the working spec. It covers what we're building toward and what the MVP implements.

## Fantasy & tone

You're a travelling bovine podiatrist. A patient cow, one caked hoof presented. You read what's
wrong under the mud and overgrown horn, choose the right tool, and restore a flat, balanced,
weight-bearing surface so she walks off sound. The feel to aim for is the Nate-the-Hoof-Guy register: calm,
methodical, informative, quietly triumphant. (He's inspiration only; there's no licensing deal.)

**Anti-cheese principle:** this is not a pimple-popper. It rewards judgment, not gross-out or
tapping. Respect for the animal is a design constraint: drawing blood always costs. One small nick
caps the grade at Sound; a second nick or a deep cut fails the case.

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
Fails and penalties: drawing blood (a first small nick caps the grade at Sound; a second nick or a deep cut fails), over-thinning the sole, cutting the toe triangle/axial wall,
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
| View | Sole facing the camera, heel bulbs at the top, toes pointing down (the trimmer's view in the chute). Desktop shows the whole 400×720 scene letterboxed. On phones (≤ 860 px) the camera zooms onto the hoof, the HUD becomes a compact strip across the top, and the barn scenery extends past the scene edges to fill the width. The walk-off always uses the whole scene. |
| Guided run | Optional coached first trim: 13 beats on the first ulcer cow, 9 on the routine first cow (a firm mark tested, no open/block/flush/wrap), each with a tool, an on-hoof target outline, one instruction and a progress bar |
| Treatment | Flush the opened ulcer with the spray, then pad and wrap it; fresh paring washes out the flush |
| Reveal | Mud hides the bruise-coloured ulcer patch and the decoy marks (a dark stain, a reddish bruise) until scrubbed; decoys trim off with the surface horn |
| Diagnosis | Testers spring on the ulcer and read firm on decoys. Commit read (available after the first finding) lists what was tested, then you pick from 4 diagnoses; wrong picks are explained, and the plan is shown after a misread only in the guided run. Committing without testing the ulcer scores as an unread lesion |
| Cases | Case A hand-built routine trim (#132, left hind, the road's first cow) and Case B hand-built (#214, left hind, cow 2) plus `makeCaseB(seed)`: left or right hind (mirrored layout), per-claw overgrowth, ulcer position/size/claw, heel-horn position, decoys. Best grade per case kept in localStorage |
| Steps | Live checklist (clean, read, five steps, finish, treat) with per-step tips and a suggested tool |
| Feedback | Thickness colour ramp, mm gauge, balance beam, toe-length gauges, resistance easing in over the last 1.5 mm above target, grinder pitch/whine and haptics that tighten as the sole thins, thin-sole warnings |
| Blood | Living cells cut to 0 mm. First stroke that bloods ≤ 3 cells is a nick: flinch, moo, one drop, the tool comes off, grade capped at Sound, Restraint −40. A second nick or a deeper cut: case failed |
| Scoring | Weighted 4-part score + teaching notes; gait (sound/tender/lame) drives the walk-off: a weight-test beat, a 4-beat walk and an AHDB mobility score (0–3) |
| Juice | Curled shavings, mud clods, grinder dust, flakes, release puff, screen shake, CC0 recorded SFX with procedural grinder/rasp loops (and procedural fallback), vibration on supported devices |

### Deliberate simplifications

- "Lower the affected claw" (step 4) is folded into the block: the height difference comes from the block.
- Toe length is modelled as removing the dead overgrown toe beyond the trim line, rather than a drag-to-measure overlay.
- No two-finger rotate; the sole view shows everything needed for this case.
- Numbers (7 mm sole, 4.5 mm dish) are AHDB-derived design targets, tuned for feel in `src/config.js`.

### Next up

1. Case A (overgrowth only, apprentice tools) and Case C (embedded screw); per-tool practice drills.
2. Case select + farm visit (3–5 cases) + herd mobility score.
3. Art: real cow sprite (the layered horn renderer is done; see docs/ART-DIRECTION.md).
4. Optional narrator; a fuller ASMR mix tuned by playtest (the CC0 recording pass is done, see audio/CREDITS.md).
5. Capacitor wrap for iOS/Android; haptics via native plugin.
