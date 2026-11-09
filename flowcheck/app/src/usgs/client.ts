import type { FlowReading, Gauge } from "./types";

export const USGS_API_BASE = "https://api.waterdata.usgs.gov/ogcapi/v1";

/** USGS parameter code for discharge (streamflow), in cubic feet per second. */
const DISCHARGE = "00060";
/** Latest readings older than this are left out, so retired gauges don't look current. */
const LATEST_WINDOW = "P2D";
/** How many gauge IDs go into one latest-values request. Keeps URLs short. */
const IDS_PER_REQUEST = 40;
/** The API answers with at most this many items per page. */
const PAGE_LIMIT = 10_000;
const MAX_PAGES = 5;

/**
 * Words that are in almost every gauge name, often abbreviated ("R", "NR").
 * Requiring them would hide matches like "YOUGHIOGHENY R NR CONFLUENCE".
 */
const FILLER_WORDS = new Set(["RIVER", "R", "CREEK", "CR", "NEAR", "NR", "AT", "THE", "OF"]);

/** A request to the USGS Water Data API failed. `message` is safe to show to users. */
export class UsgsError extends Error {
  /** HTTP status from USGS, or null when no response arrived. */
  readonly status: number | null;
  readonly url: string;

  constructor(message: string, { status = null, url, cause }: { status?: number | null; url: string; cause?: unknown }) {
    super(message, { cause });
    this.name = "UsgsError";
    this.status = status;
    this.url = url;
  }
}

export interface UsgsClientOptions {
  fetch?: typeof globalThis.fetch;
  baseUrl?: string;
  /** Give up on a request after this long. The API is sometimes slow. */
  timeoutMs?: number;
}

export interface SearchOptions {
  /** River or place name ("gauley", "arkansas granite"), or a USGS site number. */
  text: string;
  /** Full state name as USGS writes it, e.g. "West Virginia". */
  state?: string;
  limit?: number;
  signal?: AbortSignal;
}

type Params = Record<string, string>;
type Feature = { id?: unknown; properties?: Record<string, unknown>; geometry?: { coordinates?: unknown } | null };
type FeatureCollection = { features: Feature[]; links?: { rel?: string; href?: string }[] };

/**
 * Client for the USGS Water Data OGC APIs (api.waterdata.usgs.gov).
 * No key needed, and the API allows calls straight from the browser.
 */
