import { describe, it, expect } from 'vitest';
import { endlessChains } from '../src/manifest';
import { runIntake } from '../src/integrations/intake';
import type { IntakeContext } from '../src/integrations/intake';

const ctx: IntakeContext = {
  integrationId: 'acme',
  url: 'https://acme.example',
  layoutMisfits: () => [],
  endlessChains,
  fingerprints: new Set(['deals/open']),
};

const ID = 'ext.desk.acme.orders';
const calling = (url: string, request?: Record<string, unknown>): unknown => ({
  integration: 'acme',
  actions: { [ID]: { id: ID, endpoints: { load: { url, method: 'POST', ...(request === undefined ? {} : { request }) } } } },
});
const reasonsOf = (url: string, request?: Record<string, unknown>): string[] => {
  const result = runIntake(calling(url, request), ctx);
  return result.ok ? [] : result.reasons;
};

describe('runIntake — where an endpoint may call', () => {
  it('takes a path under its own prefix, a template in the query after it, and the app’s vex routes with a fingerprint the app serves', () => {
    for (const url of ['/integrations/acme/orders', '/integrations/acme/orders/open?view={{$.view}}']) expect([url, reasonsOf(url)]).toEqual([url, []]);
    for (const url of ['/api/vex', '/api/member/vex']) expect([url, reasonsOf(url, { fingerprint: 'deals/open' })]).toEqual([url, []]);
  });

  it('refuses a path that resolves anywhere but where it is written', () => {
    const resolves = (url: string, to: string): string =>
      `action ${ID}: endpoint "load" calls "${url}", whose path resolves to "${to}": write it as it resolves, under /integrations/acme/`;
    for (const [url, to] of [
      ['/integrations/acme/../other/orders', '/integrations/other/orders'],
      ['/integrations/acme/%2e%2e/other/orders', '/integrations/other/orders'],
      ['/integrations/acme/..\\other/orders', '/integrations/other/orders'],
      ['/integrations/acme/../../api/vex', '/api/vex'],
      ['/integrations/acme/./orders', '/integrations/acme/orders'],
    ]) {
      expect([url, reasonsOf(url)]).toEqual([url, [resolves(url, to)]]);
    }
  });

  it('refuses a template in the path: it is filled in when the endpoint is called, after this check', () => {
    for (const url of ['/integrations/acme/{{$.p}}', '/integrations/acme/orders/{{$.id}}?view=all']) {
      expect([url, reasonsOf(url)]).toEqual([url, [`action ${ID}: endpoint "load" calls "${url}", whose path is filled in when it is called: only the query, after "?", may hold a template`]]);
    }
  });

  it('refuses an /api/ path that is not one of the app’s vex routes, though it names a fingerprint the app serves', () => {
    for (const url of ['/api/../integrations/other/orders', '/api/members', '/api/vex?all=1']) {
      expect([url, reasonsOf(url, { fingerprint: 'deals/open' })]).toEqual([url, [`action ${ID}: endpoint "load" calls "${url}" — only /integrations/acme/* or /api/*/vex`]]);
    }
  });
});
