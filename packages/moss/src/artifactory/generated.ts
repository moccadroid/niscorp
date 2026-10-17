import { randomUUID } from 'node:crypto';
import { ActionDefinitionSchema, ActionFragmentSchema, auditAction } from '@niscorp/nova';
import type { ActionDefinition, ActionFragment, AuditCatalogEntry } from '@niscorp/nova';
import { isRecord } from '@niscorp/nova/reflect';
import { depthRefusal, exceedsDepth } from '@niscorp/strata';
import type { SeedEntry, SeedMutation } from '@niscorp/vex';
import type { z } from 'zod';
import { GENERATED_ID_PREFIX, layoutMisfits, layoutNameRefusal } from '../manifest';
import type { KitComponents } from '../manifest';
import type { SavedVersion } from './saves';

export const generatedId = (): string => `${GENERATED_ID_PREFIX}${randomUUID()}`;

export type GeneratedHeldTo = {
  kit: KitComponents;
  entryOf: (fingerprint: string) => SeedEntry | SeedMutation | undefined;
  replayable: () => Promise<ReadonlySet<string>>;
  // The actions its owner holds, their own generated ones among them.
  catalog: () => readonly AuditCatalogEntry[];
  mayCall: (name: string) => boolean;
};

type Read<Body> = { body: Body } | { refusal: string };

// No `{{`: a templated address is decided when it is called, and this is read before.
const VEX_ROUTE = /^\/api\/(?:[A-Za-z0-9_-]+\/)?vex$/;

const endpointRefusals = async (endpoints: ActionDefinition['endpoints'], heldTo: GeneratedHeldTo): Promise<string[]> => {
  const refusals: string[] = [];
  for (const [name, endpoint] of Object.entries(endpoints ?? {})) {
    if ('fn' in endpoint) {
      if (endpoint.fn.includes('{{')) refusals.push(`endpoint "${name}" names a function that is worked out when it is called, and what is generated names one written out`);
      else if (!heldTo.mayCall(endpoint.fn)) refusals.push(`endpoint "${name}" calls the function "${endpoint.fn}", which its owner’s roles do not grant`);
      continue;
    }
    if (endpoint.method !== 'POST' || !VEX_ROUTE.test(endpoint.url)) {
      refusals.push(`endpoint "${name}" calls "${endpoint.method} ${endpoint.url}", and what is generated calls only the app’s vex route, with POST`);
      continue;
    }
    const fingerprint = isRecord(endpoint.request) ? endpoint.request['fingerprint'] : undefined;
    if (typeof fingerprint !== 'string') {
      refusals.push(`endpoint "${name}" names no fingerprint`);
      continue;
    }
    const entry = heldTo.entryOf(fingerprint);
    if (entry === undefined) refusals.push(`endpoint "${name}" replays "${fingerprint}", which is no entry the app ships or was handed, nor a read its owner saved`);
    else if ('mutation' in entry) refusals.push(`endpoint "${name}" replays "${fingerprint}", which is a write, and what is generated only reads`);
    else if (!(await heldTo.replayable()).has(fingerprint)) refusals.push(`endpoint "${name}" replays "${fingerprint}", which its owner may not replay`);
  }
  return refusals;
};

const parsedUnder = <Schema extends z.ZodType>(schema: Schema, body: unknown, id: string, more: Record<string, unknown> = {}): Read<z.infer<Schema>> => {
  // First: the schema recurses, and a deep enough body overflows the stack.
  if (exceedsDepth(body)) return { refusal: depthRefusal() };
  if (isRecord(body) && body['id'] !== undefined && body['id'] !== id) {
    return { refusal: `it names the id "${String(body['id'])}", and is kept under "${id}": leave the id out of the body.` };
  }
  const parsed = schema.safeParse(isRecord(body) ? { ...more, ...body, id } : body);
  if (parsed.success) return { body: parsed.data };
  const first = parsed.error.issues[0];
  return { refusal: first === undefined ? 'no reason given' : `${first.path.join('.') || '(the body)'}: ${first.message}` };
};

const layoutRefusals = (layout: ActionDefinition['layout'], kit: KitComponents): string[] => {
  const named = layoutNameRefusal(layout);
  return [...(layout === undefined || typeof layout === 'string' ? [] : layoutMisfits(layout, kit)), ...(named === undefined ? [] : [`it ${named}`])];
};

const passedOrRefused = <Body>(body: Body, refusals: readonly string[]): Read<Body> => (refusals.length > 0 ? { refusal: refusals.join('; ') } : { body });

export const readAction = async (body: unknown, id: string, heldTo: GeneratedHeldTo): Promise<Read<ActionDefinition>> => {
  const parsed = parsedUnder(ActionDefinitionSchema, body, id);
  if ('refusal' in parsed) return parsed;
  const action = parsed.body;
  return passedOrRefused(action, [
    ...layoutRefusals(action.layout, heldTo.kit),
    ...(await endpointRefusals(action.endpoints, heldTo)),
    ...auditAction(action, { catalog: heldTo.catalog() }).issues,
  ]);
};

export const readFragment = async (body: unknown, id: string, heldTo: GeneratedHeldTo): Promise<Read<ActionFragment>> => {
  const parsed = parsedUnder(ActionFragmentSchema, body, id, { kind: 'fragment' });
  if ('refusal' in parsed) return parsed;
  const fragment = parsed.body;
  return passedOrRefused(fragment, [...layoutRefusals(fragment.layout, heldTo.kit), ...(await endpointRefusals(fragment.endpoints, heldTo))]);
};

const generatedIn = (inForce: readonly SavedVersion[], kind: string): SavedVersion[] => inForce.filter((version) => version.kind === kind && version.body !== null);

export const catalogOfGenerated = (inForce: readonly SavedVersion[]): AuditCatalogEntry[] =>
  generatedIn(inForce, 'action').map((version) => ({ id: version.id, input: isRecord(version.body) && isRecord(version.body['input']) ? version.body['input'] : {} }));

export type Generated = { actions: Record<string, ActionDefinition>; fragments: Record<string, ActionFragment> };

// `whose`: as the line says it of one that is left out, "of ada". Absent: nothing is said.
export const generatedInForce = async (inForce: readonly SavedVersion[], heldTo: GeneratedHeldTo, whose: string | undefined): Promise<Generated> => {
  const passed = async <Body>(kind: string, read: (body: unknown, id: string, heldTo: GeneratedHeldTo) => Promise<Read<Body>>): Promise<Record<string, Body>> => {
    const kept: Record<string, Body> = {};
    for (const version of generatedIn(inForce, kind)) {
      const answered = version.unread !== undefined ? { refusal: version.unread } : await read(version.body, version.id, heldTo);
      if ('body' in answered) kept[version.id] = answered.body;
      else if (whose !== undefined) console.error(`[moss] the ${kind} "${version.id}" ${whose} is left out: ${answered.refusal}`);
    }
    return kept;
  };
  return { actions: await passed('action', readAction), fragments: await passed('fragment', readFragment) };
};
