# Foodie Journey

Iteration 1: detect restaurant visits from geotagged photos, journal them by
voice, and browse them as a diary. No posting to Google Maps/Yelp yet — that's
phase 2.

## Pipeline

```
Phone photo library
  → EXIF extraction (GPS + timestamp)
  → Places API lookup (reverse geocode to restaurant)
  → Visit clustering (group nearby photos in time)
  → Voice journal (LLM structuring of a transcript into notes/tags/rating)
  → Local diary storage (SQLite, timeline UI, FTS5 search index)
  → Ask the diary (RAG: local full-text retrieval, Claude answers)
```

Each stage lives in `src/pipeline/`:
- `extractPhotoMetadata.ts` — reads the device photo library via
  `expo-media-library/legacy` (SDK 57's default export is a newer
  class-based API; the old functional one this app uses only works from
  the `/legacy` subpath). Also resolves a stored photo id back to a
  displayable thumbnail on demand
- `resolvePlace.ts` — resolves coordinates to a restaurant. Prefers Google Places
  (Nearby Search) when `EXPO_PUBLIC_GOOGLE_PLACES_API_KEY` is set; falls back to
  `resolveOsmPlace.ts` (OpenStreetMap/Overpass — free, no key) when it isn't, or
  when the Google call itself fails. OSM's restaurant coverage/metadata is
  noticeably patchier than Google's outside dense cities — this is a
  proof-of-concept fallback, not a claim of equivalent quality
- `clusterVisits.ts` — groups photos into discrete visits by time + distance proximity
- `journalVisit.ts` — turns a transcript into structured notes/tags/rating via the Claude API

RAG (search over the diary) lives in `src/rag/`:
- `searchDiary.ts` — retrieves the most relevant journaled visits for a query via local full-text search and has Claude answer from them

Retrieval is entirely local: `visitStore.ts` maintains a SQLite FTS5 index
(bm25-ranked) over each visit's notes/tags/place name — no embeddings, no
external API for search. It's lexical, not semantic (a query for "ramen"
won't match a note that only says "noodle soup"), which is a real tradeoff
against something like Voyage/OpenAI embeddings, but it's free, offline, and
plenty for searching your own vocabulary over your own diary.

Storage: `src/db/visitStore.ts` (visits + the FTS5 index), SQLite via `expo-sqlite`
UI: `src/screens/DiaryScreen.tsx` (timeline, photo thumbnails, journal entry),
`src/screens/ReviewScreen.tsx` (today's detected visits only, for same-day
voice journaling) and `src/screens/AskDiaryScreen.tsx` (ask the diary),
switched via a tab bar in `App.tsx`. Both journaling screens share
`src/components/JournalForm.tsx` and `src/hooks/useAssetThumbnails.ts`.
Photos themselves are never copied into the app — only the device's asset id is
stored (see `Visit.photoIds`), and thumbnails are resolved from that id at
render time.

## Setup

1. `npm install`
2. Copy `.env.example` to `.env` and add:
   - a Google Places API key (enable "Places API (New)" in Google Cloud Console) —
     optional; without it, place resolution falls back to OpenStreetMap
   - an Anthropic API key (for journal structuring and diary Q&A)
3. `npm start` — then open in Expo Go on your phone, or run `npm run ios` / `npm run android`

Note: both keys are `EXPO_PUBLIC_*` and ship inside the client bundle —
fine for this exploratory build, not for a distributed app (would need a
backend proxy).

## Testing

`npm test` runs the functional tests that exist so far — all hit a live
public API (not mocked), so none are part of CI; run them manually when
touching the place-resolution or journaling pipeline:
- `clusterVisits.functional.test.ts` — a hardcoded known-good coordinate
- `scanLocalTestPhotos.functional.test.ts` — drop your own photos (real
  EXIF GPS data) into a `.test/` folder at the project root and it runs
  them through the real pipeline instead. That folder is gitignored (real
  personal photos, real locations) and the test just skips if it's empty,
  so this is opt-in per developer
- `reviewToday.functional.test.ts` — same `.test/` photos, retimed to
  "now" so they exercise the Review screen's "today only" filter, then
  runs the resolved visit through the real `journalVisit()` Claude call
  too (skipped if `EXPO_PUBLIC_ANTHROPIC_API_KEY` isn't set to a real key)

`jest.setup.js` loads `.env` before any test runs (via `@expo/env`, the
same loader `expo start` uses) — without it, Jest's plain Node process
never sees `EXPO_PUBLIC_*` at all.

### Local web dev with `.test/` photos

Since a browser has no device photo library, `npm run web` would
otherwise always show an empty Diary/Review with nothing to scan. In
local dev only, `extractPhotoMetadata.ts` instead fetches from a route
`scripts/webDev.js`'s proxy serves (`/__test-photos`), which live-reads
the same `.test/` folder above via `exifr` on every request — drop a
photo in, hit Refresh, see it flow through the real pipeline. This is
gated on `Platform.OS === "web" && __DEV__`, so it's compiled out of any
production/release build the same way React strips its own dev-only
warnings — not just unused in practice, structurally unreachable.

## Not yet built

- Manual "confirm this visit" UI to correct misresolved places
- Posting drafted reviews to Google Maps / Yelp / OpenTable (phase 2)

Voice capture works via the OS keyboard's built-in dictation (tap the mic on
the iOS/Android keyboard while the journal transcript field is focused) —
there's no in-app speech-to-text library or recording UI, just a plain
`TextInput` that dictation types into like any other text field.
