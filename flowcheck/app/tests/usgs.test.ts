import { describe, expect, it } from "vitest";
import { buildSearchFilter, createUsgsClient, parseSiteNumber, UsgsError } from "../src/usgs/client";

// Real USGS Water Data API responses recorded on 2026-11-09, trimmed to keep them small
// (search to 10 sites, the 7-day history to one reading per hour).
import history from "./fixtures/continuous-USGS-03192000-7d.json";
import latest from "./fixtures/latest-gauley-wv.json";
import gauge from "./fixtures/monitoring-location-USGS-03192000.json";
import search from "./fixtures/search-gauley-wv.json";

type Handler = (url: URL, init?: RequestInit) => Response | Promise<Response>;

/** A fetch that records every URL and answers with `handler`. */
function fakeFetch(handler: Handler) {
  const calls: URL[] = [];
  const fn = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    calls.push(url);
    return handler(url, init);
  };
  return Object.assign(fn, { calls });
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const clone = <T>(value: T): T => structuredClone(value);

describe("searchGauges", () => {
  it("finds USGS stream gauges by name in a state", async () => {
    const fetch = fakeFetch(() => json(search));
    const usgs = createUsgsClient({ fetch });

    const gauges = await usgs.searchGauges({ text: "Gauley River", state: "West Virginia" });

    expect(fetch.calls).toHaveLength(1);
    const url = fetch.calls[0];
    expect(url.origin + url.pathname).toBe("https://api.waterdata.usgs.gov/ogcapi/v1/collections/monitoring-locations/items");
    expect(url.searchParams.get("f")).toBe("json");
    expect(url.searchParams.get("filter-lang")).toBe("cql2-text");
    expect(url.searchParams.get("filter")).toBe(
      "agency_code='USGS' AND site_type_code='ST' AND state_name='West Virginia' AND monitoring_location_name LIKE '%GAULEY%'",
    );

    expect(gauges).toHaveLength(10);
    expect(gauges[7]).toEqual({
      id: "USGS-03192000",
      name: "GAULEY RIVER ABOVE BELVA, WV",
      state: "West Virginia",
      county: "Nicholas County",
      lat: 38.233439509784,
      lon: -81.1809415148745,
      drainageAreaSqMi: 1316,
    });
    expect(gauges[0].drainageAreaSqMi).toBeNull();
  });

  it("looks up a site number directly", async () => {
    const fetch = fakeFetch(() => json(gauge));
    const usgs = createUsgsClient({ fetch });

    const gauges = await usgs.searchGauges({ text: " 03192000 " });

    expect(fetch.calls[0].pathname).toBe("/ogcapi/v1/collections/monitoring-locations/items/USGS-03192000");
    expect(gauges.map((g) => g.name)).toEqual(["GAULEY RIVER ABOVE BELVA, WV"]);
  });

  it("returns nothing for a site number USGS doesn't have", async () => {
    const fetch = fakeFetch(() => json({ code: "NotFound", description: "identifier not found" }, 404));
    const usgs = createUsgsClient({ fetch });

    expect(await usgs.searchGauges({ text: "USGS-99999999" })).toEqual([]);
  });

  it("doesn't call USGS when there's nothing to search for", async () => {
    const fetch = fakeFetch(() => json(search));
    const usgs = createUsgsClient({ fetch });

    expect(await usgs.searchGauges({ text: " % " })).toEqual([]);
    expect(fetch.calls).toHaveLength(0);
  });
});

describe("buildSearchFilter", () => {
  it("needs every word, in any order, and skips words most names share", () => {
    expect(buildSearchFilter("arkansas river near granite")).toBe(
      "agency_code='USGS' AND site_type_code='ST' AND monitoring_location_name LIKE '%ARKANSAS%' AND monitoring_location_name LIKE '%GRANITE%'",
    );
  });

  it("keeps a filler word when it's all that was typed", () => {
    expect(buildSearchFilter("Bull Creek")).toContain("LIKE '%BULL%'");
    expect(buildSearchFilter("creek")).toContain("LIKE '%CREEK%'");
  });

  it("escapes quotes and drops LIKE wildcards", () => {
    const filter = buildSearchFilter("o'leary 100% _x_");
    expect(filter).toContain("LIKE '%O''LEARY%'");
    expect(filter).toContain("LIKE '%100%'");
    expect(filter).toContain("LIKE '%X%'");
    expect(filter).not.toMatch(/LIKE '[^']*_/);
  });

  it("returns null for input too short to search", () => {
    expect(buildSearchFilter("")).toBeNull();
    expect(buildSearchFilter("a")).toBeNull();
    expect(buildSearchFilter("' ' ")).toBeNull();
  });
});

