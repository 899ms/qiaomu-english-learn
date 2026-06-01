# Qiaomu English Learn Product Direction

## Positioning

`qiaomu-english-learn` is a Read Frog learning-focused fork. It should keep Read Frog's existing translation surfaces and add a vocabulary learning layer instead of removing translation features.

The product promise is not "translate everything into Chinese". It is "make English readable just enough today, then gradually remove help as the learner proves words are known."

## Core Mode

The new mode is a translation + learning mode:

- Default threshold: CET4 and above.
- Default behavior: lightly annotate or explain target words instead of translating whole pages by default.
- User control: every assisted word can be marked as known.
- Persistence: known words are remembered across pages and sessions.
- Result: assisted words decline over time until the user can comfortably read full English content.

## Keep Existing Scenarios

Do not collapse the product into only webpage word highlighting. Vocabulary learning should eventually work across:

- Webpage reading and page translation.
- Selection translation and dictionary actions.
- Video subtitle translation.
- Text-to-speech and pronunciation practice.
- Future review/export flows.

These scenarios should remain first-class Read Frog capabilities. The learning layer observes and assists them; it should not replace their original translation, subtitle, or TTS behavior.

## V0 Scope

V0 should be additive and low-risk:

- Add `wordLearning` config with an enable switch, threshold, display mode, and known-word behavior.
- Add a local vocabulary classifier interface. Start with a small seed lexicon; later generate a full lexicon from licensed sources.
- Add page-level visible text annotation for eligible English words.
- Add a compact word popover with definition, level, "Save", "Known", and "Hide" actions.
- Record eligible word encounters across page reading, selection translation, subtitle viewing, and TTS.
- Add a review surface for collected words so users can save words, review due words, mark words as known, hidden, or back to review.
- Keep existing page translation, subtitles, selection toolbar, providers, and TTS intact.

## Saved Words And Review

`Known`, `Hide`, and `Save` are separate concepts:

- `Known`: the learner already understands the word, so default page assistance can disappear.
- `Hide`: the word is noise or not useful, so it should be suppressed.
- `Save`: the word enters the review deck, independent of whether it is currently shown on pages.

Saved words should have lightweight spaced review metadata: due time, interval, ease, correct streak, lapse count, and total reviews. The first implementation can use simple Again/Hard/Good/Easy scheduling; the storage shape should stay flexible enough to support richer recall, listening, context sentence, and export flows later.

## Data Sources

Candidate sources to generate a complete local lexicon:

- `JavaProgrammerLB/cet-word-list`, MIT license, for CET vocabulary membership.
- `skywind3000/ECDICT`, MIT license, for English-Chinese definitions and metadata.

Generated lexicon files should retain attribution and license notes.

Current generated lexicon:

- Output: `src/utils/word-learning/generated-lexicon.ts`.
- Size: 14,886 entries generated from ECDICT exam tags plus the CET word list.
- Command: `pnpm generate:word-learning-lexicon -- --cet /tmp/cet-word-list.txt --ecdict /tmp/ecdict.csv --out src/utils/word-learning/generated-lexicon.ts`.
- Curated seed entries in `src/utils/word-learning/lexicon.ts` intentionally override generated entries when shorter reading glosses are better.
- Attribution details are tracked in `docs/product/word-learning-data-sources.md`.
