import { z } from 'zod';
import { asTool, defineAgent, defineTool, type SignalClient } from '@niscorp/cortex';
import { registerScript, type ScriptedReply, type ScriptedRequest } from '@showroom/lib/scripted-model/scripted-fetch';
import { normalize } from '@showroom/lib/scripted-model/scripts';

// ═══════════════════════════════════════════════════════════
// Acme Studio's desk — three agents and the studio they act on.
//
//   · the FRONT DESK answers members in the app, using the timetable, booking
//     and the studio's policies as tools;
//   · the INBOX READER turns members' emails into typed triage cards;
//   · the BILLING AGENT fixes charges — and the front desk can hand it a job,
//     because an agent can be another agent's tool.
//
// The agents, the tools, cortex's loop and signal's client are real. With no
// API key, the model is the showroom's scripted provider: the scripts at the
// bottom of this file are what it says, and each page labels it. With a key,
// the same agents run against a live model.
// ═══════════════════════════════════════════════════════════

// ── the studio ──────────────────────────────────────────────────

export type ClassRow = { name: string; time: string; instructor: string; spots: number };
export type Charge = { id: string; member: string; amount: number; date: string; refunded: boolean };

export type Studio = {
  classes: ClassRow[];
  bookings: { member: string; class: string }[];
  charges: Charge[];
  refunds: { charge: string; amount: number }[];
};

export const newStudio = (): Studio => ({
  classes: [
    { name: 'Morning flow', time: 'Mon 07:30', instructor: 'Theo', spots: 4 },
    { name: 'Power hour', time: 'Mon 12:15', instructor: 'Olivia', spots: 2 },
    { name: 'Evening stretch', time: 'Tue 19:00', instructor: 'Theo', spots: 6 },
    { name: 'Core & breath', time: 'Wed 18:00', instructor: 'Olivia', spots: 0 },
    { name: 'Weekend long flow', time: 'Sat 10:00', instructor: 'Theo', spots: 9 },
  ],
  bookings: [{ member: 'Mia', class: 'Morning flow' }],
  charges: [
    { id: 'ch_8801', member: 'Linus', amount: 89, date: '1 Sep', refunded: false },
    { id: 'ch_8802', member: 'Linus', amount: 89, date: '1 Sep', refunded: false },
    { id: 'ch_8803', member: 'Mia', amount: 89, date: '1 Sep', refunded: false },
  ],
  refunds: [],
});

const POLICIES: Record<string, string> = {
  prices: 'Monthly membership €89 (unlimited classes). Ten-class pass €120. Students €59/month.',
  guests: 'Members may bring one guest per month for free; after that a drop-in is €18.',
  cancellation: 'Cancel a class booking free of charge until 12 hours before it starts.',
  address: 'Acme Studio, the old tram depot, Rochusgasse 12, 1030 Vienna (U3 Rochusgasse).',
};

// ── the agents ──────────────────────────────────────────────────

const deskTools = (studio: Studio, member: string) => [
  defineTool({
    id: 'timetable',
    name: 'timetable',
    description: 'This week’s classes with time, instructor and spots left.',
    riskLevel: 'low',
    input: z.object({}),
    execute: () => studio.classes.map((c) => ({ ...c })),
  }),
  defineTool({
    id: 'book_class',
    name: 'book_class',
    description: 'Books the member into a class by name.',
    riskLevel: 'medium',
    input: z.object({ class: z.string().describe('The class name, e.g. "Evening stretch".') }),
    execute: ({ class: name }) => {
      const row = studio.classes.find((c) => c.name.toLowerCase() === name.toLowerCase());
      if (row === undefined) return { booked: false, reason: `No class called "${name}".` };
      if (row.spots === 0) return { booked: false, reason: `${row.name} is full.` };
      if (studio.bookings.some((b) => b.member === member && b.class === row.name)) return { booked: false, reason: `Already booked into ${row.name}.` };
      row.spots -= 1;
      studio.bookings.push({ member, class: row.name });
      return { booked: true, class: row.name, time: row.time, spots_left: row.spots };
    },
  }),
  defineTool({
    id: 'studio_info',
    name: 'studio_info',
    description: 'The studio’s policies.',
    riskLevel: 'low',
    input: z.object({ topic: z.enum(['prices', 'guests', 'cancellation', 'address']) }),
    execute: ({ topic }) => ({ topic, policy: POLICIES[topic] ?? '' }),
  }),
];

export const DeskAnswer = z.object({
  intent: z.enum(['info', 'book', 'billing', 'other']).describe('What the member wanted.'),
  class: z.string().nullable().describe('The class it was about, if any.'),
  booked: z.boolean().describe('Whether a booking was made in this turn.'),
});

export const frontDesk = (studio: Studio, member: string) =>
  defineAgent({
    id: 'front_desk',
    description: 'Acme Studio’s front desk, in the members’ app.',
    instructions: `You are the Acme Studio front desk, talking to ${member}, a member. Use the tools; never guess times, spots or prices.`,
    tools: deskTools(studio, member),
    output: { schema: DeskAnswer },
  });

