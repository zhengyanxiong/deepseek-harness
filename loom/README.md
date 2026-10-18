# Loom implementation status

## Install

Loom is a DSH bundle. DSH `0.2.1-rc.2` through `0.2.x` and Node.js `>=22.19` are required; its manifest declares that DSH range and installation refuses a release outside it. From this directory, build and pack:

```sh
pnpm run build
npm pack
dsh plugin --profile web add ./dsh-loom-0.1.0.tgz
```

Start the profile with `dsh --profile web`. The Web sidebar then lists **Loom**. A bundle installed from a built tarball needs no install-time build permission. Publishing the same package to npm and installing `dsh-loom@0.1.0` works the same way; the package name in `cordis.patch.yml` must match the published name.

The current repository root is the DSH application, not this bundle, so `dsh plugin add` cannot consume the repository URL directly: a Git install reads the package at the repository root. To distribute through Git without npm, attach the `npm pack` tarball to a GitHub Release and pass its URL to `dsh plugin add`, or move this directory into a standalone bundle repository whose root manifest declares `dsh.bundle` and whose built `lib/` is available (via committed artifacts or a self-contained `prepare` script). A Git `prepare` script requires an explicit build permission in the user's profile.

## Implementation status

This directory contains the in-progress Loom bundle, domain model, storage, local Git adapters, the owner-only Host catalog Remote service, and the Client workbench. The Client loads the projects, versions, tasks and task details it renders from the Host snapshot endpoint over its own generated Remote contribution, creates projects, versions, tasks and Locks through the same namespace, materializes a prepared workspace from a Lock, starts an execution round with a native Session attached to that workspace, applies the allowed task transitions, compares the workspace against its Lock through the native deliverables file comparison factory, and cleans up a retained workspace only after explicit confirmation in a modal that can open the native file comparison. The Host also persists workspace execution ownership with FIFO waiting, blocks Loom-attached Agent tool calls unless the calling Session owns execution access, releases ownership when its Agent turn becomes idle, and performs user-confirmed handoff by cancelling the owning Agent turn and its live descendants and waiting for observable idleness. Cleanup first runs the non-destructive check; uncommitted changes or unpushed commits require a second explicit discard confirmation. The bottom Activity pane renders the durable business audit trail. The Usage pane and context Cost/usage section render provider-reported token buckets from the native token-meter projection; terminal and test panes remain unwired.

## Implemented domain rules

- Project configuration admission without filesystem or network effects.
- Version repository references resolved to immutable commit snapshots.
- Task execution rounds retain one workspace across successive Sessions.
- Tasks persist an optional description, business-module selection and low/normal/high priority; unknown project modules and invalid fields are rejected. The board filters by priority and module and searches descriptions, and cards can be dragged only between states allowed by the task transition rules.
- Project configuration JSON is admitted through the same parser as manual creation, previewed with repositories and modules, and saved only after explicit confirmation; importing never fetches repositories or runs scripts.
- The context panel shows the version's repositories and Lock baselines; the task detail shows the append-only attempt history.
- The settings overlay persists the default view, board layout, context visibility and pinned-project list in the browser only.
- The workbench narrows the side panels below 1180px, moves the project tree into a drawer below 940px, and hides the context aside below 760px.
- New temporary sessions run in the newest active Loom workspace without belonging to a version or task.
- A new task may explicitly reuse another task's idle workspace from the same version and Lock; the Host refuses while any other task is running on it or an Agent still owns its execution.
- Each repository worktree is attached to a deterministic version-owned branch (`loom/<version>/<source>-<workspace>`) created at the Lock commit, so code lives on a real branch rather than a detached HEAD. Existing registered workspaces are attached to a branch at startup or before their next start without changing their files; branches Loom created are removed with the workspace.
- Workspace execution ownership uses generation tokens, FIFO waiting and confirmed-stop takeover.
- Loom-attached Agent tool calls acquire execution access before running; a non-owner is denied until the current owner yields or a confirmed handoff completes.
- Durable audit records cover project, version, Lock, task, workspace, attempt, Session and execution mutations.

## Execution handoff and limits

The start form lists every retained workspace prepared under the selected version, shows each workspace's recorded Lock baseline, and marks one busy while another task is running or a Session owns its execution. The Client offers waiting, confirmed takeover and explicit release controls for the current workspace. The Host records the takeover request, cancels the owning Agent with `keepInbox`, cancels live descendant Agents owned by it, and treats the handoff as confirmed only after every observed Agent reports non-running status within ten seconds; otherwise the original owner remains and the UI reports the blocked outcome. Ownership is released automatically when the owning Agent becomes idle or its Session is disposed, promoting the FIFO head.

