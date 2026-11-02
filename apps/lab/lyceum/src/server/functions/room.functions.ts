import { z } from 'zod';
import type { FunctionDefinition, FunctionSession } from '@niscorp/moss';
import { chainCycles } from '@niscorp/nova/reflect';
import { ECHO, WRONG_COLOUR } from '@lyceum/app/actions/slide/checked.examples';
import { KIT_PROPS } from '@lyceum/ui/kit.props';
import { timerDocument } from '@lyceum/app/vex/timer.entries';
import type { Census } from '../census';
import { vexOver } from '../vex-over';

const fold = (line: string, width: number): string =>
  line
    .split(/(?<=[:|] ?)/)
    .reduce<string[]>((lines, piece) => {
      const last = lines.at(-1) ?? '';
      return last !== '' && (last + piece).length <= width ? [...lines.slice(0, -1), last + piece] : [...lines, piece];
    }, [])
    .map((part) => part.trim())
    .join('\n');

const TimerRowSchema = z.object({ reflex: z.unknown(), due_at: z.string() }).nullable();

export const roomFunctions = (session: FunctionSession, publicUrl: string, sshAddress: string, census: () => Promise<Census>): FunctionDefinition[] => [
  {
    id: 'room.address',
    description: 'Answers where the room joins the talk: { url, host, ssh }. Send nothing.',
    execute: async () => ({ url: publicUrl, host: new URL(publicUrl).host, ssh: sshAddress }),
  },
  {
    id: 'room.census',
    description: 'Answers how many lines of lyceum’s source are data and how many are code, by kind, and how many checks it has. Send nothing.',
    execute: census,
  },
  {
    id: 'room.checks',
    description: 'Answers what two checks say about the slide’s examples: the props schema about the wrong colour, and the loop found in the echo action. Send nothing; answers { schema, loop }.',
    execute: async () => {
      const colour = KIT_PROPS.shape.Action.safeParse(WRONG_COLOUR.props);
      return {
        schema: colour.success ? '' : fold(colour.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; '), 38),
        loop: chainCycles([ECHO])[0]?.path ?? '',
      };
    },
  },
  {
    id: 'room.timer',
    description: 'Answers the timer the stage shows: its code, the lines that say what it does and as whom, and when it is due. Send nothing; answers { code, marked, due_at }.',
    execute: async () => {
      const row = TimerRowSchema.parse(await vexOver(session.wire)(timerDocument.fingerprint));
      if (row === null) return { code: '', marked: [], due_at: '' };
      const code = JSON.stringify(row.reflex, null, 2);
      const marked = code.split('\n').flatMap((line, i) => (/^ {2}"(effect|as)":/.test(line) ? [i + 1] : []));
      return { code, marked, due_at: row.due_at };
    },
  },
];
