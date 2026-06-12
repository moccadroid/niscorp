import { z } from 'zod';
import { SchemaDemo } from '../schema-demo';

// Arrays of scalars and of objects. Each list has Add plus per-item ✕ / ↑ / ↓
// (remove and reorder). Those controls carry the item's index as the click
// payload and compile to declarative push/removeAt/move triggers — see the
// Definition tab.

export const schema = z
  .object({
    tags: z.array(z.string()).meta({ title: 'Tags' }),
    contacts: z
      .array(
        z.object({
          name: z.string().meta({ title: 'Name' }),
          email: z.email().meta({ title: 'Email' }),
        }),
      )
      .meta({ title: 'Contacts' }),
  })
  .meta({ title: 'List' });

export const Demo = () => <SchemaDemo schema={schema} />;
