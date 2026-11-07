import { existsSync } from 'node:fs';
import type { NiscMossProject } from '@niscorp/cli';
import { createIntegrations } from '@niscorp/moss/integrations';
import { buildLyceum } from '@lyceum/app/app';
import { seatsExtension } from '@lyceum/app/attachable';
import { bootOn } from '@lyceum/server/boot';
import { lyceumIdentity } from '@lyceum/server/identity';
import { postgresRuntime } from '@lyceum/server/postgres-runtime';

// For `nisc migrate`, the step a deployment runs before `pnpm serve`. Lyceum serves its own built terminal, so
// `nisc build` and `nisc start` are not for it.

if (existsSync('.env')) process.loadEnvFile('.env');

const openDatabase = async () => {
  const databaseUrl = process.env['DATABASE_URL'] ?? '';
  if (databaseUrl === '') throw new Error('lyceum: DATABASE_URL is not set — `nisc migrate` changes the Postgres it names, and in memory there is nothing to keep.');
  return postgresRuntime(databaseUrl);
};

export const project: NiscMossProject = {
  // What `nisc migrate` checks against the tables: the entries and the features. The rest is the running server's.
  app: buildLyceum({
    features: [createIntegrations({ extension: seatsExtension })],
    identity: lyceumIdentity,
    functions: () => [],
    reactions: [],
    inputs: undefined,
    seeds: undefined,
    onSession: () => undefined,
    components: {},
  }),
  runtime: openDatabase,
  boot: async () => {
    const { server, close } = await bootOn(await openDatabase());
    return { server, close };
  },
  draw: () => {
    throw new Error('lyceum: draws no page through nisc — `pnpm serve` serves its built terminal.');
  },
};
