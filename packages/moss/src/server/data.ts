import { createData, featureTablesOf } from '../data';
import type { Data } from '../data';
import type { NiscApp } from '../manifest';
import type { NiscRuntime } from '../runtime';

// WHAT SOMEBODY MAY READ AND WRITE, for every surface (../data). It runs the
// tables' one ledgered run, brings the documents stored in them to this
// code's grammars, and stands the engine up over what is there — in that
// order, because a table created after the engine has looked is a table no
// grant can reach. It is handed the database, the tables, the charter and the
// row behaviors, and where a span goes; who a request is, it is told for each
// request. The entries it serves are not read off the app here: the running
// manifest holds them and hands them over when it stands (./manifest.ts).
export const buildData = (app: NiscApp, runtime: NiscRuntime): Promise<Data> =>
  createData({
    pool: runtime.pool,
    db: runtime.db,
    cache: runtime.cache,
    vexConfig: runtime.vexConfig,
    migrations: runtime.migrations,
    storesSessions: runtime.session === 'sessions',
    // The tables the features keep, so they are there before a feature starts.
    // Asked with the cache the deployment handed over: the table that one
    // keeps is the core's under whatever name it has.
    featureTables: featureTablesOf(app, runtime.cache),
    tables: runtime.tables,
    grammars: app.grammars,
    charter: app.charter,
    behaviors: app.behaviors,
    telemetry: runtime.telemetry,
  });
