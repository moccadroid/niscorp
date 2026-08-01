import { useEffect } from 'react';
import { z } from 'zod';
import type { NovaComponent } from '@niscorp/nova/adapters/react';

// The assistant's live state, as a host effect — the same pattern as Accent:
// the frame is static data, so anything the stylesheet must know about the
// session lands as a data attribute on the document root, written by an
// always-mounted action (the dock, which already holds both facts) and read
// by the theme's region selectors.
//
//   data-assist        the territory: 'aside' or 'all'. Absent means none is
//                      the assistant's, and nothing is framed.
//   data-assist-think  present while a run is composing.
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
