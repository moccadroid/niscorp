import { useEffect } from 'react';
import { z } from 'zod';
import type { NovaComponent } from '@niscorp/nova/adapters/react';

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
