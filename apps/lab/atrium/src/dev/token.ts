// Print a session token for a demo principal.
//
//   pnpm --filter atrium exec tsx src/dev/token.ts ines
//
// Useful for driving a second surface — curl, a second browser profile, a
// terminal — as somebody else while the first one stays signed in. In the UI
// you would just pick a name on the login page.
//
// Works without a database: minting needs only the CAST (username → principal).
import { CAST, mintToken } from '@atrium/server/users';

const username = process.argv[2];

if (username === undefined) {
  console.log('Who?\n');
  for (const c of CAST) console.log(`  ${c.username.padEnd(8)} ${c.blurb}`);
  process.exit(1);
}

const token = mintToken(username);
if (token === null) {
  console.error(`No such person: "${username}".`);
  process.exit(1);
}
console.log(token);
