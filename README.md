# Restaurant diary

Iteration 1: detect restaurant visits from geotagged photos, journal them by
voice, and browse them as a diary. No posting to Google Maps/Yelp yet — that's
phase 2.

## Pipeline

```
Phone photo library
  → EXIF extraction (GPS + timestamp)
  → Places API lookup (reverse geocode to restaurant)
  → Visit clustering (group nearby photos in time)
  → Voice journal (speech-to-text + LLM notes)   [not yet wired up]
  → Local diary storage (SQLite, timeline UI)
```

Each stage lives in `src/pipeline/`:
- `extractPhotoMetadata.ts` — reads the device photo library via `expo-media-library`
- `resolvePlace.ts` — calls Google Places API (Nearby Search) to resolve coordinates to a restaurant
- `clusterVisits.ts` — groups photos into discrete visits by time + distance proximity

Storage: `src/db/visitStore.ts` (SQLite via `expo-sqlite`)
UI: `src/screens/DiaryScreen.tsx`

## Setup

1. `npm install`
2. Copy `.env.example` to `.env` and add your Google Places API key
   (enable the "Places API (New)" in Google Cloud Console)
3. `npm start` — then open in Expo Go on your phone, or run `npm run ios` / `npm run android`

## Not yet built

- Voice journal capture (speech-to-text + LLM structuring) — stubbed as a
  pipeline stage but not wired to a screen yet
- Manual "confirm this visit" UI to correct misresolved places
- Posting drafted reviews to Google Maps / Yelp / OpenTable (phase 2)