export const Triage = z.object({
  member: z.string().describe('Who wrote.'),
  intent: z.enum(['reschedule', 'cancel_membership', 'billing', 'question']).describe('What they want.'),
  class: z.string().nullable().describe('The class it concerns, if any.'),
  moveTo: z.string().nullable().describe('For a reschedule: the class they want instead.'),
  urgent: z.boolean().describe('True if it has to be handled today.'),
  summary: z.string().describe('One line for the owner.'),
});
export type TriageCard = z.infer<typeof Triage>;

export const inboxReader = defineAgent({
  id: 'inbox_reader',
  description: 'Reads emails sent to the studio and files them.',
  instructions: 'You read emails sent to Acme Studio and file each one as a triage card for the owner.',
  output: { schema: Triage },
});

export const BillingAnswer = z.object({ refunded_eur: z.number(), charge: z.string().nullable() });

export const billingAgent = (studio: Studio) =>
  defineAgent({
    id: 'billing_agent',
    description: 'Looks into a member’s charges and refunds a duplicate. Give it the member’s name and the problem.',
    instructions: 'You are Acme Studio’s billing agent. Find the member’s charges; refund a charge only if it is an exact duplicate.',
    tools: [
      defineTool({
        id: 'find_charges',
        name: 'find_charges',
        description: 'A member’s charges this month.',
        riskLevel: 'low',
        input: z.object({ member: z.string() }),
        execute: ({ member }) => studio.charges.filter((c) => c.member.toLowerCase() === member.toLowerCase()).map((c) => ({ ...c })),
      }),
      defineTool({
        id: 'refund',
        name: 'refund',
        description: 'Refunds one charge.',
        riskLevel: 'high',
        input: z.object({ charge: z.string(), amount: z.number() }),
        execute: ({ charge, amount }) => {
          const row = studio.charges.find((c) => c.id === charge);
          if (row === undefined || row.refunded) return { refunded: false };
          row.refunded = true;
          studio.refunds.push({ charge, amount });
          return { refunded: true, charge, amount };
        },
      }),
    ],
    output: { schema: BillingAnswer },
  });

export const deskWithBilling = (studio: Studio, member: string, llm: SignalClient) =>
  defineAgent({
    id: 'front_desk',
    description: 'Acme Studio’s front desk, with the billing agent on call.',
    instructions: `You are the Acme Studio front desk, talking to ${member}, a member. Anything about charges or refunds goes to the billing agent.`,
    tools: [...deskTools(studio, member), asTool(billingAgent(studio), { llm })],
    output: { schema: DeskAnswer },
  });

// ── the emails ──────────────────────────────────────────────────

export type Email = { id: string; from: string; subject: string; body: string };

export const EMAILS: readonly Email[] = [
  { id: 'e1', from: 'Mia', subject: 'tmrw', body: 'hiii can’t make it to morning flow tmrw 😩 could you move me to evening stretch on tuesday instead?? thx!!' },
  { id: 'e2', from: 'Linus', subject: 'Charged twice?', body: 'Hi, my bank shows two payments of €89 on 1 September. I only have one membership. Could you refund one please?' },
  { id: 'e3', from: 'Ruth', subject: 'Leaving', body: 'Dear Olivia, I’m moving to Graz, so I’d like to end my membership from next month. Thank you for a lovely three years!' },
  { id: 'e4', from: 'Alan', subject: 'Parking', body: 'Quick one — is there anywhere to park near the studio on Saturday mornings?' },
];

export const emailPrompt = (e: Email): string => `From: ${e.from}\nSubject: ${e.subject}\n\n${e.body}`;

// ── the scripts: what the scripted model says ───────────────────

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const rows = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter(isRecord) : []);
const envelope = (response: string, data: unknown): ScriptedReply => ({ data: { response, data } });
const has = (request: ScriptedRequest, words: readonly string[]): boolean => words.every((w) => normalize(request.lastUser).includes(w));

const CLASS_NAMES = ['Morning flow', 'Power hour', 'Evening stretch', 'Core & breath', 'Weekend long flow'];

export const DESK_PROMPTS = ['When is the next Power hour?', 'Book me into Evening stretch.', 'Can I bring a friend?', 'How much is a monthly membership?', 'Book me into Core & breath.'];

