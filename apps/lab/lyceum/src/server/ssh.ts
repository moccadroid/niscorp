// The SSH door alone, against a running lyceum — for `pnpm dev`, whose server
// lives inside vite: `pnpm ssh`, then `ssh -p 2222 localhost`. The deployed
// server opens the same door in its own process (LYCEUM_SSH_PORT, serve.ts).
//
//   LYCEUM_SOCKET   the room's socket (default: the dev server's)
//   LYCEUM_SSH_PORT where the door listens (default 2222)
process.env['FORCE_COLOR'] ??= '3';
const { openSshDoor } = await import('./ssh-door');

const door = await openSshDoor({
  port: Number(process.env['LYCEUM_SSH_PORT'] ?? 2222),
  socketUrl: process.env['LYCEUM_SOCKET'] ?? 'ws://127.0.0.1:5197/socket',
  hostKeyFile: process.env['LYCEUM_SSH_HOST_KEY'] ?? '.lyceum/ssh_host_ed25519_key',
});
console.log(`lyceum's ssh door: ssh -p ${door.port} localhost`);
const stop = (): void => void door.close().finally(() => process.exit(0));
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

export {};
