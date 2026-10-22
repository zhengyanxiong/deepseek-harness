# Security policy

## Supported versions

Workloom is an early preview. Only the latest published version of the
`dsh-workloom` npm package receives security fixes.

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability. Report it privately
through [GitHub Security Advisories](https://github.com/zhengyanxiong/dsh-workloom/security/advisories/new),
or by email to `zhengyanxiong@users.noreply.github.com`.

Please include the affected version, a reproduction of the issue and the impact
you expect. You will receive an initial response within a few days.

## What Workloom can do on your machine

Workloom is a DeepSeek Harness plugin. It reads the catalog under
`$DSH_HOME/loom`, inspects local Git repositories, creates Git worktrees and
links, and starts native DSH Sessions. It runs with the permissions DSH grants
its Host and Client processes; review the plugin's configuration and the DSH
permission model before running it against repositories you do not own.
