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

// ═══════════════════════════════════════════════════════════
// $round
// ═══════════════════════════════════════════════════════════

export const RoundNodeSchema = z
  .object({
    $round: z
      .object({
        value: z.lazy(node).describe('Numeric value to round.'),
        digits: z.number().int().nonnegative().optional().default(0).describe('Decimal places. Default: 0.'),
      })
      .strict(),
  })
  .strict()
  .describe('Round a number to N decimal places.');
export type RoundNode = z.infer<typeof RoundNodeSchema>;
