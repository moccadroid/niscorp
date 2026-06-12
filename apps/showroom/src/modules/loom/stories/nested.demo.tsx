import { z } from 'zod';
import { SchemaDemo } from '../schema-demo';

// A nested object. The compiler recurses: an object property becomes its own
// group of wrapped fields bound to dotted paths like `address.street`, and the
// document on the right stays correctly nested.

export const schema = z
  .object({
    name: z.string().meta({ title: 'Name' }),
    address: z
      .object({
        street: z.string().meta({ title: 'Street' }),
        city: z.string().meta({ title: 'City' }).optional(),
        zip: z.string().meta({ title: 'ZIP' }).optional(),
      })
      .meta({ title: 'Address' }),
  })
  .meta({ title: 'Account' });

export const Demo = () => <SchemaDemo schema={schema} />;
