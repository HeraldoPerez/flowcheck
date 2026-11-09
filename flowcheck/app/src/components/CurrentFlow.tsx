import { describeQualifiers, formatAge, formatFlowNumber, isStale } from "../lib/format";
import type { FlowReading } from "../usgs/types";

interface Props {
  reading: FlowReading | undefined;
  /** False while the latest readings are still loading. */
  loaded: boolean;
  now: number;
}

/** The latest reading for a gauge: the number, how old it is, and any USGS notes. */
export function CurrentFlow({ reading, loaded, now }: Props) {
  if (!loaded) return <span className="flow flow--muted">Checking flow…</span>;
  if (!reading) return <span className="flow flow--muted">No flow reading in the last 2 days</span>;

  const stale = isStale(reading.time, now);
  const notes = describeQualifiers(reading.qualifiers);
  const age = formatAge(reading.time, now);

  return (
    <span className="flow">
      {reading.value === null ? (
        <span className="flow__value flow__value--none">No reading</span>
      ) : (
        <span className="flow__value">
          {formatFlowNumber(reading.value)} <span className="flow__unit">cfs</span>
        </span>
      )}
      <time
        className={stale ? "flow__age flow__age--stale" : "flow__age"}
        dateTime={reading.time}
        title={new Date(reading.time).toLocaleString()}
      >
        {stale ? `Last reading ${age}` : age}
      </time>
      {notes.length > 0 && <span className="flow__notes">{notes.join(" · ")}</span>}
    </span>
  );
}
