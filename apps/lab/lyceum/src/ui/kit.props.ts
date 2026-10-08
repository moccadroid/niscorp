import { z } from 'zod';
import type { DomComponent } from '@niscorp/nova/adapters/dom';
import { ALIGNS, GAPS, INKS, LANGS, LEVELS, LOOKS, MARKS, PANES, SCALES, SIGILS, SIZES, SPLITS } from './kit';

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
const pipelineStep = z.object({ label, value: z.string(), ink, off: z.boolean() }).partial({ ink: true, off: true }).strict();

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
        scale: z.enum(SCALES).describe('The reading scale: sizes fixed in rem with a measure, for a slide that is read'),
      })
      .partial()
      .strict(),
    Cell: z.object({ area, ink, mark, align: z.enum(ALIGNS), pad: z.literal('none'), scroll: z.enum(['y', 'end']) }).partial().strict(),
    Label: z.object({}).strict(),
    Headline: z.object({ level: z.enum(LEVELS) }).partial().strict(),
    Text: z.object({ tone: z.literal('muted'), size: z.enum(SIZES) }).partial().strict(),
    // The reading grammar: a document set out to be read, two things side by
    // side, things one under another, a row of figures.
    Exhibit: z
      .object({ area, label, text: z.string(), lang: z.enum(LANGS), tone: z.enum(PANES), flag: ink, marked: z.array(z.number()) })
      .partial()
      .strict(),
    Pair: z.object({ area, split: z.enum(SPLITS) }).partial().strict(),
    Stack: z.object({ area, gap: z.enum(GAPS), scroll: z.literal('y') }).partial().strict(),
    Stats: z.object({ area, items: z.array(z.object({ label, value: z.union([z.string(), z.number()]), ink }).partial({ ink: true }).strict()) }).partial().strict(),
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
    Menu: z.object({ area, label }).partial().strict(),
    Pipeline: z
      .object({
        area,
        steps: z.array(pipelineStep).describe('What always runs, in order; a step that did not happen is off'),
        detour: z
          .object({
            from: z.number().describe('The step the detour leaves the line at, from 0'),
            to: z.number().describe('The step it comes back at'),
            label,
            enter: z.string().describe('What the way in is called'),
            leave: z.string().describe('What the way back is called'),
            direct: z.string().describe('What the link it stands in for is called'),
            off: z.boolean(),
            steps: z.array(pipelineStep),
          })
          .partial({ label: true, enter: true, leave: true, direct: true, off: true })
          .strict(),
        legend: z.array(z.object({ label, ink }).partial({ ink: true }).strict()),
      })
      .partial()
      .strict(),
  })
  .strict()
  .describe('The props each lyceum kit component accepts, by component name');

// A KIT is one renderer per component this grammar names — every look lyceum
// paints with implements the same set: in a browser (./kit.ts, ./plain.kit.ts)
// a DOM component each, in a terminal (./ink.kit.ts) an ink one.
export type KitOf<Component> = Record<keyof z.infer<typeof KIT_PROPS>, Component>;
export type Kit = KitOf<DomComponent>;
