import type { NiscApp } from '@niscorp/moss';
import type { LayoutNode } from '@niscorp/nova';
import { ADMIN_ASSIGNMENTS, ADMIN_CHARTER } from './charter';
import { integrationsAction } from './actions/integrations.action';
import type { Seam } from '../seam';

// THE ADMINISTRATION TOOL, as an application.
//
// It is a nisc app like any other — charter, actions, layouts, a shell — and it
// has no data layer at all. Every fact it shows comes back through `fn:` over
// the operator seam, which is what lets it be pointed at any Lyra and what
// makes "this tool cannot reach a studio's rows" structural rather than a rule
// somebody remembered.

const FRAME: LayoutNode = {
  component: 'Stack',
  props: { gap: 0, h: '100%', bg: 'ground' },
  children: [{ component: 'CanvasSlot', props: { canvasId: 'main' } }],
};

const ago = (ms: number | null): string => {
  if (ms === null) return 'never';
  const seconds = Math.round((Date.now() - ms) / 1000);
  if (seconds < 90) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  return minutes < 90 ? `${minutes}m ago` : `${Math.round(minutes / 60)}h ago`;
};

type Listed = {
  id: string;
  url: string;
  status: string;
  requestedData: string[];
  approvedData: string[];
  lastImportAt: number | null;
  lastError: string | null;
  actionCount: number;
};

// A probe answer is remembered here rather than in Lyra: it is a fact about a
// moment, not about the deployment, and writing it into a table would make an
// operator's poke look like state.
const PROBES: Record<string, string> = {};

export const buildAdmin = (seam: Seam): NiscApp => ({
  charter: ADMIN_CHARTER,
  assignments: ADMIN_ASSIGNMENTS,
  actions: { 'admin.integrations': integrationsAction },
  shell: {
    canvases: [{ id: 'main', initial: 'admin.integrations' }],
    layout: FRAME,
  },
  functions: () => ({
    'admin.integrations.list': async () => {
      const answer = (await seam.get('/operator/integrations')) as { integrations: Listed[] };
      const rows = answer.integrations.map((row) => {
        const granted = new Set(row.approvedData);
        const requested = new Set(row.requestedData);

        // SCOPE BY SCOPE, with what happened to each. A comma-separated string
        // works for three and hides the one that changed at twelve — and the
        // one that changed on the last import is exactly what somebody opens
        // this screen to find.
        //
        //   granted    approved, and still asked for
        //   requested  asked for, not approved yet — this is the review
        //   removed    approved once, no longer in the bundle
        const scopes = [
          ...row.requestedData.map((scope) => ({ label: scope, state: granted.has(scope) ? 'granted' : 'requested' })),
          ...row.approvedData.filter((scope) => !requested.has(scope)).map((scope) => ({ label: scope, state: 'removed' })),
        ];

        // THE BADGE IS THE STATUS, AND ONLY THE STATUS. It showed 'Failed'
        // when the last import had failed, which threw away the answer to the
        // question the badge exists for: is this thing approved or not. A
        // pending integration whose import also failed read as 'Failed' and
        // hid the Approve button's reason for existing.
        //
        // A failed operation is a separate fact and it gets its own line.
        const failed = row.lastError !== null;
        return {
          id: row.id,
          url: row.url,
          pending: row.status === 'pending',
          badge: row.status === 'approved' ? 'Approved' : 'Pending',
          problem: failed ? `Last import failed: ${row.lastError}` : '',
          facts: [
            { label: 'Actions', value: String(row.actionCount) },
            // LAST GOOD import. A failed one does not move the timestamp —
            // nothing was imported — so labelling it 'Last import' beside a
            // failure line made the card contradict itself: 'failed' and '49s
            // ago' in the same breath.
            { label: 'Last good import', value: ago(row.lastImportAt) },
            { label: 'Probe', value: PROBES[row.id] ?? 'not probed' },
          ],
          scopes,
        };
      });
      return { rows };
    },

    'admin.integrations.announce': async (data) => {
      const id = String(data['newId'] ?? '');
      try {
        const result = (await seam.post('/operator/integrations', {
          id,
          url: String(data['newUrl'] ?? ''),
        })) as { status?: string; actions?: number; key?: string };
        // The minted key rides the first registration's answer and nothing
        // else, ever — the row keeps only its hash. It travels as its OWN
        // field, never inside the sentence: the layout gives it the one-time
        // credential block, masked, with its own warning.
        return { said: `${id}: ${result.actions ?? 0} actions, ${result.status ?? 'imported'}.`, key: result.key ?? '' };
      } catch (err) {
        // A SERVICE ERROR IS ALREADY ON THE CARD. moss records it against the
        // row — unreachable, refused by intake — so rethrowing here would print
        // the same sentence twice in two wordings, once transiently at the top
        // of the page and once durably beside the integration it is about.
        //
        // An INPUT error (400) wrote nothing anywhere, so it has to be said
        // here or not at all.
        const status = (err as { status?: number }).status ?? 0;
        if (status === 400 || status === 404) throw err;
        return { said: '' };
      }
    },

    'admin.integrations.approve': async (data) => seam.post(`/operator/integrations/${String(data['pendingId'] ?? '')}/approve`, {}),
    'admin.integrations.remove': async (data) => seam.del(`/operator/integrations/${String(data['pendingId'] ?? '')}`),

    // THE LINE THAT SAVES THE HUNT. What the service says right now, from here,
    // without a browser or a signed-in person in the way.
    'admin.integrations.probe': async (data) => {
      const id = String(data['pendingId'] ?? '');
      const answer = (await seam.post(`/operator/integrations/${id}/probe`, { path: 'bundle' })) as { status: number; ms: number };
      PROBES[id] = answer.status === 200 ? `${answer.status} in ${answer.ms}ms` : `${answer.status === 0 ? 'unreachable' : answer.status}`;
      return answer;
    },
  }),
});
