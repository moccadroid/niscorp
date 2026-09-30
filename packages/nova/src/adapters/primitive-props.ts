import { z } from 'zod';

// ═══════════════════════════════════════════════════════════
// The headless primitive vocabulary's AUTHORING contracts — one Zod props
// schema per primitive, framework-free, shared by every adapter kit that ships
// the vocabulary (react, vue). A schema is what a layout node may set; the
// kits differ in how they paint, never in what they accept, so the schema
// lives once, here, and each kit's component carries it as its static `meta`.
// ═══════════════════════════════════════════════════════════

// ─── Stack ───
export const StackPropsSchema = z
  .object({
    direction: z
      .enum(['row', 'column'])
      .optional()
      .describe('Flex direction. Default: column.'),
    gap: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe('Gap between children in pixels. Default: 0.'),
    align: z
      .enum(['start', 'center', 'end', 'stretch'])
      .optional()
      .describe('Cross-axis alignment. Default: stretch.'),
    justify: z
      .enum(['start', 'center', 'end', 'between', 'around'])
      .optional()
      .describe('Main-axis justification. Default: start.'),
    padding: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe('Inner padding in pixels. Default: 0.'),
    wrap: z
      .boolean()
      .optional()
      .describe('Whether children wrap to a new line. Default: false.'),
  })
  .strict()
  .describe('Flex container that arranges children in a row or column.');

export type StackProps = z.infer<typeof StackPropsSchema>;

// ─── Text ───
export const TextPropsSchema = z
  .object({
    as: z
      .enum(['span', 'p', 'h1', 'h2', 'h3', 'h4'])
      .optional()
      .describe('HTML element to render. Default: span.'),
    size: z
      .enum(['sm', 'md', 'lg', 'xl', '2xl'])
      .optional()
      .describe('Font size token. Default: md.'),
    weight: z
      .enum(['normal', 'medium', 'bold'])
      .optional()
      .describe('Font weight token. Default: normal.'),
    color: z
      .string()
      .optional()
      .describe('CSS color string (open set). Default: inherit.'),
  })
  .strict()
  .describe('Text element with semantic typography props.');

export type TextProps = z.infer<typeof TextPropsSchema>;

// ─── Input ───
export const InputPropsSchema = z
  .object({
    type: z
      .enum(['text', 'number', 'email', 'password'])
      .optional()
      .describe('Input type. Default: text.'),
    placeholder: z
      .string()
      .optional()
      .describe('Placeholder text shown when empty.'),
    disabled: z
      .boolean()
      .optional()
      .describe('Whether the input is disabled. Default: false.'),
    value: z
      .string()
      .optional()
      .describe('Current value. Typically supplied via model binding.'),
    debounce: z
      .number()
      .optional()
      .describe('Milliseconds to coalesce keystrokes before dispatching ui:model. Default: 0 (every keystroke). Set it when the shell is remote to cut round-trips.'),
  })
  .strict()
  .describe('Text input bound to data via the `model` field on the layout node.');

export type InputProps = z.infer<typeof InputPropsSchema>;

// ─── Button ───
export const ButtonPropsSchema = z
  .object({
    label: z
      .string()
      .optional()
      .describe('Button label. If absent, children are used.'),
    variant: z
      .enum(['primary', 'secondary', 'ghost'])
      .optional()
      .describe('Visual variant. Default: primary.'),
    disabled: z
      .boolean()
      .optional()
      .describe('Whether the button is disabled. Default: false.'),
  })
  .strict()
  .describe("Clickable button. Click events fire as `ui:click` with the layout node's ref.");

export type ButtonProps = z.infer<typeof ButtonPropsSchema>;

// ─── Box ───
export const BoxPropsSchema = z
  .object({
    padding: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe('Inner padding in pixels. Default: 0.'),
    background: z
      .string()
      .optional()
      .describe('CSS background color or value.'),
    border: z
      .boolean()
      .optional()
      .describe('Whether to show a 1px border. Default: false.'),
    radius: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe('Border radius in pixels. Default: 0.'),
  })
  .strict()
  .describe('Generic container with basic styling props. Use Stack for layout, Box for visual wrapping.');

export type BoxProps = z.infer<typeof BoxPropsSchema>;

// ─── Panel ───
export const PanelPropsSchema = z
  .object({
    title: z.string().optional().describe('Optional header title.'),
    backRef: z.string().optional().describe('When set, the header grows a ← (before the title) that fires ui:click with this ref.'),
    closeRef: z.string().optional().describe('When set, the header grows a ✕ that fires ui:click with this ref.'),
  })
  .strict()
  .describe('A framed, elevated surface with an optional title.');

export type PanelProps = z.infer<typeof PanelPropsSchema>;

// ─── JsonTree ───
export const JsonTreePropsSchema = z
  .object({
    value: z.unknown().optional().describe('The value to render.'),
    label: z.string().optional().describe('A name for the root node.'),
  })
  .strict()
  .describe('A collapsible view of any JSON value.');

export type JsonTreeProps = z.infer<typeof JsonTreePropsSchema>;

// ─── CanvasSlot ───
export const CanvasSlotPropsSchema = z
  .object({
    canvasId: z
      .string()
      .optional()
      .describe('Id of the canvas to render. Usually bound from a loop, e.g. "$.c.id".'),
  })
  .strict()
  .describe('Renders a canvas by id, recursing into its actionLayout. Resolves to nothing when canvasId is missing.');

export type CanvasSlotProps = z.infer<typeof CanvasSlotPropsSchema>;

// ─── ActionSlot ───
// The AUTHORING contract: what a layout node may set on an ActionSlot —
// instanceId only, strict. The identity props flattenRenderTree stamps on a
// served marker (canvasId / definitionId) are runtime OUTPUT, never authored;
// widening this schema would advertise them to the layout agent's palette.
export const ActionSlotPropsSchema = z
  .object({
    instanceId: z
      .string()
      .optional()
      .describe('Id of the action instance to render. Usually bound from canvas scope, e.g. "$.active.id" or "$.i.id".'),
  })
  .strict()
  .describe('Renders an action instance by id. Resolves to nothing when instanceId is missing.');

export type ActionSlotProps = z.infer<typeof ActionSlotPropsSchema>;

