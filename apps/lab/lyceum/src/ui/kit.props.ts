import { z } from 'zod';
import type { DomComponent } from '@niscorp/nova/adapters/dom';
import { ALIGNS, INKS, LEVELS, LOOKS, MARKS, SIGILS } from './kit';

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
        narrow: z
          .object({ areas: z.array(z.string()), rows: z.array(z.union([z.number(), z.literal('auto')])), cols: z.array(z.number()) })
          .partial({ rows: true, cols: true })
          .strict(),
      })
      .partial()
      .strict(),
    Cell: z.object({ area, ink, mark, align: z.enum(ALIGNS), pad: z.literal('none'), scroll: z.enum(['y', 'end']) }).partial().strict(),
    Label: z.object({}).strict(),
    Headline: z.object({ level: z.enum(LEVELS) }).partial().strict(),
    Text: z.object({ tone: z.literal('muted') }).partial().strict(),
    Figure: z.object({ label, value: z.union([z.string(), z.number()]) }).partial().strict(),
    Countdown: z.object({ label, to: z.string().describe('The instant counted down to') }).partial().strict(),
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
    Flow: z
      .object({
        from: z.string().describe('What the first end is'),
        to: z.string().describe('What the second end is'),
        lanes: z.array(z.object({ label, toward: z.enum(['to', 'from']), ink }).partial({ ink: true }).strict()),
      })
      .partial()
      .strict(),
    Columns: z.object({ bars: z.array(z.object({ label, value: z.number(), ink, mark }).partial({ ink: true, mark: true }).strict()) }).partial().strict(),
    Action: z.object({ area, ink, label, lines: z.literal('two'), size: z.literal('large'), sound: z.literal('chime') }).partial().strict(),
    Field: z.object({ area, placeholder: z.string(), value: z.string(), enter: z.literal('clears') }).partial().strict(),
    Look: z.object({ look: z.enum(LOOKS) }).partial().strict(),
    Xray: z.object({ on: z.boolean() }).partial().strict(),
  })
  .strict()
  .describe('The props each lyceum kit component accepts, by component name');

// A KIT is one renderer per component this grammar names — every look lyceum
// paints with implements the same set: in a browser (./kit.ts, ./plain.kit.ts)
// a DOM component each, in a terminal (./ink.kit.ts) an ink one.
export type KitOf<Component> = Record<keyof z.infer<typeof KIT_PROPS>, Component>;
export type Kit = KitOf<DomComponent>;