const deskReply = (request: ScriptedRequest): ScriptedReply => {
  const first = request.toolResultsSinceUser === 0;
  const result = request.lastToolResult;
  if (has(request, ['power hour']) && !has(request, ['book'])) {
    if (first) return { call: { name: 'timetable', args: {} } };
    const row = rows(result).find((r) => r['name'] === 'Power hour');
    return envelope(
      row === undefined ? 'I couldn’t find Power hour on this week’s timetable.' : `The next Power hour is ${String(row['time'])} with ${String(row['instructor'])} — ${String(row['spots'])} spots left. Want me to book you in?`,
      { intent: 'info', class: 'Power hour', booked: false },
    );
  }
  const name = CLASS_NAMES.find((c) => has(request, ['book', normalize(c)]));
  if (name !== undefined) {
    if (first) return { call: { name: 'book_class', args: { class: name } } };
    const r = isRecord(result) ? result : {};
    return r['booked'] === true
      ? envelope(`Done — you’re booked into ${String(r['class'])}, ${String(r['time'])}. ${String(r['spots_left'])} spots left.`, { intent: 'book', class: String(r['class']), booked: true })
      : envelope(`I couldn’t book that: ${String(r['reason'] ?? 'unknown reason')} Want me to find another class?`, { intent: 'book', class: name, booked: false });
  }
  const topic = has(request, ['friend']) ? 'guests' : has(request, ['much']) || has(request, ['price']) ? 'prices' : has(request, ['cancel']) ? 'cancellation' : has(request, ['where']) ? 'address' : undefined;
  if (topic !== undefined) {
    if (first) return { call: { name: 'studio_info', args: { topic } } };
    const policy = isRecord(result) ? String(result['policy'] ?? '') : '';
    return envelope(policy, { intent: 'info', class: null, booked: false });
  }
  if (has(request, ['charged']) || has(request, ['refund'])) {
    if (first && request.tools.some((t) => t.name === 'billing_agent')) {
      return { call: { name: 'billing_agent', args: { input: `${request.lastUser} — the member is Linus.` } } };
    }
    const r = isRecord(result) ? result : {};
    const refunded = typeof r['refunded_eur'] === 'number' ? r['refunded_eur'] : 0;
    return envelope(
      refunded > 0 ? `Sorted — you were charged twice on 1 September, so we’ve refunded one of them (€${refunded.toFixed(2)}). It’ll be back on your card in a few days.` : 'I checked your charges and couldn’t find a duplicate.',
      { intent: 'billing', class: null, booked: false },
    );
  }
  return envelope('I’m the scripted front desk — I can answer the prompts shown above. With an API key, the same agent answers anything.', { intent: 'other', class: null, booked: false });
};

const TRIAGE: Record<string, TriageCard> = {
  Mia: { member: 'Mia', intent: 'reschedule', class: 'Morning flow', moveTo: 'Evening stretch', urgent: true, summary: 'Can’t make tomorrow’s Morning flow; wants Tuesday’s Evening stretch instead.' },
  Linus: { member: 'Linus', intent: 'billing', class: null, moveTo: null, urgent: true, summary: 'Charged €89 twice on 1 September; asks for one to be refunded.' },
  Ruth: { member: 'Ruth', intent: 'cancel_membership', class: null, moveTo: null, urgent: false, summary: 'Moving to Graz; ending her membership from next month.' },
  Alan: { member: 'Alan', intent: 'question', class: 'Weekend long flow', moveTo: null, urgent: false, summary: 'Asks where to park on Saturday mornings.' },
};

const inboxReply = (request: ScriptedRequest): ScriptedReply => {
  const from = /From: (\w+)/.exec(request.lastUser)?.[1] ?? '';
  const card = TRIAGE[from];
  if (card === undefined) return envelope('Filed.', { member: from, intent: 'question', class: null, moveTo: null, urgent: false, summary: request.lastUser.slice(0, 80) });
  // Mia's email is the messy one: the first answer invents a category the
  // schema doesn't have. Cortex rejects it and asks again with the issues.
  if (from === 'Mia' && request.correction === undefined) return envelope('Filed.', { ...card, intent: 'move' });
  return envelope('Filed.', card);
};

const billingReply = (request: ScriptedRequest): ScriptedReply => {
  if (request.toolResultsSinceUser === 0) return { call: { name: 'find_charges', args: { member: 'Linus' } } };
  const result = request.lastToolResult;
  if (Array.isArray(result)) {
    const charges = rows(result);
    const dupe = charges.find((c, i) => charges.some((d, j) => j < i && d['amount'] === c['amount'] && d['date'] === c['date']));
    if (dupe !== undefined) return { call: { name: 'refund', args: { charge: String(dupe['id']), amount: Number(dupe['amount']) } } };
    return envelope('No duplicate found.', { refunded_eur: 0, charge: null });
  }
  const r = isRecord(result) ? result : {};
  return envelope(`Refunded ${String(r['charge'])}.`, { refunded_eur: Number(r['amount'] ?? 0), charge: String(r['charge'] ?? '') });
};

registerScript({ id: 'cortex/billing', source: 'scripted', reply: (r) => (r.system.includes('billing agent') && r.system.startsWith('You are Acme Studio’s billing agent') ? billingReply(r) : undefined) });
registerScript({ id: 'cortex/inbox', source: 'scripted', reply: (r) => (r.system.includes('You read emails sent to Acme Studio') ? inboxReply(r) : undefined) });
registerScript({ id: 'cortex/desk', source: 'scripted', reply: (r) => (r.system.includes('You are the Acme Studio front desk') ? deskReply(r) : undefined) });
