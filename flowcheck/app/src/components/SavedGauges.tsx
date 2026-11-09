import { useCallback, useEffect, useState } from "react";
import { useNow } from "../hooks";
import { errorMessage } from "../lib/errors";
import { placeLabel, prettyGaugeName, siteNumber, usgsPageUrl } from "../lib/format";
import type { SavedGauge } from "../lib/savedGauges";
import type { UsgsClient } from "../usgs/client";
import type { FlowReading } from "../usgs/types";
import { CurrentFlow } from "./CurrentFlow";
import { GaugeHistory } from "./GaugeHistory";

/** USGS gauges usually report about once an hour, so checking more often than this gains little. */
const REFRESH_MS = 15 * 60_000;

interface Props {
  usgs: UsgsClient;
  gauges: SavedGauge[];
  onRemove: (id: string) => void;
}

/** The user's saved gauges with their current flow. Tap one to see its last 7 days. */
export function SavedGauges({ usgs, gauges, onRemove }: Props) {
  const now = useNow();
  // `ids` records which gauges were asked about, so a newly saved gauge shows "Checking"
  // until its reading arrives instead of "no reading".
  const [latest, setLatest] = useState<{ ids: Set<string>; readings: Map<string, FlowReading> } | null>(null);
  const [checkedAt, setCheckedAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [refreshes, setRefreshes] = useState(0);

  const idKey = gauges.map((g) => g.id).join(",");
  const refresh = useCallback(() => setRefreshes((n) => n + 1), []);

  useEffect(() => {
    if (!idKey) return;
    const controller = new AbortController();
    const ids = idKey.split(",");
    setLoading(true);
    usgs
      .getLatestFlows(ids, controller.signal)
      .then(
        (readings) => {
          setLatest({ ids: new Set(ids), readings });
          setCheckedAt(Date.now());
          setError(null);
        },
        (err: unknown) => {
          if (!controller.signal.aborted) setError(errorMessage(err));
        },
      )
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [usgs, idKey, refreshes]);

  // Keep readings fresh while the page is open and on screen.
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  if (gauges.length === 0) {
    return (
      <section className="panel" aria-labelledby="saved-heading">
        <h2 id="saved-heading">Your gauges</h2>
        <p className="muted">
          No saved gauges yet. Search for a river below and save the gauges you check before you go out.
        </p>
      </section>
    );
  }

  return (
    <section className="panel" aria-labelledby="saved-heading">
      <div className="panel__header">
        <h2 id="saved-heading">Your gauges</h2>
        <div className="panel__actions">
          {checkedAt !== null && (
            <span className="muted small" aria-live="polite">
              {loading ? "Updating…" : `Checked ${new Date(checkedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`}
            </span>
          )}
          <button type="button" className="button button--small" onClick={refresh} disabled={loading}>
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="notice notice--error" role="alert">
          <p>Couldn't update flows. {error}</p>
        </div>
      )}

      <ul className="gauge-list">
        {gauges.map((gauge) => {
          const isOpen = expanded === gauge.id;
          const panelId = `gauge-panel-${gauge.id}`;
          return (
            <li key={gauge.id} className={isOpen ? "gauge-card gauge-card--open" : "gauge-card"}>
              <button
                type="button"
                className="gauge-card__summary"
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => setExpanded(isOpen ? null : gauge.id)}
              >
                <span className="gauge-card__title">
                  <span className="gauge-name">{prettyGaugeName(gauge.name)}</span>
                  <span className="gauge-place">
                    {placeLabel(gauge)} · {siteNumber(gauge.id)}
                  </span>
                </span>
                <CurrentFlow
                  reading={latest?.readings.get(gauge.id)}
                  loaded={latest?.ids.has(gauge.id) ?? false}
                  now={now}
                />
              </button>

              {isOpen && (
                <div className="gauge-card__body" id={panelId}>
                  <GaugeHistory usgs={usgs} gaugeId={gauge.id} />
                  <div className="gauge-card__links">
                    <a href={usgsPageUrl(gauge.id)} target="_blank" rel="noreferrer">
                      View on USGS
                    </a>
                    <button
                      type="button"
                      className="button button--small button--quiet"
                      onClick={() => {
                        setExpanded(null);
                        onRemove(gauge.id);
                      }}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
