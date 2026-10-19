import type { ActionDefinition } from '@niscorp/nova';
import { checkScreen, type CheckResult, type FindingCode, type Probe } from '@relay/screen-builder';
import { screenSetup } from '@relay/server/functions/ray/screens';
import { getVexRuntime, devRayContext } from './engine';

// The screen builder's check against the dev database, with no model: each case is one thing it must catch or pass.
const screen = (change: (definition: ActionDefinition) => ActionDefinition = (same) => same): ActionDefinition =>
  change({
    id: 'check.deals',
    name: 'Deals',
    data: { rows: [], search: '' },
    layout: {
      component: 'Stack',
      children: [
        { component: 'Input', ref: 'search', model: '$.search' },
        { component: 'Table', props: { rows: '$.rows', rowKey: 'deal_id', rowRef: 'dealRow', empty: 'None.', columns: [{ label: 'Title', cell: { kind: 'primary', key: 'title' } }] } },
      ],
    },
    triggers: [
      { event: 'ui:model', ref: 'search', do: [{ call: 'load' }] },
      { event: 'ui:click', ref: 'dealRow', do: [{ push: { action: 'crm.deal.view', input: { id: '@event.payload' } } }] },
    ],
    endpoints: {
      load: { url: '/api/vex', method: 'POST', request: { fingerprint: 'deals/list', context: { q: { $join: { parts: ['%', { $ref: '$.search' }, '%'], sep: '' } } } }, target: 'rows' },
    },
    lifecycle: { mount: [{ call: 'load' }] },
  });

const PROBES: Probe[] = [
  { do: [{ set: 'search', to: 'zzzz-matches-nothing' }], changes: 'rows' },
  { do: [{ click: 'dealRow' }], opens: 'crm.deal.view' },
];

