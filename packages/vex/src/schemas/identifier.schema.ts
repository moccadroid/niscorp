import { z } from 'zod';

// ═══════════════════════════════════════════════════════════════
// THE NAMES A QUERY MAY SAY — and the one rule for telling them apart.
//
// Every string an author (a person, a seed, a model) puts in a NAME position
// ends up in SQL text: a column reference, an output alias, a subquery alias.
// Values never do — they bind as parameters or are quoted as literals. So a
// name is the only place authored text meets the statement, and it is held to
// a grammar that cannot carry anything but a name: letters, digits and
// underscores, not starting with a digit.
//
// This is the parse-time half. The resolver checks the same predicates again,
// because `engine.compile()` and `engine.test()` take a DSL that never went
// through Zod, and the compiler refuses to emit a field position that did not
// resolve against the introspected schema. Three layers, one grammar.
//
// `isFieldPathShape` is also what decides, in a value position, whether a
// string is a column or a literal. It used to be "contains a dot", which made
// every email address an unknown entity and every string with a dot a column
// reference — so a literal like "u1@x.com" threw, and a string that merely
// looked dotted went to SQL as a name. Now a column is exactly `ident.ident`,
// and everything else is a literal.
// ═══════════════════════════════════════════════════════════════

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
const FIELD_PATH = /^[A-Za-z_][A-Za-z0-9_]*\.[A-Za-z_][A-Za-z0-9_]*$/;

export const isIdentifier = (value: string): boolean => IDENTIFIER.test(value);

export const isFieldPathShape = (value: unknown): value is string => typeof value === 'string' && FIELD_PATH.test(value);

export const IdentifierSchema = z
  .string()
  .regex(IDENTIFIER, 'A name is letters, digits and underscores, not starting with a digit');

export const FieldPathSchema = z
  .string()
  .regex(FIELD_PATH, 'A field path is entity.field — each part letters, digits and underscores, not starting with a digit');
