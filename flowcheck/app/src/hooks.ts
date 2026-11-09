import { useCallback, useEffect, useState } from "react";
import { addGauge, browserStorage, loadSavedGauges, removeGauge, storeSavedGauges } from "./lib/savedGauges";
import type { Gauge } from "./usgs/types";

type StorageLike = Parameters<typeof loadSavedGauges>[0];

/** Saved gauges, kept in sync with browser storage. */
export function useSavedGauges(storage: StorageLike = browserStorage()) {
  const [gauges, setGauges] = useState(() => loadSavedGauges(storage));
  const [canPersist, setCanPersist] = useState(true);

  useEffect(() => {
    setCanPersist(storeSavedGauges(gauges, storage));
  }, [gauges, storage]);

  const save = useCallback((gauge: Gauge) => setGauges((list) => addGauge(list, gauge)), []);
  const remove = useCallback((id: string) => setGauges((list) => removeGauge(list, id)), []);

  return { gauges, save, remove, canPersist };
}

/** The current time, updated every `intervalMs`, so "12 min ago" labels stay right. */
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}
