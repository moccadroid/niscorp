# @niscorp/nisc

The nisc platform as **one known-compatible set**. Every `@niscorp` package is
its own library with its own version — prism, solid and signal are useful far
from nisc, nova runs without moss — and this package is the release that says
which versions of all of them belong together.

```bash
pnpm add @niscorp/nisc zod
```

It ships no code. Its dependencies pin each package to the **exact** version it
was released with, so installing `@niscorp/nisc@0.4.0` installs the set that
was tested as nisc 0.4.0. Import from the packages themselves
(`@niscorp/nova`, `@niscorp/moss`, …).

Its version moves whenever any member's does. The packages are live, and a
release is compatible with the one before it: installing a newer
`@niscorp/nisc` does not break an app that worked on the older one. A breaking
release is a last resort that needs the maintainer's approval; if one ever
ships in a member, this package breaks with it — `pnpm check:changesets`
refuses a plan that is missing either the approval or this.

## The rulebook

It also carries the rules a nisc application is built by, for the versions it
pins: [`AGENTS.md`](AGENTS.md) — the decision points, the rules, the order of
work, what a review checks — and [`STYLE_GUIDE.md`](STYLE_GUIDE.md). They are
written for the coding agent building the app as much as for a person. An app
made by `npm create nisc` has a short `AGENTS.md` of its own that points here,
so the rules it follows are always the ones for what it has installed.

## License

Apache-2.0
