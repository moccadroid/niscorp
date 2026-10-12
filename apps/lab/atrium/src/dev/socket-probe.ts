import { offerToken, PROTOCOL } from '@niscorp/moss/protocol';

const ws = new WebSocket(`ws://localhost:5175/socket?protocol=${PROTOCOL}`, offerToken(null));
const seen: string[] = [];

ws.addEventListener('open', () => console.log('socket OPEN'));
ws.addEventListener('close', (e) => console.log(`socket CLOSED code=${e.code} reason=${e.reason}`));
ws.addEventListener('error', () => console.log('socket ERROR'));
ws.addEventListener('message', (e) => {
  const msg = JSON.parse(String(e.data)) as { type: string; canvas?: string; tree?: unknown[] };
  seen.push(`${msg.type}${msg.canvas !== undefined ? `:${msg.canvas}` : ''}${Array.isArray(msg.tree) ? ` (${msg.tree.length} nodes)` : ''}`);
});

setTimeout(() => {
  console.log('received:', seen.join(' · ') || '(nothing)');
  process.exit(0);
}, 4000);
