# NOTES

React 18 + TypeScript + Vite, MUI v6, React Router v7, ECharts (canvas), date-fns-tz.
State is kept in React Context (authentication only) and small hooks. The central `useAsyncResource` hook handles loading, errors, retries, cancellation and stale responses. Redux and React Query weren't needed for one screen with a handful of requests, so no extra state library was added.

## 1. Session and token management

**Where the token is stored: `sessionStorage`.** Only `src/features/auth/tokenStorage.ts` touches it.

- **Why:** it survives a page refresh, as required, but is scoped to the browser tab and cleared when the tab closes. That gives a shorter exposure window than `localStorage`, without the "every refresh logs you out" cost of keeping it only in memory.
- **Trade-offs weighed:**
  - Like any web storage, it's readable by scripts on the page. XSS protection relies on React's escaping, and tooltip strings from the backend are HTML-escaped before rendering.
  - Each new tab needs its own sign-in.
  - An httpOnly cookie would be safer against XSS, but the backend returns the token in the JSON body, so a cookie would need server changes.

**Refresh-on-load.**
- If a token exists when the app starts, `AuthProvider` stays in an `initializing` state and calls `GET /auth/me` once; a ref guard stops React StrictMode sending it twice. The dashboard route is not rendered until that call succeeds.
- If it returns 401, the token is cleared and the user is sent to `/login` with a "session expired" message.
- Any other error shows a "can't restore session" screen with Retry. It never assumes the user is signed in.

**From the login response to the `Authorization` header.**
- `POST /auth/login` is sent unauthenticated. The `access_token` from the response envelope is stored, then `/auth/me` loads the user.
- All requests go through one client (`src/api/client.ts`). It adds `Authorization: Bearer <token>` from a single token getter, unwraps the `{ trace_id, status_code, message, data }` envelope, and turns errors into one `ApiError` type.
- Retries: 5xx and network errors are retried up to 2 times, with backoff of 500 ms and then 1 s.

**Expiry.**
- Any authenticated 401 calls one `onUnauthorized` hook. It clears the token and switches the auth state to signed out; the route guard then redirects to `/login`.
- A 401 is ignored if the token that was rejected is no longer the current one, so a late response can't end a newer session.
- A 401 on `/auth/login` is shown as an inline "invalid credentials" message instead.

**Logout.**
- Sign-out clears the token and the auth state immediately, so the login screen appears straight away. `POST /auth/logout` is then sent in the background with the captured token.
- Its failure (including 401) is ignored, and it can't trigger the session-expired flow.
- The backend was observed to accept the token after logout, so clearing it locally is what actually ends the session.

## 2. Keeping the chart fast with individual produces on

**Approach.**
- ECharts with the **canvas** renderer, tree-shaken to only the pieces used (custom series, scatter, grid, tooltip, inside data zoom, brush).
- Canvas draws every marker onto a single bitmap instead of creating thousands of SVG or DOM nodes. ECharts' large-scatter mode takes the markers directly from typed arrays.

**Work done once per response, never while rendering.**
- `normalizeTimeline` parses every timestamp once. It flattens and sorts the (unsorted) produces into a `Float64Array` of times and a `Uint8Array` of result codes, and clips segments to the shift window.
- `buildTimelineChartModel` precomputes the marker positions as flat `[x, y, …]` arrays, one per result.
- Colours are resolved once per series (and once per segment band), never per marker.
- The chart instance is updated with `setOption`. It stays mounted when individual produces are toggled, and is only re-created when a new asset, date or shift is loading.

**Thinning: none.** Every PASS and FAIL marker is drawn, so no FAIL can ever be dropped. Measurements showed thinning wasn't needed.

**How smoothness was checked.**
- A synthetic 20,000-marker payload was run in Chrome:
  - zoom re-renders took roughly 10–70 ms across runs
  - no main-thread tasks over 50 ms during zoom or hover
  - all 25 FAIL markers were present
- Unit tests check that 20,000 markers are normalized and modelled in under 250 ms, and that every FAIL is kept.
- Real data for one line and shift is about 5,000–8,200 individual rows.

**Network, not rendering, was the observed bottleneck.**
- The `exact_produces: true` response is about 950 KB of uncompressed JSON (no gzip), which took seconds to download.
- To keep the page responsive, the individual rows are requested **separately**, only while the toggle is on. The small summary request (segments + hourly counts, `exact_produces: false`) feeds the table, the bands and the hourly markers. So the table and chart stay visible while the individual markers download ("Loading individual produces…").
- Turning the toggle off drops the individual layer without a new request.

