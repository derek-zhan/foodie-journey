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
- `extractPhotoMetadata.ts` — reads the device photo library via `expo-media-library`
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
UI: `src/screens/DiaryScreen.tsx` (timeline + journal entry) and `src/screens/AskDiaryScreen.tsx` (ask the diary), switched via a tab bar in `App.tsx`

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

`npm test` runs the one functional test that exists so far: mocks a
photo's EXIF coordinates and confirms `clusterVisits` → `resolvePlace`
actually resolves them to a real nearby restaurant. It hits a live
public API (not mocked), so it's not part of CI — run it manually when
touching the place-resolution pipeline.

## Not yet built

- Voice *capture* (speech-to-text) — journaling currently takes pasted/typed
  transcript text; the LLM-structuring half is wired up
- Manual "confirm this visit" UI to correct misresolved places
- Posting drafted reviews to Google Maps / Yelp / OpenTable (phase 2)