const main = async (): Promise<void> => {
  await getVexRuntime();
  const setup = screenSetup(devRayContext());
  const checks: [string, boolean][] = [];
  const codes = (result: CheckResult): FindingCode[] => result.findings.map((finding) => finding.code);
  const said = (result: CheckResult): string => result.findings.map((finding) => finding.message).join(' | ') || 'no findings';

  const clean = await checkScreen(screen(), setup, { probes: PROBES });
  checks.push([`a working screen with its probes passes (${said(clean)}; ${JSON.stringify(clean.loaded)})`, clean.ok]);

  const unprobed = await checkScreen(screen(), setup, { probes: [PROBES[0] as Probe] });
  checks.push([`a row click no probe uses is reported (${said(unprobed)})`, !unprobed.ok && codes(unprobed).includes('probe-missing')]);

  const frozen = await checkScreen(
    screen((definition) => ({ ...definition, endpoints: { load: { url: '/api/vex', method: 'POST', request: { fingerprint: 'deals/list', context: { q: '%%' } }, target: 'rows' } } })),
    setup,
    { probes: PROBES },
  );
  checks.push([`a search that never reaches the query is caught by its probe (${said(frozen)})`, !frozen.ok && frozen.findings.some((finding) => finding.code === 'probe' && finding.message.includes('same context'))]);

  const wrongInput = await checkScreen(
    screen((definition) => ({ ...definition, triggers: [definition.triggers?.[0] as never, { event: 'ui:click', ref: 'dealRow', do: [{ push: { action: 'crm.deal.view', input: { id: '@event.payload.id' } } }] }] })),
    setup,
    { probes: PROBES },
  );
  checks.push([`a row click that opens the deal without its id is caught (${said(wrongInput)})`, !wrongInput.ok && wrongInput.findings.some((finding) => finding.message.includes('without its "id"'))]);

  const unbound = await checkScreen(
    screen((definition) => ({ ...definition, data: { ...definition.data, deals: [] }, layout: { component: 'Stack', children: [{ component: 'Input', ref: 'search', model: '$.search' }, { component: 'Table', props: { rows: '$.deals', rowKey: 'deal_id', rowRef: 'dealRow', empty: 'None.', columns: [{ label: 'Title', cell: { kind: 'primary', key: 'title' } }] } }] } })),
    setup,
    { probes: PROBES },
  );
  checks.push([`a table bound to the wrong key is reported (${said(unbound)})`, !unbound.ok && codes(unbound).includes('unshown-rows')]);

  const nothingShown = await checkScreen(
    screen((definition) => ({ ...definition, layout: { component: 'Stack', children: [{ component: 'Input', ref: 'search', model: '$.search' }, { component: 'Text', children: '{???}' }] }, triggers: [definition.triggers?.[0] as never] })),
    setup,
    { probes: [PROBES[0] as Probe] },
  );
  checks.push([`loaded rows the layout never binds are reported (${said(nothingShown)})`, !nothingShown.ok && nothingShown.findings.some((finding) => finding.message.includes('that nothing on the screen shows'))]);

  const emptySecond = await checkScreen(
    screen((definition) => ({
      ...definition,
      data: { ...definition.data, none: [] },
      layout: {
        component: 'Stack',
        children: [
          ...((definition.layout as { children: unknown[] }).children as never[]),
          { component: 'Table', props: { rows: '$.none', rowKey: 'deal_id', empty: 'None.', columns: [{ label: 'Title', cell: { kind: 'primary', key: 'title' } }] } },
        ],
      },
      endpoints: { ...definition.endpoints, loadNone: { url: '/api/vex', method: 'POST', request: { fingerprint: 'deals/list', context: { q: '%zzzz-matches-nothing%' } }, target: 'none' } },
      lifecycle: { mount: [{ call: 'load' }, { call: 'loadNone' }] },
    })),
    setup,
    { probes: PROBES },
  );
  checks.push([`a second table over a query that answers no rows is not blamed for the first one's rows (${said(emptySecond)})`, emptySecond.ok]);

  const withRefresh = (definition: ActionDefinition): ActionDefinition => ({
    ...definition,
    layout: { component: 'Stack', children: [{ component: 'Button', ref: 'refresh', children: 'Refresh' }, ...((definition.layout as { children: unknown[] }).children as never[])] },
    triggers: [...(definition.triggers ?? []), { event: 'ui:click', ref: 'refresh', do: [{ call: 'load' }] }],
  });
  const refreshed = await checkScreen(screen(withRefresh), setup, { probes: [...PROBES, { do: [{ click: 'refresh' }], reloads: 'rows' }] });
  checks.push([`a refresh button is probed by what it reloads (${said(refreshed)})`, refreshed.ok]);

  const dodged = await checkScreen(screen(withRefresh), setup, { probes: [{ do: [{ set: 'search', to: 'zzzz' }], reloads: 'rows' }, PROBES[1] as Probe, { do: [{ click: 'refresh' }], reloads: 'rows' }] });
  checks.push([`a probe that sets a value cannot settle for "reloads" (${said(dodged)})`, !dodged.ok && dodged.findings.some((finding) => finding.message.includes('"reloads" is for a click alone'))]);

  const prismInLayout = await checkScreen(
    screen((definition) => ({ ...definition, layout: { component: 'Stack', children: [{ component: 'Input', ref: 'search', model: '$.search' }, { component: 'Text', children: 'x', props: { size: { $ref: '$.search' } } }, { component: 'Table', props: { rows: '$.rows', rowKey: 'deal_id', rowRef: 'dealRow', empty: 'None.', columns: [{ label: 'Title', cell: { kind: 'primary', key: 'title' } }] } }] } })),
    setup,
    { probes: PROBES },
  );
  checks.push([`a transform op in a layout prop is reported (${said(prismInLayout)})`, !prismInLayout.ok && codes(prismInLayout).includes('unresolved-binding')]);

  const invented = await checkScreen(
    screen((definition) => ({ ...definition, endpoints: { load: { url: '/api/vex', method: 'POST', request: { fingerprint: 'fp_made_up', context: {} }, target: 'rows' } } })),
    setup,
    { probes: PROBES, replayable: (fingerprint) => fingerprint === 'deals/list' },
  );
  checks.push([`a fingerprint nothing answered is refused before the mount (${said(invented)})`, !invented.ok && codes(invented).includes('unknown-fingerprint')]);

  const setPath = await checkScreen(
    screen((definition) => ({ ...definition, triggers: [{ event: 'ui:model', ref: 'search', do: [{ set: '$.search', value: 'x' }, { call: 'load' }] }, definition.triggers?.[1] as never] })),
    setup,
    { probes: PROBES },
  );
  checks.push([`a "$." set path is named (${said(setPath)})`, !setPath.ok && codes(setPath).includes('set-path')]);

  const flattened = await checkScreen(
    screen((definition) => ({ ...definition, triggers: [definition.triggers?.[0] as never, { event: 'ui:click', ref: 'dealRow', do: [{ push: 'crm.deal.view', action: 'crm.deal.view', input: { id: '@event.payload' } } as never] }] })),
    setup,
    { probes: PROBES },
  );
  checks.push([`a step nova does not know is shown with the forms a step takes (${said(flattened)})`, !flattened.ok && flattened.findings.length === 1 && flattened.findings[0]?.message.includes('triggers.1.do.0 is no step') === true]);

  const emptyColumn = await checkScreen(
    screen((definition) => ({ ...definition, layout: { component: 'Stack', children: [{ component: 'Input', ref: 'search', model: '$.search' }, { component: 'Table', props: { rows: '$.rows', rowKey: 'deal_id', rowRef: 'dealRow', empty: 'None.', columns: [{ label: 'When', cell: { kind: 'text', key: 'occurred_at' } }] } }] } })),
    setup,
    { probes: PROBES },
  );
  checks.push([`a column that reads a key no row has is reported (${said(emptyColumn)})`, !emptyColumn.ok && emptyColumn.findings.some((finding) => finding.message.includes('"occurred_at", which no row has'))]);

  const today = String(setup.ambient['today']);
  const frozenToday = await checkScreen(
    screen((definition) => ({ ...definition, endpoints: { load: { url: '/api/vex', method: 'POST', request: { fingerprint: 'deals/list', context: { q: { $join: { parts: ['%', { $ref: '$.search' }, '%'], sep: '' } }, since: today } }, target: 'rows' } } })),
    setup,
    { probes: PROBES },
  );
  checks.push([`today's date written into a request is reported (${said(frozenToday)})`, !frozenToday.ok && codes(frozenToday).includes('frozen-value')]);

  const tabbed = await checkScreen(
    screen((definition) => ({
      ...definition,
      data: { ...definition.data, status: 'open' },
      layout: { component: 'Stack', children: [{ component: 'Tabs', ref: 'status', props: { value: '$.status', options: [{ value: 'open', label: 'Open' }, { value: 'zzzz', label: 'Nothing' }] } }, ...((definition.layout as { children: unknown[] }).children as never[])] },
      triggers: [...(definition.triggers ?? []), { event: 'ui:click', ref: 'status', do: [{ set: 'status', value: '@event.payload' }, { set: 'search', value: '@event.payload' }, { call: 'load' }] }],
    })),
    setup,
    { probes: [...PROBES, { do: [{ click: 'status', to: 'zzzz' }], changes: 'rows' }] },
  );
  checks.push([`a tab is probed by the value its click carries (${said(tabbed)})`, tabbed.ok]);

  const emptyPattern = await checkScreen(
    screen((definition) => ({ ...definition, endpoints: { load: { url: '/api/vex', method: 'POST', request: { fingerprint: 'deals/list', context: { q: '' } }, target: 'rows' } } })),
    setup,
    { probes: PROBES, patterns: (fingerprint) => (fingerprint === 'deals/list' ? ['q'] : []) },
  );
  checks.push([`a search pattern sent empty is reported (${said(emptyPattern)})`, !emptyPattern.ok && codes(emptyPattern).includes('empty-pattern')]);

  const modelTabs = await checkScreen(
    screen((definition) => ({
      ...definition,
      data: { ...definition.data, status: 'open' },
      layout: { component: 'Stack', children: [{ component: 'Tabs', ref: 'status', model: '$.status', props: { value: '$.status', options: [{ value: 'open', label: 'Open' }, { value: 'won', label: 'Won' }] } }, ...((definition.layout as { children: unknown[] }).children as never[])] },
      triggers: [...(definition.triggers ?? []), { event: 'ui:model', ref: 'status', do: [{ call: 'load' }] }],
    })),
    setup,
    { probes: [...PROBES, { do: [{ set: 'status', to: 'won' }], changes: 'rows' }] },
  );
  checks.push([`a ui:model trigger on tabs, which are clicked, is reported (${said(modelTabs)})`, !modelTabs.ok && codes(modelTabs).includes('dead-trigger')]);

  const emptyOptional = await checkScreen(
    screen((definition) => ({ ...definition, endpoints: { load: { url: '/api/vex', method: 'POST', request: { fingerprint: 'deals/list', context: { q: { $ref: '$.search' } } }, target: 'rows' } } })),
    setup,
    { probes: PROBES, proofs: new Map([['deals/list', { count: 120, context: { q: { kind: 'context', type: 'string', optional: true } } }]]) },
  );
  checks.push([`an optional key sent as "" is reported (${said(emptyOptional)})`, !emptyOptional.ok && codes(emptyOptional).includes('empty-optional')]);

  const beside = await checkScreen(
    screen((definition) => ({ ...definition, layout: { component: 'Stack', children: [{ component: 'Input', ref: 'search', model: '$.search', placeholder: 'Search' }, ...((definition.layout as { children: unknown[] }).children.slice(1) as never[])] } })),
    setup,
    { probes: PROBES },
  );
  checks.push([`a prop written beside "component" is named as a prop (${said(beside)})`, !beside.ok && beside.findings.some((finding) => finding.message.includes('"placeholder" is a prop of Input'))]);

  const holding = await checkScreen(screen(), setup, { probes: [...PROBES, { holds: [{ in: 'rows', atLeast: 1, atMost: 200 }, { in: 'rows', field: 'status', is: ['open', 'won', 'lost'] }, { in: 'rows', field: 'status', has: 'won' }] }] });
  checks.push([`claims the rows bear out pass (${said(holding)})`, holding.ok]);

  const onlyOpen = await checkScreen(screen(), setup, { probes: [...PROBES, { holds: [{ in: 'rows', field: 'status', is: 'open' }] }] });
  checks.push([`a filter the rows do not bear out is reported (${said(onlyOpen)})`, !onlyOpen.ok && onlyOpen.findings.some((finding) => finding.message.includes('where every row\'s is "open"'))]);

  const byValue = await checkScreen(screen(), setup, { probes: [...PROBES, { do: [{ set: 'search', to: 'a' }], changes: 'rows', holds: [{ in: 'rows', field: 'value', sorted: 'desc' }] }] });
  checks.push([`an order the rows do not bear out is reported after the steps (${said(byValue)})`, !byValue.ok && byValue.findings.some((finding) => finding.message.includes('is not sorted by value descending'))]);

  const formatted = await checkScreen(screen(), setup, { probes: [...PROBES, { holds: [{ in: 'rows', field: 'close_date_display', from: '2026-01-01' }] }] });
  checks.push([`a claim that orders a formatted value says so, not that the rows are wrong (${said(formatted)})`, !formatted.ok && formatted.findings.some((finding) => finding.message.includes('a formatted value that cannot be ordered'))]);

  const proofs = new Map([['deals/list', { count: 120, context: { q: { kind: 'context' as const, type: 'string' as const } } }]]);
  const typed: Probe[] = [{ do: [{ set: 'search', to: 'a' }], changes: 'rows' }, { do: [{ set: 'search', to: 'a' }, { click: 'dealRow' }], opens: 'crm.deal.view' }];
  const waits = await checkScreen(screen((definition) => ({ ...definition, lifecycle: {} })), setup, { probes: typed, proofs });
  checks.push([`a list that loads only when a control is used is not blamed for being empty as the screen opens (${said(waits)})`, waits.ok]);

  const uncalled = await checkScreen(
    screen((definition) => ({ ...definition, layout: { component: 'Stack', children: [(definition.layout as { children: unknown[] }).children[1] as never] }, lifecycle: {}, triggers: [definition.triggers?.[1] as never] })),
    setup,
    { probes: [PROBES[1] as Probe], proofs },
  );
  checks.push([`an endpoint no step calls is reported (${said(uncalled)})`, !uncalled.ok && uncalled.findings.some((finding) => finding.message.includes('is called by no step'))]);

  const picked = await checkScreen(
    screen((definition) => ({
      ...definition,
      data: { rows: [], search: '', picked: '', detail: [] },
      layout: {
        component: 'Stack',
        children: [
          { component: 'Select', ref: 'pick', model: '$.picked', props: { options: '$.rows', valueKey: 'deal_id', labelKey: 'title' } },
          { component: 'Table', props: { rows: '$.detail', rowKey: 'deal_id', empty: 'None.', columns: [{ label: 'Title', cell: { kind: 'primary', key: 'title' } }] } },
        ],
      },
      triggers: [{ event: 'ui:model', ref: 'pick', do: [{ call: 'loadDetail' }] }],
      lifecycle: { mount: [{ call: 'load' }] },
      endpoints: { ...definition.endpoints, loadDetail: { url: '/api/vex', method: 'POST', request: { fingerprint: 'deals/list', context: { q: { $ref: '$.picked' } } }, target: 'detail' } },
    })),
    setup,
    { probes: [], proofs },
  );
  checks.push([`rows a Select shows are shown, and its list waits for a pick (${said(picked)})`, !codes(picked).includes('unshown-rows') && !codes(picked).includes('load-empty')]);

  const nested = await checkScreen({ ...screen(), probes: PROBES }, setup);
  checks.push([`probes inside the action are named as such (${said(nested)})`, !nested.ok && nested.findings.some((finding) => finding.message.includes('the probes sit inside the action'))]);

  const invalid = await checkScreen({ id: 123, endpoints: 'nope' }, setup);
  checks.push([`a definition that is not one is refused (${said(invalid)})`, !invalid.ok && codes(invalid).includes('schema')]);

  let ok = true;
  for (const [label, pass] of checks) {
    ok = ok && pass;
    console.log(`${pass ? '✓' : '✗'} ${label}`);
  }
  console.log(ok ? '\nOK — the check passes a working screen and catches each fault (no LLM).' : '\nFAIL.');
  process.exit(ok ? 0 : 1);
};

void main();