**Interaction.**
- Drag across the chart to zoom to a time range (brush); the minimum span is 60 s.
- Double-click, or the "Reset zoom" button, to reset. There's no panning, as allowed.
- Tooltips show a marker's result and its IST timestamp. Hovering a band shows its kind and duration.

## 3. Time handling and hourly bucketing

**UTC ↔ IST.**
- All conversion lives in `src/utils/timezone.ts` and uses date-fns-tz with the IANA zone `Asia/Kolkata`. The browser's local timezone is never used.
- **Outgoing:** the shift window is built in IST first.
  - `shift_timings` are start times; each shift runs until the next start, and the last wraps to the first.
  - date + start time and (date + 1 if the shift crosses midnight) + end time give the window.
  - Only then is it converted to UTC for `time_range`, e.g. `2026-06-23T07:00:00Z`.
- **Incoming:** every timestamp (axis labels, tooltips, table columns) is formatted in IST.
- Tests run in a New York timezone, and the Chrome checks ran in a Los Angeles browser, so a wrong conversion would show up.

**Segments.**
- `runtimes`, `downtimes` and `stoppages` are parsed once and classified: runtime, unknown unplanned production, planned downtime, unknown downtime, stoppage.
- They are **clipped to the shift window**, because the live backend sometimes returns segments ending after `to_ts`. The chart and the table use the same clipped segments, so they agree.

**Hourly table.**
- **Columns:** one per IST clock hour of the shift (e.g. 07:00–08:00 … 18:00–19:00), per the assignment's "one row per clock hour" example.
  - For a shift that starts on the half hour (e.g. the sample `main` shift, 12:30–00:30), the first and last columns are half-hour clock-hour pieces (12:30–13:00, 00:00–00:30).
- **Rows:** exactly the nine rows listed in the assignment, in that order.
  - Runtime counts `planned` runtime only. Unplanned Production is the `unknown unplanned production` runtime. They're kept separate because the sanity check adds them.
