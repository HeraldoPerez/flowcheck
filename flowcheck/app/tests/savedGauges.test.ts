import { describe, expect, it } from "vitest";
import { addGauge, loadSavedGauges, removeGauge, STORAGE_KEY, storeSavedGauges } from "../src/lib/savedGauges";
import type { Gauge } from "../src/usgs/types";

const belva: Gauge = {
  id: "USGS-03192000",
  name: "GAULEY RIVER ABOVE BELVA, WV",
  state: "West Virginia",
  county: "Nicholas County",
  lat: 38.2334,
  lon: -81.1809,
  drainageAreaSqMi: 1316,
};
const craigsville: Gauge = { ...belva, id: "USGS-03189100", name: "GAULEY RIVER NEAR CRAIGSVILLE, WV" };

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    data,
  };
}

describe("saved gauges", () => {
  it("adds gauges once, in order, and removes them", () => {
    const now = new Date("2026-11-09T14:00:00Z");
    let list = addGauge([], belva, now);
    list = addGauge(list, craigsville, now);
    list = addGauge(list, belva, now);

    expect(list.map((g) => g.id)).toEqual(["USGS-03192000", "USGS-03189100"]);
    expect(list[0]).toEqual({ ...belva, savedAt: "2026-11-09T14:00:00.000Z" });
    expect(removeGauge(list, "USGS-03192000").map((g) => g.id)).toEqual(["USGS-03189100"]);
  });

  it("round-trips through storage", () => {
    const storage = memoryStorage();
    const list = addGauge([], belva);

    expect(storeSavedGauges(list, storage)).toBe(true);
    expect(JSON.parse(storage.data.get(STORAGE_KEY)!).version).toBe(1);
    expect(loadSavedGauges(storage)).toEqual(list);
  });

  it("starts empty when storage is missing, broken or from an unknown version", () => {
    expect(loadSavedGauges(null)).toEqual([]);
    expect(loadSavedGauges(memoryStorage())).toEqual([]);
    expect(loadSavedGauges(memoryStorage({ [STORAGE_KEY]: "{not json" }))).toEqual([]);
    expect(loadSavedGauges(memoryStorage({ [STORAGE_KEY]: JSON.stringify({ version: 99, gauges: [] }) }))).toEqual([]);
  });

  it("drops entries that aren't gauges", () => {
    const good = { ...belva, savedAt: "2026-11-09T14:00:00.000Z" };
    const stored = JSON.stringify({ version: 1, gauges: [good, { id: 5 }, null, "x"] });
    expect(loadSavedGauges(memoryStorage({ [STORAGE_KEY]: stored }))).toEqual([good]);
  });

  it("reports when the browser refuses to store", () => {
    const full = {
      getItem: () => null,
      setItem: () => {
        throw new DOMException("Quota exceeded", "QuotaExceededError");
      },
    };
    expect(storeSavedGauges(addGauge([], belva), full)).toBe(false);
    expect(storeSavedGauges([], null)).toBe(false);
  });
});
