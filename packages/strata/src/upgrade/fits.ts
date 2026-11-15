import type { GrammarSchema } from '../check';

export const schemaMisfit = async (schemas: Readonly<Record<string, GrammarSchema>> | undefined, kind: string, document: unknown): Promise<string | undefined> => {
  const schema = schemas?.[kind];
  if (schema === undefined) return undefined;
  const checked = await schema['~standard'].validate(document);
  return checked.issues === undefined ? undefined : checked.issues.slice(0, 2).map((i) => i.message).join('; ');
};
