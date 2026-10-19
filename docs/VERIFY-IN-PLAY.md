# Verify in play: Ben's phone checklist

Everything here is built and tested, but none of it has been judged by a person on a phone. Tick
each box, or write what felt wrong next to it. Items are grouped by area, newest first within each.

**How to reach things.** Run `npm start` on the PC and open the LAN URL it prints on the phone (or
use the APK for the "APK only" items). Dev params go after the URL:

| Param | Does |
|---|---|
| `?cond=<id>&seed=n` | Free play on one condition. Ids: `routine ulcer whiteline puncture toenecrosis doublesole twoclaw dd footrot nonfoot thinsole dds` |
| `&foot=front &growth= &mud= &temper= &decoys= &size= &at=` | Vary that free-play cow |
| `&partial=heifer` / `&partial=lately` | A short routine cow (WP17.2) |
| `&apprentice=unlevel,heel` / `&apprentice=` | The apprentice's cow with those faults, or a clean job (WP17.1). Faults: `unlevel nodish longtoe rough heel` |
| `?rep=n` | Start with that reputation (opens farms, tiers and kit) |
| `?farm=<id>` | Start a visit at that farm: `willowbank hollins brackenford toplane marshend greystone coldharbour ridgeway` |
| `?season=spring\|summer\|autumn\|winter` | Season pictures (not the deal) |
| `&debug` | Exposes `window.hoofGame` in the console |

A fresh round (no saved progress) starts at Willow Bank. To get one on the phone, use **Start the
round over** on the road map.

---

## 0. Phone notes fixes (2026-10-19)

- [ ] **Gauge word.** Step 2 with the claws matched but still high: the gauge says e.g. `level · inner 1.1 mm high` in amber, and LEVEL (green) comes up exactly when step 2 ticks.
- [ ] **Toasts off your thumb.** Working the toe or lower sole, messages come up under the gauge instead of at the bottom. Working the heel, they stay at the bottom. They shouldn't jump while showing.
- [ ] **Islands look like dips, not holes.** After grinding round an island it reads as patchy, mottled dirt in a shallow dip. On unground sole it's as stained as the rest. Still easy enough to spot as "stain left: leave it"?
- [ ] Still to check from 10-15: a faint pink patch mid outer claw, and a dark dash just outside the outer claw's right edge.

---

## 1. This round (review fixes 2026-10-15)

### Stain islands are low spots (WP10.3 follow-up)
- [ ] After a level grinder pass, the brown islands stay as dark hollows and the level gauge still reads level. `?cond=routine`
- [ ] Tap one with the testers: "A low spot, stained deep … leave it."
- [ ] Hold the grinder on one: the disc mostly skates over it. Keep going and the tone and buzz tighten as the stain goes, and it clears before the thin warning or blood.
- [ ] On the dirty foot, before trimming, do the islands read as hollows under the muck, or too obviously?

### The read (#1)
- [ ] The right answer is not always the top button on the read card, and the order looks random from cow to cow.
- [ ] Before the read, the intro card and top bar name her by ear tag (`Holstein #904`), not by her condition; the condition appears in the top bar only after you commit the read.
- [ ] The "how to treat it" text now comes up after the read, not on the intro card. Does it arrive at a sensible moment?
- [ ] Ticket and fail card eyebrows name the condition. Fine there?
- [ ] Known leaks still open: the **Guided first trim** button only shows on routine and ulcer cows; some intros hint ("look along the wall"). Do they give too much away?

### The first cow (#2)
- [ ] A fresh round opens at Willow Bank on **#132, a routine trim** (Case A), then #214, the ulcer (Case B).
- [ ] Pick **Guided first trim** on #132: 9 beats, including testing a mark that stays firm. Does it read as a proper lesson without an ulcer?
- [ ] The guided run is offered again on #214 (the ulcer, 13 beats), and not on later routine or ulcer cows.

### Load time (#4)
- [ ] The intro card for the next cow is live at once; the "Lifting her foot…" bar is short or gone after the walk-off, the ticket or the visit card.
- [ ] The first cow after opening the app may still show the bar. How long?
- [ ] No stutter in the walk-off while the next foot builds behind it.

