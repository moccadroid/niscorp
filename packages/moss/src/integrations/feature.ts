import type { Feature, FeatureSeams, Replay } from '../feature';
import { KEY_PREFIX, createAssertionSigner, keyCredential } from './credentials';
import type { IntegrationActor } from './credentials';
import { REGISTRY_ENTRIES, REGISTRY_TABLES } from './entries';
import { callIntegrationWith, createForwarder, proxyRoutes, withFallbackMessage } from './forward';
import type { CallIntegration } from './forward';
import type { ExtensionConfig } from './intake';
import { contractRoutes, operatorRoutes } from './operator';
import { STORED_ACTIONS, filterInstalled, findIntegration, integrationByKey, integrationOfAction, loadIntegrationActions, registeredIntegrations } from './registry';
import type { RegisteredIntegration } from './registry';

export type IntegrationsConfig<Extension = undefined> = {
  extension?: ExtensionConfig<Extension>;
  integrationActor?: IntegrationActor;
  // 32 bytes, as base64.
  signingSeed?: string;
  outboundTimeoutMs?: number;
};

const DEFAULT_OUTBOUND_TIMEOUT_MS = 30_000;

// The longest delay a timer of Node's holds: a longer one is cut to 1 ms.
const MAX_TIMEOUT_MS = 2 ** 31 - 1;

const outboundTimeoutOf = (asked: number | undefined): number => {
  if (asked === undefined) return DEFAULT_OUTBOUND_TIMEOUT_MS;
  if (!Number.isInteger(asked) || asked < 1 || asked > MAX_TIMEOUT_MS) {
    throw new Error(
      `moss: the \`outboundTimeoutMs\` of \`createIntegrations\` is ${String(asked)}. ` +
        `It is how long a call out to an integration may take: a whole number of milliseconds from 1 to ${String(MAX_TIMEOUT_MS)}. No call out waits for ever.`,
    );
  }
  return asked;
};

export type Integrations<Extension = undefined> = Feature & {
  listIntegrations: () => Promise<RegisteredIntegration<Extension>[]>;
  callIntegration: CallIntegration;
  integrationByKey: (key: string) => Promise<string | undefined>;
  integrationOfAction: (actionId: string) => string | undefined;
};

type Started = { replay: Replay; call: CallIntegration };

const start = async <Extension>(config: IntegrationsConfig<Extension>, timeoutMs: number, seams: FeatureSeams): Promise<Started> => {
  const replay = await seams.ownEntries(REGISTRY_ENTRIES);
  await seams.upgradeStore(STORED_ACTIONS);
  const find = (id: string): ReturnType<typeof findIntegration> => findIntegration(replay, id);
  const signer = createAssertionSigner(config.signingSeed);
  const forward = createForwarder({ find, resolveIdentity: seams.resolveIdentity, scopeOf: seams.scopeOf, mint: signer.mint, timeoutMs });
  const stored = (): ReturnType<typeof loadIntegrationActions> => loadIntegrationActions(replay, seams.grammars);
  const reload = async (): Promise<void> => seams.replaceActions(await stored());

  seams.addCatalogFilter(filterInstalled);
  seams.setActionsLoader(stored);
  seams.registerCredential(KEY_PREFIX, keyCredential({ byKey: (key) => integrationByKey(replay, key), actor: config.integrationActor, resolveIdentity: seams.resolveIdentity }));
  seams.wrapWire(withFallbackMessage);

  seams.mountRoutes(
    contractRoutes({
      host: { components: seams.components, charter: seams.charter, extension: config.extension?.contract },
      fingerprintsFor: seams.fingerprintsFor,
      verifyKey: signer.verifyKey,
    }),
  );
  seams.mountOperatorRoutes(
    operatorRoutes({
      replay,
      extension: config.extension,
      grammars: seams.grammars,
      fingerprints: seams.fingerprints,
      layoutMisfits: seams.layoutMisfits,
      endlessChains: seams.endlessChains,
      actions: seams.actions,
      refusalOf: seams.refusalOf,
      reload,
      timeoutMs,
    }),
  );
  seams.mountRoutes(proxyRoutes({ grantedActionIds: seams.grantedActionIds, forward }));

  const approved = await stored();
  if (Object.keys(approved).length > 0) seams.replaceActions(approved);

  return { replay, call: callIntegrationWith({ forward, ...(seams.telemetry === undefined ? {} : { telemetry: seams.telemetry }) }) };
};

export const createIntegrations = <Extension = undefined>(config: IntegrationsConfig<Extension> = {}): Integrations<Extension> => {
  const timeoutMs = outboundTimeoutOf(config.outboundTimeoutMs);
  let started: Started | undefined;
  const running = (call: string): Started => {
    if (started === undefined) {
      throw new Error(
        `moss: integrations.${call} was called before a server started the feature. Put what createIntegrations returned in the manifest's \`features\`, and call it once createServer has answered.`,
      );
    }
    return started;
  };
  return {
    name: 'integrations',
    tables: { names: REGISTRY_TABLES },
    start: async (seams) => {
      started = await start(config, timeoutMs, seams);
    },
    callIntegration: async (id, path, init) => running('callIntegration').call(id, path, init),
    listIntegrations: async () => registeredIntegrations(running('listIntegrations').replay, config.extension?.schema),
    integrationByKey: async (key) => integrationByKey(running('integrationByKey').replay, key),
    integrationOfAction,
  };
};
