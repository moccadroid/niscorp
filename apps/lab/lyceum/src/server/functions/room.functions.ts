import { z } from 'zod';
import type { FunctionDefinition, FunctionSession } from '@niscorp/moss';
import { chainCycles } from '@niscorp/nova/reflect';
import { ECHO, WRONG_COLOUR } from '@lyceum/app/actions/slide/checked.examples';
import { KIT_PROPS } from '@lyceum/ui/kit.props';
import { timerDocument, timersEveryone } from '@lyceum/app/vex/timer.entries';
import { createUpgrader } from '@niscorp/strata';
import { evaluate } from '@niscorp/prism';
import { NOVA_SEQUENCE } from '@niscorp/nova/migrations';
import { PRISM_SEQUENCE } from '@niscorp/prism/migrations';
import { LYCEUM_KIT } from '@lyceum/app/grammars';
import { compactJson } from '@lyceum/app/actions/slide/compact';
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
const AutomationRowsSchema = z.array(z.object({ reflex: z.unknown(), saved_by: z.string() }));
// Of a stored automation, what a slide shows: who it runs as, when, what it does.
const SHOWN_KEYS = ['as', 'on', 'effect'];
const shownOf = (reflex: unknown): Record<string, unknown> =>
  typeof reflex === 'object' && reflex !== null ? Object.fromEntries(Object.entries(reflex).filter(([key]) => SHOWN_KEYS.includes(key))) : {};

// A screen stored when this app's kit was at version 6, when Look still named
// a kit (poster or plain); read now, through the app's own grammars.
const STORED_AT = 6;
const STORED_SCREEN = { component: 'Sheet', props: { areas: ['look'] }, children: [{ component: 'Look', props: { look: 'poster' } }] };
let upgraded: Promise<Record<string, unknown>> | undefined;
const upgradeStored = async (): Promise<Record<string, unknown>> => {
  const upgrader = await createUpgrader([NOVA_SEQUENCE, PRISM_SEQUENCE, LYCEUM_KIT], { transform: evaluate });
  const now = upgrader.stamp[LYCEUM_KIT.id] ?? 0;
  const read = compactJson(upgrader.upgrade(STORED_SCREEN, { kind: 'nisc.nova/layout', stamp: { ...upgrader.stamp, [LYCEUM_KIT.id]: STORED_AT } }).document);
  const newer = { [LYCEUM_KIT.id]: now + 1 };
  let refusal = '';
  try {
    upgrader.upgrade(STORED_SCREEN, { kind: 'nisc.nova/layout', stamp: { ...upgrader.stamp, ...newer } });
  } catch (error) {
    refusal = error instanceof Error ? error.message : String(error);
  }
  return {
    stored: compactJson(STORED_SCREEN),
    storedAt: STORED_AT,
    read,
    readAt: now,
    marked: read.split('\n').flatMap((line, index) => (line.includes('"dom"') ? [index + 1] : [])),
    newer: { stamp: compactJson(newer), at: now + 1, refusal },
  };
};

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
    id: 'room.automations',
    description: 'Answers the newest automation saved on the controller and the newest saved on a phone, each as stored — who it runs as, when, what it does — with the lines that say what it does and as whom. Send nothing.',
    execute: async () => {
      const rows = AutomationRowsSchema.parse(await vexOver(session.wire)(timersEveryone.fingerprint));
      const shown = (row: { reflex: unknown } | undefined): { code: string; marked: number[] } => {
        if (row === undefined) return { code: '', marked: [] };
        const code = compactJson(shownOf(row.reflex));
        return { code, marked: code.split('\n').flatMap((line, i) => (/"(effect|as)":/.test(line) ? [i + 1] : [])) };
      };
      return { controller: shown(rows.find((row) => row.saved_by === 'speaker')), phone: shown(rows.find((row) => row.saved_by !== 'speaker')) };
    },
  },
  {
    id: 'room.upgrade',
    description: 'Answers a screen stored at an older version of this app’s kit, as stored and as read now, and what reading one stamped by newer code says. Send nothing.',
    execute: async () => (upgraded ??= upgradeStored()),
  },
  {
    id: 'room.timer',
    description: 'Answers the timer the stage shows, the newest one saved on the controller: its code, the lines that say what it does and as whom, and when it is due. Send nothing; answers { code, marked, due_at }.',
    execute: async () => {
      const row = TimerRowSchema.parse(await vexOver(session.wire)(timerDocument.fingerprint, { savedBy: 'speaker' }));
      if (row === null) return { code: '', marked: [], due_at: '' };
      const code = JSON.stringify(shownOf(row.reflex), null, 2);
      const marked = code.split('\n').flatMap((line, i) => (/^ {2}"(effect|as)":/.test(line) ? [i + 1] : []));
      return { code, marked, due_at: row.due_at };
    },
  },
];