export function createUsgsClient({
  fetch: fetchImpl = (input, init) => globalThis.fetch(input, init),
  baseUrl = USGS_API_BASE,
  timeoutMs = 30_000,
}: UsgsClientOptions = {}) {
  async function getJson(url: string, signal?: AbortSignal): Promise<unknown | null> {
    const timeout = AbortSignal.timeout(timeoutMs);
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;

    let res: Response;
    try {
      res = await fetchImpl(url, { signal: combined });
    } catch (cause) {
      if (signal?.aborted) throw signal.reason; // The caller cancelled; not an error to show.
      if (timeout.aborted) {
        throw new UsgsError("USGS took too long to answer. Try again in a minute.", { url, cause });
      }
      throw new UsgsError("Couldn't reach USGS. Check your connection and try again.", { url, cause });
    }

    if (res.status === 404) return null;
    if (!res.ok) throw new UsgsError(messageForStatus(res.status), { status: res.status, url });

    try {
      return await res.json();
    } catch (cause) {
      if (signal?.aborted) throw signal.reason;
      throw new UsgsError("USGS sent a response FlowCheck couldn't read.", { status: res.status, url, cause });
    }
  }

  async function getCollection(url: string, signal?: AbortSignal): Promise<FeatureCollection> {
    const data = await getJson(url, signal);
    if (data === null) return { features: [] };
    if (!isFeatureCollection(data)) {
      throw new UsgsError("USGS sent a response FlowCheck couldn't read.", { url });
    }
    return data;
  }

  function itemsUrl(collection: string, params: Params): string {
    const query = new URLSearchParams({ f: "json", ...params });
    return `${baseUrl}/collections/${collection}/items?${query}`;
  }

  /**
   * Finds USGS stream gauges by name, optionally within one state.
   * A site number ("03192000" or "USGS-03192000") looks up that gauge directly.
   * Returns gauges in USGS order, which roughly follows each river downstream.
   */
  async function searchGauges({ text, state, limit = 50, signal }: SearchOptions): Promise<Gauge[]> {
    const siteNumber = parseSiteNumber(text);
    if (siteNumber) {
      const gauge = await getGauge(`USGS-${siteNumber}`, signal);
      return gauge ? [gauge] : [];
    }

    const filter = buildSearchFilter(text, state);
    if (!filter) return [];

    const url = itemsUrl("monitoring-locations", {
      limit: String(limit),
      properties: "monitoring_location_name,state_name,county_name,drainage_area",
      "filter-lang": "cql2-text",
      filter,
    });
    const data = await getCollection(url, signal);
    return data.features.map(toGauge).filter((g): g is Gauge => g !== null);
  }

  /** One gauge by ID ("USGS-03192000"), or null if USGS has no such site. */
  async function getGauge(id: string, signal?: AbortSignal): Promise<Gauge | null> {
    const url = `${baseUrl}/collections/monitoring-locations/items/${encodeURIComponent(id)}?f=json`;
    const data = await getJson(url, signal);
    return data === null ? null : toGauge(data as Feature);
  }

  /**
   * The newest streamflow reading for each gauge, from the last 2 days.
   * Gauges with no recent reading (retired, seasonal, or not a flow gauge) are left out of the map.
   */
  async function getLatestFlows(ids: string[], signal?: AbortSignal): Promise<Map<string, FlowReading>> {
    const unique = [...new Set(ids)];
    const chunks: string[][] = [];
    for (let i = 0; i < unique.length; i += IDS_PER_REQUEST) chunks.push(unique.slice(i, i + IDS_PER_REQUEST));

    const pages = await Promise.all(
      chunks.map((chunk) =>
        getCollection(
          itemsUrl("latest-continuous", {
            monitoring_location_id: chunk.join(","),
            parameter_code: DISCHARGE,
            time: LATEST_WINDOW,
            skipGeometry: "true",
            limit: "500",
            properties: "monitoring_location_id,time,value,approval_status,qualifier",
          }),
          signal,
        ),
      ),
    );

    const latest = new Map<string, FlowReading>();
    for (const feature of pages.flatMap((page) => page.features)) {
      const id = feature.properties?.monitoring_location_id;
      const reading = toReading(feature);
      if (typeof id !== "string" || !reading) continue;
      // A few gauges have more than one discharge series. Keep the newest reading.
      const current = latest.get(id);
      if (!current || Date.parse(reading.time) > Date.parse(current.time)) latest.set(id, reading);
    }
    return latest;
  }

  /** Streamflow readings for the last `days` days, oldest first. Usually one every 15 minutes. */
  async function getFlowHistory(id: string, { days = 7, signal }: { days?: number; signal?: AbortSignal } = {}) {
    if (!Number.isInteger(days) || days < 1 || days > 31) throw new RangeError("days must be a whole number from 1 to 31");

    let url: string | undefined = itemsUrl("continuous", {
      monitoring_location_id: id,
      parameter_code: DISCHARGE,
      time: `P${days}D`,
      skipGeometry: "true",
      limit: String(PAGE_LIMIT),
      properties: "time_series_id,time,value,approval_status,qualifier",
    });

    const bySeries = new Map<string, FlowReading[]>();
    for (let page = 0; url && page < MAX_PAGES; page++) {
      const data = await getCollection(url, signal);
      for (const feature of data.features) {
        const reading = toReading(feature);
        if (!reading) continue;
        const series = String(feature.properties?.time_series_id ?? "");
        const list = bySeries.get(series) ?? [];
        list.push(reading);
        bySeries.set(series, list);
      }
      url = nextPageUrl(data, baseUrl);
    }

    // If a gauge has two discharge series (rare), mixing them would make a zigzag. Use the fuller one.
    const readings = [...bySeries.values()].sort((a, b) => b.length - a.length)[0] ?? [];
    return readings.sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
  }

  return { searchGauges, getGauge, getLatestFlows, getFlowHistory };
}

