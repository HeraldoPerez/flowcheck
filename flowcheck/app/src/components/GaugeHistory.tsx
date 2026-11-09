import { lazy, Suspense, useEffect, useState } from "react";
import { errorMessage } from "../lib/errors";
import { formatCfs } from "../lib/format";
import type { UsgsClient } from "../usgs/client";
import type { FlowReading } from "../usgs/types";

// The chart library is most of the app's size, so it loads only when someone opens a gauge.
const FlowChart = lazy(() => import("./FlowChart").then((m) => ({ default: m.FlowChart })));

const DAYS = 7;

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "done"; readings: FlowReading[] };

/** The last 7 days of flow for one gauge, loaded when it's shown. */
export function GaugeHistory({ usgs, gaugeId }: { usgs: UsgsClient; gaugeId: string }) {
  const [state, setState] = useState<State>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });
    usgs.getFlowHistory(gaugeId, { days: DAYS, signal: controller.signal }).then(
      (readings) => setState({ status: "done", readings }),
      (error: unknown) => {
        if (!controller.signal.aborted) setState({ status: "error", message: errorMessage(error) });
      },
    );
    return () => controller.abort();
  }, [usgs, gaugeId, attempt]);

  if (state.status === "loading") return <p className="muted">Loading the last {DAYS} days…</p>;

  if (state.status === "error") {
    return (
      <div className="notice notice--error" role="alert">
        <p>{state.message}</p>
        <button type="button" className="button button--small" onClick={() => setAttempt((n) => n + 1)}>
          Try again
        </button>
      </div>
    );
  }

  const values = state.readings.map((r) => r.value).filter((v): v is number => v !== null);
  if (values.length === 0) {
    return <p className="muted">USGS has no flow readings for this gauge in the last {DAYS} days.</p>;
  }

  return (
    <figure className="history">
      <Suspense fallback={<div className="flow-chart flow-chart--loading muted">Loading chart…</div>}>
        <FlowChart readings={state.readings} />
      </Suspense>
      <figcaption className="history__caption">
        Last {DAYS} days: low {formatCfs(Math.min(...values))}, high {formatCfs(Math.max(...values))}.
      </figcaption>
    </figure>
  );
}
