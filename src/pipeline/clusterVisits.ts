import type { PhotoAsset, ResolvedPlace, Visit } from "../types";
import { resolvePlace } from "./resolvePlace";

const MAX_GAP_MINUTES = 90; // photos more than this apart are separate visits
const MAX_DISTANCE_METERS = 150; // photos further apart are separate visits

function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * Stage 4: Visit clustering
 *
 * Groups photos taken close together in time AND space into a single visit,
 * then resolves each cluster's centroid to a restaurant via the Places API.
 * Clusters that don't resolve to a food place are dropped.
 */
export async function clusterVisits(photos: PhotoAsset[]): Promise<Visit[]> {
  const sorted = [...photos].sort((a, b) => a.timestamp - b.timestamp);
  const clusters: PhotoAsset[][] = [];

  for (const photo of sorted) {
    if (photo.latitude == null || photo.longitude == null) continue;

    const last = clusters[clusters.length - 1];
    const lastPhoto = last?.[last.length - 1];

    const withinTime =
      lastPhoto &&
      (photo.timestamp - lastPhoto.timestamp) / 60000 <= MAX_GAP_MINUTES;
    const withinDistance =
      lastPhoto &&
      lastPhoto.latitude != null &&
      lastPhoto.longitude != null &&
      haversineMeters(
        lastPhoto.latitude,
        lastPhoto.longitude,
        photo.latitude,
        photo.longitude
      ) <= MAX_DISTANCE_METERS;

    if (last && withinTime && withinDistance) {
      last.push(photo);
    } else {
      clusters.push([photo]);
    }
  }

  const visits: Visit[] = [];

  for (const cluster of clusters) {
    const centroid = {
      latitude:
        cluster.reduce((s, p) => s + (p.latitude ?? 0), 0) / cluster.length,
      longitude:
        cluster.reduce((s, p) => s + (p.longitude ?? 0), 0) / cluster.length,
    };

    const place: ResolvedPlace | null = await resolvePlace(
      centroid.latitude,
      centroid.longitude
    );
    if (!place) continue; // not a food place — skip (e.g. photo at home)

    visits.push({
      id: `${place.placeId}-${cluster[0].timestamp}`,
      place,
      photoIds: cluster.map((p) => p.id),
      startedAt: cluster[0].timestamp,
      endedAt: cluster[cluster.length - 1].timestamp,
      confirmed: false,
    });
  }

  return visits;
}
