// Shim: ink draws on a `NodeJS.WriteStream` and reads a `NodeJS.ReadStream`, a
// process's own TTY, and an SSH channel is a plain duplex. This dresses one as
// the other with the members ink uses and asserts the rest: there is no honest
// way to construct the whole of a process TTY. An SSH session has no
// server-side pty, so the output turns ink's bare "\n" into "\r\n".
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

  // Raw mode is what an SSH pty already is.
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
