# dsh-workbench

An independent DSH **bundle** that adds a Workbench panel to the Web client: an
executable + monitorable personal workbench per `docs/design.md` v2, organized
into two tabs:

- **指挥台** — a command palette (`Ctrl/⌘+K`, fuzzy match + MRU + dynamic
  parameter candidates), quick actions generated from the same command
  registry, clickable cards (open session, hover-revealed job stop), the
  resource strip, and a floating composer that feeds the session draft pipe.
- **监控** — 30s-sampled resource-trend sparklines (1h/6h/24h windows), a
  realtime activity stream derived from session/job snapshot diffs (coalesced,
  capped, pinned scroll), and task/goal/context progress bars.

The panel still aggregates, per session where applicable:

- **会话总览** — the session catalog (`displayTitle`, running mark).
- **后台任务** — the live background-job roster, grouped by owning session.
- **工作流** — background jobs registered with `kind: 'workflow'`.
- **目标** — each session's `goal` projection (objective + durable phase).
- **提醒** — the host reminder catalog, refreshed on `schedule/changed` and
  reconnect.
- **子代理** — each parent session's direct children (`subagentCatalog`).
- **智能体团队** — each lead session's `agentTeam` roster (name, role, phase).
- **Token · 上下文** — per-session cumulative usage and context occupancy.

## Architecture

The package lives at the repository root, outside the monorepo workspace, and
installs into the `web` profile as a local-directory bundle. It has two halves:

- `lib/index.js` — the host half (`name` / `inject` / `apply`), a no-op because
  the bundle only contributes a browser panel.
- `lib/client.js` — the browser half, bundled standalone (React and the
  `ui-primitives` atoms stay external against the shell's module table). It
  registers a top-level `main` panel (`id: workbench`) plus a
  `sidebar.panellist` entry, and selects the panel on a fresh boot unless
  another panel is open or a session is retained by the main view (a deep link
  or a resumed session keeps the conversation).

The body is a `PropsRuntime<'main'>` shell with two tab views, styled after the
Web styling reference: one `WorkbenchPanel.module.css` (compiled by
lightningcss inside the bundle), `--dsw-*` semantic tokens, and `Tag` /
`StateDot` / icon atoms from `ui-primitives`. Cross-session data and actions
reach the body through the slot inject face:

- `useSessions` — `SessionSummary.projectionValues` carries `goal`, `tokenUsage`,
  `contextPressure`, `subagentCatalog`, and `agentTeam` for every listed session.
- `ctx.jobs.state` (bound as `useJobs`) — every session's job roster, watched
  ref-counted from `ctx.sessions.list`.
- `ctx.remote.schedule.catalog()` (bound as `useReminders`) — the host reminder
  catalog, read lazily and refreshed on `schedule/changed` and
  `connection/reset`.
- Client aggregates (`store.ts`, design §6) — the realtime **activity stream**
  is derived by diffing successive session/job snapshots (250ms same-source
  coalescing, 200-row cap), and the **trend sampler** writes a 30s point
  (token input/output, avg context occupancy, running-job count) into a
  96-point hot ring plus a `localStorage` day-long series the wider windows
  downsample.
- Actions — `openSession` / `startSession(prompt)` resolve through
  `ctx.uiWorkspace` (navigation plus draft initialization) and `stopJob`
  through `ctx.jobs.kill`.

## Build and install

The package is not part of the monorepo workspace; it builds standalone.

```sh
tsdown                              # emit lib/index.js (host half) + lib/client.js (browser half)
dsh plugin --profile web add ./     # link this checkout into the web profile
```

The host Loader imports `lib/index.js`; the client module system serves
`lib/client.js` because the package declares `dsh.client` with a `./client`
export. The bundle patch inserts one row, `id: workbench`, referenced by package
name.

## Known limitations

- The CSS Modules loader is self-contained: `tsdown` compiles
  `WorkbenchPanel.module.css` through `lightningcss` (a devDependency) into an
  injected style tag and a hashed class map, mirroring the workspace
  `dsh-css-modules-inline` preset.
- The panel shows an empty state per section when the corresponding session
  projections have not yet been pushed by the host; there is no retry surface.
- The composer ships text through `uiWorkspace.startSession`'s draft
  initialization: the message lands prefilled in the reused-blank/new session's
  composer, one Enter away from being sent. The model/context/attachment chips
  are presentational until they bind the session composer's selectors.
- Voice entry points announce the P2 STT integration; the trend sampler's
  persisted series lives in `localStorage` (the Web client's lightweight
  host storage), trimmed to one day.