export type UsgsClient = ReturnType<typeof createUsgsClient>;

/** "03192000", "USGS-03192000" or "usgs 03192000" -> "03192000". Anything else -> null. */
export function parseSiteNumber(text: string): string | null {
  const match = text.trim().match(/^(?:usgs[-\s]?)?(\d{8,15})$/i);
  return match ? match[1] : null;
}

/**
 * Builds the CQL2 filter for a name search: USGS stream sites whose name contains
 * every word typed, in any order. Returns null when there's nothing to search for.
 */
export function buildSearchFilter(text: string, state?: string): string | null {
  const words = text
    .toUpperCase()
    .replace(/[%_\\]/g, " ") // LIKE wildcards and escapes
    .split(/\s+/)
    .map((word) => word.replace(/^[^\w']+|[^\w']+$/g, ""))
    .filter((word) => /\w/.test(word));
  if (words.join("").length < 2) return null;

  const meaningful = words.filter((word) => !FILLER_WORDS.has(word));
  const terms = [...new Set(meaningful.length > 0 ? meaningful : words)];

  const clauses = ["agency_code='USGS'", "site_type_code='ST'"];
  if (state) clauses.push(`state_name=${cqlString(state)}`);
  for (const term of terms) clauses.push(`monitoring_location_name LIKE ${cqlString(`%${term}%`)}`);
  return clauses.join(" AND ");
}

function cqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function messageForStatus(status: number): string {
  if (status === 429) return "USGS is getting too many requests right now. Wait a minute and try again.";
  if (status === 400) return "USGS couldn't understand that search. Try different words.";
  if (status >= 500) return `The USGS Water Data service is having trouble (HTTP ${status}). Try again in a few minutes.`;
  return `USGS answered with HTTP ${status}.`;
}

function isFeatureCollection(data: unknown): data is FeatureCollection {
  return typeof data === "object" && data !== null && Array.isArray((data as FeatureCollection).features);
}

function nextPageUrl(data: FeatureCollection, baseUrl: string): string | undefined {
  const href = data.links?.find((link) => link.rel === "next")?.href;
  // Only follow links back to the same API.
  return href && new URL(href).origin === new URL(baseUrl).origin ? href : undefined;
}

function toGauge(feature: Feature): Gauge | null {
  const p = feature.properties ?? {};
  const id = typeof feature.id === "string" ? feature.id : null;
  if (!id) return null;
  const coords = feature.geometry?.coordinates;
  const [lon, lat] = Array.isArray(coords) ? coords : [];
  return {
    id,
    name: stringOrNull(p.monitoring_location_name) ?? id,
    state: stringOrNull(p.state_name),
    county: stringOrNull(p.county_name),
    lat: typeof lat === "number" ? lat : null,
    lon: typeof lon === "number" ? lon : null,
    drainageAreaSqMi: typeof p.drainage_area === "number" ? p.drainage_area : null,
  };
}

function toReading(feature: Feature): FlowReading | null {
  const p = feature.properties ?? {};
  if (typeof p.time !== "string") return null;
  const value = p.value === null || p.value === undefined || p.value === "" ? NaN : Number(p.value);
  return {
    time: p.time,
    value: Number.isFinite(value) ? value : null,
    provisional: p.approval_status !== "Approved",
    qualifiers: Array.isArray(p.qualifier) ? p.qualifier.filter((q): q is string => typeof q === "string") : [],
  };
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}
