import type { Posture, Ui } from './generate';

// ═══════════════════════════════════════════════════════════════
// The two documents only a new app has.
//
// AGENTS.md says where the rules are — the installed @niscorp/nisc carries
// them, for the version installed — and what is particular to this app. It
// does not restate a rule: a copy would be frozen at the version it was made
// with, and the rules move with releases.
//
// PLAN.md is the interview's record (AGENTS.md, "Before any code"). The
// walkthrough asks what shapes the files; everything else is written down as
// OPEN, and an open decision point blocks the build until it is answered or
// delegated by name.
// ═══════════════════════════════════════════════════════════════

type Facts = { name: string; posture: Posture; ui: Ui; today: string; nisc: string };

const uiName = (ui: Ui): string => (ui === 'react' ? 'React' : 'plain DOM (nova’s DOM adapter — no framework in the page)');

const layoutOf = (facts: Facts): string =>
  facts.posture === 'moss'
    ? `src/app/        ARTIFACTS ONLY — the manifest (app.ts), the charter, the actions, the shell
src/server/     the environment (runtime.ts), the boot, how a screen is drawn (document.ts)
src/ui/         the kit — the only renderer code, with ${facts.ui === 'react' ? 'src/main.tsx' : 'src/main.ts'}, the terminal entry
src/dev/        the checks (\`npm run check\`)
nisc.config.ts  how the app boots and how a screen is drawn, for the \`nisc\` command`
    : `src/app/        ARTIFACTS ONLY — the actions and the shell's canvases
src/boot.ts     the shell factory: the artifacts plus everything environmental
src/ui/         the kit and the screen — the only renderer code, with ${facts.ui === 'react' ? 'src/main.tsx' : 'src/main.ts'}, the entry
src/dev/        the checks (\`npm run check\`)
nisc.config.ts  how the app boots and how its screen is drawn and picked up, for the \`nisc\` command`;

export const agentsDoc = (facts: Facts): string => `# ${facts.name}

A nisc application. **The rules it is built by are \`node_modules/@niscorp/nisc/AGENTS.md\`** — read all of it before changing anything here (install first: \`npm install\`). It is the rulebook for the nisc version this app has installed, and \`STYLE_GUIDE.md\` sits beside it. The grammars it names — a layout node, an \`ActionDefinition\`, a Prism config, a charter, a Vex DSL — are in each package's own \`README.md\` and \`DESIGN.md\`, under \`node_modules/@niscorp/<name>/\`.

What is particular to this app:

- **Its decisions are in PLAN.md.** What was answered when it was made, what was derived, and what is still open. An open decision point is asked before anything is built on it, never resolved silently.
- **It is ${facts.posture === 'moss' ? 'behind moss' : 'its own shell'}**, drawn with ${uiName(facts.ui)}.
- **Where things go:**

\`\`\`
${layoutOf(facts)}
\`\`\`

- **How it runs:** \`npm run dev\`, \`npm run build\`, \`npm run check\`${facts.posture === 'page' ? ', `npm run export`' : ', `npm start`'} — all of them the \`nisc\` command.
`;

const d1 = (posture: Posture): string =>
  posture === 'moss'
    ? `| D1 Posture | answered | **A moss server app.** The shell runs on the server, one per person; the browser is a canvas terminal over a socket. The charter is enforced there, and data never leaves the server except as the screens a principal is granted. |`
    : `| D1 Posture | answered | **Its own shell, in the page — no server.** The shell, its actions and its endpoints run in the browser. Consequence, said plainly: **the charter is not enforcement here.** Whatever data and policy the page has, its user has; nothing in this posture is a security boundary. An app that needs one needs a server — moss. |`;

const d2 = (posture: Posture): string =>
  posture === 'moss'
    ? `| D2 Environment | derived · **open for deployment** | Development and the checks run on PGlite, an in-memory Postgres that starts empty every boot (\`src/server/runtime.ts\`). Open: the Postgres a deployment hands it, and where it runs. |`
    : `| D2 Environment | **open** | The app has no data yet. Open: what serves its endpoints — in-memory fixtures, PGlite in the page (your data lives in one browser profile: no sync, no other devices, gone if site data is cleared), a real backend, or a mix. |`;

const d5 = (posture: Posture): string =>
  posture === 'moss'
    ? `| D5 Routing | derived · **partly open** | The first screen is drawn on the server and adopted by the terminal — it costs nothing while nobody can sign in. Open: once sign-in exists, the wire keeps a cookie copy of the session token so a page can be drawn for the person asking (AGENTS.md rule 12), and a page drawn for somebody is theirs alone (\`private, no-store\`). Open: which paths are **pages** rather than the app, and whether the app's shell state syncs to the address bar. |`
    : `| D5 Routing | derived · **partly open** | The first screen is drawn at build (\`nisc export\`) — one file per path, the screen as nobody in particular sees it — and the page's own shell picks it up. Open: which paths exist beyond \`/\`, and whether shell state syncs to the address bar. |`;

export const planDoc = (facts: Facts): string => `# PLAN — ${facts.name}

Made ${facts.today} by \`npm create nisc\`, on nisc ${facts.nisc}. This is the record AGENTS.md's interview asks for ("Before any code"). The walkthrough asked what shapes the files; everything else is **open**, and an open decision blocks the build that depends on it until it is answered by the user or delegated by name. A blanket "go" delegates nothing.

## Decision points

| | Tier | |
|---|---|---|
${d1(facts.posture)}
${d2(facts.posture)}
| D3 Reads | **open** | Vex entries (\`{ fingerprint, context }\`, the shape an AI feature can reach later) or plain endpoints with hand-written handlers. |
| D4 Writes | **open** | Vex mutation entries or plain endpoint handlers. Either way a write is an endpoint, never inline. |
${d5(facts.posture)}

## Answered when it was made

- **What draws the screen:** ${uiName(facts.ui)}. The kit in \`src/ui/\` is where the look lives; a layout names components, never styles.

## The dial-in — open

- The entities, and how they relate.
- Expected scale.
- Who uses it: one person, or roles. More than one principal sketches its roles and charter now, not later.
- AI features: now, later, never. (Later still shapes D3.)
- Look and feel.
- Where it is deployed.
- What happens to the data long-term.

## Order of work

1. **The interview** — every open item above, answered or delegated by name. ← here
2. **Scaffold** — done: ${facts.posture === 'moss' ? 'manifest, runtime and terminal' : 'the shell factory and the entry'}, one action rendering, a check.
3. **Kit** — the primitives, against a kitchen-sink action; lock the look before any feature.
4. **Data layer** — per D2/D3: schema, seed, entries; one read end to end.
5. **Actions** — domain by domain: list → detail → form.
6. **Writes** — per D4; one round trip: create → announce → re-read.
7. **Checks and polish** — a check per feature in \`src/dev/\`; empty states and transitions last.
`;

export const gitignore = `node_modules/
dist/
out/
*.tsbuildinfo
.env
.env.*
!.env.example
`;
