import { useMemo } from "react";
import { GaugeSearch } from "./components/GaugeSearch";
import { SavedGauges } from "./components/SavedGauges";
import { useSavedGauges } from "./hooks";
import type { loadSavedGauges } from "./lib/savedGauges";
import type { UsgsClient } from "./usgs/client";

interface Props {
  usgs: UsgsClient;
  /** Where saved gauges are kept. Defaults to localStorage; tests pass their own. */
  storage?: Parameters<typeof loadSavedGauges>[0];
}

export function App({ usgs, storage }: Props) {
  const { gauges, save, remove, canPersist } = useSavedGauges(storage);
  const savedIds = useMemo(() => new Set(gauges.map((g) => g.id)), [gauges]);

  return (
    <div className="page">
      <header className="site-header">
        <h1 className="site-title">
          <img src="./favicon.svg" alt="" width="28" height="28" />
          FlowCheck
        </h1>
        <p className="site-tagline">River levels at USGS gauges, for paddlers and anglers.</p>
      </header>

      <main>
        {!canPersist && (
          <p className="notice" role="status">
            Your browser isn't letting FlowCheck store data, so saved gauges will be gone when you close this page.
          </p>
        )}
        <SavedGauges usgs={usgs} gauges={gauges} onRemove={remove} />
        <GaugeSearch usgs={usgs} savedIds={savedIds} onSave={save} />
      </main>

      <footer className="site-footer">
        <p>
          <strong>Check conditions yourself before you get on the water.</strong> Readings come from the U.S.
          Geological Survey and are provisional until USGS reviews them. Gauges can fail or lag behind a rising river.
        </p>
        <p>
          Data:{" "}
          <a href="https://api.waterdata.usgs.gov/" target="_blank" rel="noreferrer">
            USGS Water Data APIs
          </a>
          . FlowCheck isn't affiliated with USGS. Saved gauges stay in this browser.{" "}
          <a href="https://github.com/Khalick/flowcheck" target="_blank" rel="noreferrer">
            Source on GitHub
          </a>
          .
        </p>
      </footer>
    </div>
  );
}
