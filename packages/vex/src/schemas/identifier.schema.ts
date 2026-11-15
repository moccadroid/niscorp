import { z } from 'zod';

// A name is the only authored text that reaches SQL as text (values bind as
// parameters or are quoted as literals), so it is held to this grammar. In a
// value position, `isFieldPathShape` decides whether a string is a column or
// a literal.
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
