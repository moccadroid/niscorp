import { useEffect } from 'react';
import { z } from 'zod';
import type { NovaComponent } from '@niscorp/nova/adapters/react';

// Per-property branding, as a host effect. The palette is a `data-accent`
// attribute on the document root (see theme.css); this writes it and renders
// nothing.
//
// It is here rather than in the frame layout because the frame is static data
// with nowhere to read a property from, while chrome is an action that receives
// per-principal boot input. The point stands either way: The Lumen and Casa
// Marisol are the same deployment in different colours, and swapping them is a
// row, not a fork.
const AccentProps = z.object({ name: z.string().optional() }).strict();

export const Accent: NovaComponent<z.infer<typeof AccentProps>> = ({ name }) => {
  useEffect(() => {
    if (name === undefined || name === '') return;
    const root = document.documentElement;
    const previous = root.dataset['accent'];
    root.dataset['accent'] = name;
    return () => {
      if (previous === undefined) delete root.dataset['accent'];
      else root.dataset['accent'] = previous;
    };
  }, [name]);
  return null;
};
Accent.meta = { description: "Applies a property's palette to the document. Renders nothing.", propsSchema: AccentProps };
