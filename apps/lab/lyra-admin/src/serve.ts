// .env first — OPERATOR_KEY lives there, on both sides of the seam.
try {
  process.loadEnvFile();
} catch {
  /* no .env present */
}

import { startAdminService } from './service';
import { adminPort, lyraBase, operatorKey } from './port';
import { adminToken } from './token';

// `pnpm --filter lyra-admin admin`. Its own process, so it restarts on its own
// clock and the app it administers never notices.

const main = async (): Promise<void> => {
  if (operatorKey() === '') {
    console.error('admin: OPERATOR_KEY is not set. Lyra serves the operator seam only when it holds the same key,');
    console.error('       so without one this tool has nothing to talk to. Put OPERATOR_KEY in a .env and start again.');
    process.exit(1);
  }
  await startAdminService();
  console.log(`lyra admin listening on http://localhost:${adminPort()}`);
  console.log(`  administering ${lyraBase()} through its operator seam`);
  console.log('');
  console.log('  Open this once. The tool appears over Lyra and stays.');
  console.log(`    ${lyraBase()}/?admin=${adminToken()}`);
  console.log('');
  console.log(`  Done with it:  ${lyraBase()}/?admin=off`);
  console.log('');
  console.log('  A page with a stale key gets nothing: an unknown principal resolves to a');
  console.log('  charter whose public role grants no actions — an empty application, not a');
  console.log('  locked one. Nobody in a studio holds a credential this service has heard of.');
};

void main();
