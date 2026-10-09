# Art direction: match the reference footage

Reference: a Nate the Hoof Guy video, "Her Hoof was NO MATCH for the ROCKS", captured as stills
in `reference/hoof-video-capture/` (local only and git-ignored, because the footage is copyrighted;
`index.md` there describes every frame). Use the footage to study the look. **Never ship or trace
these frames**: all art must be our own (procedural or original).

Key frames: `0:15` (dirty), `1:25` (ground clean, hole + bruising), `3:45` (opened cavity),
`4:25` (block), `6:55` (healed sole), `7:55` (walk-off).

## What the current build gets wrong

| Current | Reference |
|---|---|
| Toes point **up**, heels down | Sole faces camera, **heel bulbs at the top** (toward the leg/chute), **toes pointing down**. Two tall kidney-shaped claws side by side, filling most of the frame |
| Soft, blurry 4 px cell grid | Crisp, photographic surfaces: per-pixel detail is the whole appeal |
| Uniform cream when trimmed | Ground sole is near-**white ivory** with **fine parallel striations** in the grinder's direction of travel, plus faint growth lines |
| Mud as a flat brown tint | Manure is dark brown-black, wet, glossy, **studded with straw/fibre strands**, thicker toward the heel and in the interdigital gap |
| Wall is a thin darker rim | A **thick, dark, stained wall rim** (brown/olive) stays around the ground white sole; low spots the grinder skipped stay **dark-stained islands** |
| Wooden block | **Black rubber block** with a circular-lug tread, kidney-shaped, glued to the sound claw (no brand marks) |
| Lesion = red blob | A **small dark hole** that weeps **fluid and bubbles** when found; **pink bruise streaks** nearby; when opened, an irregular **wet cavity** of peach/pink tissue with layered loose flaps, tinted **blue-green** after spraying |
| Flat background | Steel hydraulic chute parts (cylinders, bolts, a green strap between the claws), straw-littered floor, shallow depth of field |

## Tools: look and feel

- **Hoof knife:** a short hooked steel blade on a handle, drawn toward you. Peels thin translucent curls. The hand/glove is optional; the blade should be visible during strokes.
- **Angle grinder (carbide disc):** the dominant bulk tool in the footage. It takes the whole sole down to white in sweeping passes, with motion blur, a dust spray, and striations left in its path. Hitting a stone should **dull/spark** it (a gameplay hook).
- **Spray bottle:** the missing 8th tool. It flushes the opened cavity and leaves a blue-green tint. In the footage it's used **between cuts**.
- **Block + glue:** black rubber, tread out, pressed on the ground-flat sound claw, with glue squeezing out at the edge.
- **Pad + wrap:** a white pad over the treated sole, then a bright pink wrap. This is the finishing beat before release.

## Gameplay beats the footage adds

1. **The grind-to-white reveal** is the real "clean" step: brushing is minor, and grinding the stained sole to white is what uncovers the problem. Consider folding most of "clean" into the first grinder pass.
2. **Weeping hole:** tapping or opening it releases fluid and bubbles, the pressure-release catharsis beat.
3. **Opening a pocket:** pare **loose, separated layers** away around the lesion. Loose flaps lift off. **Attached tissue is off-limits**, and the lesion itself is painful, so stay away from its centre.
4. **Flush → pare → flush** rhythm with the spray bottle.
5. **Finish:** spray, block on the sound claw, pad, pink wrap, release.
6. **Recheck visit (later content):** about two weeks on, black-stained new horn that pares to white. "Dark is just staining."
7. A **stone/rock foreign body** case (this video) is a natural Case C.

## Rendering approach

Move from the blurry upscaled grid to a **full-resolution layered material renderer** (still Canvas 2D or a PixiJS/WebGL upgrade):

- Per-pixel height/thickness map at screen resolution (or 2× the logical size). The simulation grid can stay coarse for scoring; visuals need their own high-res buffers.
- Layers, top to bottom: manure + straw (decals) → stained outer horn → ivory sole → bruise → corium/lesion. Each tool removes material from the top down.
- Record **stroke direction** so the grinder and knife leave directional striations.
- Add a wet specular sheen to manure, fluid and cavity tissue, and a soft drop shadow so each claw reads as a 3D convex surface.
- Rotate the scene so the heels sit at the top. Update the zones and guides (dish, toe triangle, heel) to match.
