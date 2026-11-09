const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Readings older than this get a "not current" warning. Most gauges report every hour. */
export const STALE_AFTER_MS = 3 * HOUR;

const wholeNumber = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const smallNumber = new Intl.NumberFormat("en-US", { maximumSignificantDigits: 3 });

/** 1810 -> "1,810", 14.53 -> "14.5", 0.042 -> "0.042". Null -> "–". */
export function formatFlowNumber(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "–";
  return Math.abs(value) >= 100 ? wholeNumber.format(value) : smallNumber.format(value);
}

/** Flow with its unit, e.g. "1,810 cfs". */
export function formatCfs(value: number | null): string {
  return value === null ? "No reading" : `${formatFlowNumber(value)} cfs`;
}

/** How long ago a reading was taken: "just now", "25 min ago", "3 hr ago", "2 days ago". */
export function formatAge(time: string, now: number = Date.now()): string {
  const age = now - Date.parse(time);
  if (!Number.isFinite(age)) return "";
  if (age < 2 * MINUTE) return "just now";
  if (age < HOUR) return `${Math.floor(age / MINUTE)} min ago`;
  if (age < DAY) return `${Math.floor(age / HOUR)} hr ago`;
  const days = Math.floor(age / DAY);
  return days === 1 ? "1 day ago" : `${days} days ago`;
}

export function isStale(time: string, now: number = Date.now()): boolean {
  return now - Date.parse(time) > STALE_AFTER_MS;
}

const QUALIFIER_TEXT: Record<string, string> = {
  BACKWATER: "Backwater is affecting the gauge",
  DISCONTINUED: "Gauge is discontinued",
  DRY: "Riverbed is dry",
  EQUIP: "Equipment problem at the gauge",
  ESTIMATED: "Estimated by USGS",
  FLOOD: "Gauge damaged by flooding",
  ICE: "Ice is affecting the gauge",
  MAINT: "Gauge is under maintenance",
  RATINGDEV: "Rating is being updated",
  SEASONAL: "Seasonal gauge, not running now",
  UNAVAIL: "Data temporarily unavailable",
  ZEROFLOW: "No flow",
};

/** Turns USGS qualifier codes into short notes people can read. Unknown codes are passed through. */
export function describeQualifiers(codes: string[]): string[] {
  return codes.map((code) => QUALIFIER_TEXT[code.toUpperCase()] ?? `USGS note: ${code}`);
}

const STATE_CODES = new Set(
  (
    "AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND " +
    "OH OK OR PA PR RI SC SD TN TX UT VT VA VI WA WV WI WY GU"
  ).split(" "),
);
const ALWAYS_UPPERCASE = new Set(["US", "USGS", "TVA"]);
const SMALL_WORDS = new Set(["AT", "OF", "THE", "AND", "NEAR", "ABOVE", "BELOW", "IN", "ON"]);

/**
 * USGS writes names in capitals ("GAULEY RIVER ABOVE BELVA, WV").
 * This makes them easier to read ("Gauley River above Belva, WV").
 * State codes at the end or after a comma stay in capitals, and words with digits stay as they are.
 */
export function prettyGaugeName(name: string): string {
  const parts = name.trim().split(/([\s,]+)/); // words at even indexes, separators at odd ones
  const lastWord = parts.findLastIndex((part, i) => i % 2 === 0 && /[A-Za-z]/.test(part));

  return parts
    .map((part, i) => {
      if (i % 2 === 1) return part;
      const bare = part.replace(/[^A-Za-z]/g, "").toUpperCase();
      if (bare === "" || /\d/.test(part) || ALWAYS_UPPERCASE.has(bare)) return part;
      const afterComma = i > 0 && parts[i - 1].includes(",");
      if (STATE_CODES.has(bare) && (afterComma || i === lastWord)) return part;
      if (i > 0 && SMALL_WORDS.has(bare)) return part.toLowerCase();
      return part.toLowerCase().replace(/(^|[-/(.])([a-z])/g, (_m, before: string, letter: string) => before + letter.toUpperCase());
    })
    .join("");
}

/** "Nicholas County, West Virginia", or whatever parts are known. */
export function placeLabel(gauge: { county: string | null; state: string | null }): string {
  return [gauge.county, gauge.state].filter(Boolean).join(", ");
}

/** "USGS-03192000" -> "03192000". */
export function siteNumber(id: string): string {
  return id.replace(/^USGS-/, "");
}

export function usgsPageUrl(id: string): string {
  return `https://waterdata.usgs.gov/monitoring-location/${encodeURIComponent(id)}/`;
}

export interface Point {
  t: number;
  value: number | null;
}

/**
 * Cuts a long series down to about `maxPoints` for drawing, keeping the lowest
 * and highest value in each slice so short spikes (like a dam release) survive.
 * Gaps (null values) are kept so the chart can show them.
 */
export function thinSeries(points: Point[], maxPoints = 600): Point[] {
  if (points.length <= maxPoints) return points;
  const bucketCount = Math.max(1, Math.floor(maxPoints / 2));
  const size = points.length / bucketCount;
  const out: Point[] = [];

  for (let b = 0; b < bucketCount; b++) {
    const bucket = points.slice(Math.floor(b * size), Math.floor((b + 1) * size));
    let min: Point | undefined;
    let max: Point | undefined;
    let gap: Point | undefined;
    for (const p of bucket) {
      if (p.value === null) {
        gap ??= p;
        continue;
      }
      if (!min || p.value < (min.value as number)) min = p;
      if (!max || p.value > (max.value as number)) max = p;
    }
    const keep = [min, max, gap].filter((p): p is Point => p !== undefined);
    keep.sort((a, b) => a.t - b.t);
    for (const p of keep) if (out[out.length - 1] !== p) out.push(p);
  }
  return out;
}
