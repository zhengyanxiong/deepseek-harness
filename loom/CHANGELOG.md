# Changelog

All notable changes to `dsh-workloom` are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project
follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Workloom is
an early preview, so minor versions may change the catalog format; the plugin
backs up and migrates legacy catalogs on load.

## [Unreleased]

### Added

- Native file previews inside the workbench: Markdown, images, code with
  syntax highlighting, open-with/default-app actions and page-level fullscreen.
- Diff tree that reads one directory level at a time and renders inline diffs
  instead of loading every changed file up front.
- A lightweight `workspaceChangeCount` Host remote so the workbench can show
  change counts without loading full diffs.
- Context panel split into the version baseline and the workspace branches, with
  session skills read from the native DSH skill catalog.
- Filterable branch picker with arrow keys, Escape and Enter.
- Host skill-link aggregation under `<root>/.dsh/skills` for direct multi-repo
  workspaces, with cleanup when tasks go away.
- Design notes and prototypes under `design/`.

### Changed

- The package is self-contained: it installs, typechecks, tests and builds from
  its own checkout, with Harness packages resolved from npm.
- Git C-quoted paths are decoded before they reach the UI.

### Fixed

- Preview comparisons scroll and wrap correctly in narrow panels.
- The workspace-mode picker highlights the selected mode instead of its
  neighbours.
- A direct workspace stays single-use and only starts from a clean tree.

## [0.1.7] - 2026-10-21

### Added

- Open `direct` and `linked` workspaces from the project workspace pool.

### Fixed

- Selected workspace mode is the one that is highlighted.
- A `direct` workspace is single-use and only starts from a clean tree.

## [0.1.6] - 2026-10-20

### Added

- Operation notices for long-running actions.
- The workbench centres on the active task.

## [0.1.5] - 2026-10-19

### Added

- Register an existing workspace through the in-app directory picker.

### Fixed

- File previews scroll and wrap in narrow panels.

## [0.1.4] - 2026-10-18

### Added

- First public npm release: projects, versions, Locks, tasks, task workspaces,
  native DSH Sessions, Diff review, execution ownership, Activity and Usage
  panels, plus the catalog migration path for legacy workspaces.
