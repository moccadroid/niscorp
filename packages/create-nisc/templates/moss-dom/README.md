# nisc-template-moss-dom

A [nisc](https://github.com/moccadroid/niscorp) application behind moss — the shell runs on the server, one per person; the browser is a canvas terminal.

| | |
|---|---|
| `npm run dev` | the app, in vite — with its server inside |
| `npm run build` | typecheck, bundle, draw every path and say how it is served |
| `npm start` | serve the built app, each first screen drawn |
| `npm run check` | the checks in `src/dev/` |
| `npm run strata status` | which grammar versions the source is written at |

**Before building anything:** [PLAN.md](PLAN.md) — what was decided when this app
was made and what is still open — and [AGENTS.md](AGENTS.md), which says where
the rules are.
