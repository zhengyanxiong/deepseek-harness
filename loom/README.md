# Loom implementation status

This directory contains the in-progress Loom bundle, domain model, storage, local Git adapters, the owner-only Host catalog Remote service, and the Client workbench. The Client loads the projects, versions, tasks and task details it renders from the Host snapshot endpoint over its own generated Remote contribution, creates projects, versions, tasks and Locks through the same namespace, materializes a prepared workspace from a Lock, starts an execution round with a native Session attached to that workspace, applies the allowed task transitions, and compares the workspace against its Lock through the native deliverables file comparison factory. Workspace retention and cleanup, execution handoff, the remaining bottom-panel tools, and Agent-entry execution enforcement are still incomplete.

## Implemented domain rules

- Project configuration admission without filesystem or network effects.
- Version repository references resolved to immutable commit snapshots.
- Task execution rounds retain one workspace across successive Sessions.
- Workspace execution ownership uses generation tokens, waiting and confirmed-stop takeover.

## Verification

From the repository root:

```sh
pnpm exec vitest run --config loom/vitest.config.ts
pnpm --dir loom run build
pnpm run typecheck
```

The bundle build emits `loom/lib/index.js` and `loom/lib/client.js`. `pnpm --dir loom run build` first runs `scripts/generate-typert.ts`, which generates `lib/typert.host.js` (Typert Loader artifact) and `lib/typert.remote-client.{js,d.ts,d.ts.map}` (Client contribution mounted with `ctx.remote.$mount`). Generated files are build artifacts and are not the source of record; repeated generation is byte-identical. The artifacts resolve from the repository's own `@deepseek-ai/*` packages, so they rely on the same module resolution as any installed plugin, and loading them inside an isolated profile is not yet verified.
## Host configuration

The Host catalog service requires an explicit absolute `catalogFile` path and creates its missing parent directories. One service instance must exclusively own that file. The bundle patch defaults the path to `dshHomePath('loom/catalog.json')`. Catalog Remote methods require an owner principal and validate imported data before writing. Verified endpoints: project, version, Lock, task creation, prepared-workspace registration, attempt start, Session association, and task transitions. The Client mounts the generated `./remote` contribution in an effect and registers the page through a fiber that requires `remote.loom`. The page reads `snapshot`; inline forms call `createProject`, `createVersion`, `createTask` and `generateLock`, and the execution panel calls `prepareWorkspace`, `startAttempt`, `attachSession` and `transitionTask`. It prepares a workspace by checking out every project repository at the Lock's commits, registers that path as a native Workspace, creates a native Session inside it, and attaches the Session to the new round. The bottom Diff panel reads `workspaceChanges` (tracked changes since the Lock commit plus untracked files) and renders the selected file through `renderFactorySlot('deliverables.fileDiff', …)`, so the comparison component, styling, and highlighted hunks come from ui-deliverables rather than Loom. Starting a round is not transactional with Session creation: if native Session creation fails after `startAttempt`, the task stays running with no attached Session and the panel can create another Session in the same workspace. See the plan's remote-interface section for the generation path and verification.

## Known limitations

Domain ownership transitions alone do not block real Agent execution; Host integration must enforce acquisition at execution entry points. Task transitions through the catalog do not stop native Agents or release workspace execution rights. Storage writes serialize within one instance, not across processes. Git preparation currently supports local repositories only. No current deployment profile is modified by these files.

Product scope is defined in [the approved design](../docs/superpowers/specs/2026-10-17-dsh-loom-design.md).
