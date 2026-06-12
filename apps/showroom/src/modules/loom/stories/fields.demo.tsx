import { z } from 'zod';
import { SchemaDemo } from '../schema-demo';

// The leaf field types: string, email (a string format), integer, enum, and
// boolean. Each Zod type maps to one widget. Edit a field and the document
// on the right updates; the Definition tab shows the compiled ActionDefinition.

export const schema = z
  .object({
    name: z.string().meta({ title: 'Name' }),
    email: z.email().meta({ title: 'Email' }),
    age: z.int().meta({ title: 'Age' }).optional(),
    role: z.enum(['admin', 'editor', 'viewer']).meta({ title: 'Role' }).optional(),
    active: z.boolean().meta({ title: 'Active' }).optional(),
  })
  .meta({ title: 'Person' });

export const Demo = () => <SchemaDemo schema={schema} />;
