// SHIM — breaks the style guide's no-assertion rule on purpose (AGENTS.md rule
// 16, declared exception). Ink draws on a `NodeJS.WriteStream` and reads a
// `NodeJS.ReadStream`: a process's own TTY, with dozens of members ink never
// touches. An SSH channel is a plain duplex. This file dresses one as the
// other — exactly the members ink uses (columns/rows and `resize` on the way
// out; isTTY, setRawMode, ref/unref on the way in) — and asserts the rest,
// because there is no honest way to construct the whole of a process TTY.
//
// What it does besides: an SSH session has no server-side pty, so nothing
// turns ink's bare "\n" into "\r\n" — without it every line starts where the
// last one ended. The output translates it.
import { Duplex, Readable, Writable } from 'node:stream';

export type SshTty = {
  stdin: NodeJS.ReadStream;
  stdout: NodeJS.WriteStream;
  resize: (columns: number, rows: number) => void;
};

export const sshTty = (channel: Duplex, size: { columns: number; rows: number }): SshTty => {
  const out = new Writable({
    write: (chunk: Buffer | string, _encoding, done) => {
      channel.write(String(chunk).replace(/\r?\n/g, '\r\n'));
      done();
    },
  });
  const stdout = Object.assign(out, { columns: size.columns, rows: size.rows, isTTY: true }) as unknown as NodeJS.WriteStream;

  // Input is the channel's own bytes; raw mode is what an SSH pty already is.
  const input = new Readable({ read: () => {} });
  channel.on('data', (data: Buffer) => input.push(data));
  channel.on('end', () => input.push(null));
  const stdin = Object.assign(input, {
    isTTY: true,
    setRawMode: () => stdin,
    ref: () => stdin,
    unref: () => stdin,
  }) as unknown as NodeJS.ReadStream;

  return {
    stdin,
    stdout,
    resize: (columns, rows) => {
      Object.assign(stdout, { columns, rows });
      stdout.emit('resize');
    },
  };
};
