import { useEffect } from 'react';
import { z } from 'zod';
import type { NovaComponent } from '@niscorp/nova/adapters/react';

const AssistStateProps = z.object({ scope: z.string().optional(), thinking: z.boolean().optional() }).strict();

export const AssistState: NovaComponent<z.infer<typeof AssistStateProps>> = ({ scope, thinking }) => {
  useEffect(() => {
    const root = document.documentElement;
    if (scope === 'aside' || scope === 'all') root.dataset['assist'] = scope;
    else delete root.dataset['assist'];
    if (thinking === true) root.dataset['assistThink'] = '';
    else delete root.dataset['assistThink'];
    return () => {
      delete root.dataset['assist'];
      delete root.dataset['assistThink'];
    };
  }, [scope, thinking]);
  return null;
};
AssistState.meta = { description: "Applies the assistant's territory and activity to the document. Renders nothing.", propsSchema: AssistStateProps };
