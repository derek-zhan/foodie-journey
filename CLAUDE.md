# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## What this is

Foodie Journey (Expo/React Native, TypeScript). Iteration 1 goal: detect
restaurant visits from geotagged photos and browse them as a diary. No
posting to Google Maps/Yelp yet (that's phase 2). See README.md for the
full pipeline description and current build status.

## Commands

- `npm install` — install dependencies
- `npm start` — start the Expo dev server (then open in Expo Go, or press i/a/w)
- `npm run ios` / `npm run android` — start and target a platform directly
- `npm run web` — runs `scripts/webDev.js`, not `expo start --web` directly.
  It fronts Metro with a small proxy on :8082 that adds cross-origin
  isolation headers expo-sqlite's web backend needs — **open :8082, not
  :8081**. See the comment at the top of that file for why.

- `npm test` — runs Jest (`src/**/__tests__/*.test.ts`). Both existing
  tests are live functional tests, not unit tests: real network calls,
  NOT wired into CI (a flaky public API shouldn't block unrelated PRs).
  See each file's own comment before adding more tests in this style, and
  the note on jest.config.js below before touching Jest config.
  - `clusterVisits.functional.test.ts` — a hardcoded known-good coordinate
  - `scanLocalTestPhotos.functional.test.ts` — drop real photos (with real
    EXIF GPS) into a gitignored `/.test` folder at the project root and
    this runs them through the real pipeline instead; skips (doesn't
    fail) when that folder is empty/absent, so a fresh clone is unaffected

There is no lint tooling configured in this repo yet (no eslint or
prettier config present) — don't assume `npm run lint` exists.

Environment: copy `.env.example` to `.env`. `EXPO_PUBLIC_ANTHROPIC_API_KEY`
(journal structuring + diary Q&A) is checked lazily and throws if missing —
no startup validation. `EXPO_PUBLIC_GOOGLE_PLACES_API_KEY` (requires "Places
API (New)" enabled in Google Cloud Console) is optional — `resolvePlace.ts`
falls back to OpenStreetMap/Overpass (no key) when it's unset or when the
Google call fails; see `resolveOsmPlace.ts`. Both keys that exist are
`EXPO_PUBLIC_*` and ship in the client bundle; see the caveat comment atop
`journalVisit.ts`/`searchDiary.ts`. Diary search itself (`searchVisits` in
`visitStore.ts`) needs no key at all — it's local SQLite FTS5, not an
embeddings API.

## Architecture

Single linear pipeline, each stage a pure-ish async function in
`src/pipeline/`, wired together and persisted from `src/screens/DiaryScreen.tsx`:

```
extractPhotoMetadata (src/pipeline/extractPhotoMetadata.ts)
  → reads device photo library via expo-media-library, paginated,
    filters to geotagged photos only, returns PhotoAsset[] sorted by time.
    Imports from "expo-media-library/legacy", NOT the bare package name -
    the bare "expo-media-library" is SDK 57's new class-based Asset/Album/
    Query API, and its re-exported old functional API
    (requestPermissionsAsync/getAssetsAsync/getAssetInfoAsync, which this
    whole file uses) is a deliberate throw-on-call deprecation shim, not a
    real implementation. This bit natively too, not just on web - found
    while wiring up thumbnails. Same file also exports
    getAssetThumbnailUri(photoId) - resolves a stored photoId back to a
    displayable uri (DiaryScreen uses it for the photo thumbnail row);
    returns null instead of throwing if the asset can't be resolved
    anymore (deleted, permission revoked since the scan)

clusterVisits (src/pipeline/clusterVisits.ts)
  → groups PhotoAsset[] into visits using two thresholds: MAX_GAP_MINUTES
    (90) and MAX_DISTANCE_METERS (150, haversine). For each cluster it
    calls resolvePlace on the centroid; clusters that don't resolve to a
    food place are dropped (e.g. photos taken at home)

resolvePlace (src/pipeline/resolvePlace.ts)
  → Google Places API "searchNearby" (New), restricted to FOOD_PLACE_TYPES
    (restaurant/cafe/bar/bakery/meal_takeaway/meal_delivery), 75m radius
    to absorb GPS drift. Falls back to resolveOsmPlace (OpenStreetMap via
    the public Overpass API, no key, same 75m radius) when no Google key
    is configured or the Google call throws — a deliberately simple POC
    fallback, not a real multi-provider abstraction. OSM elements can be
    "way"s (buildings), which carry a `center` instead of `lat`/`lon` —
    resolveOsmPlace handles both. Either path returns null (not an error)
    when nothing food-related is nearby — clusterVisits relies on this to
    filter non-visits

journalVisit (src/pipeline/journalVisit.ts)
  → Claude API (`client.messages.parse` + a Zod `output_config.format`)
    turns a raw transcript into {notes, tags, rating}. Speech-to-text
    capture itself isn't wired up — DiaryScreen collects the transcript
    via a plain TextInput, so this stage is really just the "LLM
    structuring" half of the voice journal step

visitStore (src/db/visitStore.ts)
  → SQLite (expo-sqlite, synchronous API). initDb() creates the visits
    table and a visits_fts FTS5 virtual table if missing (see below), then
    backfills any pre-existing journaled visit that predates the index.
    Two write entry points, deliberately not one — see the comment on
    mergeRescannedVisit for why:
      • upsertVisit(visit) — writes exactly what's passed, full overwrite.
        Used by DiaryScreen.saveJournal for deliberate journal edits,
        where an absent field (e.g. Claude giving no rating this time)
        should genuinely clear the old value, not preserve it.
      • upsertScannedVisit(visit) — merges against any existing row first
        (mergeRescannedVisit) before writing. Used only by DiaryScreen.
        runScan's re-detection loop, where clusterVisits() always
        produces a Visit with no journal fields at all; place/photoIds/
        startedAt/endedAt are write-once and `confirmed` is sticky (OR,
        not overwrite) across a re-scan for the same reason.
    Visit ids are `${placeId}-${firstPhotoTimestamp}`, and listVisits()
    reverse-engineers placeId from that composite id rather than storing
    it separately — keep that in sync if the id format ever changes. On
    web (in-memory fallback, no real SQLite — see the Platform.OS guard
    at the top of the file) there's no FTS5 either; searchVisits()
    degrades to a plain keyword-overlap scan there
```

`Visit` and its sub-types (`PhotoAsset`, `ResolvedPlace`) are the shared
data model, defined once in `src/types/index.ts`.

`App.tsx` owns DB init (`initDb`) and a two-tab switch (no navigation
library) between `DiaryScreen` (drives the scan → cluster → resolve
pipeline, plus per-visit journal entry) and `AskDiaryScreen` (RAG query
UI).

### RAG layer (`src/rag/`)

A visit only becomes searchable once it's journaled — the FTS5 index is
derived from the journaled `notes`/`tags`, not the raw photos/transcript,
and is resynced by `writeVisitRow` (visitStore.ts, shared by both
`upsertVisit` and `upsertScannedVisit`) every time a visit is written,
including from `DiaryScreen.saveJournal` right after `journalVisit`
returns.

```
searchDiary.ts
  → findRelevantVisits(query): delegates straight to visitStore's
    searchVisits() (local SQLite FTS5 + bm25 ranking — see visitStore.ts
    above; no embeddings, no external API). askDiary(query): feeds the
    top 5 results to Claude as numbered context and asks it to answer
    citing [n] — the "only from context" instruction is what keeps it
    from inventing visits that aren't in the diary. Retrieval is
    lexical, not semantic: a query has to share actual words with a
    visit's notes/tags/place name to match
```

### Not yet built (see README.md for details)

- Voice *capture* (speech-to-text → transcript) — journaling takes typed/
  pasted transcript text today; only the LLM-structuring half exists
- Manual "confirm this visit" / correction UI — `Visit.confirmed` exists
  but is never set true
- Posting drafted reviews externally (phase 2)

## Development workflow

GitHub branch protection on `master` (blocking direct pushes, requiring
a green CI check) is **not enabled** — this repo is private on a free
plan, and GitHub returns 403 "Upgrade to GitHub Pro or make this
repository public to enable this feature" for branch protection on
private repos at that tier. Until the repo goes public or upgrades,
this is a convention enforced by whoever/whatever is committing
(including Claude), not by GitHub. For every new feature or fix:

1. Branch off `master`: `feature/<slug>` or `fix/<slug>`.
2. Implement and commit on that branch.
3. `npx tsc --noEmit` clean before opening the PR.
4. Open the PR with `gh pr create` (the template in
   `.github/pull_request_template.md` fills in automatically).
5. Once CI is green, squash-merge (`gh pr merge --squash --delete-branch`)
   so `master` stays one commit per feature.

Don't commit or push directly to `master` — even a one-line fix goes
through a branch + PR so CI runs on it.

**Prototyping-stage note:** the `code-review` skill pass before merging
is skipped for now — it's thorough but expensive (multiple parallel
sub-agents per PR), and at this stage "works, ship it, fix bugs as they
turn up" is the right tradeoff over catching everything pre-merge. Revisit
this once the app is past rough prototyping and bugs actually start
costing real time to track down after the fact.

## Working in this codebase

- Expo APIs move fast between major versions — **read
  https://docs.expo.dev/versions/v57.0.0/ before writing Expo-related code**
  rather than relying on training data (this is the point of the
  `@AGENTS.md` import above).
- `tsconfig.json` has `strict: true` — keep new code strict-clean.
- Never commit a real Google Places API key; `.env` is gitignored, only
  `.env.example` should be tracked.
- `jest.config.js` deliberately does NOT use the `jest-expo` preset, even
  though `babel-preset-expo`/`babel.config.js` are present (added for
  Jest's sake - this project has no other reason to need a root babel
  config, since Metro doesn't require one). `jest-expo`'s React Native
  test environment stubs/mocks `fetch` for hermetic component testing,
  which silently broke the live functional test above (real requests came
  back as empty non-responses, not errors). Plain `testEnvironment: "node"`
  has real global `fetch`; the only thing actually needed from Expo's
  tooling is `transformIgnorePatterns` allowing `node_modules/expo/` to be
  babel-transformed, because `EXPO_PUBLIC_*` env-var inlining pulls in a
  real-but-ESM-syntax file (`expo/virtual/env.js`) that Jest's default
  "skip all of node_modules" transform setting skips. If you ever add
  component/hook tests that need React Native's test environment, that's
  a real reason to reach for `jest-expo` — just know it may reintroduce
  this fetch-mocking behavior for any test that needs live network.
