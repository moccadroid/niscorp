import { existsSync } from 'node:fs';
import { createServer } from '@niscorp/moss';
import type { MossServer, NiscRuntime, RunSink } from '@niscorp/moss';
import { buildApp } from '../app/app';
import { APP_SEQUENCE } from '../db/schema';
import { composer, firstScreen } from './compose';
import type { Models } from './compose';
import { modelsFromEnv } from './models';
import { logRun } from './runs';
import { runtime as database } from './runtime';

const fromEnvFile = (): Models => {
  if (existsSync('.env')) process.loadEnvFile('.env');
  const models = modelsFromEnv(process.env);
  console.log(`[app] ${models.summary}`);
  if (models.missing.length > 0) console.log(`[app] ${models.missing.join(', ')} is empty in .env: until it is set, a message is answered with a notice saying so.`);
  return models;
};

export type BootConfig = { models?: Models; runs?: RunSink };

export const runtime = async (): Promise<NiscRuntime> => ({ ...(await database()), tables: [APP_SEQUENCE] });

// What `nisc migrate` checks against the tables: the entries and the features, which no model changes.
export const app = buildApp({ functions: () => [], runs: logRun });

export const boot = async (config: BootConfig = {}): Promise<{ server: MossServer }> => ({
  server: await createServer(buildApp({ functions: composer(config.models ?? fromEnvFile()), runs: config.runs ?? logRun, seeds: firstScreen }), await runtime()),
});
