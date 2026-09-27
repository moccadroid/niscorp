import { useState, type FC } from 'react';
import { z } from 'zod';
import { Btn, Callout, Chip, Code, Grid, INK, Lead, MONO, Mono, Page, Panel } from '@showroom/chrome/stage/ui';
import { resolveLlm } from '../llm';
import { EMAILS, emailPrompt, inboxReader, Triage, type Email, type TriageCard } from '../world/desk';

// ═══════════════════════════════════════════════════════════
// The inbox — messy emails in, typed cards out.
//
// Olivia's inbox holds four emails from members. The inbox reader turns each
// into a triage card with a fixed shape (a Zod schema). The shape is enforced:
// Mia's email gets a first answer with a category that doesn't exist, cortex
// rejects it, tells the model what was wrong, and takes the corrected one. The
// board is filled only with cards that passed.
// ═══════════════════════════════════════════════════════════

type Filed = { card: TriageCard; retries: string[] };

const COLUMNS: readonly { intent: TriageCard['intent']; label: string }[] = [
  { intent: 'reschedule', label: 'Reschedule' },
  { intent: 'billing', label: 'Billing' },
  { intent: 'cancel_membership', label: 'Leaving' },
  { intent: 'question', label: 'Questions' },
];

const SCHEMA_TEXT = JSON.stringify(z.toJSONSchema(Triage), null, 2);

