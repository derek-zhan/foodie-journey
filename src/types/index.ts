// Core data model for the restaurant diary pipeline

export interface PhotoAsset {
  id: string;
  uri: string;
  timestamp: number; // unix ms, from EXIF or asset creationTime
  latitude: number | null;
  longitude: number | null;
}

export interface ResolvedPlace {
  placeId: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  types: string[]; // Google Places types, filtered to food/restaurant categories
}

export interface Visit {
  id: string;
  place: ResolvedPlace;
  photoIds: string[];
  startedAt: number;
  endedAt: number;
  // filled in once the user does the voice journal step
  transcript?: string;
  notes?: string;
  rating?: number; // 1-5
  tags?: string[];
  confirmed: boolean; // user tapped "yes this is right"
  // photoId -> caption, filled in from the per-photo overlay (DiaryScreen's
  // thumbnail row). Absent/empty means no caption for that photo yet.
  photoCaptions?: Record<string, string>;
}
