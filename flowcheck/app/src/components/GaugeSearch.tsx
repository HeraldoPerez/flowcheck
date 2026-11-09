import { type FormEvent, useEffect, useRef, useState } from "react";
import { useNow } from "../hooks";
import { errorMessage } from "../lib/errors";
import { placeLabel, prettyGaugeName, siteNumber } from "../lib/format";
import { US_STATES } from "../lib/states";
import { parseSiteNumber, type UsgsClient } from "../usgs/client";
import type { FlowReading, Gauge } from "../usgs/types";
import { CurrentFlow } from "./CurrentFlow";

interface Props {
  usgs: UsgsClient;
  savedIds: ReadonlySet<string>;
  onSave: (gauge: Gauge) => void;
}

interface Results {
  text: string;
  state: string;
  gauges: Gauge[];
  /** Null if the current flows couldn't be loaded; the gauges are still shown. */
  latest: Map<string, FlowReading> | null;
}

type Status = { kind: "idle" } | { kind: "loading" } | { kind: "error"; message: string } | { kind: "done"; results: Results };

/** Search USGS stream gauges by river or place name, optionally in one state, or by site number. */
export function GaugeSearch({ usgs, savedIds, onSave }: Props) {
  const now = useNow();
  const [text, setText] = useState("");
  const [state, setState] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const inFlight = useRef<AbortController | null>(null);

  useEffect(() => () => inFlight.current?.abort(), []);

  async function search(event: FormEvent) {
    event.preventDefault();
    inFlight.current?.abort();

    const query = text.trim();
    if (query.replace(/\W/g, "").length < 2) {
      setStatus({ kind: "error", message: "Type at least 2 letters of a river or place name, or a USGS site number." });
      return;
    }

    const controller = new AbortController();
    inFlight.current = controller;
    const { signal } = controller;
    setStatus({ kind: "loading" });

    try {
      const gauges = await usgs.searchGauges({ text: query, state: state || undefined, signal });
      let latest: Map<string, FlowReading> | null = new Map();
      if (gauges.length > 0) {
        // Show the gauges even if this second call fails.
        latest = await usgs.getLatestFlows(gauges.map((g) => g.id), signal).catch((err: unknown) => {
          if (signal.aborted) throw err;
          return null;
        });
      }
      setStatus({ kind: "done", results: { text: query, state, gauges, latest } });
    } catch (err) {
      if (!signal.aborted) setStatus({ kind: "error", message: errorMessage(err) });
    }
  }

  return (
    <section className="panel" aria-labelledby="search-heading">
      <h2 id="search-heading">Find a gauge</h2>
      <form className="search" onSubmit={search} role="search">
        <div className="field field--grow">
          <label htmlFor="search-text">River, place or site number</label>
          <input
            id="search-text"
            type="search"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="e.g. gauley or 03192000"
            autoComplete="off"
            enterKeyHint="search"
          />
        </div>
        <div className="field">
          <label htmlFor="search-state">State</label>
          <select id="search-state" value={state} onChange={(e) => setState(e.target.value)}>
            <option value="">Any state</option>
            {US_STATES.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="button button--primary" disabled={status.kind === "loading"}>
          {status.kind === "loading" ? "Searching…" : "Search"}
        </button>
      </form>

      <div aria-live="polite">
        {status.kind === "error" && (
          <div className="notice notice--error" role="alert">
            <p>{status.message}</p>
          </div>
        )}
        {status.kind === "done" && <SearchResults results={status.results} savedIds={savedIds} onSave={onSave} now={now} />}
      </div>
    </section>
  );
}

function SearchResults({
  results,
  savedIds,
  onSave,
  now,
}: {
  results: Results;
  savedIds: ReadonlySet<string>;
  onSave: (gauge: Gauge) => void;
  now: number;
}) {
  const { gauges, latest, text, state } = results;

  if (gauges.length === 0) {
    const where = state ? ` in ${state}` : "";
    const hint = parseSiteNumber(text)
      ? "Check the site number on the gauge's USGS page."
      : "Try fewer words, a different spelling, or another state.";
    return (
      <p className="muted">
        No USGS stream gauges match “{text}”{where}. {hint}
      </p>
    );
  }

  const row = (gauge: Gauge) => (
    <ResultRow key={gauge.id} gauge={gauge} latest={latest} saved={savedIds.has(gauge.id)} onSave={onSave} now={now} />
  );

  if (latest === null) {
    return (
      <>
        <p className="notice">Found {count(gauges.length, "gauge")}, but couldn't load their current flow.</p>
        <ul className="result-list">{gauges.map(row)}</ul>
      </>
    );
  }

  // Most matches are retired or water-quality sites. Show the ones reporting now first.
  const active = gauges.filter((g) => latest.has(g.id));
  const quiet = gauges.filter((g) => !latest.has(g.id));

  return (
    <>
      <p className="muted small">
        {active.length > 0
          ? `${count(active.length, "gauge")} reporting flow now.`
          : "None of the matching gauges have reported flow in the last 2 days."}
      </p>
      {active.length > 0 && <ul className="result-list">{active.map(row)}</ul>}
      {quiet.length > 0 && (
        <details className="quiet-results" open={active.length === 0}>
          <summary>{count(quiet.length, "more site")} with no flow reading in the last 2 days</summary>
          <ul className="result-list">{quiet.map(row)}</ul>
        </details>
      )}
    </>
  );
}

function ResultRow({
  gauge,
  latest,
  saved,
  onSave,
  now,
}: {
  gauge: Gauge;
  latest: Map<string, FlowReading> | null;
  saved: boolean;
  onSave: (gauge: Gauge) => void;
  now: number;
}) {
  const name = prettyGaugeName(gauge.name);
  return (
    <li className="result">
      <div className="result__text">
        <span className="gauge-name">{name}</span>
        <span className="gauge-place">
          {placeLabel(gauge)} · {siteNumber(gauge.id)}
        </span>
        {latest && <CurrentFlow reading={latest.get(gauge.id)} loaded now={now} />}
      </div>
      <button
        type="button"
        className="button button--small"
        onClick={() => onSave(gauge)}
        disabled={saved}
        aria-label={saved ? `${name} is saved` : `Save ${name}`}
      >
        {saved ? "Saved" : "Save"}
      </button>
    </li>
  );
}

function count(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}
