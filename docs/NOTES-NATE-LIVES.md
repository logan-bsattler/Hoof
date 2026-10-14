# Notes: Nate the Hoof Guy livestream Q&As (and other trimmers)

Companion to [`NOTES-NATE-AMA.md`](NOTES-NATE-AMA.md), which covers the April-ish 97-min AMA (`4paUJHxQS70`).
Sources are the auto-captions in `reference/youtube/<channel>/<videoId>.txt` (git-ignored, see
[`REFERENCES.md`](REFERENCES.md)). These are paraphrased notes, not transcript: wording is ours,
timestamps point back to the video. Check facts here; don't lift copy.

Reading status (2026-10-14):

| Video | Title | Read? |
|---|---|---|
| `sH2uF4yq-NQ` | New Years Eve Live (1:46) | **done**, notes below |
| `GdRKgQLSdj0` | "was live!" (1:28) | **done**, notes below |
| `-pwiiqClLis` | November Q&A live (1:07) | **done**, notes below |
| `YlxDlpwl3jI` | October live (1:10) | **done**, notes below |
| `VAzp_0yatQo` | early-autumn live (1:16) | **done**, notes below |
| `M8kH-MDHqN4` | Rainy Day Fireside live (1:04) | **done**, notes below |
| `sFT80Dz8if4` | "2nd Attempt" live (late summer, 1:34) | **done**, notes below |
| `vJ2U6wo1qGs` | live Q&A (early summer, 1:05) | **done**, notes below |
| `ErcTjacDKXk` | April live (1:53) | **done**, notes below |
| `bkc41RMZvAw` | March 25th live (1:18) | **done**, notes below |
| `yI8CBknFFHI` | first live, ~5 yrs ago (1:04) | **done**, notes below |
| Hoof GP Q&A lives: `RJqEruf7GlA` `Eq0QH_bXavI` `CqA6d74OAhk` `s1U8rJY06TM` `Wn4BcA5MeC0` `rQJznFgYbGA` `A4DJ4ycmKnk` `nrZwLZeXcQg` `2_NwAKOmKRo` `j-ckE4DKg2M` `t4BAzBv-CWk` | UK trimmer, 2.9M subs | not yet |
| `reference/youtube/_interviews-talks/` | 16 podcasts/talks (Cramer, Burgi, Bovine Vet podcast, Dutch method, Hoard's on Nate, Hoof GP interviews) | not yet; order in the reading plan at the end |

## Top ideas (2026-10-14, from all 11 lives)

**The headline: Nate's biggest lesson is restraint around a lesion, and the game scores restraint
on the sole but not round the lesion.** He calls leaving a ring of horn round an opened lesion his
biggest change in 23 years, and says it twice. Scoring it is the best single idea here. Next come
read-phase tests of "when to stop", then a season knob. The new conditions are worth having but
cost the most.

Tags: **[new]** not in the plan; **[extends X]** builds on built work; **[fix]** the game is wrong
or unchecked. "×n" = how many lives say it. Ranked by how much it changes play.

### Tier 1: sharpen the core skill (restraint and reading)
1. **Score the horn left round a lesion. [new; extends restraint scoring, J2]** ×2. Free the
   lesion (cut away the loose horn) but leave a ring of sound horn round it, and tidy up at the
   recheck. Stripping the surround thin cost him "she can't walk" calls whenever a block came off.
   Game: an over-thinned surround costs Restraint, and a returning cow whose surround was stripped
   arrives worse. (April 1:38:28, March 37:39)
2. **Decoys that teach when to stop. [extends decoys: `DECOY_KINDS` is stain/bruise]** ×3, one each:
   - *Fades as you pare:* a dark mark by the wall that goes after a pass or two. (NYE 1:14:13)
   - *Pigment:* black all the way through and never changes when pared. If the colour changes
     as you pare it's separation; if it doesn't, it's pigment. (March 47:30)
   - *Tempting bruise:* shaded like a track you should follow, but pink corium sits just under
     it, so paring on bleeds. (Oct 1:00:30)
   Also: an off-target dig leaves a pared hole that refills black, not just lost time (NYE 1:13:11).
3. **Toe-out stance on the walk-in. [new; `walkoff.js` animates the exit only]** ×2. On a hind
   foot with an outer-claw lesion she walks slightly duck-footed to unload it. That gives the
   player a read before the testers. (NYE 1:38:35, autumn 22:11)

### Tier 2: farm and route depth
4. **A season knob. [new]** ×6, the most repeated idea. Summer (above ~65–68 °F) means cows stand
   more, so more white line, abscesses and DD ("abscess season", July–Sept); winter is tame.
   Freeze/thaw and mud bring foot rot. Wet summers give long toes. Summer runs ~10–15% problem
   cows against 1–2% in winter. A per-visit modifier on `farmMix` would do it.
5. **Pasture deals the wrong mix. [fix]** ×4. Hollins (pasture) deals routine/white line/ulcer.
   Nate's pasture cows get rocks, punctures, sticks between the claws and foot rot, plus DD, but
   *fewer* ulcers (except after a spring grass flush), and almost never toe necrosis. Swap Hollins's
   ulcer share for puncture. (Pasture videos: 2nd Attempt 35:27, 1:19:38; Aug 31:25; Oct 5:01)
6. **Ulcer cows come back; white-line cows don't. [extends 7.5 returning cows]** ×2. Ulcers
   recur because the pedal bone grows spurs; white lines and abscesses are one-offs. Weight
   `returningCows` toward old ulcer cows. (NYE 1:42:06, Nov 17:05)
7. **Abscess stage: sealed or already burst. [new, art + copy]** ×2. Sealed: pus squirts when
   opened and she walks out better at once. Burst: a dry track and little pus. (GdRK 1:11:20,
   vJ2 49:18)
8. **More uses for the 13.2 swelling. [extends 13.2/13.3]** ×4. A mid-sole puncture shows
   swelling (yI8 3:55). Swelling climbing above the hoof means the vet now (Oct 1:07:51). A swollen
   claw gets a double or thick block on the sound claw (Nov 5:27, Aug 27:32). Worth a line in
   13.3's copy and a later variant.

### Tier 3: new conditions (each roughly a 13.x-sized piece)
9. **Sole fracture. [new]** ×2. An angled tear at the sole/heel-bulb seam, mostly on the *rear
   medial* claw, caused by shear (a hard turn). It looks like an ulcer but sits too far back on
   the wrong claw. A strong "where" test for the read. (GdRK 37:17, vJ2 57:12)
10. **Pressure cow where a block *is* the call. [new]** ×2. A three-legged cow with no open
   lesion, just redness through the claw: trim and block, and she walks out sound. The
   counterweight to "red means leave it". (Oct 32:47, 2nd Attempt 1:21:49)
11. **Corkscrew claw, as a chronic farm trait. [already a WP7 "later candidate"]** ×5. Rear
   lateral, twisted, mostly beef and pasture; rebalance it, and it comes back.
12. **The odd claw. [new]** ×1. Bigger from an old pedal-bone injury: trim it to its own shape,
   because trimming it to match the other claw is the mistake. (Nov 50:10)
13. **A bull. [new]** ×4. Thin soles from mounting, rubber blocks on both claws as an exception to
   the no-block rule, and a chute-time limit (a thick neck held long can pinch the radial nerve).

### Fact checks (done 2026-10-14, by reading the code)
- **Pass:** ulcers, white lines and toe necrosis land on the big claw: outer on a hind foot, inner
  on a front (`v.big`, `case.js:116`). That matches Nate's rear-lateral and front-medial rule.
- **Pass:** step 3's copy doesn't claim the dish keeps muck out of the cleft (Nate doubts it).
- **Note, no change:** the game's 7 mm target sits at Nate's ¼ in floor; he aims for ⅜ in
  (~9.5 mm). 7 mm is the textbook figure, so keep it, but don't call it "plenty" in copy.
- **Unchecked:** step 2 should never force a claw shorter than its own safe length to match
  the other (Aug 45:12). A recheck shouldn't reward paring away healed black stain (March 58:34).

### Copy lines worth taking (paraphrase, don't quote)
Thin sole flexes like a magazine, a thick one is rigid like a hardback (Nov). Corium is soft like
a marshmallow (Aug). Red at the surface is a month old (NYE). A trim costs about a penny a pound
of her value (Aug). A treated cow gets a leg band and goes in the computer before her shot (GdRK).
"Farmer math": told 10–15 cows, expect 25 (vJ2). Take your time, treat each cow as your own, stay
calm (vJ2).

## New Years Eve Live, `sH2uF4yq-NQ` (Dec 31, 1:46)

### Checks against the game

| What Nate says | Where it touches the game | Verdict / idea |
|---|---|---|
| Problem cows are 1–2% of what he trims; in winter maybe 1–2 a day, many more in summer (abscesses, DD). (7:06, 14:08) | Deal rates per farm | Confirms the AMA's 1-in-20-to-40 feet. A **season** knob (summer = more white line + DD) has two sources now. |
| Don't chase every mark. Most sole marks are wear; the sole grows from the inside so the outside is meant to be damaged and shed. Check the four likely spots (upper abaxial white line, toe-triangle corner, axial toe-triangle (rare), ulcer site) first. Novices' biggest mistake is digging where the problem never is: it doesn't fix her and makes a second wound. (1:13:11, 1:20:16) | Decoys, scoring of off-target cuts | Matches the decoy design. **Idea:** an off-target dig should cost something visible (a new pared hole that fills black), not just time. |
| A mark next to the wall that goes when you pare a little is a passing flaw from a one-off slip; he leaves it rather than take wall horn to chase it, because a dug hole just refills with black. (1:14:13) | White-line decoys | **Idea:** a "fades as you pare" white-line decoy: dark at the surface, gone after one or two passes. Teaches when to stop. |
| Red in the sole is old bleeding that has grown out; at the surface it's about a month old (~¼ in of growth) and the cause (often calving, hormones loosening the pedal bone) is usually gone. (1:15:38) | Bruise art and the "bruise" call | Supports the bruise call as "leave it". **Copy line:** red at the surface = a month-old event. |
| Better to stop, release pressure and recheck in a couple of days than dig into corium you're unsure of. Under-trimming only costs a second trim; over-trimming hurts. Keep sole as thick as the angles allow. (1:22:00, 1:23:04) | Scoring asymmetry, rechecks | Confirms Restraint scoring. Under-done should be cheaper than over-done. |
| Paring horn doesn't hurt (like a fingernail); the corium underneath does, and that's why she limps. (2:49) | Tutorial copy | Fine as is. |
| Wall regrows hairline-to-ground in about 15–18 months, so he avoids removing wall unless he must. (11:42) | Wall cuts / recheck timing | **Copy line** for the wall-resistance tip; also a reason a wall resection should score as a cost. |
| Toe necrosis: his view is inside-out (lost blood flow to the pedal-bone tip), not outside-in. Almost never in pasture cows, nearly always freestall. About half the pedal bone dies and then it stops. Hardest lesion to trim: tunnels, jagged edges, horn growing mixed into corium. Bone doesn't regrow, only remodels. Losing the toe's laminar attachments shifts load to the heel, so these cows also bleed at the ulcer site. (14:49, 35:33, 1:23:46) | `toenecrosis` case | **Ideas:** a faint ulcer-site bruise as a secondary sign on toe-necrosis cows; mark toe necrosis as freestall-only in farm decks. |
| Rear feet: problems are usually lateral. Front feet: usually medial. Newer "reverse corkscrew / medial claw syndrome" flips the rear load onto the medials. (20:52) | Which claw carries the lesion | **Check** front-foot cases put lesions on the medial claw. |
| Corkscrew claws can be improved but rarely made perfect; the fix is a shorter trim interval. (23:23) | New condition | **Large idea:** corkscrew as a farm-trait/recheck condition rather than a one-visit lesion. |
| A cow on an organic farm had a block replaced every 6 weeks for ~2 years instead of an amputation; fine while the block was good, sore as it wore. (24:49) | Rechecks, blocks | Flavour for a returning cow that keeps needing a block. |
| DD: he sprays knives after a DD foot, but studies found trimmers hardly spread it; it needs a break in the skin. A badly dosed footbath can crack skin and *cause* DD. (26:18) | WP12.3 footbath trait | **Idea:** footbath "too strong" as a fourth quality that also raises DD. |
| Antiseptic: chlorhexidine, not iodine (iodine dies on contact with manure, blood, pus; chlorhexidine binds keratin and lasts hours). Green antibiotic spray needs a protocol; he avoids antibiotics on corium. Salicylic acid: a 10 lb bag lasts ~8 months; mixed into the DD paste; summer use is far higher. (6:02, 14:08) | Treatment copy | Check the spray/paste naming in copy fits "chlorhexidine + salicylic paste". |
| Max two blocks on one cow (maybe three once). Both fronts = a pasture cow, about August. Both backs = tie-stall or freestall. (50:20) | Two-block cases, farm decks | Ties a two-front-block case to pasture farms in late summer. |
| Lesions on both claws are rare: a lateral white line makes her shift weight to the medial, which ulcers. Catching the first lesion and blocking with rubber prevents it. No block when both are bad. (1:34:45) | J3 both claws | Confirms the J3 story and gives the cause for its intro text. |
| Same cow, same problem: white lines are one-offs and rarely recur. Ulcers recur because the pedal bone grows little bone spurs and enlarges (up to ~2x); toe necrosis recurs too. (1:42:06) | Rechecks / repeat cows | **Idea:** a returning ulcer cow on a later visit; white-line cows don't come back. |

### Cow behaviour and handling
- Calm handler, calm cows. They don't love the trimmer, but they aren't wild either. (49:38)
- Cows look back as they leave the chute. (36:16)
- He trims the left front last, walks round the front to release her on the right side, writes her number there; cows wipe their noses on him as he passes. (35:10) **Small art/copy beat.**
- Jerseys: stubborn going in, nosy once done: lick the chute, pull at grinders. Brown Swiss: big Jersey, own mind. Holsteins easiest (chute built for them). Beef cows are hard only because they're short and stocky for the chute. (43:23, 1:28:59, 1:33:17) **Breed temperament idea** for farm decks.
- Bulls: thick necks need the headgate widened; if held too tight they can get radial-nerve damage and go down in front, so he loosens the rear push gate and works fast. A tilt table is safer for bulls. (1:40:20, 1:44:15)
- Gates 8 in taller stopped cows trying to jump them. (1:12:28)
- Cows hide lameness. Look for foot placement: toes turned out to unload the medial claw, slower walk, not a dog-style limp. That's mobility scoring. (1:38:35) **Read-phase idea:** gait/stance cue on the walk-in.

### Farm, route, trade
- Starts trimming heifers at 20–22 months / ~1000 lb, just before first calving; calves rarely need it. (9:12, 1:39:58)
- Farm detective work: four or five heifers with the same right-rear cut traced to a rusted hole in a vaccination tub; repeated sole marks traced to a cut-off post under parlour rubber. Nails and screws after construction work. (1:00:00) **Event idea:** "same mark on several cows today" -> the player flags it to the farmer.
- Feed: too much energy or protein shows in feet (laminitis signs); he and the nutritionist and farmer have to talk it through. (1:05:03) **Farm-trait idea.**
- Workload: 30–50 cows a day, record 79; one farm a day; maintenance cows out in 5–6 min, a block cow 8–10 (he trims the other three feet while glue sets). Glue bears weight after ~3 min. 5–6k head on the books, 8–10k trims a year. (2:06, 12:45, 1:11:02, 1:36:29)
- Schedule: small herds (50–70) twice a year in spring and fall (icy yards in winter); his 1100-cow farm has a trimmer weekly (he goes every other week); others every 2/3/4/6 weeks. Same weekday so the farm can sort cows. Herds moved to three trims a year never go back; he expects every 2–3 months eventually; "balance" is underrated. (41:17, 45:47, 46:30, 51:42)
- Price: raised $1/cow in 20 years; biggest cost is fuel; profit comes from speed. Chute was $61k new. (9:56, 49:16)
- Gear: Bosch grinders, three running on the chute plus one with an abrasive disc for prepping blocks; brushes last 8–10 months. Face shield, not glasses (debris flung round corners, fogging). Knives sharpened on a rubber abrasive wheel then a leather strop wheel. (36:36, 38:50, 1:18:47)
- Injuries: knife into thumb on a wet day; running grinder laid on his arm when another cow came down the lane and they both went out the side door; a cow stepped back on his leg in the pen (three weeks off). (30:10, 32:18)
- Heat: cows are too warm above ~65–70 °F. (52:46)
- Farmers hand out creamery cheese at year-end. Most farms ask him to film their cows. (52:04, 54:39)
- Training: farm kid, worked on a dairy in college, helped their trimmer, then 3 months of daily trimming with a mentor in Minnesota. Starting out you do 3–4 cows an hour. (19:42, 1:10:41, 1:36:09)
- Vet calls: antibiotics, surgery, anything above the hairline. He got a toe-necrosis cow *from* a vet because his chute restrains better. (18:19, 1:37:31)
- Natural vs Dutch: he prefers natural/Kansas/balance; Dutch cuts the foot flat to the world, leaving the abaxial sole thinner than the axial ("tabletop") so it needs a big model; Dutch is easier to teach; sand wears a Dutch foot faster -> thin soles. (1:25:32) Relevant to WP12.4 sand and WP13.1 thin sole.
- Shedding: wet/dry cycling on pasture sheds old horn; constantly wet (freestall) or constantly dry (tie-stall) feet don't, so toes grow long and heels drop; long winter toes can snap at the wrong point in spring. (1:30:05)

## "Nate the Hoof Guy was live!", `GdRKgQLSdj0` (winter, 1:28)

### Checks against the game

| What Nate says | Where it touches the game | Verdict / idea |
|---|---|---|
| Both claws bad: no block on either; carve relief so there's sole round the lesion, wrap, and move her to a bedded pen near feed and water. (1:03, 17:20) | J3 both claws | Confirms J3's "pen" call again. |
| Wraps are meant to come off in 3–5 days; front-foot wraps tend to get left on because they're awkward for farm staff. (35:29) | Wrap step / rechecks | **Idea:** a recheck cow whose front wrap was left on too long (he has a video "This WRAP was on TOO LONG", `XIYG3I-Rx-E`). |
| Rubber blocks always, never plastic: soft, moves as she walks, still lifts the claw. Wood only for stability (toe necrosis, axial fissures) when she rocks back on her heels and the deep flexor tendon stretches. (27:18) | Block types | Repeats the AMA; settles "rubber vs wood", no plastic. |
| Sole fracture vs sole ulcer: the ulcer sits at the usual site under the flexor tuberosity (pedal-bone pressure). A "sole fracture" sits further back, mid-claw near the heel, and runs in at an angle, like the heel horn shearing off the sole after a bad landing. (37:17) | New lesion / decoy | **Idea:** a heel-ward angled crack that looks like an ulcer but sits too far back. A good read-phase test of *where*. |
| Bulls: thin soles are their typical problem, because their work wears the feet down. Trimming is otherwise the same. (36:32) | WP13.1 thin sole | **Idea:** a bull in the thin-sole case. |
| An untrimmed foot: toe grows, the angle drops, more pressure on the pedal bone, more ulcers. Freestall cows left untrimmed are "basically guaranteed" sore; pasture cows shed and mostly trim themselves; old stanchion-barn cows grew dry toes over a foot long and high-step after a trim. (25:32, 39:26) | Overgrowth by housing | **Art/animation idea:** a long-toed tie-stall cow that high-steps out of the chute. |
| Hoof hardness depends on what she stands on, not the bedding: concrete keeps feet wetter, dirt and sand drier. (7:08) | WP12 farm traits | A "wet vs dry floor" knob could drive knife resistance per farm. |
| Heat slows healing: hot cows stand more to shed heat, so lesions take longer. Cold doesn't matter. In deep winter cows lie down as they should and foot problems "pretty much disappear" except DD. (18:26, 34:05) | Seasons | Strengthens the summer modifier. |
| Lesions inside the claw hurt; the hard outer horn doesn't. Touch the corium and she pulls her foot. (19:08, 32:43) | Pain feedback | Matches the game's flinch/Restraint. |
| Weirdest find: a rusted-off pipe about 6–8 in wide that she stood on, embedded across both claws, with little damage. (15:14) | Foreign body art | Fun one-off foreign body. |

### Handling and process
- Loading: never isolate a cow. A pen of ~5 feeds a staging lane of ~3 with a chain behind the last; as each cow leaves the chute the next sees her go and walks in. A cow that refuses and starts jumping gates (and has no foot problem) is best let go and done another day, since she can hurt herself. (23:25) **Idea:** a refuse/skip option for a sound but frantic cow.
- Scariest trims: a cow not secured properly who tips forward or back with a foot up, and anything slow in a bull (nerve damage). (21:39)
- Cows remember a traumatic trim, so keep the process calm. (14:11) Supports WP12.1.
- Knives: 7 on the trailer, a box of ~10 spare used only on sand/rock days. Thin blades for delicate work round lesions, thick ones for rough trimming. Double-edged, so either hand and no switching. Chlorhexidine spray on knives after any problem cow. (3:15, 9:34, 33:23)
- Doesn't wash feet first: wet hands and gloves are how he cut himself (through glove and finger). (35:07)
- Chute washed every day: pressure-washer at home in summer, car wash with hot water in winter. Setup and teardown ~15–20 min each. (2:52, 18:26, 41:16)

### Farm, route, trade
- Antibiotics are the farm's and vet's job, never his: a treated cow's milk going into the tank wastes the whole tank. One farm wouldn't let a foot-rot cow get her shot until a leg band was on and she was entered in the computer, which flags her at milking. (11:24) **Flavour line / J-case idea:** foot-rot referral ends with "leg band on, logged".
- He lost one cow to foul spreading up the leg, 20+ years ago. Regular visits catch things early. (14:31)
- Trim timing: at least twice a year, split around dry-off and mid-lactation. Herds under ~50 done in one day twice a year; emergencies mostly come from these twice-a-year herds. (15:55)
- About 25 farms, nearly all within 30 min, all in Wisconsin; the older small farms are slowly going. Longest customer 22–23 years. ~15 beef cows a year. (26:56, 32:22, 38:44)
- Vets mostly send hoof work to him. (20:32)
- Cow value roughly $1,500–4,000 (pregnancy and lactation stage matter); prices high now. (46:02)
- Trained as a paid apprentice: 3 months alongside, then trimming with the mentor watching to catch his mistakes. (8:10)
- Hands go numb after long spring/fall stretches; neck pinched nerve left a numb thumb. Son helps in summer, alone in winter. (28:43, 40:34)

### Second half (47:00–1:28): checks against the game

| What Nate says | Where it touches the game | Verdict / idea |
|---|---|---|
| Sole depth: beginners read the "pith", a layer of dried-out horn; in freestall feet it isn't even, so you read it as you go. Too thin a sole flexes and squeezes the corium. (1:01:09) | Step 1/3 thickness cue, WP13.1 thin sole | The game's pink-means-thin cue does this job. **Copy idea:** name the chalky, dry layer as the "still safe" sign before pink. |
| Following a lesion: there's always a little shading to follow; the knife's hook lifts the loose horn away along the line of separation. (1:01:09) | Lesion paring (`drain`, `step4`) | Matches paring a track by its darker shading. Fine. |
| Toe: always leave at least ~¼ in off the tip; cutting the true white line at the toe draws blood because its growth point sits well up inside. (51:48, 52:50) | Step 1 toe length | Repeats the AMA (36:01). |
| His "modeling" is shallow: a uniform, adequate sole that can't flex, so only the pedal bone's downward movement is left to cause ulcers. He doubts modeling keeps muck out of the cleft. (1:12:44, 1:16:59) | Step 3 dish | Repeats the AMA's Kansas-vs-Dutch point; the game's step-3 copy shouldn't claim the dish "keeps the cleft clean". |
| Juicy vs dry abscesses: catch it while sealed and pressure builds, so it bursts; if it broke out by itself the fluid has already gone. (1:11:20) | White-line `drain` / puncture `funnel` pus | **Idea:** per-cow abscess stage: "sealed" (pus squirts when opened) or "already burst" (dry track, little pus). Art + copy only. |
| Least favourite lesion: axial fissures, between the claws and hard to reach from his chute. He'd rather do toe necrosis. (47:51) | D20 dropped the axial fissure for double sole | Confirms they're hard and rare; keeps them off the list. |
| Vertical wall cracks up the front face are mostly a beef-cow problem; he rarely sees them. (1:04:24) | Wall cracks | Only worth a case on a beef farm. |
| Pedal-bone tip breaking through the sole takes 5–6 months to heal, and cows cope surprisingly well. Corium can die along with bone in toe necrosis, so some never regrow horn. (57:35, 1:11:00) | `toenecrosis`, rechecks | Flavour for a returning toe-necrosis cow. |
| Maggots in summer, on organic pasture herds with weaker fly control; foot lesions smell and draw flies. (50:02) | Season / organic farm | **Small idea:** a summer organic-pasture cow whose lesion has maggots in it (art + copy). |
| Each lesion has its own smell; foot rot is the worst. He floats a "smell-only" guessing test. (1:22:55) | Read phase | The foot-rot and toe-necrosis texts already use smell. **Idea:** a smell line on every lesion's probe text. |
| Copper sulfate for big callused DD lesions (gets deeper); salicylic acid for most. Dislikes Koppertox. (1:25:45) | `dress` step copy | **Idea:** a chronic, warty DD variant whose dressing is copper sulfate. |
| Chlorhexidine sprays on clear, so he can still see the lesion's horn margins; iodine stains and hides them. Works bare-handed. (1:21:08) | Spray step | Repeats the NYE live; the "see the margins" reason is a good tooltip. |
| Lameness drivers have shifted: more pressure lesions from more time on concrete, less foot rot. (1:07:43) | Deal mix by era/farm | Confirms concrete farms deal more ulcers. |

### Second half: handling, farm, trade
- He sets up straight after milking so he disturbs the cows' day least; a farm that isn't disrupted has him back more often. (46:45)
- A bull that lifted a gate, bent the chains and then went over the top was left untrimmed: if he can jump gates his feet are good enough for now. (56:06) Repeats the refuse/skip idea above.
- Old setup: reaching under to hook a hind leg left him in the firing line when she dunged. (48:34) Flavour.
- Was stepped on in a pen, kept working, and got compartment syndrome in the swollen foot. Kicks were far more common when he moved cows one at a time. (1:07:21, 1:08:27)
- Power rasp only to rough the claw before a block. (56:48) Matches the `rasp`/`block` order.
- Floors stay wet: a cow drinks ~50 gal and eats ~100 lb a day; alley scrapers run hourly and the floor is still wet; scraping while cows lie down gets them up, which is worse. (59:01) Line for a freestall intro.
- What he points out to farmers: sharp turns in cow flow, long standing spots (feed bunk, water) that want rubber mats, slick floors that want regrooving; fixes come in stages because of cost. (1:14:31) **Idea:** a "farm advice" beat after a visit.
- Vets miss lesions sometimes because they see fewer feet; a bull a vet had checked had one Nate then found. (51:06)
- Price $14 a trim, wraps and blocks extra; ~30–50 cows a day, fewer in winter when small farms aren't on. (57:09, 1:18:22) Repeats.
- Sold his second route because hoof health was better on fewer farms he could keep on schedule; same customers 15–18 years. (1:05:10)
- Oldest cow: a Jersey with 16 lactations. (1:02:58)
- Dew claws usually shed on their own; trims them only if long. (1:19:45)
- Wishes for a machine that washes feet three times a day; with good stalls, cooling and maintenance trims he thinks lameness could reach zero. (1:06:16)

## November Q&A live, `-pwiiqClLis` (late Nov, 1:07)

### Checks against the game

| What Nate says | Where it touches the game | Verdict / idea |
|---|---|---|
| A block lifts the claw ~¾–1 in; the joint can only drop so far, so the wrapped claw stays off the ground. With swelling or an odd gait he uses a thicker block, or two stacked. Cows catch the block's toe at first, then learn. (5:27, 7:55) | `block` tool, walk-off | **Idea:** the walk-off on a fresh block could trip once on the toe. A thick/double block is a variant for a swollen foot (WP13.2). |
| Sole thickness: ¼ in is the minimum, he aims for ⅜ or more. Thin sole flexes like a magazine; thick sole is rigid like a hardback. He trims off only the dried "pith" layer and stops before the hydrated horn. (52:16, 53:19) | Step 1/3 target thickness, WP13.1 | Good tutorial analogy (magazine vs hardback). Gives the thin-sole case a number. |
| Ulcers become chronic because the pedal bone grows little jagged points underneath; abscesses, white lines and foot rot don't make a cow more prone. (17:05) | Repeat cows | Repeats NYE (1:42:06); now from two lives. |
| Sole ulcer = pressure from the pedal bone; white-line lesions are usually bacterial, though he has seen pressure ones in the white line. (44:15) | Read-card copy | Matches `FINDING` text. Fine. |
| A claw deformed by an old pedal-bone injury is bigger inside (bone remodels bulkier). Trim it to its own structure, not to look normal, or the thinned sole flexes onto damaged corium. (50:10) | New recheck/odd-claw case | **Medium idea:** an "odd claw" cow where trimming to match the other claw is the mistake (Restraint −). |
| Foot rot starts through a small break in the cleft skin; a footbath mixed too strong dries and cracks that skin. Caught early it's systemic antibiotics, and he often needn't touch the foot. (36:27, 39:58) | `footrot` case, WP12.3 footbath | Repeats the "too strong footbath" idea; extends it to foot rot as well as DD. |
| Hoof hardness is all moisture, not air temperature. Old tie-stall front feet on sawdust went "like cement", harder than any wood, more like grinding concrete; a lesion's seepage softens the horn round it. (14:17, 26:34, 36:06) | Knife resistance per farm, lesion paring | **Idea:** horn softer near a wet lesion (cuts faster), harder on dry tie-stall fronts. |
| He scratches big stones out of the sole before using the knife; hitting a rock dents the blade. (35:23) | WP12.4 sand/knife wear | **Small idea:** a stone embedded in a sand-farm sole that chips the knife if you pare over it before picking it out. |
| Where to wash: only spray a foot when it's filthy *and* corium is open; otherwise trim first, then spray just the lesion. Sawdust behind the chute dries feet as cows step in. (29:03) | `clean` step | The game's brush step is right for the usual case. |
| Corium cuts: you nick it, you don't gouge it; strokes should never be driven toward corium. (34:00) | Over-cut penalty | Fine as is. |
| Healing: worst cases take 4–5 trims over 8–10 weeks; usually 4–6 weeks until the sole bears weight and the block comes off. (58:32) | Recheck cadence (J2) | Gives J2's block-off recheck a timeline. |

### Handling, farm, trade
- Almost every cow dungs in the chute; there's a chute in the back to direct it. (24:49, 27:38, 56:07)
- He closes rear doors behind every cow now, even the last, since a cow once came through an open gate and he laid the grinder into his arm. (25:11, 27:59)
- Don't leave a single cow behind; she'll circle and won't go in alone. (28:21) Repeats GdRK.
- Wraps come in fluorescent colours so farmers see to take them off. (15:42) **Art note:** neon wrap.
- Knives disinfected only round open lesions; DD on a freestall farm is everywhere already. (15:00)
- Startup cost: chute ~$20k used minimum, truck ~$10k, grinders/wheels ~$2k; $40–50k all in. Knives $25–30, grinder wheels ~$275 with $15 inserts (two per wheel), grinders ~$70 (he runs three), wraps ~$100 a case. (2:57, 12:30)
- Price $15 a trim, block +$25, wrap +$5, per trim, no setup fee; ~$110k a year on 8–10k trims. (7:12, 33:18, 1:01:03)
- Speed: a routine cow takes him ~5 min (some do 2); the old hand-held way was 1–2 cows an hour, now 10–20. Worst single foot 10–15 min. (9:00, 58:32, 1:01:03)
- Biggest farm milks ~1,100 (≈1,600 head with heifers, 3,200 trims a year), shared with another trimmer; no contracts. (47:45)
- In-house trimmers on big dairies use the farm's chute and are paid hourly/salary. (6:30)
- Summer 5 days a week, spring/fall 6, winter 3–4. Fixed days ("every third Friday"). The job moved from fixing problems to preventing them. (57:31, 59:59)
- Chutes: Appleton elevator chutes; old one single hind-leg lift, new one dual rear lift. (41:48)
- Calves never need trimming; youngest he treated was a heifer that tore her whole claw capsule off. (40:43)
- Dogs on farms eat hoof trimmings, and prefer the nasty ones. (1:02:06) Flavour.
- Abscess, foot rot and toe necrosis smell the worst. (16:24)

## October live, `YlxDlpwl3jI` (late Oct, 1:10)

### Checks against the game

| What Nate says | Where it touches the game | Verdict / idea |
|---|---|---|
| A pinkish shaded spot can look like separation you should keep following, but it's a bruise/haemorrhage with corium right under it: pare on and you're through. That's why he carves such spots slowly with the knife, not a small grinder. (1:00:30) | Bruise decoy vs lesion; tool choice | **Idea:** a bruise decoy that tempts paring: shaded like a track, but pink underneath. Paring through it bleeds (Restraint −). Strong read-phase test. |
| A three-legged cow with no open lesion, just redness through the whole claw (pedal-bone pressure): trimmed and blocked, she walked out sound. His "most satisfying" trim. (32:47) | Bruise call, block | **Idea:** a diffuse-redness "pressure" cow where the right call *is* a block despite no lesion. Counterweight to "red = leave it". |
| Pasture isn't simply better: fewer pressure lesions, but more foul and metabolic/diet-driven sole problems as pasture energy and protein swing through the year. (5:01) | Farm decks | Pasture farms should deal foot rot more, ulcers less. |
| Abrasive concrete thins soles, and some cows naturally have thin soles; that's the only time over-trimming the sole is a real risk. With a grinder you feel thickness before going too far; a knife is harder to keep on a plane. (25:46) | WP13.1 thin sole, WP12.4 sand | Backs the thin-sole case's setup; "abrasive concrete" is a second farm source besides sand. |
| Foot-rot vs abscess: an abscess rarely travels up; foul does, and he knows it is moving when swelling climbs above the foot. That's when it needs a vet fast. (1:07:51) | `footrot` call: vet | Matches. **Copy line:** swelling above the hoof = vet now. Ties into WP13.2 swelling art. |
| Amputation suggested maybe three times in 23 years; it leaves one claw that must stay perfect, so a bad claw kept can beat no claw. (57:22) | Vet call scope | Flavour for the vet call. |
| Wraps can trap bacteria and slow healing; he wraps DD only because salicylic needs to sit. He's trialling a no-wrap DD treatment. (1:04:17) | `dress` step | Supports "don't wrap what doesn't need it": a wrap on a plain trim could cost a little. |
| Rubber blocks cushion the one claw now carrying all her weight; wood only for stability when she rocks back on her heels (toe necrosis, sometimes axial fissure). (42:48) | Block types | Repeats AMA. |
| Calving hormones relax the suspensory apparatus holding the pedal bone, so it moves more round calving; that's why heifers get their first trim at ~22 months, before they calve. (30:22) | J1 close-to-calving, bruise copy | Repeats NYE's cause; gives J1's intro text a mechanism. |
| Cows drool in the chute from stress, on top of gallons of saliva a day for cud. Lifting the chute tends to make an agitated cow freeze and go still. (31:45, 34:54) | Cow animation | **Art beat:** drool string; she calms once lifted. |

### Handling, farm, trade
- The day's list: the farm prints the cows due, plus any that are sore or walking oddly. (17:00) Matches the visit card.
- Days vary from 6 cows (set up and done in an hour) to 50+; with a small herd he stretches the day to finish everyone. (59:28)
- Knives last about 2 months, sharpened daily; new ones are thick (rough work), worn ones thin and sharper but bend or snap. (21:54) Repeats AMA; adds the 2-month life.
- Wraps: pink now (bought four cases), was orange; newer wraps are thinner and breathe better. (6:29, 43:51)
- Chute: elevated upright; drops flat off its transport pins, rear strap then belly strap, then lifts the cow and the feet come up hydraulically at working height. (28:58)
- Busiest problem season July–September ("white-line abscess season"); spring and fall busiest for trims because small farms are added. (41:26)
- Bulls: thick necks in a cow-sized chute risk shoulder/neck problems, so work fast; he dislikes them. (33:52) Repeats NYE.
- Breeds: Holsteins were bred huge (1,800–2,000 lb) for 10–15 years; now back toward ~1,500 lb. Old barns' stalls were built for smaller cows. (44:33)
- Technology: better chutes, cattle flow and glues matter; thermal imaging adds little. Pen and paper; some farms enter his notes in herd software. (39:56)
- Glue: Bovi-Bond; he left it while cartridges were bursting, then went back. (1:06:07)
- Down cow lying in water in winter: he told the farmer. Closest he's come to a welfare issue. (37:44) Flavour.
- Training advice: learn cows and farm routines (feed, water, milking times) before trimming. (36:20)
- Jersey "5J" used to come visit and lick his grinders. (48:51) Repeats breed note.

## Early-autumn live, `VAzp_0yatQo` (Sept/Oct, 1:16)

### Checks against the game

| What Nate says | Where it touches the game | Verdict / idea |
|---|---|---|
| Early lameness sign: on a hind foot the problem is usually the outer claw, so she "toes out", walking a little duck-footed to shift weight to the inner claw. Sometimes that alone lets a short-term, metabolic problem settle. (22:11) | Walk-in gait (`walkoff.js`), read phase | **Idea (strong):** a toe-out stance on the walk-in when the lesion is on the outer hind claw; a hint before the testers. Repeats NYE (1:38:35), now twice. |
| Foot rot peaks round freeze/thaw: frozen, slippery ground and mud abrade the skin between the claws, like sand rubbing your toes raw at the beach. (44:51, 47:59) | `footrot` deal / seasons | **Idea:** foot rot more likely on late-autumn/early-spring visits and muddy farms. |
| A heifer that tore her whole claw capsule off: he glued two blocks together for extra lift and wrapped it; six weeks later new wall was growing down and the capsule eventually replaced fully. Young and light helped. (30:26) | Double block, one-off case | Flavour for the double-block variant; "she's young, she'll grow it back". |
| Pedal-bone fracture: bone pushes through the corium and out the sole; corium must heal first, then make horn; heals better than toe necrosis or axial fissures if necrosis doesn't set in at the toe. (20:21, 28:59) | Possible large case | Repeats GdRK; adds ordering "looks worst, heals best". |
| Toe necrosis: pasture cows snap long winter toes in spring, exposing corium at the tip, yet almost never get it; freestall cows rarely injure toes yet do. Hence his inside-out theory. (34:00) | `toenecrosis` deal by housing | Repeats NYE; reasoning worth one copy line. |
| Dew claws rarely need trimming; long ones hold manure and can lead to dermatitis. (11:10) | Possible art detail | Small: long dew claws on a dirty tie-stall cow. |
| Hooves dry and harden in frozen winter, stay softer in warm wet summer. (9:42) | Knife resistance by season | Repeats moisture point; adds season. |
| He has no drugs: no anaesthetic, so he works round a flinch, staying off the sore spot when he can; the chute holds the foot firmly. (1:03:05) | Flinch/Restraint | Matches the flinch model. |
| DD spreads cow → environment → cow, not by touch; high herd prevalence loads the environment. Footbaths and clean pens control it. (2:16) | WP12.3 footbath | Matches. |
| Summer: 4–6 sore cows in a 40-cow day; winter maybe none. (16:47) | Deal rates by season | Repeats NYE's 1–2%; summer is ~10–15%. |
| Hairline lesion running round the coronary band = DD; a split in the cleft front = foot rot; they smell different. (52:41, 53:44) | DD vs foot rot read | Matches the game's DD/foot rot `feedback`. |
| Foot rot caught early is just antibiotics; left late, swelling climbs and the leg from the knee down goes tight and huge, and she's shipped. He saw that on 50–60 small farms years ago, not now. (1:08:34) | `footrot` | Repeats; supports WP13.2 swelling-above-hoof art for a late case. |

### Handling, farm, trade
- Lame-cow calls: he drops in on local farms on his way to or from the day's main farm; one main farm a day otherwise. (6:09)
- Big farms every 2–3 weeks; small herds 3–4 times a year (whole herd each time); spring/fall herd trims avoid winter ice. (5:27, 15:44)
- Oldest cow he trimmed: a 19-year-old Jersey. (6:30)
- Jerseys get fewer pressure lesions (lighter), but are stubborn to load; Holsteins easiest because they fit the chute. (18:11)
- Most front-foot problems are on the inner claw. (27:53) Repeats NYE.
- Kick guards ("teardrops") swing in when he works on front feet. (27:53)
- Grinder: Rotoclip six-slot disc running only two carbide inserts (spares for when one is thrown); a round Rotoclip bites harder. Before discs trimmers used long-handled nippers and knives. (1:09:58, 1:13:11)
- Price check: $15/cow, wrap +$5, block +$25; 8–10 cows an hour. (41:40, 43:47)
- Travel: most farms 15–20 miles; one 1 h 20 min, one 2.5 h. (44:30)
- Burnout: two routes once had him working 28–30 days a month; dropping to one route fixed it. (54:28)
- Uses a scalpel only for thin heel-bulb tissue. (1:14:56)
- Flies: fans round the chute keep them off him; they go for a smelly hoof instead. (58:02)
- Farmer forgot which cow had the pedal-bone fracture because she walks fine now; Nate remembered her number. (1:02:00) Flavour for recheck intros.

## Rainy Day Fireside live, `M8kH-MDHqN4` (late Aug, 1:04)

### Checks against the game

| What Nate says | Where it touches the game | Verdict / idea |
|---|---|---|
| Claws aren't always trimmed to the same length: he follows the markers in each claw, and cutting the second to match the first would have bled on his demo cow. Dutch-style standards dodge that by cutting every claw to the safe (longest) length. (45:12) | `step2` "match the claw" | **Check:** step 2 should never force a claw shorter than its own safe length. A smaller cow has shorter claws. Repeats the AMA's "scale toe length to foot size" tweak. |
| Corium feels like a very soft marshmallow; spray doesn't seem to bother them, likely because removing the pressing horn brings instant relief. (4:35) | Spray step, copy | **Copy line:** marshmallow analogy for the tutorial. |
| Blocks per 50 cows: about 2 in summer, maybe 0 in winter; some farms none at any time. Longer trim intervals = longer toes = more pressure lesions. (22:53) | Deal rates per season/farm | Repeats; gives a block rate. |
| Pasture cows: more debris problems (sticks wedged between claws, stones, punctures from random objects), plus spring toe chipping after winter growth; housed cows get pressure lesions and odd wear angles on concrete. (31:25) | Farm decks | **Idea:** pasture farms deal puncture / foreign-body cases more, and a "stick between the claws" quick find. |
| He uses chlorhexidine spray, or salicylic acid wraps; never hydrogen peroxide (damages healthy tissue). Tetracycline went vet-only around 2017–18, so he switched; if a farm wants it, the farm supplies it. (16:08, 29:17, 30:22) | `treat`/`dress` copy | Repeats the AMA's tetracycline point; peroxide is a good "wrong spray" distractor if spray choice ever exists. |
| Severe swollen injury between the claws on a heifer: double block on the good claw to lift the swollen one clear. (27:32) | WP13.2 swelling, block | Supports a double-block variant tied to swelling. |
| Selling a lame cow for beef instead of fixing her gets her docked; a trim is worth roughly a penny a pound of her value. (33:53) | Economy / farmer copy | **Copy line** for a farmer who balks at the cost. |
| Rubber blocks cost about twice wood or more; he pays for the cushion. Rocking back also loads the ulcer site of the good claw. (42:44) | Block types | Repeats; adds price ratio. |
| Overgrown beef cow: usually a twisted outer hind claw (genetic), toe pointing up; or diet if all feet. (46:57) | Corkscrew idea | Supports the corkscrew farm-trait idea. |

### Handling, farm, trade
- Turned down a 3,000-cow farm (6,000 trims a year): he'd have no slack for cancellations and couldn't keep intervals. Only takes tiny farms within a few miles now. (25:23, 48:03)
- Emergency abscess calls come between visits in summer; he stops in the morning before the main farm, never at 2 a.m. (29:38, 44:08)
- He brings all supplies to every farm; farms with their own chute doctor some lame cows themselves. (29:17)
- Swaps grinder inserts at the start of every day; 4½-in wheel with flat inserts (less kickback than round). Grinding is easy to learn; knife work is the skill. (42:04, 50:34)
- An angry cow (ears up, eyes on you) means it; a bull usually bluffs but is unpredictable and guards his cows. (37:04) Repeats the AMA.
- Winter: heavy gloves cost dexterity; chlorhexidine can freeze in deep cold. (6:23)
- Highland cattle don't suit his headgate; he passes them on. (59:06)
- Farms leave dairy when no younger generation takes over; land goes to crop farmers. (51:59)
- Big barns' fans keep flies off; flies are worst on small organic farms. (55:32) Repeats GdRK.

## "is live… 2nd Attempt", `sFT80Dz8if4` (late summer, wildfire smoke, 1:34)

Mostly a fan Q&A (career, YouTube, kit); thin on lesions.

### Checks against the game

| What Nate says | Where it touches the game | Verdict / idea |
|---|---|---|
| Today: 11 pasture cows, 3 needed blocks, all from rocks (a small crack lets a rock in, which punctures). Normally ~2 per 50 in cool weather; varies by farm. About 8 of his ~25 farms are summer-pasture farms; the "weird rock in a bad spot" videos are theirs. (35:27, 1:18:36) | Pasture deck, deal rates | Repeats the pasture deck idea, and shows a pasture farm can have a bad day: rock punctures clump. |
| Pasture cows get rocks, foot rot, DD, debris and stones between claws; fewer white line / ulcer cases except a spring flush of new grass can bring ulcers. (1:19:38) | Pasture deck, season | **New detail:** spring grass flush → ulcers on pasture farms. |
| Wet summers soften horn, it stops wearing, toes grow long: more calls for long-toed pasture and beef cows. (15:21) | Season / weather | Fits the season knob: wet season = longer toes. |
| Horn grows about ¼ in a month; that's why a block stays a month. Minimum sole he leaves is ¼ in, prefers ⅜ in or more. (22:03) | Sole thickness, thin-sole case, block timing | **Check** the sole-depth numbers in copy match ¼ in floor / ⅜ in target. |
| How he cuts himself: knife in thick horn suddenly zips through soft horn near the heel bulb. (3:01) | Knife feel | **Idea** for knife stroke modes: heel-bulb horn is soft, a hard stroke overshoots. |
| He doesn't trim flat (Dutch); he trims to the natural sole, which has a built-in angle that flattens under load like a shock absorber. That's why he dislikes the KDK "flipper" chute paddles. (1:09:44) | `step2`/`step3` shaping | Matches the game's "follow the sole" model. Repeats the Dutch-vs-natural theme. |
| Hooves change with age: repeat pressure lesions remodel/calcify the pedal bone, and older cows heal slower than heifers. (1:12:35) | Recheck healing rate | **Idea:** heal speed by age (heifer fast, 6–10-year-old slow) on returning cows. |
| Heavier cows (same footprint, more weight, often fed hard) get more pressure problems; Jerseys fewer than Holsteins purely from size. (10:05, 42:41) | Farm/breed trait | **Idea:** a Jersey farm as an easy early farm (fewer pressure lesions). |
| Foot rot that runs up the leg is beyond him: vet-only, antibiotics and anti-inflammatories. Amputation and euthanasia are rare now because problems are caught early; even toe necrosis is trimmed rather than amputated. (49:43, 53:31, 1:26:05) | Refer-to-vet outcome | Supports a "call the vet" outcome for swollen-leg foot rot (WP13.2/13.3). |
| A heifer that ripped a claw capsule off in a feeder: he double-blocked and wrapped bare corium; six weeks later a new wall was growing down. Pedal-bone fractures also heal after the bone piece is expelled through the sole. (51:07, 1:27:57) | Rare cases | Flavour for a "you'd think she's done, but block her" rare cow. |
| Old untreated DD used to grow inches thick, up to the dew claws; today's DD is milder. Foot rot and DD have a distinct smell; he can tell before lifting the foot. (57:51, 1:17:12) | DD art; walk-in cues | **Idea:** a smell cue on walk-in/lift ("you smell it before you see it") for foot rot / DD. |
| Most memorable: a three-legged cow, hemorrhage throughout the claw from pedal-bone pressure, walked out without a limp. (1:21:49) | Exit animation | Supports the walk-out payoff. |
| Summer heat: cows stand to shed heat, so more hoof problems; "abscess season". Emergency call 3 weeks ago for a non-weight-bearing cow. (1:23:58) | Season knob | Repeats. |
| Salicylic acid: 10 lb bag twice a year (~20 lb/yr), mostly in DD paste; heel DD is the lesion he sees most. Low pH kills bacteria, exfoliates dead tissue, maybe mild pain relief. (54:13, 1:29:44) | Treatment copy | Repeats; adds why it works. |
| Dew claws: no function now; only trimmed if long. With normal hoof moisture they shed; they can get dermatitis and grow deformed. (39:22) | Dew-claw detail | Small idea, low priority. |
| Wall/vertical fissures are a dry-climate problem; rare in his Wisconsin dairy cows, sometimes in beef. (1:20:48) | Region trait | Only if a dry/western farm ever exists. |

### Handling, farm, trade
- Schedules: big farms every 2, 3 or 4 weeks; three farms on whole-herd trims every 4 months; small farms whole-herd spring and fall (to avoid ice). Winter 3–4 days a week; spring and fall 5–6. (3:43, 1:23:15)
- First farm on a brand-new chute: he asked for an easy day, the farmer handed him 45 cows. (1:07:52)
- Every cow defecates in the chute; he scrapes under it 4–5 times a day. (1:08:12) **Copy/art flavour.**
- Moving cows one at a time from a pen used to get him kicked; his current trailer set-up keeps him out of the kick zone. (1:04:40)
- Chute cost: $31,000 new in 2002, $61,000 for the current one. Truck: base-model GMC 2500. (1:11:10, 1:31:11)
- Trained ~3 months with his mentor, then took over farms; started at 23. No licence needed in the US. (8:40, 17:52)
- Four or five trimmers cover his local area; rigs pass each other going opposite ways. (1:17:53)
- Knives: rubber abrasive wheel on a bench grinder, then a cloth polishing wheel. Supplies from farm-supply shops; salicylic acid off Amazon. (19:35, 36:10)
- No washing feet: it doesn't change the trim, wet + knives + electric chute is unsafe; chlorhexidine rinse at the end. (31:55)
- Biggest cows ~1,800–1,900 lb (one herd of 1,700 lb giants); biggest bull ~2,200 lb, doesn't fit his chute well. (28:44, 44:55)
- Beef cattle on pasture shed horn naturally and rarely need trims. (1:57) Ground advice: concrete at a feed trough beats gravel/breaker rock (uneven, sharp). (1:15:03)

## "live Q&A!!", `vJ2U6wo1qGs` (early summer, after Italy trip, 1:05)

Mostly fan Q&A again; a few useful bits.

### Checks against the game

| What Nate says | Where it touches the game | Verdict / idea |
|---|---|---|
| Sole fracture vs sole ulcer: a fracture is the sole tearing away from the heel bulb where they meet (shear: hard turn, twist), mostly on **rear medial** claws; an ulcer sits under the back of the pedal bone near the deep flexor attachment (pressure, unbalanced claw), mostly on **rear lateral** claws. Both "fairly rare". (57:12) | Lesion catalogue; claw placement | **Idea:** a sole-fracture lesion (medial, at the sole/heel-bulb seam, cause = shear) as a cousin of the ulcer. At least **check** ulcers land on the rear lateral claw. |
| Healthy corium: pink, clean, uniform. Unhealthy: grey, discoloured, or bumpy protrusions. Don't cut the bad bits away; let salicylic acid slough them. (52:09) | Corium art; over-cutting | **Copy/art:** grey or lumpy exposed corium = damaged; cutting it is a fault. Fits restraint scoring. |
| Abscess release: if it's tight and full, relief is often instant; the pain is the pressure. (49:18) | Abscess walk-out | Supports a sealed-abscess cow walking out better than one already burst (the abscess-stage idea). |
| Cows that come through often (lame ones) learn the chute: a good last visit makes them walk in, a bad one makes them balk. "50/50". (26:50) | Returning cows, walk-in | **Idea:** a returning cow's chute entry depends on how her last trim went (rough trim → balks next visit). |
| Most of his work is grinder maintenance trimming; knife work is a small number of lesion cows a day. (30:43) | Game focus | Context: the game is the interesting 1–2%. |
| Thin, repeatedly sharpened knives are sharper and better around lesions, but bend then snap; he retires them when they bend. He grinds the factory hook down and sharpens a new hook into the tip. (5:41, 25:02) | Knife wear (WP12.4) | **Idea:** a worn-thin knife cuts finer but can snap; adds to knife stroke modes. |
| Toe necrosis theory he doubts: injury from loading/unloading on cattle trucks (feedlot cattle). (24:18) | `toenecrosis` flavour | Low priority. |
| Foot rot up the leg: euthanised maybe 4–5 in his career, years ago; now farmers catch the puffy foot and give antibiotics early. A cow that can't walk can't legally go for beef. (10:47, 15:10) | Vet referral; swelling | Repeats; adds the legal "non-ambulatory" point. |
| Vets rarely needed: only surgery (amputation) or antibiotics; vets send hoof work to trimmers. (42:10) | Vet referral | Repeats. |
| Heifers aren't trimmed until just before first calving, so feet are right before lactation changes hit. Calves and young stock don't get pressure lesions (too light); a calf with bad feet is structural. (4:57, 49:59) | Cow age mix | Fits: no calves in decks. |
| Each foot carries ~300–450 lb (1,200–1,800 lb cows). (42:54) | Copy | **Copy line** for "why it hurts when she steps on you." |

### Handling, farm, trade
- **"Farmer math":** told 10–15 cows means 25; told 40–50 means 60–75. He no longer asks until he arrives. (38:35) **Idea:** the visit's cow count drifts above the farmer's estimate; good farmer-dialogue line.
- Pen-and-paper records per cow and any intervention, which the farm can enter in its software. (17:36)
- Not taking new customers for ~10 years unless very close; aims to move every farm to 3–4 trims a year to cut problems. All farms within 30–40 min except one 2½ h away, kept since his first year. (29:19)
- Most kicks happen getting the cow into the chute; the rear bar and front "teardrops" protect him once she's in. Cows rarely bluff; a bull often does. (20:28, 21:10) Repeats.
- Avoids trimming heavily pregnant cows if possible. (1:00:06)
- Fair season: trim show cows a couple of weeks before the county fair so they look good. (16:12) **Idea:** a "fair cow" vanity job (looks matter, no lesions).
- Tip tables: early on farmers hated them and asked first "what kind of chute?"; modern tip tables are fast. He thinks lying vs standing makes little difference. (41:09)
- Emergency stops between scheduled visits, never middle of the night. (18:17)
- 45–50 cows a day; 5 days a week in summer, 3–4 in winter (ice). (1:02:52)
- Three lessons: take your time, treat each cow as your own, stay calm (yelling spooks the herd). (56:29) **Copy** for tutorial/end screen.

## "live… April Edition", `ErcTjacDKXk` (April, outdoors, 1:53)

Longest live; the best bit is how his lesion trimming changed (first row).

### Checks against the game

| What Nate says | Where it touches the game | Verdict / idea |
|---|---|---|
| **Biggest change in 23 years:** he used to pare all horn down thin around a lesion and lower the heel. If the block then fell off, the cow stood on a sole-less claw and he got "she can't walk" calls. Now he opens the lesion but leaves a ring of horn around it, so a lost block still leaves her protected. Those calls stopped completely. He also models (shapes) far less than he did. (1:38:28) | Lesion scoring, block outcome, recheck | **Strong idea:** score the horn left *around* a lesion. Over-thinning the surround makes a returning cow show up worse if her block came off. Fits restraint scoring and the returning-cow idea. |
| White line is "glue" between sole and wall; even fully destroyed it regrows if the corium is healthy. He rechecks most white line cases. (11:06, 22:40) | White line recheck | Supports rechecks for white line cases; copy line. |
| Lying 12–15 h a day is the key to healthy feet; cows heat-stress from about 65–68 °F and stand more, hence white lines in July–August. Winter cows are comfortable: few lesions, "tame" videos for months. (26:55, 1:19:44) | Season knob | Repeats the season knob with a temperature number. |
| Sand bedding: best footing and comfort ("like a beach"), but abrasive: high wear, thin soles; also clogs manure systems. A neighbour just switched and is having problems. (28:43) | WP12.4 sand, WP13.1 thin sole | Confirms sand → thin soles. **Idea:** a farm that *just switched* to sand (thin soles spike). |
| Beef cows he's called for are nearly always corkscrew claws (genetic, rear lateral), chronic repeat trims; pressure lesions rare on pasture. (4:22, 1:23:31) | Corkscrew idea | Repeats; adds rear-lateral and "chronic". |
| Wraps hold the product on; useful 2–3 days, then they fall off or the farm removes them; in a clean hospital pen they can stay weeks. (1:00:26) | Wrap copy, recheck art | **Check** a recheck cow normally has no wrap left. |
| Scalpel only for skin in the heel bulb that's still attached but separated: a knife won't cut it, it needs resistance. (1:19:02) | Tools | **Idea:** heel-bulb skin flap as a lesion the knife can't take; a "scalpel" tool if tools ever widen. |
| Claw retractor (new in the last year) spreads the interdigital space; lots hides in there. (1:27:47) | Interdigital checks | Supports a "look between the claws" step (stick, rock, hangnail foot rot). |
| Foot rot hangnail: a sliver of hoof stuck between the claws kept the infection going after antibiotics; he removed it. Farms treat puffy feet early, so he rarely sees bad foot rot. (49:19) | Foot rot / swelling (WP13.2) | **Idea:** swollen foot that won't settle → a hidden horn sliver between the claws is the find. |
| Pedal-bone fracture, first one: he feared the farmer would think he caused it; she was sound four months later with no recheck. If he gets the bone fragment out, most heal; more sole haemorrhage afterwards. Pedal bone never regrows. (1:14:03, 1:34:35, 1:35:39) | Rare case | Repeats; flavour for a fracture case. |
| Claw amputation: a cow can live on one claw, but if the other one fails she has nothing. Rarely done now. (1:45:12) | Vet referral | Flavour. |
| Antibiotics are vet/farm business: treated cows' milk must stay out of the tank (one mistake dumps the whole tank). Farms mark treated cows with leg bands first. He won't administer any. (38:50) | Treatment boundaries | **Copy/idea:** "leg band" on a treated cow; the player never gives antibiotics. |
| Bulls: get them in and out fast; a thick neck held too long can pinch the radial nerve and drop the front end, which ends the animal. Cows are supported by a belly strap, one foot up at a time. (33:05) | Bull cow (thin-sole bull idea) | **Idea:** a bull with a chute-time limit. |
| Old chute: a cow with a front foot up got out of balance and tipped forward; he released the manual lever just in time. New chute's belly strap sits further forward so they rarely tip. (1:11:34) | Chute events | Flavour, low priority. |
| Calving: stress can induce labour; a cow has calved in the pen just after her trim. Avoids trimming near calving. (1:48:06) | Event card | Flavour for a farm event. |
| Rasps: not used; the grinder wheel takes micro amounts to level. (1:33:53) | Tools | Fine as is. |

### Handling, farm, trade
- **Difficult cow:** don't isolate her and don't leave her last in the pen (she'll try to jump gates). Put her mid-line in a staging lane so she follows another cow; bring two or three at a time. If she's frantic, let her go and try another day: the injury risk isn't worth the foot. Or trick her round a corner into the chute. (1:24:15, 1:46:14) **Idea:** a walk-in mechanic for a nervous cow (pair her with a buddy).
- Biggest change besides trimming: cow flow. Smoother handling, calmer cows, big time saved. He brings his own sawdust so cows don't slip coming in. (1:37:46, 1:32:23)
- Rookie mistake: going too fast to impress the farmer or match veterans. "Treat every trim like your life depends on it." Farmers want to see cows improve, not speed. (9:20, 1:41:59)
- Starting a business: got the state's list of registered dairy producers, mailed a letter to farms in his target counties, then word of mouth. (8:18)
- Day: one farm per day; 20–79 cows (79 is his record), usually 35–50. ~10,000 trims a year on 3–5,000 cows. Average per cow over a year ≈ $16 with wraps and blocks. (5:05, 53:19, 55:02)
- Emergency visit for an existing customer: same pay as a normal day's rate basis, settled next visit. Not efficient, but keeps farms. (36:40)
- One 1,100-cow farm (+500 heifers) shared with a second trimmer, a day a week each. (24:47)
- One spring/fall farm moved itself to three trims a year. (56:49)
- 7 knives on the chute, 8–10 spares; sharpened daily; a knife lasts a couple of months. Snapped tips are like shivs. (24:25, 55:24)
- Kids and fairs: dairy cows go home from the fair; beef animals are sold. (1:26:44)
- His mentor's father lost cows to lameness before anyone trimmed; "lose 30 head a year." (1:50:14)
- Thrush in horses is the same family of bacteria as foot rot. (16:44) Iodine → chlorhexidine story: his mum, a surgical nurse, suggested it. (18:29) Repeats.

## Live Q&A March 25th, `bkc41RMZvAw` (late March, 1:18)

### Checks against the game

| What Nate says | Where it touches the game | Verdict / idea |
|---|---|---|
| Lesion work: free the lesion (cut away loose horn round it), don't go to bare minimum. Take the rest of the horn at the recheck once it has firmed up underneath. That's why he bleeds less than other trimmers. (37:39) | Restraint scoring, recheck | Same lesson as the April live: **two-stage** lesion trim (free now, tidy at recheck). Strong support for scoring "enough, not more". |
| Dark colour vs a hidden lesion: if colour changes as you pare, it's separation; if the first layer off is black all the way through, it's just pigment. Easy once experienced. (47:30) | Decoys | **Idea:** a pigmented (black) claw decoy: dark from top to bottom, never changes when pared, so not a lesion. Sibling of the "fades as you pare" decoy. |
| Horn round a lesion is softer because lesion fluid soaks it; on very hard feet he uses the grinder more, and the knife only near the lesion. Separated horn is rubbery like a tyre, not squishy. (34:50, 11:13) | Knife feel, art cue | **Idea:** knife cuts easier near a lesion (a feel cue that you're close); WP12 hard-horn farms push grinder use. |
| On a rear foot the lateral claw always lands first (she plants the foot under her: lateral, then medial, then load). A block is only about ½ in, just enough to unload the bad claw. (6:17) | Block rationale, ulcer placement | **Copy line** for why rear lateral claws get pressure lesions and why the block goes on the medial. |
| Both claws on one foot bad (e.g. both have lesions or DD): no block, since you'd load a bad claw. Wrap and move her to a bedded pack, off concrete, away from competition. (32:40) | `pen` outcome | Repeats "both claws → pen". |
| Most blocks on one cow: four, on a breeding bull: both rear feet worn thin from mounting, rubber blocks on all four rear claws as cushion. (44:14) | Bull thin-sole idea | Repeats; adds the "rubber block on both claws for thin sole" exception to the no-block rule. |
| Toe necrosis: blood flow loss, bone dies from the inside; remove necrotic tissue; healing takes a long time and leaves a very short claw that's never normal, but the cow copes. Mostly lateral claws, so she has the medial. (19:01) | `toenecrosis` | **Check** toe necrosis lands on lateral claws; recheck art could show the shortened claw. |
| Cows with one claw (after amputation) rarely get problems in the remaining claw, which tells you lesions come from how the foot lands and loads, not raw weight. (28:03) | Copy | **Copy line** for "it's balance, not weight". |
| Worst hoof: deep digital sepsis, infection destroying everything inside the claw. Most dangerous: foot rot running up the leg. (48:13) | WP13.3 deep sepsis | Confirms deep sepsis as the "worst foot" tier. |
| Recheck a month on: the black left is only stain; he only cuts if something's still open or loose. If it hasn't healed in a month, something is irritating it (loose horn) and must come off. (58:34) | Recheck logic | **Check** recheck scoring: don't reward paring away healed black stain; do reward finding the loose horn on an unhealed one. |
| Footbath: 6–8 in minimum, deep enough to cover dew claws (dew claws get DD too); length matters more than depth so each foot dunks several times; the level drops as cows carry solution out. Alternatives: lime dry baths (doubtful), parlour spraying; snow cleans feet. (17:59, 1:04:21) | WP12.3 footbath trait | **Idea:** footbath faults beyond strength: too short or too shallow (dew-claw DD). |
| Strangest find: a 6–8 in rusted gate-rung pipe pinning both claws of one foot; she walked in looking normal. Also teeth (often), the odd nail or screw. (1:06:48) | Foreign-body cases | Supports the pasture/foreign-body deck; walk-in can look normal. |
| Corkscrew: pedal bone rotates, horn builds up on one side, claw twists; trim off the extra horn to rebalance. Often environmental, sometimes genetic. Seen more in beef (trimmed less). (30:10) | Corkscrew idea | Repeats with the mechanism. |
| Jerseys have a larger footprint relative to body size than Holsteins; smaller breeds have fewer problems. (41:56) | Breed trait | Supports a Jersey farm as easy. |

### Handling, farm, trade
- Bright wrap colours (pink, orange) so they're still visible when filthy and get removed on time; a wrap left on can cause problems. He tried no biodegradable wraps: farmers pay for the wrap and hate seeing one fall off before he leaves. Sticks with one glue, one wrap. (4:27, 14:24)
- Grinder: 4½-in six-slot flat wheel run with only two opposing carbide inserts; fewer inserts bite more per turn (more aggressive), spares in case one is thrown. (1:11) Double-edged knives so one knife cuts both ways. (9:07)
- Farmers no longer question his price; they see the value. Some bigger farms have their own small stationary chute to look at a foot between visits. (52:31, 1:10:44)
- Scariest moment: old chute, a cow got her foot through the belly-band arm as it lifted, started tipping, leg pinched. New chute blocks that. (53:13)
- Cows in the parlour pit are trouble (expensive kit). Group spooking: one spooked cow spooks the group; keep groups small. (35:33, 1:15:46)
- Heifers first trimmed at ~22 months, then every 5–6 months. (1:08:13)
- A cow found lying in a cold puddle on one farm (owner away feeding); he told the farmer. Closest he's come to a welfare report. (11:34)
- Coldest trim: −26 °F outside, warmer in a barn full of cows. (25:07)

## Live Q&A, `yI8CBknFFHI` (autumn, ~5 years ago, 19 years trimming, 1:04)

His first live. Older numbers: $14 trim, $20 block, $5 wrap; ~30 farms, 40 to 1,200 cows.

### Checks against the game

| What Nate says | Where it touches the game | Verdict / idea |
|---|---|---|
| He doesn't aim for a perfectly white sole; some dark spots stay. He decides by whether she's favouring the foot and whether the dark is in a predictable spot (white line, ulcer site). Mid-sole marks are rarely anything unless a puncture, which usually shows swelling. (3:55) | Decoys, "four likely spots" | Repeats the "don't chase every mark" rule; adds **swelling as the tell for a mid-sole puncture** (ties WP13.2). |
| White line: remove anything loose and dead (hard keratinised horn); leave soft horn that's still attached, even if it looks loose. Cutting corium backs up healing because corium makes the new horn. (19:09) | Loose vs soft horn | **Idea:** "soft but attached" horn as a do-not-cut zone; cutting it scores as over-trim. |
| Razor blade (scalpel) for a big flap of very soft horn the knife can't take without reaching too deep and hitting corium. (26:55) | Tools | Repeats the scalpel note. |
| A cow he can't fix: toe necrosis meeting an axial fissure; the wall peels open every time it grows. Aggressive removal made her very lame, so for years she's just re-blocked every ~2 months. (32:57, 53:43) | Returning-cow idea | **Idea:** a chronic "maintenance" cow: the right call is a block, not a big cut. |
| Toe necrosis needs every shred of loose tissue out (messy, demonetised). He used to see it most in slatted-floor barns. (59:24) | `toenecrosis`; farm trait | **Idea:** slatted floors as a farm trait raising toe necrosis. |
| Heifers on a freestall farm keep getting dorsal-wall cracks with reverse corkscrew: he thinks stalls/feed rails are built for mature cows, so heifers stretch for feed and load the wall. Barn-design problem. (35:43) | Farm trait | **Idea:** "barn built for bigger cows" farm trait → wall cracks on heifers. |
| Pedal-bone fracture cows aren't trucked to a vet: an unsteady cow can fall in the trailer and break a leg; a vet could only amputate. Trimming in place is better. (28:01) | Vet referral logic | **Copy line** for why the player handles fractures. |
| Sole thickness: minimum ¼ in; varies ¼–¾ in on an overgrown foot. Natural vs Dutch: natural follows the heel angles and judges sole by the "pith" texture; Dutch squares the heels. (9:32, 1:02:34) | Sole depth, step 3 | Repeats; "pith" texture as the depth cue. |
| Blocks: soft rubber ½ in that compresses; off after a month or two if still on. (7:07, 40:17) | Block copy | Repeats. |
| Ration: fast-fed cows grow softer horn. Metabolic hoof problems show more on small farms: inconsistent forage (weather-damaged hay) and no TMR, so cows sort out the corn and protein. (42:02) | Farm trait | **Idea:** small-farm "uneven ration" trait → more white line / sole haemorrhage. |
| Footbaths make an "amazing" difference; without one DD blows up and is hard to control. (44:06) | WP12.3 | Repeats. |
| Corkscrew: still trim to uniform sole thickness so the bones sit right; they often twist again because inner structures changed. (1:00:26) | Corkscrew idea | Repeats. |
| Which cows get trimmed on a big farm: cows about to dry off, any sore-footed cow, and mid-lactation or "days since last trim" cows. (13:27) | Visit list | **Idea:** the visit list labels why each cow is in (dry-off / lame / due). |
| He works clockwise from the right front; once grabbed the wrong rear foot and nearly missed one, so he checks all four before releasing. (55:49) | Foot order | **Check** the game's foot order; "missed a foot" as a possible fault. |

### Handling, farm, trade
- Cows come over to tug grinder cords and lick his kit, not to greet him. (25:09)
- Got manure down his neck as a rookie reaching under a cow past the splash flap. (8:09)
- Grinder wound: a beef cow nosed open a pen door, charged, knocked him out of the chute with the grinder running into his arm. (15:56)
- Bosch grinders; 20–30 knives a year at ~$28–30; broken ones go to farmers for cutting twine. (38:11, 48:48, 50:34)
- Farms consolidating: fewer, bigger farms, more cows overall; big farms manage welfare tightly or problems blow up. (22:17, 24:26)
- Chute on a nitrogen accumulator: in a power cut he can still release the cow and lift the chute. (1:02:13)
- Refused to go back to one farm after one visit (didn't say why). (57:16)
- Started filming because The Hoof GP proved people would watch. (27:15, 50:56)

## Reading plan (2026-10-14)

Nate's 11 lives are done. More Nate would mostly repeat him, so the next reading goes after a
**different view**, in this order:

1. **Top ideas (above): done 2026-10-14.** Next: take the Tier 1 items into a WP in
   `QUALITY-PLAN.md`.
2. **Vet and lameness-science talks, chosen, not exhaustive.** These feed WP13.3 deep sepsis
   (a vet case) and the scoring of lesion work. In `reference/youtube/_interviews-talks/`:
   - `mTVn4SE-URI` Therapeutic Hoof Trimming, Dr. Gerard Cramer
   - `vkUBgpGAkJk` Timed functional and therapeutic trimming, Karl Burgi
   - `7m-Nb_KbDas` The Bovine Vet Podcast: Seeing Lameness Sooner
   - `Q51KkGWLjw4` Dairy-Tech Online 2021: Hoof Trimming & Lameness
   - `pUA_ehSw1yc` Dutch hoof trimming method (the method Nate argues against)
   - `o06jOkfZHZ0` Maximum Production ep. 18: Healthy Hooves, Healthy Herds
3. **Later, for farm and trade colour only:** `CUnMBnro7Us` Hoard's on Nate, and the Hoof GP
   interviews (`AbsPi-KpX2I`, `HFQMT2rgm8s`, `QCrKlGimyUw`, `WWYuUX8H9Bg`, `XMy3I3Jl85w`,
   `pKA8bzSrOTo`, `x_y9MJgv660`) plus `E4_Dsel8oRg`, `K8tIrPWzH3Q` (titled just "Hoof Trimmer").
4. **Hoof GP lives last, by topic, not in full.** He's a UK trimmer: the value is where he
   differs from Nate. Grep the 11 lives (status table) for `block`, `foul`/`foot rot`, `vet`,
   `ulcer`, `wrap`, `Dutch`, `antibiotic`, and note only disagreements and new lesions.

Other sources, unchanged:
- Nate's 459 regular videos are titled by case; titles alone map the lesion catalogue (rocks/gravel in the white line, punctures, nails/metal, double soles, heel-bulb separation, pedal-bone fracture (cow 6768), axial fissures, corkscrews, cross-claw, frostbite, dew-claw holes, "hangnails", toe ulcers, wall cracks).
- Thumbnails for every video are in `reference/youtube/<channel>/thumbs/` for art reference.
