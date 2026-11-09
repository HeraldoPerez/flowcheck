import { describe, expect, it } from "vitest";
import { midnightsBetween } from "../src/components/FlowChart";
import {
  describeQualifiers,
  formatAge,
  formatCfs,
  formatFlowNumber,
  isStale,
  prettyGaugeName,
  thinSeries,
  type Point,
} from "../src/lib/format";

describe("formatFlowNumber", () => {
  it("rounds big flows and keeps 3 significant digits for small ones", () => {
    expect(formatFlowNumber(1810)).toBe("1,810");
    expect(formatFlowNumber(184.4)).toBe("184");
    expect(formatFlowNumber(14.53)).toBe("14.5");
    expect(formatFlowNumber(0.042)).toBe("0.042");
    expect(formatFlowNumber(0)).toBe("0");
    expect(formatFlowNumber(null)).toBe("–");
  });

  it("adds the unit", () => {
    expect(formatCfs(1200)).toBe("1,200 cfs");
    expect(formatCfs(null)).toBe("No reading");
  });
});

describe("formatAge and isStale", () => {
  const now = Date.parse("2026-11-09T14:00:00Z");

  it("says how long ago a reading was", () => {
    expect(formatAge("2026-11-09T13:59:30Z", now)).toBe("just now");
    expect(formatAge("2026-11-09T13:35:00Z", now)).toBe("25 min ago");
    expect(formatAge("2026-11-09T10:30:00Z", now)).toBe("3 hr ago");
    expect(formatAge("2026-11-08T12:00:00Z", now)).toBe("1 day ago");
    expect(formatAge("2026-11-06T12:00:00Z", now)).toBe("3 days ago");
    expect(formatAge("not a date", now)).toBe("");
  });

  it("flags readings older than 3 hours", () => {
    expect(isStale("2026-11-09T11:30:00Z", now)).toBe(false);
    expect(isStale("2026-11-09T10:30:00Z", now)).toBe(true);
  });
});

describe("describeQualifiers", () => {
  it("explains USGS codes and passes unknown ones through", () => {
    expect(describeQualifiers(["ICE", "SEASONAL", "NEWCODE"])).toEqual([
      "Ice is affecting the gauge",
      "Seasonal gauge, not running now",
      "USGS note: NEWCODE",
    ]);
  });
});

describe("prettyGaugeName", () => {
  it.each([
    ["GAULEY RIVER ABOVE BELVA, WV", "Gauley River above Belva, WV"],
    ["EAST FORK ARKANSAS RIVER AT HWY 91 NR LEADVILLE,CO", "East Fork Arkansas River at Hwy 91 Nr Leadville,CO"],
    ["ARKANSAS RIVER NEAR MALTA, CO.", "Arkansas River near Malta, CO."],
    ["YOUGHIOGHENY RIVER AT US 219 NEAR REDHOUSE, MD", "Youghiogheny River at US 219 near Redhouse, MD"],
    ["POTOMAC RIVER NEAR WASH, DC LITTLE FALLS PUMP STA", "Potomac River near Wash, DC Little Falls Pump Sta"],
    ["DE QUEEN RIVER IN DE QUEEN, AR", "De Queen River in De Queen, AR"],
    ["N.FORK LEE'S CREEK", "N.Fork Lee's Creek"],
    ["R70.0 GAULEY R @ GAULEY BRIDGE WV", "R70.0 Gauley R @ Gauley Bridge WV"],
  ])("%s -> %s", (raw, pretty) => {
    expect(prettyGaugeName(raw)).toBe(pretty);
  });
});

describe("thinSeries", () => {
  const series = (values: (number | null)[]): Point[] => values.map((value, t) => ({ t, value }));

  it("leaves short series alone", () => {
    const points = series([1, 2, 3]);
    expect(thinSeries(points, 10)).toBe(points);
  });

  it("cuts a long series down but keeps spikes, dips and gaps", () => {
    const values: (number | null)[] = Array.from({ length: 1000 }, () => 100);
    values[123] = 5000; // dam release
    values[456] = 2; // dip
    values[789] = null; // gauge offline

    const thinned = thinSeries(series(values), 100);

    expect(thinned.length).toBeLessThanOrEqual(150);
    expect(thinned.some((p) => p.value === 5000)).toBe(true);
    expect(thinned.some((p) => p.value === 2)).toBe(true);
    expect(thinned.some((p) => p.value === null)).toBe(true);
    expect(thinned.map((p) => p.t)).toEqual([...thinned.map((p) => p.t)].sort((a, b) => a - b));
  });
});

describe("midnightsBetween", () => {
  it("returns each local midnight inside the range", () => {
    const start = new Date(2026, 10, 2, 13, 30).getTime();
    const end = new Date(2026, 10, 5, 9, 0).getTime();
    expect(midnightsBetween(start, end)).toEqual([
      new Date(2026, 10, 3).getTime(),
      new Date(2026, 10, 4).getTime(),
      new Date(2026, 10, 5).getTime(),
    ]);
    expect(midnightsBetween(undefined, end)).toEqual([]);
  });
});
