// Run: pnpm --filter lyra exec tsx src/dev/theming-check.ts
import { CAST } from '@lyra/db/seed';
import { themeFor } from '@lyra/server/themes';
import { asPrincipal, login, ok, report, runtime, settle, treeOf } from './world';

const tokensOn = (tree: string, token: string): boolean => tree.includes(token);

// ── two studios, two palettes, one set of actions ──
const maren = await login(CAST.lumen.owner);
const dario = await login(CAST.northrock.owner);
await settle();

const lumenTree = treeOf(maren);
const northTree = treeOf(dario);

ok('Lumen is served a palette', tokensOn(lumenTree, '#fdfcfa'), 'sand ground');
ok('North Rock is served a different one', tokensOn(northTree, '#0c0c0d'), 'charcoal ground');
ok('...and neither sees the other’s', !tokensOn(lumenTree, '#0c0c0d') && !tokensOn(northTree, '#fdfcfa'));

const idsIn = (tree: string): string[] => [...tree.matchAll(/"definitionId":"([^"]+)"/g)].map((m) => m[1] ?? '').sort();
ok('both studios run the same actions', JSON.stringify(idsIn(lumenTree)) === JSON.stringify(idsIn(northTree)), idsIn(lumenTree).join(', ') || 'same set');

// ── absent is stock, through the ordinary path ──
const stock = await themeFor(runtime.pool, 'st_does_not_exist');
ok('a studio with no theme gets the stock look', Object.keys(stock.tokens).length === 0 && stock.name === 'stock');

// ── the read is scoped like everything else ──
const lumenTheme = await asPrincipal(CAST.lumen.owner, '/api/studio/vex', { fingerprint: 'theme/current', context: {} });
const northTheme = await asPrincipal(CAST.northrock.owner, '/api/studio/vex', { fingerprint: 'theme/current', context: {} });
ok('the theme read answers for the caller’s own studio', JSON.stringify(lumenTheme).includes('Sand'));
ok('...and the other gets theirs from the same fingerprint', JSON.stringify(northTheme).includes('Charcoal'));

// ── only the owner may change it ──
const asDesk = await asPrincipal(CAST.lumen.desk, '/api/studio/vex', {
  fingerprint: 'studio/set-theme',
  context: { themeId: 'th_charcoal' },
});
ok('the desk cannot re-skin the studio', JSON.stringify(asDesk).includes('status'), JSON.stringify(asDesk));
const stillSand = await runtime.db.query<{ t: string }>("SELECT theme_id t FROM studios WHERE id='st_lumen'");
ok('...and the row did not move', stillSand.rows[0]?.t === 'th_sand');

const forged = await asPrincipal(CAST.lumen.owner, '/api/studio/vex', {
  fingerprint: 'studio/set-theme',
  context: { themeId: 'th_sand', studioId: 'st_northrock' },
});
void forged;
const northUntouched = await runtime.db.query<{ t: string }>("SELECT theme_id t FROM studios WHERE id='st_northrock'");
ok('an owner cannot re-skin a competitor', northUntouched.rows[0]?.t === 'th_charcoal');

// ── the swap lands on a shell that is already open ──
ok('before: Maren is wearing sand', tokensOn(treeOf(maren), '#fdfcfa'));

maren.dispatch({ type: 'ui:click', ref: 'nav', payload: 'studio.settings' });
await settle();
ok('the owner has an Appearance surface', treeOf(maren).includes('Appearance'));
ok('...listing the themes on offer', treeOf(maren).includes('Charcoal'));

maren.dispatch({ type: 'ui:click', ref: 'apply', payload: { theme_id: 'th_charcoal' } });
await settle(14);

const after = treeOf(maren);
ok('the write landed', (await runtime.db.query<{ t: string }>("SELECT theme_id t FROM studios WHERE id='st_lumen'")).rows[0]?.t === 'th_charcoal');
ok('...and the OPEN shell repainted — no reload', tokensOn(after, '#0c0c0d'), 'charcoal reached the chrome');
ok('...with the old palette gone', !tokensOn(after, '#fdfcfa'));

ok('North Rock was untouched throughout', (await runtime.db.query<{ t: string }>("SELECT theme_id t FROM studios WHERE id='st_northrock'")).rows[0]?.t === 'th_charcoal');

report('two studios, one deployment, different looks — and a swap reaches an open screen.');
