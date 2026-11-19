// Shared by resolvePlace.ts and resolveOsmPlace.ts - none of their 4 fetch
// calls (Google Places, Overpass, Nominatim) had a timeout, so a hung
// request could freeze a scan or RestaurantPicker's search indefinitely
// with no way to cancel short of force-quitting. AbortController/fetch's
// `signal` option are both standard RN/Hermes globals - no new dependency.
export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = 10000
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err: any) {
    if (err?.name === "AbortError") {
      throw new Error("Request timed out - try again");
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}
