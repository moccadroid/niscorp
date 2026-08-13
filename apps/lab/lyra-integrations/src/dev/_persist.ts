import { database } from '../db';
import { accountFor, forgetAccounts, rememberAccount, storeIsDurable } from '../packs/stripe/store';

const db = database();
const store = db === undefined ? undefined : { query: db.query, table: (n: string) => `stripe_${n}` };
console.log('durable:', storeIsDurable(store));
await forgetAccounts(store);

await rememberAccount(store, { studioId: 'st_northrock', accountId: 'acct_persist_probe', studioName: 'North Rock BJJ', country: 'AT', createdAt: '' });
console.log('written:', JSON.stringify(await accountFor(store, 'st_northrock')));

// One account per studio, and the database is what says so.
await rememberAccount(store, { studioId: 'st_northrock', accountId: 'acct_SECOND_one', studioName: 'North Rock BJJ', country: 'AT', createdAt: '' });
const after = await accountFor(store, 'st_northrock');
console.log('after a second attempt:', after?.accountId, after?.accountId === 'acct_persist_probe' ? '(first kept)' : '(OVERWRITTEN)');
console.log('another studio:', await accountFor(store, 'st_lumen'));
process.exit(0);
