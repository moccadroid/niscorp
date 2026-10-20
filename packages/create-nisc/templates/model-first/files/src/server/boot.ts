import { existsSync } from 'node:fs';
import { createServer } from '@niscorp/moss';
import type { MossServer } from '@niscorp/moss';
import { buildApp } from '../app/app';
import { APP_SEQUENCE } from '../db/schema';
import { composer } from './compose';
import type { Models } from './compose';
import { modelsFromEnv } from './models';
import { runtime } from './runtime';

const fromEnvFile = (): Models => {
  if (existsSync('.env')) process.loadEnvFile('.env');
  const models = modelsFromEnv(process.env);
  console.log(`[app] ${models.said}`);
  if (models.missing.length > 0) console.log(`[app] ${models.missing.join(', ')} is empty in .env: until it is set, a message is answered with a notice saying so.`);
  return models;
};

// The checks hand in models of their own; the app reads its keys from .env.
export const boot = async (models: Models = fromEnvFile()): Promise<{ server: MossServer }> => ({
  server: await createServer(buildApp(composer(models)), { ...(await runtime()), tables: [APP_SEQUENCE] }),
});
