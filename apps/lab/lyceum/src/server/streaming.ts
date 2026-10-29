import { z } from 'zod';
import type { FunctionDefinition, FunctionSession, MossServer } from '@niscorp/moss';
import { createStream } from '@niscorp/solid';
import { compactJson } from '@lyceum/app/actions/slide/compact';
import { POLL } from '@lyceum/app/actions/slide/solid.actions';

// A recorded reply, played into Solid a few characters at a time at a model's
// pace. Every screen that follows it is told when more arrived, and reads the
// text so far and what Solid holds of it.
export const STREAM_CHANNEL = 'stream-changed';

const PollSchema = z.object({ title: z.string(), options: z.array(z.object({ label: z.string() })) });
type Poll = z.infer<typeof PollSchema>;
type Streamed = { text: string; held: string; poll: Poll; done: boolean; chunks: number };

const REPLY = JSON.stringify(POLL, null, 2);
const CHUNK = 4;
const PACE_MS = 80;

const nothingYet = (): Streamed => {
  const poll = createStream({ schema: PollSchema }).current();
  return { text: '', held: compactJson(poll), poll, done: false, chunks: 0 };
};

export type Streaming = { functions: (session: FunctionSession) => FunctionDefinition[] };

export const streaming = (server: () => MossServer): Streaming => {
  let streamed = nothingYet();
  let playing = false;
  const tell = (): void => {
    const shells = server().shells;
    for (const principal of new Set((shells?.list() ?? []).map((shell) => shell.principal))) if (principal !== null) shells?.deliver(principal, STREAM_CHANNEL);
  };
  const play = async (): Promise<void> => {
    playing = true;
    const stream = createStream({ schema: PollSchema });
    streamed = nothingYet();
    tell();
    for (let at = 0; at < REPLY.length; at += CHUNK) {
      await new Promise((resolve) => setTimeout(resolve, PACE_MS));
      stream.write(REPLY.slice(at, at + CHUNK));
      const poll = stream.current();
      streamed = { text: REPLY.slice(0, at + CHUNK), held: compactJson(poll), poll, done: false, chunks: streamed.chunks + 1 };
      tell();
    }
    stream.close();
    streamed = { ...streamed, done: true };
    playing = false;
    tell();
  };

  return {
    functions: (session) => [
      {
        id: 'stream.write',
        description: 'Starts the recorded reply streaming into Solid, a few characters at a time; every screen following it reads it again as it arrives. The speaker only. Send nothing; answers { started }.',
        execute: async () => {
          if (session.principal !== 'speaker') throw new Error('Only the speaker starts the stream.');
          if (!playing) void play();
          return { started: true };
        },
      },
      {
        id: 'room.stream',
        description: 'Answers the reply streaming now: the text that arrived, what Solid holds of it as JSON and as data, how many chunks, and whether it is done. Send nothing.',
        execute: async () => streamed,
      },
    ],
  };
};
