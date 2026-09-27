import { z } from 'zod';
import { ASSISTANTS } from '@lyceum/app/assistant/assistants';
import type { AssistantDeclaration } from '@lyceum/app/assistant/assistants';
import { ACTIONS } from '@lyceum/app/action-catalog';
import { ENTRIES } from '@lyceum/app/vex';

// WHO GETS WHICH ASSISTANT — read off what the charter granted, never written
// down twice. A declaration (app/assistant/assistants.ts) applies to whoever
// holds its action, so a person's assistant is the declarations their grants
// select: their instructions, their grounding reads, the union of their tools.

export const TOOL_NAMES = ['open', 'ask', 'automate'] as const;
export type ToolName = (typeof TOOL_NAMES)[number];

const DeclarationSchema = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9-]*$/),
    title: z.string().min(1),
    intro: z.string(),
    instructions: z.string().min(1),
    grounding: z.array(z.object({ as: z.string().min(1), fingerprint: z.string().min(1), context: z.record(z.string(), z.unknown()), upfront: z.boolean() }).strict()),
    tools: z.array(z.enum(TOOL_NAMES)),
    starters: z.array(z.string().min(1)).max(6),
    applies: z.object({ screen: z.string().min(1) }).strict(),
  })
  .strict();

// Parsed once, at boot: a declaration naming an action or a read the app does
// not have, or a tool the host does not offer, refuses to start — the same
// stance moss takes on an incoherent charter.
const DECLARATIONS: readonly AssistantDeclaration[] = (() => {
  const parsed = z.array(DeclarationSchema).parse(ASSISTANTS);
  const reads = new Set(ENTRIES.map((entry) => entry.fingerprint));
  for (const declaration of parsed) {
    if (ACTIONS[declaration.applies.screen] === undefined) throw new Error(`assistant "${declaration.id}" applies to "${declaration.applies.screen}", which is not an action`);
    for (const ground of declaration.grounding) if (!reads.has(ground.fingerprint)) throw new Error(`assistant "${declaration.id}" grounds on "${ground.fingerprint}", which is not an entry`);
  }
  return parsed;
})();

export type Assembled = {
  // The declarations this person's grants select — also shown to them, so the
  // assembly is visible: "your assistant is built from room, records".
  from: readonly AssistantDeclaration[];
  tools: ReadonlySet<ToolName>;
};

export const assembleFor = (held: readonly string[]): Assembled => {
  const from = DECLARATIONS.filter((declaration) => held.includes(declaration.applies.screen));
  const tools = new Set<ToolName>(from.flatMap((declaration) => declaration.tools.flatMap((tool) => TOOL_NAMES.filter((name) => name === tool))));
  return { from, tools };
};
