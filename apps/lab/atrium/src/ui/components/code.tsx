import { z } from 'zod';
import type { NovaComponent } from '@niscorp/nova/adapters/react';

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
