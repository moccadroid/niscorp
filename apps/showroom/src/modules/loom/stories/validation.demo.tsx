import { z } from 'zod';
import { SchemaDemo } from '../schema-demo';

// Validation runs against the real Zod schema — refinements and all, not a
// lossy JSON Schema. Edit a field to violate a rule and the message appears
// inline under it, then clears when the value is valid. The document stays
// clean (errors live in a separate channel, excluded from what's reported).

export const schema = z
  .object({
    username: z.string().min(3, { message: 'At least 3 characters' }).meta({ title: 'Username' }),
    email: z.email({ message: 'Enter a valid email' }).meta({ title: 'Email' }),
    age: z.number().int().min(18, { message: 'Must be 18 or older' }).meta({ title: 'Age' }),
  })
  .meta({ title: 'Signup' });

export const Demo = () => <SchemaDemo schema={schema} />;
