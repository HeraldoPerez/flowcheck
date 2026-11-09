import type { Gauge } from "../usgs/types";

/** A gauge the user saved. Kept in the browser only; nothing is sent anywhere. */
export interface SavedGauge extends Gauge {
  savedAt: string;
}

export const STORAGE_KEY = "flowcheck.savedGauges";

/** What's written to storage. The version lets later releases migrate old data. */
interface StoredData {
  version: 1;
  gauges: SavedGauge[];
}

type StorageLike = Pick<Storage, "getItem" | "setItem">;

/** localStorage, or null where the browser blocks it (some private modes do). */
export function browserStorage(): StorageLike | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/** Reads saved gauges. Missing, unreadable or unknown data gives an empty list instead of an error. */
export function loadSavedGauges(storage: StorageLike | null = browserStorage()): SavedGauge[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw) as Partial<StoredData>;
    if (data.version !== 1 || !Array.isArray(data.gauges)) return [];
    return data.gauges.filter(isSavedGauge);
  } catch {
    return [];
  }
}

/** Writes saved gauges. Returns false if the browser refused (storage full or blocked). */
export function storeSavedGauges(gauges: SavedGauge[], storage: StorageLike | null = browserStorage()): boolean {
  if (!storage) return false;
  try {
    const data: StoredData = { version: 1, gauges };
    storage.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

/** Adds a gauge to the end of the list. Saving one that's already there changes nothing. */
export function addGauge(list: SavedGauge[], gauge: Gauge, now: Date = new Date()): SavedGauge[] {
  if (list.some((g) => g.id === gauge.id)) return list;
  const { id, name, state, county, lat, lon, drainageAreaSqMi } = gauge;
  return [...list, { id, name, state, county, lat, lon, drainageAreaSqMi, savedAt: now.toISOString() }];
}

export function removeGauge(list: SavedGauge[], id: string): SavedGauge[] {
  return list.filter((g) => g.id !== id);
}

function isSavedGauge(value: unknown): value is SavedGauge {
  if (typeof value !== "object" || value === null) return false;
  const g = value as Record<string, unknown>;
  return typeof g.id === "string" && typeof g.name === "string" && typeof g.savedAt === "string";
}
