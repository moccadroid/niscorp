import { z } from 'zod';
import { ALIGNS, INKS, LEVELS, MARKS, SIGILS } from './kit';

// ═══════════════════════════════════════════════════════════════
// WHAT A LAYOUT MAY SAY TO EACH KIT COMPONENT — the kit's grammar (strata's
// `lyceum.kit`, AGENTS.md rule 18). A layout written against these props is a
// document in this grammar, so a change here — a prop added, renamed, a set
// narrowed — is a migration: `kit-check` snapshots this schema and refuses a
// change the sequence does not record.
//
// The closed sets are the kit's own (./kit.ts), so the two cannot drift. A value
// a layout binds to data (`'$.rows'`) is described as what it resolves to.
// Unknown props are refused here even though the kit drops them at render —
// the grammar is what the kit ACCEPTS, not what it survives.
// ═══════════════════════════════════════════════════════════════

const area = z.string().describe('A grid area name from the enclosing Sheet');
const ink = z.enum(INKS);
const mark = z.enum(MARKS);
const label = z.string();

export const KIT_PROPS = z
  .object({
    Page: z.object({}).strict(),
    Sheet: z
      .object({
        areas: z.array(z.string()),
        cols: z.array(z.number()),
        rows: z.array(z.union([z.number(), z.literal('auto')])),
        size: z.enum(['fill', 'auto']),
      })
      .partial()
      .strict(),
    Cell: z.object({ area, ink, mark, align: z.enum(ALIGNS), pad: z.literal('none'), scroll: z.literal('y') }).partial().strict(),
    Label: z.object({}).strict(),
    Headline: z.object({ level: z.enum(LEVELS) }).partial().strict(),
    Text: z.object({ tone: z.literal('muted') }).partial().strict(),
    Figure: z.object({ label, value: z.union([z.string(), z.number()]) }).partial().strict(),
    Code: z.object({ text: z.string(), marked: z.array(z.number()) }).partial().strict(),
    Sigil: z.object({ shape: z.enum(SIGILS), size: z.literal('large') }).partial().strict(),
    Qr: z.object({ value: z.string() }).partial().strict(),
    Rows: z
      .object({
        rows: z.array(z.record(z.string(), z.unknown())),
        rowKey: z.string(),
        empty: z.string(),
        rowRef: z.string(),
        clickKey: z.string(),
        selected: z.unknown(),
        columns: z.array(
          z
            .object({ label, key: z.string(), w: z.number(), kind: z.enum(['text', 'mono', 'sigil']), missing: z.string() })
            .partial({ w: true, kind: true, missing: true })
            .strict(),
        ),
      })
      .partial()
      .strict(),
    Bar: z.object({ segments: z.array(z.object({ value: z.number(), ink, mark }).partial({ ink: true, mark: true }).strict()) }).partial().strict(),
    Action: z.object({ area, ink, label, lines: z.literal('two') }).partial().strict(),
    Field: z.object({ area, placeholder: z.string(), value: z.string() }).partial().strict(),
  })
  .strict()
  .describe('The props each lyceum kit component accepts, by component name');