describe("parseSiteNumber", () => {
  it("accepts 8 to 15 digit site numbers with or without the USGS prefix", () => {
    expect(parseSiteNumber("03192000")).toBe("03192000");
    expect(parseSiteNumber("USGS-03192000")).toBe("03192000");
    expect(parseSiteNumber("usgs 381432104205500")).toBe("381432104205500");
    expect(parseSiteNumber("1234567")).toBeNull();
    expect(parseSiteNumber("gauley")).toBeNull();
  });
});

describe("getLatestFlows", () => {
  it("returns the newest reading for each gauge that reported in the last 2 days", async () => {
    const fetch = fakeFetch(() => json(latest));
    const usgs = createUsgsClient({ fetch });

    const readings = await usgs.getLatestFlows(["USGS-03189100", "USGS-03192000", "USGS-03189600"]);

    const url = fetch.calls[0];
    expect(url.pathname).toBe("/ogcapi/v1/collections/latest-continuous/items");
    expect(url.searchParams.get("monitoring_location_id")).toBe("USGS-03189100,USGS-03192000,USGS-03189600");
    expect(url.searchParams.get("parameter_code")).toBe("00060");
    expect(url.searchParams.get("time")).toBe("P2D");

    expect(readings.get("USGS-03192000")).toEqual({
      time: "2026-11-09T13:00:00+00:00",
      value: 1200,
      provisional: true,
      qualifiers: [],
    });
    expect(readings.get("USGS-03189100")?.value).toBe(184);
    expect(readings.has("USGS-03189600")).toBe(false); // retired in 2003
  });

  it("keeps a reading with no value, along with the reason", async () => {
    const iced = clone(latest);
    Object.assign(iced.features[0].properties, { value: null, qualifier: ["EQUIP", "ICE"] });
    const usgs = createUsgsClient({ fetch: fakeFetch(() => json(iced)) });

    const reading = (await usgs.getLatestFlows(["USGS-03192000"])).get("USGS-03192000");

    expect(reading?.value).toBeNull();
    expect(reading?.qualifiers).toEqual(["EQUIP", "ICE"]);
  });

  it("uses the newest reading when a gauge has two flow series", async () => {
    const two = clone(latest);
    two.features[1].properties.monitoring_location_id = "USGS-03192000";
    two.features[1].properties.time = "2026-11-09T13:15:00+00:00";
    const usgs = createUsgsClient({ fetch: fakeFetch(() => json(two)) });

    const readings = await usgs.getLatestFlows(["USGS-03192000"]);

    expect(readings.get("USGS-03192000")?.time).toBe("2026-11-09T13:15:00+00:00");
  });

  it("splits long lists of gauges across requests", async () => {
    const fetch = fakeFetch(() => json({ type: "FeatureCollection", features: [] }));
    const usgs = createUsgsClient({ fetch });
    const ids = Array.from({ length: 95 }, (_, i) => `USGS-${String(i).padStart(8, "0")}`);

    await usgs.getLatestFlows([...ids, ids[0]]);

    expect(fetch.calls.map((u) => u.searchParams.get("monitoring_location_id")!.split(",").length)).toEqual([40, 40, 15]);
  });
});

