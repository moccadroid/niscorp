// ═══════════════════════════════════════════════════════════════
// The connection's status, as a target shows it. A screen on a dead socket is
// indistinguishable from a working terminal rendering an empty app, so every
// target says which it is.
// ═══════════════════════════════════════════════════════════════

// What a target that prints words says (./tty as each change happens, ./ink
// for as long as it is not open).
export const STATUS_WORDS = {
  connecting: '… connecting',
  connected: '✓ connected',
  lost: '× connection lost — retrying',
  incompatible: '× this terminal and the server speak different protocol versions — update one of them',
} as const;
