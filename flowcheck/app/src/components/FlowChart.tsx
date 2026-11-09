import { useMemo } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatCfs, formatFlowNumber, thinSeries } from "../lib/format";
import type { FlowReading } from "../usgs/types";

const dayLabel = new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric" });
const timeLabel = new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/** Line chart of streamflow over time. Gaps in the data stay gaps. */
export function FlowChart({ readings }: { readings: FlowReading[] }) {
  const points = useMemo(
    () => thinSeries(readings.map((r) => ({ t: Date.parse(r.time), value: r.value }))),
    [readings],
  );
  const ticks = useMemo(() => midnightsBetween(points[0]?.t, points[points.length - 1]?.t), [points]);

  return (
    <div className="flow-chart">
      <ResponsiveContainer width="100%" height={220} initialDimension={{ width: 600, height: 220 }}>
        <LineChart data={points} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="t"
            type="number"
            scale="time"
            domain={["dataMin", "dataMax"]}
            ticks={ticks}
            tickFormatter={(t: number) => dayLabel.format(t)}
          />
          <YAxis width={52} domain={[0, "auto"]} tickFormatter={(v: number) => formatFlowNumber(v)} />
          <Tooltip
            labelFormatter={(t) => timeLabel.format(Number(t))}
            formatter={(value) => [formatCfs(typeof value === "number" ? value : null), "Flow"]}
            contentStyle={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              color: "var(--text)",
            }}
          />
          <Line
            dataKey="value"
            type="monotone"
            dot={false}
            strokeWidth={2}
            connectNulls={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Local midnights inside [start, end], used as day ticks on the x axis. */
export function midnightsBetween(start: number | undefined, end: number | undefined): number[] {
  if (start === undefined || end === undefined || end < start) return [];
  const ticks: number[] = [];
  const day = new Date(start);
  day.setHours(24, 0, 0, 0); // next local midnight
  while (day.getTime() <= end) {
    ticks.push(day.getTime());
    day.setDate(day.getDate() + 1);
  }
  return ticks;
}
