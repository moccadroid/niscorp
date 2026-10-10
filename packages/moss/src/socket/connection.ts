// The transport seam — what a runtime's websocket must provide. Four
// functions, and what the request that opened the connection offered;
// everything above them is identical on every runtime.
export type Connection = {
  send: (text: string) => void;
  close: (code?: number, reason?: string) => void;
  onMessage: (fn: (text: string) => void) => void;
  onClose: (fn: () => void) => void;
  // The upgrade request, as far as it says who is asking: the subprotocols it
  // offered (`Sec-WebSocket-Protocol`, split), and — for a browser's session
  // (../identity, session-cookie.ts) — where the page is, where the request was
  // addressed, and the cookies it carried. A transport that leaves this out
  // serves every terminal as nobody.
  //
  // `answer`: a transport that has NOT answered the request yet says so by
  // giving this, and is told — once who is asking is decided, before the
  // connection is used at all — the `Set-Cookie` values its answer is to
  // carry: the one moment a cookie can be written. It answers when the
  // connection is first used.
  // Without it nothing is written, and a browser's terminal goes on holding
  // its own token.
  upgrade?: {
    offered: readonly string[];
    origin?: string | null;
    host?: string | null;
    cookie?: string | null;
    answer?: (cookies: readonly string[]) => void;
  };
  // Set here, not by a transport: how this connection's terminal is handed a
  // session when its browser holds a seal (../identity, seal.ts) — sealed, so
  // the page carries it to the next upgrade and cannot open it. Absent, a
  // session is handed over as its token.
  seal?: (token: string) => Promise<string>;
};

// One accept per new connection: authenticate (who a terminal is rides the
// upgrade request; absent = the anonymous principal, invalid = closed with
// 4401), then say hello with the resolved catalog and settle into the message
// loop. `stop` ends revalidation, for hosts that outlive their server (dev
// checks, embedded tools) — the timer is unref'd, so a plain process needn't
// call it.
export type SocketAccept = ((url: string, connection: Connection) => Promise<void>) & { stop: () => void };
