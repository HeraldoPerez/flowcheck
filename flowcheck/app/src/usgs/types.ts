/** A USGS stream gauge (a "monitoring location" in the USGS Water Data APIs). */
export interface Gauge {
  /** Agency prefix plus site number, e.g. "USGS-03192000". */
  id: string;
  /** Name as USGS writes it, e.g. "GAULEY RIVER ABOVE BELVA, WV". */
  name: string;
  state: string | null;
  county: string | null;
  lat: number | null;
  lon: number | null;
  /** Square miles of land that drain to the gauge. */
  drainageAreaSqMi: number | null;
}

/** One streamflow reading. */
export interface FlowReading {
  /** ISO 8601 timestamp in UTC. */
  time: string;
  /**
   * Cubic feet per second. Null when the gauge reported a time but no number,
   * for example when the river is iced over. `qualifiers` usually says why.
   */
  value: number | null;
  /** True until USGS has reviewed and approved the reading. */
  provisional: boolean;
  /** USGS qualifier codes such as "ICE", "EQUIP" or "ESTIMATED". */
  qualifiers: string[];
}
