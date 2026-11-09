# Changelog

Notable changes go here. Format loosely follows [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

- Project started.
- React + TypeScript app (Vite) that calls the USGS Water Data APIs (`/ogcapi/v1`) straight from the browser, with no server or key.
- Search USGS stream gauges by river or place name, optionally in one state, or by site number. Gauges with a flow reading in the last 2 days are listed first.
- Save gauges in the browser's local storage.
- Current flow for saved gauges, with the reading's age, a warning when it's over 3 hours old, and USGS qualifier codes in plain words. Refreshes every 15 minutes.
- 7-day flow chart (Recharts) with the week's low and high. The chart is loaded on demand to keep the first page load small.
- Tests for the USGS client, formatting, storage and the main screens, using recorded USGS responses.
- GitHub Actions: CI on pushes and pull requests, and deploy to GitHub Pages from `main`.