- **Segment minutes:** each segment is split at hour boundaries, and each piece's minutes are added to that hour's row for its kind. For example, runtime 08:33→10:12 becomes 27 / 60 / 12 min.
- **Total / Pass / Fail:** `ok_count + ng_count`, `ok_count` and `ng_count`, summed across part models. They are never derived from individual rows, so WIP is never counted as PASS or FAIL.
- **Bucket placement:** a produce-count or cycle-time bucket goes in the column containing its IST `bucket_start`. A bucket that starts just before the shift but overlaps it (the live night shift's 18:30 IST bucket) goes into the first column, so it isn't lost.
  - **Data limitation:** the live backend's hourly buckets start on whole UTC hours, which is :30 IST. For the live 07:00–19:00 shift, a bucket shown in the 08:00–09:00 column actually covers 08:30–09:30.
  - The hourly counts can't be split more finely without the individual rows, and the assignment says these rows come from `produce_counts`.
- **Cycle times:** Ideal and Actual come from `POST /analytics-query` (`distribution: "hourly"`), matched by `bucket_start`. `null` values are left blank.
- **In-progress shift:** "now" is the time the data arrived.
  - Hours after "now" are blank, not zero.
  - The current hour counts segment minutes only up to "now".
  - Buckets that start at or after "now" are not filled.
- **Sanity check** (ASG 2.4): for every fully elapsed hour, runtime + unplanned production + stoppage + unknown downtime is compared with the elapsed minutes, allowing ±1 min for rounding.
  - Deviations are reported under the table and are never corrected by moving minutes between rows. Each deviation is reported as one of:
    - explained by planned downtime or an unrecognised segment type
    - minutes not covered by any segment (missing data)
    - overlapping segments
  - With the live data, every hour that falls short is short by exactly its planned-downtime minutes (tea or lunch break). Planned downtime is a downtime type the written table has no row for.

## 4. Assumptions and cuts

**Priority between the written requirements and the screenshots.**
- The assignment says the screenshots are the visual source of truth and asks candidates to raise disagreements.
- For this submission we decided, ourselves, to follow the **written requirements** wherever a screenshot differs from them, and to use the screenshots only as visual guidance otherwise.
- This is our implementation decision, not something the client has confirmed. The differences are:
  - **Table columns:** clock hours, as written, instead of the screenshot's shift-aligned 08:30–09:30 columns.
  - **Table rows:** the nine written rows, instead of the screenshot's twelve.
  - **Future hours and `null` cycle times:** blank, as written, instead of the screenshot's "0".

**Assumptions.**
- **Asset picker:** the asset tree is flattened to line and machine nodes (asset levels 20 and 10), grouped under their parent. The selected node's `id` + `assetlevel_id` become the `entity_scope`.
- **Default date:** 23 June 2026 (the data range given is 22–25 June). The first line and the first active shift are selected from the live responses.
- **`exact_produces`:** sent as `false` when the toggle is off, matching the assignment's example request.
- **Individual-produces toggle and refetching (interpretation).**
  - The assignment says "Changing any filter refetches the data" (ASG 2.1), and it lists the toggle in the filter bar.
  - It also says to set `exact_produces: true` "only when 'Show individual produces' is on … request it only when needed" (ASG 2.2).
  - It does not say whether turning the toggle **off** must re-request the summary data. The behaviour below is our reading of the two requirements together, not something the assignment states explicitly:
    - **Toggle on:** requests the individual produces (`exact_produces: true`) for the current asset, date and shift.
    - **Toggle off:** no request. The summary data already loaded for the same asset, date and shift (segments, hourly counts, cycle times) is shown again. That data doesn't depend on the toggle. Refresh gets the latest data at any time.
    - **Asset, date or shift change:** everything is refetched for the new selection. Refresh re-requests all active data.
- **Hourly markers** (toggle off) show cumulative production and sit at the end of each hourly bucket, clipped to the shift.
- **WIP:** the assignment documents `result` as `PASS` / `FAIL` only, but the live data also contains `result: "WIP"` (for example 92 rows on Line 1, 23 June day shift).
  - Those rows are kept in the data and never counted as PASS or FAIL. They're not plotted, because the written spec defines no marker for them; the chart says how many were left out.
  - Rows with `produce_type: "WIP"` whose result is PASS or FAIL are plotted by their result, as written.
  - The screenshot's "Triangles = WIP" legend was not implemented, because the written spec doesn't describe it.
- **Planned downtime** (e.g. tea and lunch breaks in the live data) is drawn as its own band colour. It has no table row, because it isn't one of the assignment's rows. A note under the table shows its minutes, because hours containing it add up to less than 60.
- **Stoppage format:** the written spec treats `stoppages` as timeline segment bands alongside `runtimes` and `downtimes`, but gives no example entry. The sample payload and every live response we saw had `stoppages: []`.
  - Stoppages are read like the other segments (`start_at` / `end_at`).
  - Entries without valid timestamps are skipped and counted.
  - A missing or non-array `stoppages` field (or any other collection) is treated as empty.
- **Axis ticks:** the timeline's labels are in IST. The tick positions follow ECharts' UTC-hour alignment, which falls at :30 IST.

**Cut / not built.**
- Out of scope per the assignment: segment classification and create dialogs, auto-refresh, CSV/PDF export, i18n/themes/settings, hierarchy drill-down and multi-machine views.
- Screenshot-only extras not in the written requirements, intentionally not built:
  - a "NOW" line on the chart
  - labels inside the bands
  - point labels, a connecting line, and per-part-model lines and legend (hourly points sit at the bucket end rather than the screenshot's bucket midpoint)
  - the "asset level" and "machine" selectors, and the "Part model" chip
  - "Last observed produce" and the unknown-segment classification hint (classification is out of scope)
  - the WIP triangle legend
  - the screenshot's extra table rows and its "mins"/"secs" cell units (units are in the row labels)
- **Performance evidence:** 20,000 markers were verified with **synthetic** data (unit tests and Chrome).
  - The largest live payload we observed was about 8,200 individual rows for one 12-hour shift (about 13,700 for a full day), below the 10,000–20,000 the assignment mentions.
- No favicon (not required).
- The backend payload isn't compressed. That is a server setting, not something the frontend can change.

## Running and deploying

```bash
npm install
cp .env.example .env.local   # set VITE_API_URL to the backend base URL (host root, no /api)
npm run dev
```

Other scripts: `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`.

**Deployment target: Netlify.**
- The assignment allows any host; this project targets Netlify.
- Build command `npm run build`, publish directory `dist`, Node 20+.
- `VITE_API_URL` must be set in the site's environment variables, because it is read at build time.
- `public/_redirects` (copied to `dist/_redirects`) rewrites every path to `index.html`, so opening or refreshing `/login` and `/dashboard` works.
