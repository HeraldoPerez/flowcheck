import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { App } from "../src/App";
import { STORAGE_KEY } from "../src/lib/savedGauges";
import { UsgsError, type UsgsClient } from "../src/usgs/client";
import type { FlowReading, Gauge } from "../src/usgs/types";

const belva: Gauge = {
  id: "USGS-03192000",
  name: "GAULEY RIVER ABOVE BELVA, WV",
  state: "West Virginia",
  county: "Nicholas County",
  lat: 38.2334,
  lon: -81.1809,
  drainageAreaSqMi: 1316,
};
const retired: Gauge = { ...belva, id: "USGS-03189600", name: "GAULEY RIVER BELOW SUMMERSVILLE DAM, WV" };

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
const reading = (value: number | null, overrides: Partial<FlowReading> = {}): FlowReading => ({
  time: minutesAgo(20),
  value,
  provisional: true,
  qualifiers: [],
  ...overrides,
});

/** A USGS client that answers from memory. Each method is a spy so tests can check calls. */
function fakeUsgs(overrides: Partial<UsgsClient> = {}): UsgsClient {
  return {
    searchGauges: vi.fn(async () => [retired, belva]),
    getGauge: vi.fn(async () => belva),
    getLatestFlows: vi.fn(async (ids: string[]) => {
      const map = new Map<string, FlowReading>();
      if (ids.includes(belva.id)) map.set(belva.id, reading(1200));
      return map;
    }),
    getFlowHistory: vi.fn(async () => [
      reading(1680, { time: "2026-11-02T13:30:00Z" }),
      reading(3470, { time: "2026-11-05T02:00:00Z" }),
      reading(1200, { time: "2026-11-09T13:00:00Z" }),
    ]),
    ...overrides,
  };
}

async function searchFor(text: string, state?: string) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("River, place or site number"), text);
  if (state) await user.selectOptions(screen.getByLabelText("State"), state);
  await user.click(screen.getByRole("button", { name: "Search" }));
  return user;
}

describe("FlowCheck", () => {
  it("starts with no saved gauges", () => {
    render(<App usgs={fakeUsgs()} />);
    expect(screen.getByText(/No saved gauges yet/)).toBeInTheDocument();
  });

  it("searches, shows gauges reporting now first, and tucks away the rest", async () => {
    const usgs = fakeUsgs();
    render(<App usgs={usgs} />);

    await searchFor("gauley", "West Virginia");

    expect(usgs.searchGauges).toHaveBeenCalledWith(expect.objectContaining({ text: "gauley", state: "West Virginia" }));
    expect(await screen.findByText("1 gauge reporting flow now.")).toBeInTheDocument();

    const lists = screen.getAllByRole("list");
    expect(within(lists[0]).getByText("Gauley River above Belva, WV")).toBeInTheDocument();
    expect(within(lists[0]).getByText("1,200")).toBeInTheDocument();
    expect(screen.getByText("1 more site with no flow reading in the last 2 days")).toBeInTheDocument();
  });

  it("saves a gauge, shows its flow, and keeps it after a reload", async () => {
    const usgs = fakeUsgs();
    const { unmount } = render(<App usgs={usgs} />);

    const user = await searchFor("gauley");
    await user.click(await screen.findByRole("button", { name: "Save Gauley River above Belva, WV" }));

    expect(screen.getByRole("button", { name: "Gauley River above Belva, WV is saved" })).toBeDisabled();
    const saved = screen.getByRole("region", { name: "Your gauges" });
    expect(await within(saved).findByText("1,200")).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).gauges[0].id).toBe(belva.id);

    unmount();
    render(<App usgs={usgs} />);
    expect(await screen.findByText("Gauley River above Belva, WV")).toBeInTheDocument();
  });

  it("opens a saved gauge to show the last 7 days, and removes it", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, gauges: [{ ...belva, savedAt: "2026-11-09T00:00:00Z" }] }));
    const usgs = fakeUsgs();
    const user = userEvent.setup();
    render(<App usgs={usgs} />);

    const card = await screen.findByRole("button", { name: /Gauley River above Belva/ });
    expect(card).toHaveAttribute("aria-expanded", "false");
    await user.click(card);

    expect(card).toHaveAttribute("aria-expanded", "true");
    expect(await screen.findByText("Last 7 days: low 1,200 cfs, high 3,470 cfs.")).toBeInTheDocument();
    expect(usgs.getFlowHistory).toHaveBeenCalledWith(belva.id, expect.objectContaining({ days: 7 }));
    // The chart loads separately. Wait until its line is drawn, so a crash in it fails this test.
    await waitFor(() => expect(document.querySelector(".flow-chart .recharts-line-curve")).not.toBeNull(), {
      timeout: 5000,
    });
    expect(screen.getByRole("link", { name: "View on USGS" })).toHaveAttribute(
      "href",
      "https://waterdata.usgs.gov/monitoring-location/USGS-03192000/",
    );

    await user.click(screen.getByRole("button", { name: "Remove" }));
    expect(screen.getByText(/No saved gauges yet/)).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).gauges).toEqual([]);
  });

  it("explains a missing reading and an old one", async () => {
    const iced: Gauge = { ...belva, id: "USGS-01000000", name: "ICY CREEK NEAR NOWHERE, ME" };
    const usgs = fakeUsgs({
      searchGauges: vi.fn(async () => [belva, iced]),
      getLatestFlows: vi.fn(
        async () =>
          new Map([
            [belva.id, reading(1200, { time: minutesAgo(5 * 60 + 20) })],
            [iced.id, reading(null, { qualifiers: ["ICE"] })],
          ]),
      ),
    });
    render(<App usgs={usgs} />);

    await searchFor("creek");

    expect(await screen.findByText("Last reading 5 hr ago")).toBeInTheDocument();
    expect(screen.getByText("No reading")).toBeInTheDocument();
    expect(screen.getByText("Ice is affecting the gauge")).toBeInTheDocument();
  });

  it("shows search errors from USGS", async () => {
    const usgs = fakeUsgs({
      searchGauges: vi.fn(async () => {
        throw new UsgsError("USGS is getting too many requests right now. Wait a minute and try again.", {
          status: 429,
          url: "https://api.waterdata.usgs.gov/",
        });
      }),
    });
    render(<App usgs={usgs} />);

    await searchFor("gauley");

    expect(await screen.findByRole("alert")).toHaveTextContent(/too many requests/);
  });

  it("still lists gauges when their current flow can't be loaded", async () => {
    const usgs = fakeUsgs({
      getLatestFlows: vi.fn(async () => {
        throw new UsgsError("Couldn't reach USGS.", { url: "https://api.waterdata.usgs.gov/" });
      }),
    });
    render(<App usgs={usgs} />);

    await searchFor("gauley");

    expect(await screen.findByText("Found 2 gauges, but couldn't load their current flow.")).toBeInTheDocument();
    expect(screen.getByText("Gauley River above Belva, WV")).toBeInTheDocument();
  });

  it("asks for more than one letter before searching", async () => {
    const usgs = fakeUsgs();
    render(<App usgs={usgs} />);

    await searchFor("g");

    expect(screen.getByRole("alert")).toHaveTextContent(/at least 2 letters/);
    expect(usgs.searchGauges).not.toHaveBeenCalled();
  });

  it("says when nothing matches", async () => {
    render(<App usgs={fakeUsgs({ searchGauges: vi.fn(async () => []) })} />);

    await searchFor("zzzz", "Utah");

    expect(await screen.findByText(/No USGS stream gauges match “zzzz” in Utah/)).toBeInTheDocument();
  });
});