The tool gate checks every `tools/pre-execute` call from an Agent attached to a Loom attempt. It acquires ownership for a free workspace and denies calls while another Session owns it. This constrains the DSH-managed execution path, not the filesystem: external editors and terminals can still modify workspace files. Stop confirmation observes the owning Agent's status; it does not separately prove that every child Agent or external process has stopped.

## Verification

From the repository root:

```sh
pnpm exec vitest run --config loom/vitest.config.ts
pnpm --dir loom run build
pnpm run typecheck
```

The bundle build emits `loom/lib/index.js` and `loom/lib/client.js`. `pnpm --dir loom run build` first runs `scripts/generate-typert.ts`, which generates `lib/typert.host.js` (Typert Loader artifact) and `lib/typert.remote-client.{js,d.ts,d.ts.map}` (Client contribution mounted with `ctx.remote.$mount`). Generated files are build artifacts and are not the source of record; repeated generation is byte-identical. The artifacts resolve from the repository's own `@deepseek-ai/*` packages, so they rely on the same module resolution as any installed plugin. Installing the packed tarball into an empty profile and mounting its Web header has been verified; the native Diff factory still depends on the deployed DSH build.

## Host configuration

The Host catalog service requires an explicit absolute `catalogFile` path and creates its missing parent directories. One service instance must exclusively own that file. The bundle patch defaults the path to `dshHomePath('loom/catalog.json')`. Starting a round without an explicit workspace root uses `workspacesDir` (default `dshHomePath('loom/workspaces')`, otherwise a `workspaces` sibling of the catalog) and creates a unique child directory, so the workbench never asks users to invent a path. Catalog Remote methods require an owner principal and validate imported data before writing. Verified endpoints: project, version, Lock and task creation, prepared-workspace registration, attempt start, Session association, task transitions, and execution acquisition, release and confirmed takeover. The Client mounts the generated `./remote` contribution in an effect and registers the page through a fiber that requires `remote.loom`. The page reads `snapshot`; inline forms call `createProject`, `createVersion`, `createTask` and `generateLock`, and the execution panel calls `prepareWorkspace`, `startAttempt`, `attachSession` and `transitionTask`. It prepares a workspace by checking out every project repository at the Lock's commits, registers that path as a native Workspace, creates a native Session inside it, and attaches the Session to the new round. The bottom Diff panel and the cleanup modal read `workspaceChanges` (tracked changes since the Lock commit plus untracked files), render changed files as a repository/directory tree, and draw the selected file through `renderFactorySlot('deliverables.fileDiff', …)`, so the comparison component, styling, and highlighted hunks come from ui-deliverables rather than Loom. The bottom Diff pane can expand to a full-window dialog, and its expanded height is adjustable by dragging the divider above it. Selecting a changed file opens the native comparison in the workbench's right aside, whose width is adjustable by dragging its divider; both sizes persist in browser-local preferences. The aside's turn review and the bottom Diff tree share one two-line file-row style with per-file counts; the turn review loads the selected file's native comparison. The File tab reads the current file through the native workspace-files service. Native conversation file links and changed-files review rows route there while Loom is the active panel, preserving the Sidebar preview entry point inside the workbench; a review row loads the turn's summary and native comparison through the native change routes. Cleanup refuses while a task using the workspace is running, refuses unconfirmed commits made since the Lock and uncommitted files, then removes the worktrees and root while keeping the catalog record marked `cleaned` so attempt history still resolves; the panel asks for that confirmation in a modal; when the workspace is dirty the modal can open the native comparison and then requires an explicit discard. The native comparison comes from the `deliverables.fileDiff` factory in `packages/client/ui-deliverables`, so an installation deployed with an older built copy of that package shows Loom’s unconnected-integration fallback instead. Starting a round is not transactional with Session creation: if native Session creation fails after `startAttempt`, the task stays running with no attached Session and the panel can create another Session in the same workspace. See the plan's remote-interface section for the generation path and verification.

## Known limitations

The tool gate and handoff cover DSH-managed Agent calls; external processes and editors are outside that path. Stop confirmation observes the owning Agent's status, not every child or external process. Terminal, test and cost panes are not wired to native or external data sources. Storage writes serialize within one instance, not across processes. Git preparation currently supports local repositories only. No current deployment profile is modified by these files.

Product scope is defined in [the approved design](../docs/superpowers/specs/2026-10-17-dsh-loom-design.md).