describe("getFlowHistory", () => {
  it("returns 7 days of readings, oldest first", async () => {
    const shuffled = clone(history);
    shuffled.features.reverse();
    const fetch = fakeFetch(() => json(shuffled));
    const usgs = createUsgsClient({ fetch });

    const readings = await usgs.getFlowHistory("USGS-03192000");

    const url = fetch.calls[0];
    expect(url.pathname).toBe("/ogcapi/v1/collections/continuous/items");
    expect(url.searchParams.get("time")).toBe("P7D");
    expect(url.searchParams.get("parameter_code")).toBe("00060");
    expect(readings).toHaveLength(169);
    expect(readings[0]).toEqual({ time: "2026-11-02T13:30:00+00:00", value: 1680, provisional: true, qualifiers: [] });
    expect(readings.at(-1)?.value).toBe(1200);
  });

  it("follows the next-page link", async () => {
    const first = clone(history);
    const second = clone(history);
    first.features = first.features.slice(0, 100);
    second.features = second.features.slice(100);
    const next = "https://api.waterdata.usgs.gov/ogcapi/v1/collections/continuous/items?cursor=abc&f=json";
    Object.assign(first, { links: [{ rel: "next", href: next }] });

    const fetch = fakeFetch((url) => json(url.searchParams.get("cursor") ? second : first));
    const usgs = createUsgsClient({ fetch });

    const readings = await usgs.getFlowHistory("USGS-03192000");

    expect(fetch.calls).toHaveLength(2);
    expect(readings).toHaveLength(169);
  });

  it("ignores next-page links to other sites", async () => {
    const page = clone(history);
    Object.assign(page, { links: [{ rel: "next", href: "https://example.com/steal" }] });
    const fetch = fakeFetch(() => json(page));

    await createUsgsClient({ fetch }).getFlowHistory("USGS-03192000");

    expect(fetch.calls).toHaveLength(1);
  });

  it("uses the fuller series when a gauge has two", async () => {
    const mixed = clone(history);
    mixed.features.slice(0, 5).forEach((f) => (f.properties.time_series_id = "other"));
    const usgs = createUsgsClient({ fetch: fakeFetch(() => json(mixed)) });

    expect(await usgs.getFlowHistory("USGS-03192000")).toHaveLength(164);
  });

  it("rejects a bad number of days", async () => {
    const usgs = createUsgsClient({ fetch: fakeFetch(() => json(history)) });
    await expect(usgs.getFlowHistory("USGS-03192000", { days: 0 })).rejects.toThrow(RangeError);
    await expect(usgs.getFlowHistory("USGS-03192000", { days: 2.5 })).rejects.toThrow(RangeError);
  });
});

describe("errors", () => {
  const ids = ["USGS-03192000"];

  it("explains rate limiting", async () => {
    const usgs = createUsgsClient({ fetch: fakeFetch(() => json({}, 429)) });
    const error = await usgs.getLatestFlows(ids).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(UsgsError);
    expect(error).toMatchObject({ status: 429, message: expect.stringMatching(/too many requests/) });
  });

  it("reports USGS server errors with the status", async () => {
    const usgs = createUsgsClient({ fetch: fakeFetch(() => new Response("Bad gateway", { status: 502 })) });
    await expect(usgs.getLatestFlows(ids)).rejects.toMatchObject({ status: 502, message: expect.stringMatching(/HTTP 502/) });
  });

  it("reports a network failure", async () => {
    const usgs = createUsgsClient({
      fetch: fakeFetch(() => {
        throw new TypeError("Failed to fetch");
      }),
    });
    await expect(usgs.getLatestFlows(ids)).rejects.toMatchObject({ name: "UsgsError", status: null, message: expect.stringMatching(/Couldn't reach USGS/) });
  });

  it("reports a response that isn't JSON", async () => {
    const usgs = createUsgsClient({ fetch: fakeFetch(() => new Response("<html>maintenance</html>", { status: 200 })) });
    await expect(usgs.getLatestFlows(ids)).rejects.toMatchObject({ name: "UsgsError", message: expect.stringMatching(/couldn't read/) });
  });

  it("reports JSON in the wrong shape", async () => {
    const usgs = createUsgsClient({ fetch: fakeFetch(() => json({ hello: "world" })) });
    await expect(usgs.getLatestFlows(ids)).rejects.toBeInstanceOf(UsgsError);
  });

  it("gives up after the timeout", async () => {
    const hang: Handler = (_url, init) =>
      new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal?.reason)));
    const usgs = createUsgsClient({ fetch: fakeFetch(hang), timeoutMs: 20 });

    await expect(usgs.getLatestFlows(ids)).rejects.toMatchObject({ name: "UsgsError", message: expect.stringMatching(/too long/) });
  });

  it("passes a cancel through as-is, not as a USGS error", async () => {
    const hang: Handler = (_url, init) =>
      new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal?.reason)));
    const usgs = createUsgsClient({ fetch: fakeFetch(hang) });
    const controller = new AbortController();

    const pending = usgs.getLatestFlows(ids, controller.signal);
    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });
});
