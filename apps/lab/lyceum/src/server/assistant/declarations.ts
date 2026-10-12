import { z } from 'zod';
import { ASSISTANTS } from '@lyceum/app/assistant/assistants';
import type { AssistantDeclaration } from '@lyceum/app/assistant/assistants';
import { ACTIONS } from '@lyceum/app/action-catalog';
import { ENTRIES } from '@lyceum/app/vex';

export const TOOL_NAMES = ['open', 'query', 'automate'] as const;
export type ToolName = (typeof TOOL_NAMES)[number];

const DeclarationSchema = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9-]*$/),
    title: z.string().min(1),
    context: z.string().min(1),
    grounding: z.array(z.object({ as: z.string().min(1), fingerprint: z.string().min(1), context: z.record(z.string(), z.unknown()), upfront: z.boolean() }).strict()),
    tools: z.array(z.enum(TOOL_NAMES)),
    applies: z.object({ screen: z.string().min(1) }).strict(),
  })
  .strict();

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
  from: readonly AssistantDeclaration[];
  tools: ReadonlySet<ToolName>;
};

export const assembleFor = (held: readonly string[]): Assembled => {
  const from = DECLARATIONS.filter((declaration) => held.includes(declaration.applies.screen));
  const tools = new Set<ToolName>(from.flatMap((declaration) => declaration.tools.flatMap((tool) => TOOL_NAMES.filter((name) => name === tool))));
  return { from, tools };
};
