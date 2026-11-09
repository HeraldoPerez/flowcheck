# FlowCheck

Check river levels at USGS gauges and see at a glance whether a run is in range.

You save the gauges you care about and FlowCheck shows the current reading and the last 7 days. Next it will let you set the flow range that works for you on each gauge and color the reading too low, good, or too high. It's for paddlers and anglers who check the same few gauges before every trip.

**Live app:** https://khalick.github.io/flowcheck/

## Status

Early, but usable. What works now:

- **Search** USGS stream gauges by river or place name, optionally in one state, or by site number (`03192000`). Gauges reporting flow right now are listed first; retired and water-quality sites are folded away.
- **Save** gauges. They're kept in your browser, with no account needed.
- **Current flow** for each saved gauge, with how old the reading is and USGS notes in plain words ("Ice is affecting the gauge", "Seasonal gauge, not running now"). Readings older than 3 hours are flagged. Flows refresh every 15 minutes while the page is open.
- **7-day chart** of flow when you open a gauge, with that week's low and high.

Next up is your own low/good/high range per gauge. The full plan is in [ROADMAP.md](ROADMAP.md).

## Running it locally

Needs Node 22.12 or newer.

```bash
git clone https://github.com/Khalick/flowcheck.git
cd flowcheck/app
npm install
npm run dev        # http://localhost:5173
```

Other scripts, all run from `app/`:

| Command | What it does |
| --- | --- |
| `npm test` | Runs the tests (Vitest). They use recorded USGS responses, so no network is needed. |
| `npm run typecheck` | Type-checks the app and tests. |
| `npm run build` | Builds the static site into `app/dist/`. |
| `npm run preview` | Serves the built site locally. |

## How it works

FlowCheck is a static React app. There's no server: the browser calls the [USGS Water Data APIs](https://api.waterdata.usgs.gov/) directly, which allow cross-origin requests and need no key. It's built on the newer OGC API (`/ogcapi/v1`), not the legacy WaterServices.

| What | USGS collection |
| --- | --- |
| Search by name or site number | `monitoring-locations`, filtered with CQL2 |
| Current flow for many gauges at once | `latest-continuous`, discharge (`00060`), last 2 days |
| 7-day chart | `continuous`, discharge, `time=P7D` |

The chart library is loaded only when you open a gauge, so the first page load stays small on phones.

```
app/
  src/usgs/        USGS API client and types
  src/lib/         formatting, saved-gauge storage, state list
  src/components/  search, saved gauges, current flow, chart
  tests/           unit and component tests, plus recorded USGS fixtures
```

Pushing to `main` runs the tests and deploys to GitHub Pages (`.github/workflows/`).

## Privacy

Saved gauges stay in your browser's local storage. FlowCheck has no accounts, no analytics and no server of its own. The only requests it makes go to USGS.

## Data and safety

Streamflow data comes from the U.S. Geological Survey and is provisional until USGS reviews and approves it. Gauges can fail, ice up, or lag behind a rising river. FlowCheck isn't affiliated with or endorsed by USGS. **Always check conditions yourself before getting on the water.**

## Built with

React 19, TypeScript, Vite and Recharts. Tested with Vitest and Testing Library.

## License

MIT, see [LICENSE](LICENSE).
