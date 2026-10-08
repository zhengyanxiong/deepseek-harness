# dsh-workbench

An independent DSH **bundle** that adds a Workbench panel to the Web client: an
executable + monitorable personal workbench per `docs/design.md` v2, organized
into two tabs:

- **指挥台** — quick-action forms, failed-job and blocked-goal attention rows, searchable sessions with persistent pins, running work, and today's reminders. The right-side operation surface (operation form, job detail, or the conversation drawer) is collapsed by default and opens only on demand within the visible workbench width; forms retain their input while switching panels.
- **监控** — 30s-sampled resource-trend sparklines (1h/6h/24h windows), a
  realtime activity stream derived from session/job snapshot diffs (coalesced,
  capped, pinned scroll), task/goal/context progress bars, and the reference cards for sessions, jobs, workflows, goals, reminders, subagents, teams, and token usage.

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
- Actions — `openSession` / `connectWorkspaceSession` / `acquireDrawerSession`
  resolve through `ctx.uiWorkspace` navigation and session retention,
  `primeSessionDraft` initializes a Session's request draft without
  overwriting it, and `stopJob` through `ctx.jobs.kill`.

## Build and install

The package is not part of the monorepo workspace; it builds standalone. Run `pnpm run typecheck` from this directory to build the referenced Client declarations and check the workbench; `pnpm run build` bundles JavaScript but does not typecheck.

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
- Quick-action forms prepare a request in an empty native Session draft; they do not submit messages or create business records. Existing text or attachments cause preparation to refuse without replacing them. The user reviews and sends through the native InputBar inside the right drawer. Reminder creation is assistant-mediated because the Client schedule remote exposes no create method; workflow, todo, and new-job forms follow the same explicit request-draft path.
- The right panel stays collapsed on page load and opens only for an operation form, a job detail, or the conversation drawer (session cards, quick-action forms, card rows). Visibility is not persisted across reloads. The header workspace picker chooses the default target workspace for new-session prepares.
- Form fields survive panel switches while the workbench stays mounted, not a page reload. Native conversation drafts use the conversation subsystem's per-Session persistence. Pins persist locally. Session rows follow catalog order with pinned entries first; there is no separate recent-access ordering or workspace membership filter.
- Reminder times use the browser's IANA time zone and show an ISO instant before preparation; invalid dates, DST gaps, and past instants are rejected. Daily recurrence is included in the assistant request, not scheduled by the browser.
- Attention rows currently cover failed jobs and explicitly blocked goals. Waiting-question and approval projections are not consumed. Job details show the available status/progress/detail fields and a link to the owning session, not a separate live-output stream or retry operation.
- Voice entry points announce the P2 STT integration; the trend sampler's
  persisted series lives in `localStorage` (the Web client's lightweight
  host storage), trimmed to one day.
