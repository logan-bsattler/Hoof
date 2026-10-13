# Notes: Nate the Hoof Guy live Q&A

Source: "Nate the Hoof Guy is live! Ask me anything!", YouTube livestream, 97 min
(https://www.youtube.com/watch?v=4paUJHxQS70). Nate is a full-time Wisconsin trimmer with 23 years in the trade.
Read from YouTube's auto-generated captions on 2026-10-12. These are paraphrased notes, not a transcript:
the wording is ours, and timestamps point back to the video. Like the other references, use it to check
facts, not as copy.

## Checks against the game as built

| What Nate says | Where it touches the game | Verdict |
|---|---|---|
| Problems show up in four places: the white line near the heel (most common), the corners of the toe triangle on the outer wall, the inner (axial) white line (rare), and the usual ulcer site. A mark in the middle of the sole is almost never trouble. The exception is a puncture, which stands out because it is too regular: a straight line or a perfect circle. (1:22:11) | Decoy placement in `conditions.js` (`place`, decoy kinds) and the white-line tract site (`placeTract`) | Decoys in mid-sole fit this. **Idea:** a puncture decoy kind that is regular in shape, so the player learns "regular = foreign object". Check that the white-line entry can also sit at the toe-triangle corner, not only on the abaxial wall at y 370–415. |
| You can tell which claw has the problem from the swelling. (1:23:39) | The read phase | **Idea:** a visible swelling cue on the bad claw, as a hint that the testers then confirm. |
| Sole horn cuts like a hard rubber tyre. The wall is more like hardwood. (46:48) | Tool resistance in `tools.js` | Check that the wall resists more than the sole. If the wall and sole share one rate, the wall should be clearly stiffer. |
| He judges toe length by the white line and the sole thickness, not by measuring. Drawing blood around the toe means the sole is too thin. When in doubt, leave more. (1:17:21) | The tutorial and the step-1 copy | This matches the game's "pink means thin" rule. A tip line could say the white line is your gauge. |
| You can't really cut through the white line at the toe. As you pare, the visible line moves, because the true junction sits further up inside the foot. Cutting it means blood. (36:01) | The HoofArt white line during step 1 and step 2 | Worth an eyeball check: does the drawn white line move as the sole is pared, or stay painted in one place? |
| He uses the Kansas, or natural, method: an even sole thickness across each claw, sized to that cow, and very little modeling. The Dutch method (the game's five steps) sets a standard toe length, lowers the inner claw to match the outer one, then models. Modeling is right for Dutch and mostly not needed for natural. (22:05, 1:09:32) | The whole step model (`steps.js`) | No change needed: the game teaches Dutch, as the AHDB references do. **Possible tweak:** if the toe-length target is one fixed number, scale it with the cow's foot size. Nate's complaint about Dutch is that a big foot gets the same toe as a small one. |
| Both claws bad: no block, because a block loads the other claw. Wrap the foot and send her to a soft hospital pen near the parlour instead. (10:37, 1:15:39) | Block rules (`requires.block`) | **New case idea:** lesions on both claws, where gluing a block is the mistake (Restraint −). The right call is wrap + "hospital pen". |
| Rubber blocks by default, for the cushion. A wood block is for stability, when a cow keeps rocking back onto her heels (toe necrosis, axial fissures). Rocking back for too long can stretch tendons for good. (5:15) | `placeBlock` (one block type) | **Idea:** two block types once a stability case exists. Not worth it before then. |
| Glue needs at least 3 minutes. He feels for heat and waits until it's gone, and the glue sets faster in summer and slower in winter. Workflow: trim the lame foot first, block it, trim the fronts while the glue cures. About 5 blocks per glue cartridge. A used mixing tip doubles as a spacer between the claws. (54:38, 1:16:00) | The block step | **Idea:** a short cure beat, with the block warm to the touch, before she can stand. Seasons could change it later. |
| Wraps knock digital dermatitis down. A well-run footbath does the rest. Tetracycline powder, the old topical, is now vet-prescription only. (38:00, 1:32:14) | DD treatment copy | Check the DD intro and plan copy don't imply the trimmer has tetracycline. |
| He rarely calls a vet himself. For something he can't fix (amputation, antibiotics), he wraps the foot and the farmer talks to the vet. (1:26:12) | Conditions and results | **Idea:** a "refer to the vet" outcome for a case beyond the trimmer (foot rot, deep sepsis), scored for recognising it, not for trimming it. |

## Game ideas, roughly by size

**Small (copy, tuning, art):**
- **Cows remember.** Cows that have been through the crush before walk straight in; young ones are skittish; a cow with a bad experience resists. (1:26:54) That suits return visits (WP7.5): a recheck cow that went off lame comes back a bit livelier, and a well-trimmed one comes back calmer. Today a returning cow keeps her temperament unchanged.
- **Heat stress.** Hot barns keep cows on their feet more, so white-line problems rise in summer. (1:20:00) This is farmer flavour now and a season modifier later.
- **Shedding.** Horn sheds through wet/dry cycling. Pasture cows shed naturally. Constantly wet freestalls and constantly dry tie-stalls don't, and the horn piles up. An overgrown foot also stops meeting the ground properly. (56:16, 1:27:59) This backs up the game's growth ranges by housing, and could go into farm intros.
- **Concrete vs grass.** Concrete has no give, so more force goes into the foot. (51:32) This matches the HOUSING notes. It's a line for Brackenford's intro.
- **The farmer's job.** Farmers sort the cows and leave you to it; a few come to chat. They call about DD outbreaks or a summer of white-line cases. (53:51, 1:19:38) This fits the visit card's farmer line.
- **Kicks.** Kicks come out of nowhere, and some cows are known for it. A cow that means it is more dangerous than a bluffing bull. (1:21:18, 1:18:11) **Idea:** the farmer warns you about a known kicker on the visit card; that cow has a high temper.

**Medium (new rules on existing systems):**
- **Knife wear.** He sharpens every day and carries 7 knives on the chute plus 12–20 spares. Sand and gravel dull them fast. Thin, worn knives do finesse work but bend or snap under heavy cuts. (50:07, 51:00) **Idea:** a sand-bedded farm where the knife dulls (resistance creeps up) until you swap to a fresh knife.
- **Footbath quality as a farm trait.** DD ranges from none in 20 years on one farm to 30 of 50 cows on a farm with no footbath. (1:33:41) This could replace Marsh End's fixed DD share: a "footbath: none / poor / good" line on the farm card that drives the DD share.
- **Heavily pregnant cow.** Don't trim a cow close to calving; trim her at dry-off. (1:29:04) **Idea:** a cow flagged close to calving, where the right call is a light trim or to skip her. This is a pure restraint test.
- **Removing blocks on rechecks.** The main reason for a recheck is often taking the old block off. (38:42) A recheck cow could arrive still wearing last visit's block.

**Large (new conditions):**
- **Toe necrosis:** non-healing, recurring, bone and tissue dying inside the toe. It needs repeat trims and a wood block for stability. (1:24:35, 5:30)
- **Axial fissure:** a crack running up the inner wall. (1:23:24)
- **Puncture:** a regular hole or line in mid-sole. (1:24:13)
- **Foot rot / foul:** infection moving up the leg, and the scariest case for the cow. The trimmer's job is to spot it and refer it. (15:44, 1:25:38)
- **Reverse corkscrew claw:** newer, within the last 10–12 years. (52:29)

## Route and economy flavour

- **Workload:** 40–50 cows a day (160–200 feet), 60 on a heavy day. Only 1 foot in 20 to 1 in 40 has a real problem. (4:21, 1:05:41, 1:14:37) The game deals far more lesions than that, which is fine for a game, but routine-heavy early farms are true to life.
- **Price:** $14–15 per cow for maintenance, with blocks and wraps extra; about $16–17 a cow on average over a year. (13:45) This would be the anchor if the game ever pays in money as well as reputation.
- **The route:** about 25 farms, most within 20–40 minutes of home, plus one 2.5 hours away that he kept from his old route. (16:22, 1:32:01) The ideal is every farm 3–4 times a year. (1:00:10) Farms are getting fewer and bigger. The big ones monitor activity and rumination, so problems get caught earlier, and some hire in-house trimmers. (44:13)
- **Records:** paper and pen, plus a recheck list. (38:00, 58:03)
- **Learning the trade:** cadaver feet, then years beside a mentor trimmer. No licence is needed, and short courses of 3–4 days exist. (7:24, 27:04, 1:19:16) This could frame the tutorial as a mentor's first lesson.
- **Weather:** he has trimmed at −26 °F (−32 °C). Glue is slower in the cold. (1:35:26)
- **Gear:** the chute has a comealong behind and guards on the front legs, so kicks are rare. He flips the grinder's carbide inserts every day. He dislikes the grinder's noise, and horn dust ends up in his nose. (32:45, 1:06:18, 13:05, 1:04:47)
