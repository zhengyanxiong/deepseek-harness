# Loom implementation status

This directory contains the in-progress Loom bundle, domain model, storage, local Git adapters, the owner-only Host catalog Remote service, and the Client workbench. The Client loads the projects, versions, tasks and task details it renders from the Host snapshot endpoint over its own generated Remote contribution, creates projects, versions, tasks and Locks through the same namespace, materializes a prepared workspace from a Lock, starts an execution round with a native Session attached to that workspace, applies the allowed task transitions, compares the workspace against its Lock through the native deliverables file comparison factory, and cleans up a retained workspace only after explicit confirmation. The Host also persists workspace execution ownership with FIFO waiting, blocks Loom-attached Agent tool calls unless the calling Session owns execution access, releases ownership when its Agent turn becomes idle, and performs user-confirmed handoff by cancelling the owning Agent turn and waiting for observable idleness. The bottom Activity pane renders the durable business audit trail; terminal, test and cost panes remain unwired.

## Implemented domain rules

- Project configuration admission without filesystem or network effects.
- Version repository references resolved to immutable commit snapshots.
- Task execution rounds retain one workspace across successive Sessions.
- A new task may explicitly reuse another task's idle workspace from the same version and Lock; the Host refuses while any other task is running on it or an Agent still owns its execution.
- Each repository worktree is attached to a deterministic version-owned branch (`loom/<version>/<source>-<workspace>`) created at the Lock commit, so code lives on a real branch rather than a detached HEAD. Existing registered workspaces are attached to a branch at startup or before their next start without changing their files; branches Loom created are removed with the workspace.
- Workspace execution ownership uses generation tokens, FIFO waiting and confirmed-stop takeover.
- Loom-attached Agent tool calls acquire execution access before running; a non-owner is denied until the current owner yields or a confirmed handoff completes.
- Durable audit records cover project, version, Lock, task, workspace, attempt, Session and execution mutations.

## Execution handoff and limits

The start form lists every retained workspace prepared under the selected version, shows each workspace's recorded Lock baseline, and marks one busy while another task is running or a Session owns its execution. The Client offers waiting, confirmed takeover and explicit release controls for the current workspace. The Host records the takeover request, cancels the owning Agent with `keepInbox`, and treats the handoff as confirmed only after the Agent reports non-running status within ten seconds; otherwise the original owner remains and the UI reports the blocked outcome. Ownership is released automatically when the owning Agent becomes idle or its Session is disposed, promoting the FIFO head.

The tool gate checks every `tools/pre-execute` call from an Agent attached to a Loom attempt. It acquires ownership for a free workspace and denies calls while another Session owns it. This constrains the DSH-managed execution path, not the filesystem: external editors and terminals can still modify workspace files. Stop confirmation observes the owning Agent's status; it does not separately prove that every child Agent or external process has stopped.

## Verification

From the repository root:

```sh
pnpm exec vitest run --config loom/vitest.config.ts
pnpm --dir loom run build
pnpm run typecheck
```

The bundle build emits `loom/lib/index.js` and `loom/lib/client.js`. `pnpm --dir loom run build` first runs `scripts/generate-typert.ts`, which generates `lib/typert.host.js` (Typert Loader artifact) and `lib/typert.remote-client.{js,d.ts,d.ts.map}` (Client contribution mounted with `ctx.remote.$mount`). Generated files are build artifacts and are not the source of record; repeated generation is byte-identical. The artifacts resolve from the repository's own `@deepseek-ai/*` packages, so they rely on the same module resolution as any installed plugin, and loading them inside an isolated profile is not yet verified.

## Host configuration

The Host catalog service requires an explicit absolute `catalogFile` path and creates its missing parent directories. One service instance must exclusively own that file. The bundle patch defaults the path to `dshHomePath('loom/catalog.json')`. Starting a round without an explicit workspace root uses `workspacesDir` (default `dshHomePath('loom/workspaces')`, otherwise a `workspaces` sibling of the catalog) and creates a unique child directory, so the workbench never asks users to invent a path. Catalog Remote methods require an owner principal and validate imported data before writing. Verified endpoints: project, version, Lock and task creation, prepared-workspace registration, attempt start, Session association, task transitions, and execution acquisition, release and confirmed takeover. The Client mounts the generated `./remote` contribution in an effect and registers the page through a fiber that requires `remote.loom`. The page reads `snapshot`; inline forms call `createProject`, `createVersion`, `createTask` and `generateLock`, and the execution panel calls `prepareWorkspace`, `startAttempt`, `attachSession` and `transitionTask`. It prepares a workspace by checking out every project repository at the Lock's commits, registers that path as a native Workspace, creates a native Session inside it, and attaches the Session to the new round. The bottom Diff panel reads `workspaceChanges` (tracked changes since the Lock commit plus untracked files) and renders the selected file through `renderFactorySlot('deliverables.fileDiff', …)`, so the comparison component, styling, and highlighted hunks come from ui-deliverables rather than Loom. Cleanup refuses while a task using the workspace is running, refuses unconfirmed commits made since the Lock and uncommitted files, then removes the worktrees and root while keeping the catalog record marked `cleaned` so attempt history still resolves; the panel asks for that confirmation in place. Starting a round is not transactional with Session creation: if native Session creation fails after `startAttempt`, the task stays running with no attached Session and the panel can create another Session in the same workspace. See the plan's remote-interface section for the generation path and verification.

## Known limitations

The tool gate and handoff cover DSH-managed Agent calls; external processes and editors are outside that path. Stop confirmation observes the owning Agent's status, not every child or external process. Terminal, test and cost panes are not wired to native or external data sources. Storage writes serialize within one instance, not across processes. Git preparation currently supports local repositories only. No current deployment profile is modified by these files.

Product scope is defined in [the approved design](../docs/superpowers/specs/2026-10-17-dsh-loom-design.md).
