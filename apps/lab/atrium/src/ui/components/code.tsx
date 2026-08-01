import { z } from 'zod';
import type { NovaComponent } from '@niscorp/nova/adapters/react';

// A block of literal text, monospaced, scrolling in place.
//
// Domain-blind like the rest of the kit: it shows a string exactly as given and
// knows nothing about what is in it. What makes it worth a primitive rather
// than a `Text` is the two things `Text` deliberately does not do — preserve
// the whitespace it was handed, and cap its own height instead of pushing the
// page down.
const CodeProps = z
  .object({
    text: z.string().optional(),
    max: z.number().optional().describe('Height cap in px before it scrolls on its own. Default 320.'),
  })
  .strict();

export const Code: NovaComponent<z.infer<typeof CodeProps>> = ({ text = '', max = 320 }) => (
  <pre className="at-code" style={{ maxHeight: max }}>
    {text}
  </pre>
);
Code.meta = { description: 'Preformatted monospace text in a scrolling block. Shows a string verbatim; knows nothing about it.', propsSchema: CodeProps };
