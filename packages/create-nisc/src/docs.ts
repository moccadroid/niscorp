import type { Part } from './catalog';

export type DocFacts = {
  name: string;
  today: string;
  nisc: string;
  parts: readonly Part[];
  // The sections items add to AGENTS.md, each from its own agents-section.md.
  agents: readonly string[];
};

const all = <K extends 'is' | 'where' | 'runs' | 'decisions' | 'answered' | 'open' | 'order'>(parts: readonly Part[], key: K): string[] =>
  parts.flatMap((part) => {
    const value = part.docs?.[key];
    return value === undefined ? [] : typeof value === 'string' ? [value] : [...value];
  });

const decisionNumber = (row: string): number => Number(/^\| D(\d+) /.exec(row)?.[1] ?? Number.POSITIVE_INFINITY);

const sections = (texts: readonly string[]): string => texts.map((text) => `\n${text.trim()}\n`).join('');

export const agentsDoc = (facts: DocFacts): string => {
  const [first = 'a nisc application', ...rest] = all(facts.parts, 'is');
  return `# ${facts.name}

A nisc application. **The rules it is built by are \`node_modules/@niscorp/nisc/AGENTS.md\`** — read all of it before changing anything here (it is there once the app's dependencies are installed). It is the rulebook for the nisc version this app has installed, and \`STYLE_GUIDE.md\` sits beside it. The grammars it names — a layout node, an \`ActionDefinition\`, a Prism config, a charter, a Vex DSL — are in each package's own \`README.md\` and \`DESIGN.md\`, under \`node_modules/@niscorp/<name>/\`.

What is particular to this app:

- **Its decisions are in PLAN.md.** What was answered when it was made, what was derived, and what is still open. An open decision point is asked before anything is built on it, never resolved silently.
- **It is ${first}**${rest.map((clause) => `, ${clause}`).join('')}.
- **Where things go:**

\`\`\`
${all(facts.parts, 'where').join('\n')}
\`\`\`

- **How it runs:** ${all(facts.parts, 'runs').join(', ')} — all of them the \`nisc\` command — and \`npm run strata status\` for the grammars.
${sections(facts.agents)}`;
};

export const planDoc = (facts: DocFacts): string => `# PLAN — ${facts.name}

Made ${facts.today} by \`npm create nisc\`, on nisc ${facts.nisc}. This is the record AGENTS.md's interview asks for ("Before any code"). The walkthrough asked what shapes the files; everything else is **open**, and an open decision blocks the build that depends on it until it is answered by the user or delegated by name. A blanket "go" delegates nothing.

## Decision points

| | Tier | |
|---|---|---|
${all(facts.parts, 'decisions')
  .sort((a, b) => decisionNumber(a) - decisionNumber(b))
  .join('\n')}

## Answered when it was made

${all(facts.parts, 'answered')
  .map((line) => `- ${line}`)
  .join('\n')}

## The dial-in — open

${all(facts.parts, 'open')
  .map((line) => `- ${line}`)
  .join('\n')}

## Order of work

${all(facts.parts, 'order')
  .map((line, at) => `${at + 1}. ${line}`)
  .join('\n')}
`;

export const gitignoreLines = ['node_modules/', 'dist/', 'out/', '.strata/', '*.tsbuildinfo', '.env', '.env.*', '!.env.example'];
