import { z } from 'zod';

let _NodeSchema: z.ZodTypeAny = z.any();
export const setNodeSchema = (schema: z.ZodTypeAny): void => {
  _NodeSchema = schema;
};
const node = (): z.ZodTypeAny => _NodeSchema;

const pairOf = (desc: string) =>
  z.tuple([z.lazy(node), z.lazy(node)]).describe(desc);

// ═══════════════════════════════════════════════════════════
// Binary math ops
// ═══════════════════════════════════════════════════════════

export const AddNodeSchema = z
  .object({ $add: pairOf('Two numeric operands to add.') })
  .strict()
  .describe('Add two numbers.');
export type AddNode = z.infer<typeof AddNodeSchema>;

export const SubNodeSchema = z
  .object({ $sub: pairOf('Two numeric operands to subtract (a - b).') })
  .strict()
  .describe('Subtract second number from first.');
export type SubNode = z.infer<typeof SubNodeSchema>;

export const MulNodeSchema = z
  .object({ $mul: pairOf('Two numeric operands to multiply.') })
  .strict()
  .describe('Multiply two numbers.');
export type MulNode = z.infer<typeof MulNodeSchema>;

export const DivNodeSchema = z
  .object({ $div: pairOf('Two numeric operands to divide (a / b). Throws on division by zero.') })
  .strict()
  .describe('Divide first number by second. Throws E_DIVISION_BY_ZERO if divisor is 0.');
export type DivNode = z.infer<typeof DivNodeSchema>;

export const ModNodeSchema = z
  .object({ $mod: pairOf('Two numeric operands: the remainder of a divided by b. Throws on division by zero.') })
  .strict()
  .describe('The remainder of the first number divided by the second, with the sign of the second: for a positive divisor n it is always from 0 up to n, also for a negative first number. Throws E_DIVISION_BY_ZERO if divisor is 0.');
export type ModNode = z.infer<typeof ModNodeSchema>;

// ═══════════════════════════════════════════════════════════
// $round
// ═══════════════════════════════════════════════════════════

export const RoundNodeSchema = z
  .object({
    $round: z
      .object({
        value: z.lazy(node).describe('Numeric value to round.'),
        digits: z.number().int().nonnegative().optional().default(0).describe('Decimal places. Default: 0.'),
        mode: z.enum(['nearest', 'floor', 'ceil']).optional().describe('Which way to round: "nearest" (the default), "floor" (down, toward negative infinity) or "ceil" (up).'),
      })
      .strict(),
  })
  .strict()
  .describe('Round a number to N decimal places: to the nearest, or down ("floor") or up ("ceil") with `mode`.');
export type RoundNode = z.infer<typeof RoundNodeSchema>;

// ═══════════════════════════════════════════════════════════
// $toNumber
// ═══════════════════════════════════════════════════════════

export const ToNumberNodeSchema = z
  .object({
    $toNumber: z
      .object({
        value: z.lazy(node).describe('A number, or text that is a number written in digits: "42", "-3.5", " 1e3 ".'),
        fallback: z.lazy(node).optional().describe('What to answer when the value is not a number and not such text. Without it that is an error.'),
      })
      .strict(),
  })
  .strict()
  .describe('A number from a number or from numeric text, as data from a form, a CSV or an API often has it. Anything else (other text, true, null, an object) throws E_TYPE unless `fallback` is given.');
export type ToNumberNode = z.infer<typeof ToNumberNodeSchema>;
