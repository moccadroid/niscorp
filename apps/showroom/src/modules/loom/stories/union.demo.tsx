import { z } from 'zod';
import { SchemaDemo } from '../schema-demo';

// A discriminated union — the thing RJSF can't do. The `kind` selector chooses
// the variant; only that branch's fields show. Switching reshapes the document
// to the new branch (the old fields are dropped), and the discriminant +
// per-branch rendering compile to a select plus `$eq` conditionals — see the
// Definition tab.

export const schema = z
  .object({
    shape: z
      .discriminatedUnion('kind', [
        z.object({ kind: z.literal('circle'), radius: z.number().meta({ title: 'Radius' }) }),
        z.object({
          kind: z.literal('rectangle'),
          width: z.number().meta({ title: 'Width' }),
          height: z.number().meta({ title: 'Height' }),
        }),
        z.object({ kind: z.literal('text'), content: z.string().meta({ title: 'Content' }) }),
      ])
      .meta({ title: 'Shape' }),
  })
  .meta({ title: 'Drawing' });

export const Demo = () => <SchemaDemo schema={schema} />;
