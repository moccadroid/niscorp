import { createShell, shellIdle, type ActionDefinition, type FetchFn, type PublicActionRuntime, type RenderComponentNode, type RenderNode, type Shell, type TransformFn } from '@niscorp/nova';
import { allSteps, componentsIn, navigationOf } from './read';
import type { Finding, ScreenSetup } from './types';

export type Mounted = {
  shell: Shell;
  instance: string;
  runtime: PublicActionRuntime;
  // What went wrong since the mount began: failed calls, failed transforms, runtime errors.
  findings: Finding[];
  // The request bodies the screen posted to vex, in order.
  sent: unknown[];
  tree: () => RenderNode[];
  components: () => RenderComponentNode[];
  idle: (waitMs?: number) => Promise<boolean>;
  dispose: () => void;
};

const parsed = (body: string): unknown => {
  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
};

const MOUNT_WAIT_MS = 60_000;

// The screen in a shell of its own, with the host's wire and transform, and every action it may open as an empty stand-in.
export const mount = async (definition: ActionDefinition, setup: ScreenSetup): Promise<Mounted> => {
  const findings: Finding[] = [];
  const sent: unknown[] = [];

  const wire: FetchFn = async (url, init) => {
    const body = init?.body === undefined ? undefined : parsed(init.body);
    if (url === setup.vex.endpoint && body !== undefined) sent.push(body);
    const response = await setup.wire(url, init);
    if (!response.ok) {
      const what = body === undefined ? '' : ` — it sent ${JSON.stringify(body).slice(0, 300)}`;
      findings.push({ code: 'endpoint', message: `a call to ${url} failed (${response.status}): ${(await response.text()).slice(0, 300)}${what}` });
    }
    return response;
  };

  const transform: TransformFn = (config, source) => {
    try {
      return setup.transform(config, source);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      const reshapeOnly = Array.isArray(source) ? ' A response reshapes the rows it is given; limiting, sorting and filtering them belong in the query.' : '';
      findings.push({ code: 'transform', message: `an endpoint transform failed: ${reason} — in ${JSON.stringify(config).slice(0, 240)}.${reshapeOnly}` });
      throw error;
    }
  };

  const canvases = new Set(['main', ...allSteps(definition).flatMap((step) => navigationOf(step)?.canvas ?? [])]);
  const standIns = Object.fromEntries(setup.catalog.map((entry) => [entry.id, { id: entry.id, data: {} }]));
  const shell = createShell({
    canvases: [...canvases].map((id) => ({ id })),
    registry: setup.kit.registry,
    actions: { ...standIns, [definition.id]: definition },
    functions: {},
    transform,
    fetch: wire,
    onError: (error) => findings.push({ code: 'mount', message: `${error.code}: ${error.message}` }),
  });
  const offEndpoint = shell.onEndpoint((event) => {
    if (!event.ok) findings.push({ code: 'endpoint', message: `endpoint "${event.name}" failed (status ${event.status}): its target was not written` });
  });

  const instance = shell.push('main', definition.id);
  const runtime = shell.getRuntime(instance);
  if (runtime === undefined) throw new Error(`the shell made no runtime for "${definition.id}"`);
  const idle = (waitMs = MOUNT_WAIT_MS): Promise<boolean> => shellIdle(shell, { waitMs });
  if (!(await idle())) findings.push({ code: 'mount', message: `the screen did not settle within ${MOUNT_WAIT_MS / 1000} s: an endpoint never answered` });

  const tree = (): RenderNode[] => shell.flattenRenderTree(shell.getCanvasRenderTree('main'));
  return {
    shell,
    instance,
    runtime,
    findings,
    sent,
    tree,
    components: () => componentsIn(tree()),
    idle,
    dispose: () => {
      offEndpoint();
      shell.dispose();
    },
  };
};
