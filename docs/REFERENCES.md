# Reference library

Source documents on hoof trimming and lameness live in `reference/docs/`. That folder is git-ignored because the documents are third-party copyrighted, so each machine needs its own copy. Each PDF has a `.txt` beside it, extracted with `pdftotext -layout`, so it can be grepped.

Use them to check facts, not as copy: paraphrase any wording that reaches game text.

| File | What it is | Size | Best for |
|---|---|---|---|
| `shearer-manual-foot-care` | *Manual of Foot Care in Cattle*. Shearer, Van Amstel & Gonzalez. A full book: anatomy, trimming, causes of lameness, footbaths, monitoring, behavior and facilities | ~37k words | The deep reference. Ch. 2 anatomy, ch. 3 claw trimming, ch. 4 causes of lameness (ulcers, white-line disease, digital dermatitis, foot rot) |
| `hoof-care-field-guide` | AHDB Dairy *Healthy Feet Programme: Hoof care field guide* (UK) | ~5k words | Tool kit, knife handling and sharpening, the five-step Dutch method, trimming do's and don'ts, treating digital dermatitis, foul and horn injuries |
| `ahdb-five-step-protocol` | *Five step protocol for hoof trimmers* (Level 3 training module, Theme 10) | ~2k words | Restraint and leg lifting, the functional trim of rear and front feet, the therapeutic trim |
| `cramer-hoof-trimming` | Gerard Cramer (Univ. of Minnesota), *Hoof trimming: the steps to success* (conference paper) | ~3k words | Why trimming matters, the vet's role, trimming costs and cow-welfare effects. Useful for farm and route framing |

## Video notes (tracked, paraphrased)

| File | What it is | Best for |
|---|---|---|
| [`NOTES-NATE-AMA.md`](NOTES-NATE-AMA.md) | Paraphrased notes, with timestamps, from a 97-min live Q&A by Nate the Hoof Guy, a working Wisconsin trimmer | Where lesions sit and how to read them, block and wrap choices, cow behaviour, farm, route and economy flavour, and new condition ideas |

| [`NOTES-NATE-LIVES.md`](NOTES-NATE-LIVES.md) | Paraphrased notes from Nate's other livestream Q&As (1 of 11 read so far), with a reading-status table | Lesion reading, cow handling, breed temperament, farm detective work, route/price, toe necrosis and ulcer recurrence |

## YouTube captions (local only)

`reference/youtube/<channel>/<videoId>.txt` holds title, link, description and auto-captions (20-second lines) for every video on Nate the Hoof Guy, The Hoof GP, Midwestern Hoof Trimmer, Keeping Cows Moovin, Cattle Lameness Academy, Seeds Hoof Trimming and Hoof Hero (Brett DeGroot), plus `_interviews-talks/` (podcasts and conference talks). `thumbs/` beside each has the `hqdefault` thumbnail. `_lists/` has the channel listings (id, length, views/age, title). Rebuild with `node _tools/list.mjs @handle videos > x.tsv` then `node _tools/fetch.mjs x.tsv <outdir> 1`. Grep these; paraphrase anything that reaches game text.

## Where to look, by plan item
- **The five-step trim (steps.js, tutorial):** the field guide's "Trimming steps", the five-step protocol, and Shearer ch. 3.
- **WP7.2 routine trim:** the field guide's pitfalls page, and the Shearer ch. 3 sections on over-trimming.
- **WP7.2 white-line abscess:** the field guide's "Injury of the horn" page, and Shearer ch. 4.
- **WP7.2 digital dermatitis:** the field guide's DD treatment page, and Shearer ch. 4 and ch. 6 (footbaths).
- **WP7.4 farm profiles (housing, mud, condition mix):** Shearer ch. 4 and ch. 8, and Cramer.

## Adding a document
1. Copy the PDF into `reference/docs/` with a short kebab-case name.
2. Run `pdftotext -layout name.pdf name.txt` (it ships with Git for Windows).
3. Add a row to the table above.