### WP17: the long road
- [ ] **17.1 Apprentice cows:** from Brackenford (rep 75) one cow a visit says the apprentice trimmed her. Direct: `?cond=routine&apprentice=unlevel,heel`. Can you find the faults with the gauge, beam and testers? Is signing off a good one untouched (`&apprentice=`) satisfying? The ticket lists what the apprentice left.
- [ ] 17.1 on a lesion cow: `?cond=ulcer&apprentice=` (the ulcer is missed under a clean trim). Is the ulcer findable?
- [ ] 17.1 oddity seen in the browser: an apprentice cow released still muddy got "Dish not modelled on both claws" though her faults were level and heel only. Probably the muck, but check whether a cleaned good job ever gets that note.
- [ ] **17.2 Short cows:** `?cond=routine&partial=heifer` (little horn, livelier) and `&partial=lately` (one claw already right). Do they feel quicker and still worth doing? On the road, about a quarter of routine cows from Hollins on.
- [ ] **17.3 Kit:** the road map shows a kit line (`?rep=200`: hose, finer disc, knife next at 330). It's faint against the summer sky: legible on the phone? The day summary names kit opened that day.
  - [ ] Hose helper (rep 50): the foot comes in about half clean.
  - [ ] Finer disc (rep 165): slower near the line, finer swirls. Easier to stop on target?
  - [ ] Better knife (rep 330): a cap gives in two flicks (`?rep=330&cond=ulcer`).
  - [ ] Wood block (rep 480): tap the block tool again to swap.
- [ ] **17.5 More kit:** three more small buffs (`?rep=n` to jump).
  - [ ] Long-handled nippers (rep 100): a long toe comes off in fewer bites. Too easy now?
  - [ ] Leg guards (rep 250): a lively cow jolts less and shifts less; a known kicker still kicks (`?rep=250&temper=0.9`). Does the calm show?
  - [ ] Strop wheel (rep 600, about 60–80 cows in): carving pares a fifth faster; on Greystone's sand the knife lasts twice as long. Noticeable, or too faint?
  - [ ] The road map's kit line with seven pieces: does it wrap cleanly on the phone?
- [ ] **17.4 Pacing:** the bot now opens the whole road in 10 days at Textbook, 21 at Sound. Does the road still feel earned, or now too quick?

### Playtest log
- [ ] After a few cows, the road map's **Export playtest log** link saves a `true-hoof-playlog-<date>.json` (in the browser) or copies it (in the APK). Paste or open it: one entry per cow, with farm, guided, load time, step times and tools.
- [ ] APK only: the copy toast appears and the clipboard holds the JSON.

---

## 2. Older items not yet judged

### Hoof art
- [ ] **WP10.2–10.5** (crosshatch, stain islands, uneven manure, ulcer size 10–16): do feet look varied and real? At the largest ulcer the opened core is clipped square at the axial wall. `?cond=ulcer&size=16`
- [ ] **WP13.2 swelling:** it shows through the muck, which may give foot rot away early. `?cond=footrot`
- [ ] **WP13.3 deep sepsis:** the hole art at phone size, and whether −15 per stroke on the swollen claw feels fair. `?cond=dds`
- [ ] **WP14.2 decoys:** the ground haemorrhage shows a round pink spot. Too obvious? `?cond=routine&decoys=2`
- [ ] **J2 old block:** the worn-block art and the three knife taps to pry it off. Reached on a recheck cow at Brackenford or later (a cow that left lame in a block).
- [ ] **J3 two-claw ulcers:** the art and the bot-proof orbit. `?cond=twoclaw&seed=12`
- [ ] **D26 non-foot lameness:** play one through (`?cond=nonfoot&seed=41`). Is the neutral "Trim her, or send her?" step clear? Is the scuffed toe tip strong enough?

### Feel and controls
- [ ] **WP16 carve vs flick:** the delay before a carve starts, and how short and quick a flick has to be (`CFG.tools.knife`: flickMax 40 px, flickTime 160 ms). `?cond=ulcer` on the cap, and the heel curl on any cow.
- [ ] **WP16 guided flick:** the guided ulcer run's openUlcer and heelHorn beats were never played through.
- [ ] **WP14.3 toe-out:** the walk-in stance and the ticket line. Any cow with a long outer claw on a hind foot.
- [ ] **Temper and fidget:** livelier cows (`&temper=1`, heifers) fidget and flinch. Annoying or fair?
- [ ] **Slip trigger:** at the Journeyman tier the guides come on after a slip. Does it trigger too eagerly? `?rep=75&farm=brackenford`
- [ ] **Audio levels:** grinder, knife, flick, spray and the walk-off against each other, on the phone speaker.

### The road and screens
- [ ] **WP15.1 seasons:** the road countryside per season (`?season=winter`: is the header text readable over snow?) and the barn tint on the crush, title and walk-off.
- [ ] **WP15.2 ulcer recurrence:** a healed ulcer cow back with the ulcer where it was. Visit a farm a third time (Top Lane).
- [ ] **WP15.3 burst abscess:** seen only in the art lab. `?cond=whiteline` at Brackenford or later, or the art lab `dev/artlab.html?cond=whiteline&burst=1`.
- [ ] **WP11.2 field guide:** the crops (ulcer and two-claw are weak), the ten "Not met yet" chips on a fresh round, the "Book" chip label.

### Device
- [ ] **WP10 phone bench:** open `dev/bench.html` over the LAN and send the numbers (split the compose if three strokes take over ~30 ms).
- [ ] **APK save:** finish a cow, force-close the app, reopen. The day picks up at the next cow, and the playtest log is still there.