export const Inbox: FC = () => {
  const [filed, setFiled] = useState<Readonly<Record<string, Filed>>>({});
  const [reading, setReading] = useState<string>();
  const [trace, setTrace] = useState<readonly { email: string; text: string; tone: 'ok' | 'bad' | 'idle' }[]>([]);
  const { scripted } = resolveLlm();

  const read = async (email: Email): Promise<void> => {
    setReading(email.id);
    const retries: string[] = [];
    setTrace((t) => [...t, { email: email.from, text: `reading ${email.from}’s email…`, tone: 'idle' }]);
    const { llm } = resolveLlm();
    const result = await inboxReader.run(emailPrompt(email), {
      llm,
      onEvent: (e) => {
        if (e.type === 'retry' && e.kind === 'output') {
          retries.push(e.issues);
          setTrace((t) => [...t, { email: email.from, text: `✗ answer rejected — ${e.issues}. Asking again.`, tone: 'bad' }]);
        }
      },
    }).result;
    if (result.ok) {
      setFiled((f) => ({ ...f, [email.id]: { card: result.output.data, retries } }));
      setTrace((t) => [...t, { email: email.from, text: `✓ filed as ${result.output.data.intent}${retries.length > 0 ? ` after ${retries.length} correction` : ''}`, tone: 'ok' }]);
    } else {
      setTrace((t) => [...t, { email: email.from, text: `✗ ${result.error.message}`, tone: 'bad' }]);
    }
    setReading(undefined);
  };

  const readAll = async (): Promise<void> => {
    for (const e of EMAILS) if (filed[e.id] === undefined) await read(e);
  };

  const reset = (): void => {
    setFiled({});
    setTrace([]);
  };

  return (
    <Page>
      <Lead eyebrow="The inbox" title="Messy emails in, typed cards out — and a card that doesn’t fit is sent back.">
        Members write however they write. The inbox reader turns each email into a triage card with a fixed shape: who, what they want, which class,
        how urgent. The shape is a schema, and it is enforced — an answer that doesn’t fit is rejected and the model is told why.
      </Lead>

      <Panel>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 12.5, color: INK.soft }}>
          <Chip tone={scripted ? 'accent' : 'ok'}>{scripted ? 'scripted model' : 'live model'}</Chip>
          {scripted ? 'No API key: the model’s answers are scripted — including one wrong one. The schema check and the retry are real cortex.' : 'Your own model, from Signal → Settings.'}
          <span style={{ flex: 1 }} />
          <Btn kind="primary" disabled={reading !== undefined || Object.keys(filed).length === EMAILS.length} onClick={() => void readAll()}>
            Read them all
          </Btn>
          <Btn kind="quiet" disabled={reading !== undefined} onClick={reset}>
            ↺ Reset
          </Btn>
        </div>
      </Panel>

      <Grid min={320} gap={16}>
        <Panel title="Olivia’s inbox" aside={`${EMAILS.length - Object.keys(filed).length} unread`}>
          {EMAILS.map((e) => {
            const done = filed[e.id];
            return (
              <div key={e.id} style={{ border: `1px solid ${done ? '#a7f3d0' : INK.line}`, background: done ? INK.okWash : '#fff', borderRadius: 12, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
                  <span style={{ fontWeight: 700, fontSize: 13.5 }}>
                    {e.from} <span style={{ fontWeight: 500, color: INK.soft }}>· {e.subject}</span>
                  </span>
                  {done !== undefined ? (
                    <Chip tone="ok">filed</Chip>
                  ) : (
                    <Btn kind="plain" disabled={reading !== undefined} onClick={() => void read(e)}>
                      {reading === e.id ? 'Reading…' : 'Read it'}
                    </Btn>
                  )}
                </div>
                <div style={{ fontSize: 13, lineHeight: 1.5, color: INK.text }}>{e.body}</div>
              </div>
            );
          })}
        </Panel>

        <Panel title="The triage board" aside="only cards that passed the schema">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
            {COLUMNS.map((col) => {
              const cards = Object.values(filed).filter((f) => f.card.intent === col.intent);
              return (
                <div key={col.intent} style={{ background: INK.wash, border: `1px solid ${INK.line}`, borderRadius: 12, padding: 8, display: 'flex', flexDirection: 'column', gap: 8, minHeight: 120 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: INK.soft }}>
                    {col.label} <span style={{ color: INK.faint }}>{cards.length}</span>
                  </div>
                  {cards.map(({ card, retries }) => (
                    <div key={card.member} style={{ background: '#fff', border: `1px solid ${card.urgent ? '#fecaca' : '#eef0f3'}`, borderRadius: 10, padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
                        <b style={{ fontSize: 12.5 }}>{card.member}</b>
                        {card.urgent && <Chip tone="bad">today</Chip>}
                      </div>
                      <div style={{ fontSize: 12, lineHeight: 1.4 }}>{card.summary}</div>
                      {card.class !== null && (
                        <div style={{ fontSize: 11, color: INK.soft }}>
                          {card.class}
                          {card.moveTo !== null ? ` → ${card.moveTo}` : ''}
                        </div>
                      )}
                      {retries.length > 0 && <Chip tone="warn">corrected once</Chip>}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
          <div style={{ fontFamily: MONO, fontSize: 11, lineHeight: 1.6, background: '#0f172a', color: '#cbd5e1', borderRadius: 10, padding: '8px 10px', minHeight: 40 }}>
            {trace.length === 0 ? <span style={{ color: '#64748b' }}>…</span> : trace.map((t, i) => <div key={i} style={{ color: t.tone === 'bad' ? '#fca5a5' : t.tone === 'ok' ? '#86efac' : '#94a3b8' }}>{t.text}</div>)}
          </div>
        </Panel>
      </Grid>

      <Grid min={320} gap={12}>
        <Panel title="The card’s shape" aside="Zod, converted to JSON Schema and handed to the model">
          <Code maxHeight={260}>{SCHEMA_TEXT}</Code>
        </Panel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Callout tone="accent" title="The shape is enforced, not hoped for">
            The model is told the schema, and its answer is checked against it. Mia’s email first came back filed under <Mono>"move"</Mono> — a
            category that doesn’t exist. Cortex rejected it, sent the issue back, and took the corrected answer. The board never saw the bad one.
          </Callout>
          <Callout tone="accent" title="Code downstream can trust it">
            Every card on the board has a member, one of four intents, and a boolean <Mono>urgent</Mono>. A column is a filter, not a guess.
          </Callout>
        </div>
      </Grid>
    </Page>
  );
};
