import type { NiscApp } from '@niscorp/moss';
import type { LayoutNode } from '@niscorp/nova';
import { ADMIN_ASSIGNMENTS, ADMIN_CHARTER } from './charter';
import { integrationsAction } from './actions/integrations.action';
import type { Seam } from '../seam';

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

        const scopes = [
          ...row.requestedData.map((scope) => ({ label: scope, state: granted.has(scope) ? 'granted' : 'requested' })),
          ...row.approvedData.filter((scope) => !requested.has(scope)).map((scope) => ({ label: scope, state: 'removed' })),
        ];

        const failed = row.lastError !== null;
        return {
          id: row.id,
          url: row.url,
          pending: row.status === 'pending',
          badge: row.status === 'approved' ? 'Approved' : 'Pending',
          problem: failed ? `Last import failed: ${row.lastError}` : '',
          facts: [
            { label: 'Actions', value: String(row.actionCount) },
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
        return { said: `${id}: ${result.actions ?? 0} actions, ${result.status ?? 'imported'}.`, key: result.key ?? '' };
      } catch (err) {
        // moss records a service error against the row and the card shows it,
        // so it is swallowed here. An input error wrote nothing, so it is thrown.
        const status = (err as { status?: number }).status ?? 0;
        if (status === 400 || status === 404) throw err;
        return { said: '' };
      }
    },

    'admin.integrations.approve': async (data) => seam.post(`/operator/integrations/${String(data['pendingId'] ?? '')}/approve`, {}),
    'admin.integrations.remove': async (data) => seam.del(`/operator/integrations/${String(data['pendingId'] ?? '')}`),

    'admin.integrations.probe': async (data) => {
      const id = String(data['pendingId'] ?? '');
      const answer = (await seam.post(`/operator/integrations/${id}/probe`, { path: 'bundle' })) as { status: number; ms: number };
      PROBES[id] = answer.status === 200 ? `${answer.status} in ${answer.ms}ms` : `${answer.status === 0 ? 'unreachable' : answer.status}`;
      return answer;
    },
  }),
});
