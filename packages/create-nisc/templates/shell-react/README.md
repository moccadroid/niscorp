# nisc-template-shell-react

A [nisc](https://github.com/moccadroid/niscorp) application with its own shell — it runs in the page, with no server.

| | |
|---|---|
| `npm run dev` | the app, in vite |
| `npm run build` | typecheck, bundle, draw every path and say how it is served |
| `npm run export` | write the site as a folder (`out/`) — any static host serves it |
| `npm start` | serve the built app, each first screen drawn per request |
| `npm run check` | the checks in `src/dev/` |
| `npm run strata status` | which grammar versions the source is written at |

**Before building anything:** [PLAN.md](PLAN.md) — what was decided when this app
was made and what is still open — and [AGENTS.md](AGENTS.md), which says where
the rules are.
