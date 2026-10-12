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
