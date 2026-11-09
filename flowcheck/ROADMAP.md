# Roadmap

Rough plan. Estimates are my guesses and will change.

## v0.1.0: first usable version
- [x] Search USGS stream gauges by name, state or site number, with gauges reporting now listed first
- [x] Save gauges in the browser
- [x] Current flow for saved gauges, with the reading's age and USGS notes (ice, equipment, seasonal)
- [x] 7-day flow chart, loaded only when a gauge is opened
- [x] Tests on recorded USGS responses, CI, and a GitHub Pages deploy workflow
- [ ] Your own low/good/high range per gauge: set it on the gauge, color the current reading, shade the bands on the chart (~4h)
- [ ] Gauge height (ft) as well as flow (cfs). Many runs are called by feet, so pick the unit per gauge (~4h)
- [ ] Rising, falling or steady arrow from the last few hours of readings (~1h)
- [ ] Release v0.1.0 with notes (~1h)

## v0.2.0
- [ ] Map search with Leaflet: gauges in the visible area, colored by your ranges (~6h)
- [ ] Compare today with typical flow for this date, from USGS daily values (~6h)
- [ ] Rename saved gauges after the run ("Upper Gauley") and reorder them (~2h)

## Later
- [ ] Installable PWA with offline mode: cache the app and the last readings (~3h)
- [ ] Share a gauge link that carries your range, plus a URL per gauge so the back button works (~2h)
- [ ] Export and import saved gauges and ranges as a file (~2h)
- [ ] Optional USGS API key setting for higher rate limits, and a retry when USGS answers 429 (~2h)
- [ ] NWS river forecasts for gauges that have one (~5h)
- [ ] Accessibility pass (keyboard, screen-reader chart summary, contrast) and end-to-end tests in a real browser (~4h)
