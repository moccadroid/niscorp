// Probe the RUNNING dev server's socket the way a browser terminal does:
// connect anonymous, print what arrives. If no frame lands, the white screen
// is the wire; if frames land, the crash is in a React component.
const ws = new WebSocket('ws://localhost:5175/socket');
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
