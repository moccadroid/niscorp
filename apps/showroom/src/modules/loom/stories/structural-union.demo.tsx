import { z } from 'zod';
import { SchemaDemo } from '../schema-demo';

// A plain union with no shared `type` tag — each branch is told apart by *which
// key it carries* (`paragraph` vs `imageUrl` vs `heading`). Loom discriminates
// by presence: the chooser compiles to one `$exists` branch per variant (see the
// Definition tab), and switching resets the document to the new branch's defaults.
// This is the same machinery as the tagged union next door — only the match differs —
// and it's what lets Loom edit the stack's own structurally-tagged schemas (a
// Nova node, a Vex filter), not just ones with a literal discriminant.

const Block = z.union([
  z.object({ paragraph: z.string().meta({ title: 'Text' }) }).meta({ title: 'Paragraph' }),
  z
    .object({
      imageUrl: z.string().meta({ title: 'Image URL' }),
      caption: z.string().meta({ title: 'Caption' }).optional(),
    })
    .meta({ title: 'Image' }),
  z
    .object({
      heading: z.string().meta({ title: 'Heading' }),
      level: z.enum(['h1', 'h2', 'h3']).meta({ title: 'Level' }).default('h2'),
    })
    .meta({ title: 'Heading' }),
]);

export const schema = z.object({ block: Block }).meta({ title: 'Content block' });

const initial = { block: { imageUrl: 'https://nisc.dev/logo.png', caption: 'The logo' } };

export const Demo = () => <SchemaDemo schema={schema} value={initial} />;
