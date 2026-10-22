# Contributing

Thanks for helping improve Workloom. This document covers the local setup, the
checks a change must pass, and the rules that keep the plugin compatible with
DeepSeek Harness.

## Requirements

- Node.js `>=22.19`
- pnpm `11.x` (the repository pins `packageManager`)
- A DeepSeek Harness installation to run the plugin against: `>=0.2.1-rc.2 <0.3.0`

## Setup

```bash
pnpm install
pnpm run typecheck
pnpm test
pnpm run build
```

`pnpm install` links the published `@deepseek-ai/dsh-*` packages this plugin is
built against. The Harness API is pre-stable, so a version bump of those
packages is a real change: run the full check set afterwards.

The devDependencies also mirror the Web shell's client module table (`shiki`,
`simple-icons`, `zustand`, `immer`, the `mdast-*`/`micromark-*` set and
`jsdom`). Published Harness client packages expect the shell to provide those
modules at runtime, so the Node test environment installs them itself. They are
development-only and never ship in the bundle.

## Checks

| Command | What it covers |
| --- | --- |
| `pnpm run typecheck` | Host, Client and domain programs (`tsconfig.*.json`) |
| `pnpm test` | Unit tests for the domain, Host services and Client components |
| `pnpm run build` | `tsdown` bundle into `lib/` |

CI runs the same three commands through `.github/workflows/ci.yml`.

## Generated artifacts

`lib/typert.host.*` and `lib/typert.remote-client.*` are generated from the
plugin's Host FaceModel and are checked in, because the generator needs a
DeepSeek Harness source checkout to analyze the workspace. Run
`pnpm run generate` from inside that monorepo after changing Host Remote
methods, then commit the regenerated files. Everything else under `lib/` is
build output and is ignored.

## Code style

- TypeScript with the strict settings in `tsconfig.base.json`.
- `.ts` in local relative imports; package names across packages.
- English comments and JSDoc; user-visible copy goes through the locale
  dictionaries in `locale/` and `src/client/locales.ts`.
- Files end with exactly one trailing newline.

## Commit messages

Use Conventional Commits with a `workloom` scope, for example:

```
feat(workloom): read a diff tree one level at a time
fix(workloom): keep the selected workspace mode highlighted
```

## Releasing

1. Update `CHANGELOG.md` and bump `version` in `package.json`.
2. Commit, then tag `v<version>` and push the tag.
3. `.github/workflows/release.yml` publishes to npm and creates the GitHub
   Release. It needs an `NPM_TOKEN` repository secret, or npm trusted
   publishing configured for the repository.

## License

By contributing you agree that your contributions are licensed under the MIT
License.
